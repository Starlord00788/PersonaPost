import json
import logging
import re
from typing import Any

from app.config import settings
from app.schemas import DraftRequest, DraftResponse, MultiPlatformDraftResponse
from app.services.review import review_draft

logger = logging.getLogger(__name__)

_FENCE_RE = re.compile(r"^```[a-z]*\n?", re.MULTILINE)


def _sanitize_json(raw: str) -> str:
    """Remove or escape control characters that break json.loads."""
    # Replace literal CR/LF/tab inside strings with their escape sequences.
    # We do this by scanning character by character within string regions.
    result = []
    in_string = False
    escape_next = False
    for ch in raw:
        if escape_next:
            result.append(ch)
            escape_next = False
            continue
        if ch == "\\":
            result.append(ch)
            escape_next = True
            continue
        if ch == '"' and not escape_next:
            in_string = not in_string
            result.append(ch)
            continue
        if in_string:
            if ch == "\n":
                result.append("\\n")
            elif ch == "\r":
                result.append("\\r")
            elif ch == "\t":
                result.append("\\t")
            elif ord(ch) < 32:
                # other control characters — skip
                pass
            else:
                result.append(ch)
        else:
            result.append(ch)
    return "".join(result)


def _parse_groq_json(text: str) -> dict:
    """Parse Groq JSON output robustly, with a regex fallback."""
    # First try: sanitize then parse
    try:
        sanitized = _sanitize_json(text)
        start = sanitized.find("{")
        end = sanitized.rfind("}") + 1
        if start != -1 and end > 0:
            return json.loads(sanitized[start:end])
    except Exception:
        pass

    # Second try: regex extraction of plan and draft fields directly
    plan_match = re.search(r'"plan"\s*:\s*"(.*?)"\s*(?:,|\})', text, re.DOTALL)
    draft_match = re.search(r'"draft"\s*:\s*"(.*?)"\s*(?:,|\})', text, re.DOTALL)
    if plan_match and draft_match:
        plan = plan_match.group(1).replace("\\n", "\n").replace("\\'", "'")
        draft = draft_match.group(1).replace("\\n", "\n").replace("\\'", "'")
        return {"plan": plan, "draft": draft}

    raise ValueError(f"Could not parse JSON from Groq response: {text[:200]}")

# Per-platform constraints injected into the generation prompt.
_PLATFORM_RULES: dict[str, str] = {
    "linkedin": (
        "LinkedIn post: 150-300 words. Professional, insight-led tone. "
        "Use 2-3 short paragraphs. End with an engaging question or clear CTA. "
        "No hashtags unless very targeted (max 2). No emojis unless the voice profile uses them."
    ),
    "x": (
        "X / Twitter thread SINGLE TWEET: STRICT 280 character MAXIMUM — count every character. "
        "Punchy, opinionated opening. Use a hook that makes people want to engage. "
        "1-2 hashtags maximum. Every word must earn its place. No filler. "
        "CRITICAL: output must be 280 characters or fewer, no exceptions."
    ),
    "instagram": (
        "Instagram caption: warm, conversational, 80-150 words. "
        "Lead with the single most engaging sentence as a hook. "
        "Use line breaks for readability. "
        "End with 4-6 tightly targeted hashtags on a new line."
    ),
}


def _strip_fences(text: str) -> str:
    text = _FENCE_RE.sub("", text)
    return text.replace("```", "").strip()


def get_groq_client() -> Any | None:
    if not settings.groq_api_key:
        return None
    try:
        from groq import Groq  # type: ignore[import-untyped]
    except Exception as exc:
        logger.warning("Groq SDK import failed, using fallback generation: %s", exc)
        return None
    try:
        return Groq(api_key=settings.groq_api_key)
    except Exception as exc:
        logger.warning("Groq client init failed, using fallback generation: %s", exc)
        return None


def _describe_voice(voice_profile: Any | None) -> str:
    if not voice_profile:
        return "Balanced and practical — no specific voice profile loaded."
    lines = [
        f"Tone: {voice_profile.tone}",
        f"Formality: {voice_profile.formality}/10",
        f"Sentence length: {voice_profile.sentence_length}",
        f"CTA style: {voice_profile.cta_style}",
        f"Emoji usage: {voice_profile.emoji_usage}",
        f"Vocabulary level: {getattr(voice_profile, 'vocabulary_level', 'intermediate')}",
    ]
    key_phrases = getattr(voice_profile, "key_phrases", [])
    if key_phrases:
        lines.append(f"Characteristic phrases to echo: {', '.join(key_phrases)}")
    writing_patterns = getattr(voice_profile, "writing_patterns", [])
    if writing_patterns:
        lines.append(f"Writing patterns to mirror: {'; '.join(writing_patterns)}")
    return "\n".join(lines)


def _enforce_platform_limits(draft_text: str, platform: str) -> str:
    """Post-generation enforcement: trim X posts that are too long."""
    if platform == "x" and len(draft_text) > 280:
        # Truncate at last complete word before 277 chars, add ellipsis
        trimmed = draft_text[:277]
        last_space = trimmed.rfind(" ")
        if last_space > 200:
            trimmed = trimmed[:last_space]
        draft_text = trimmed.rstrip(".,!?;:") + "…"
        logger.info("Trimmed X post to %d chars", len(draft_text))
    return draft_text


# ---------------------------------------------------------------------------
# Analytics helper
# ---------------------------------------------------------------------------

_POWER_WORDS = {
    "hot take", "nobody", "stop", "wrong", "truth", "actually", "secret",
    "unpopular", "controversial", "mistake", "fail", "never", "always",
    "shocking", "finally", "exposed", "warning", "urgent", "hack",
    "proven", "guaranteed", "instantly", "immediately",
}

_BEST_TIMES: dict[str, str] = {
    "linkedin": "Tue-Thu 8-10am",
    "x": "Mon-Wed 12-1pm",
    "instagram": "Fri-Sun 6-8pm",
}


def _compute_analytics(draft_text: str, platform: str, niche: str) -> dict:  # noqa: ARG001
    """Compute lightweight analytics fields for a generated draft."""
    import re as _re  # already imported at module level but kept local for clarity

    # -- Readability grade (based on avg sentence length in words) -------------
    sentences = [s.strip() for s in _re.split(r"[.!?]+", draft_text) if s.strip()]
    if sentences:
        avg_words = sum(len(s.split()) for s in sentences) / len(sentences)
    else:
        avg_words = 0.0

    if avg_words < 12:
        readability_grade = "Easy"
    elif avg_words < 20:
        readability_grade = "Medium"
    else:
        readability_grade = "Advanced"

    # -- Hook strength (power words in first sentence) -------------------------
    first_sentence = sentences[0].lower() if sentences else draft_text[:100].lower()
    hits = sum(1 for pw in _POWER_WORDS if pw in first_sentence)
    # Map: 0 hits → 0, 1 → 3, 2 → 5, 3 → 7, 4+ → 10 (capped at 10)
    hook_strength = min(10, hits * 3) if hits > 0 else 0
    # Boost slightly for any strong opening punctuation / rhetorical feel
    if first_sentence.endswith("?") or first_sentence.startswith(("here\'s", "this")):
        hook_strength = min(10, hook_strength + 1)

    # -- Best time to post -----------------------------------------------------
    best_time_to_post = _BEST_TIMES.get(platform, "Mon-Fri 9-11am")

    # -- Reach tier ------------------------------------------------------------
    if hook_strength >= 7:
        reach_tier = "Viral"
    elif hook_strength >= 4:
        reach_tier = "Broad"
    else:
        reach_tier = "Niche"

    return {
        "hook_strength": hook_strength,
        "best_time_to_post": best_time_to_post,
        "reach_tier": reach_tier,
        "readability_grade": readability_grade,
    }


def _fallback_draft(payload: DraftRequest) -> DraftResponse:
    trend_title = payload.trend_title or f"{payload.niche.title()} workflows that save time"
    plan = (
        f"Build an educational post about {trend_title} "
        f"with a clear hook, one practical insight, and a call to action."
    )
    draft = (
        f"{trend_title} is changing how teams work. "
        f"The useful part is not the hype; it is the repeatable process behind it. "
        f"If your goal is {payload.goal}, focus on one workflow you can improve this week. "
        f"What's the single biggest bottleneck you're facing right now?"
    )
    draft = _enforce_platform_limits(draft, payload.platform)
    reviewer_score, revision_notes = review_draft(draft, payload)
    analytics = _compute_analytics(draft, payload.platform, payload.niche)
    return DraftResponse(
        plan=plan,
        draft=draft,
        reviewer_score=reviewer_score,
        revision_notes=revision_notes,
        **analytics,
    )


def _call_groq(client: Any, payload: DraftRequest) -> DraftResponse:
    """Single Groq call — raises on any failure so callers can catch and fallback."""
    trend_title = payload.trend_title or payload.niche
    voice_desc = _describe_voice(payload.voice_profile)
    platform_rules = _PLATFORM_RULES.get(payload.platform, _PLATFORM_RULES["linkedin"])

    # Format knowledge context meaningfully
    if payload.knowledge_snippets:
        context = "Relevant context from knowledge base:\n" + "\n".join(
            f"- {s}" for s in payload.knowledge_snippets
        )
    else:
        context = "No knowledge base context available — rely on the topic and voice."

    prompt = f"""You are a professional social media copywriter. Write a high-quality post for a content creator.

TOPIC: {trend_title}
NICHE: {payload.niche}
GOAL: {payload.goal}

VOICE PROFILE (match this precisely):
{voice_desc}

PLATFORM REQUIREMENTS (follow exactly):
{platform_rules}

CONTEXT:
{context}

INSTRUCTIONS:
- Mirror the voice profile's tone, vocabulary, and writing patterns exactly
- The post must feel genuinely written by this person, not by an AI
- Make the hook the strongest possible opening — it must stop the scroll
- Include one specific, actionable insight (not vague advice)
- The CTA must match the voice profile's cta_style
- Do NOT use generic AI filler phrases like "In today's world" or "It's important to note"

Return JSON only — no extra text, no markdown fences:
{{"plan": "one sentence: what angle you took and why it fits this voice+niche", "draft": "the full post text"}}"""

    response = client.chat.completions.create(
        model=settings.groq_generation_model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.75,
    )
    raw = response.choices[0].message.content or ""
    cleaned = _strip_fences(raw)
    parsed = _parse_groq_json(cleaned)
    plan = str(parsed.get("plan", "")).strip()
    draft_text = str(parsed.get("draft", "")).strip()
    if not plan or not draft_text:
        raise ValueError("Missing plan or draft in model response")

    draft_text = _enforce_platform_limits(draft_text, payload.platform)
    reviewer_score, revision_notes = review_draft(draft_text, payload)
    analytics = _compute_analytics(draft_text, payload.platform, payload.niche)
    return DraftResponse(
        plan=plan,
        draft=draft_text,
        reviewer_score=reviewer_score,
        revision_notes=revision_notes,
        **analytics,
    )


def _do_refine(refine_payload: Any) -> "DraftResponse":
    from app.services.refinement import refine_draft  # noqa: PLC0415
    return refine_draft(refine_payload)


def generate_draft(payload: DraftRequest) -> DraftResponse:
    """
    Main generation entry point.

    Flow:
    1. Try Groq → on any error fall back to deterministic stub.
    2. If score < threshold AND max_retries > 0, run up to max_retries
       refinement passes via _do_refine().
    3. If still below threshold after all retries, set needs_manual_edit=True.
    """
    client = get_groq_client()
    if not client:
        return _fallback_draft(payload)

    try:
        result = _call_groq(client, payload)
    except Exception as exc:
        logger.warning(
            "Groq generation failed (%s: %s), using deterministic fallback",
            type(exc).__name__,
            exc,
        )
        return _fallback_draft(payload)

    # Auto-refinement retry loop
    if result.reviewer_score < settings.min_approval_score and payload.max_retries > 0:
        from app.schemas import RefinementRequest  # noqa: PLC0415

        for attempt in range(1, payload.max_retries + 1):
            logger.info(
                "Score %d below threshold %d — refinement attempt %d/%d",
                result.reviewer_score,
                settings.min_approval_score,
                attempt,
                payload.max_retries,
            )
            refine_payload = RefinementRequest(
                niche=payload.niche,
                goal=payload.goal,
                voice_profile=payload.voice_profile,
                original_draft=result.draft,
                instruction=(
                    "Improve the hook so it's more specific and scroll-stopping. "
                    "Strengthen the call to action to better match the voice profile's CTA style. "
                    "Cut any generic AI-sounding phrases."
                ),
                revision_notes=result.revision_notes,
                approve=payload.approve,
                platform=payload.platform,
            )
            try:
                result = _do_refine(refine_payload)
            except Exception as exc:
                logger.warning("Refinement attempt %d failed: %s", attempt, exc)
                break
            if result.reviewer_score >= settings.min_approval_score:
                logger.info("Score reached %d after attempt %d", result.reviewer_score, attempt)
                break
        else:
            result = result.model_copy(update={"needs_manual_edit": True})

    return result


# ---------------------------------------------------------------------------
# Multi-platform generation
# ---------------------------------------------------------------------------


def generate_multi_platform(payload: DraftRequest) -> MultiPlatformDraftResponse:
    """Generate drafts for LinkedIn, X, and Instagram sequentially.

    Creates a copy of the payload for each platform, calls generate_draft,
    and bundles the results into a MultiPlatformDraftResponse.
    """
    platforms = ("linkedin", "x", "instagram")
    results: dict[str, DraftResponse] = {}
    for platform in platforms:
        platform_payload = payload.model_copy(update={"platform": platform, "approve": False})
        results[platform] = generate_draft(platform_payload)

    return MultiPlatformDraftResponse(
        linkedin=results["linkedin"],
        x=results["x"],
        instagram=results["instagram"],
    )


def build_generation_prompt(payload: DraftRequest) -> tuple[str, str]:
    """Build the system + user prompt for generation. Returns (system_prompt, user_prompt).
    Extracted so streaming can use the same prompt logic as generate_draft.
    """
    from app.services.knowledge import retrieve_knowledge  # lazy import
    from app.schemas import KnowledgeRetrieveRequest

    # Knowledge retrieval
    knowledge_snippets = payload.knowledge_snippets or []
    if payload.auto_retrieve_knowledge and not knowledge_snippets:
        try:
            query = " ".join(p for p in [payload.trend_title or "", payload.goal] if p).strip() or payload.niche
            result = retrieve_knowledge(KnowledgeRetrieveRequest(niche=payload.niche, query=query, top_k=3))
            knowledge_snippets = [s.text for s in result.snippets]
        except Exception:
            pass

    platform_rules = _PLATFORM_RULES.get(payload.platform, "")
    voice_desc = _describe_voice(payload.voice_profile)
    knowledge_section = "\n".join(f"- {s}" for s in knowledge_snippets) if knowledge_snippets else "None provided."
    trend_section = f"Trending topic: {payload.trend_title}" if payload.trend_title else f"Niche topic: {payload.niche}"

    system_prompt = (
        "You are an elite social media ghostwriter. Write in the creator's exact voice — "
        "match their tone, rhythm, vocabulary, and style perfectly. Never sound generic."
    )
    user_prompt = f"""Write a {payload.platform} post for this creator.

VOICE PROFILE:
{voice_desc}

GOAL: {payload.goal}
NICHE: {payload.niche}
{trend_section}

PLATFORM RULES:
{platform_rules}

KNOWLEDGE CONTEXT:
{knowledge_section}

Write ONLY the post text. No JSON, no metadata, no explanations. Just the raw post."""

    return system_prompt, user_prompt


def stream_draft(payload: DraftRequest):
    """Generator that yields SSE-formatted chunks of the draft text.
    Each chunk is a server-sent event: 'data: <text>\\n\\n'
    Ends with 'data: [DONE]\\n\\n'
    """
    import json
    client = get_groq_client()
    if not client:
        # Fallback: yield the fallback draft as a single chunk
        result = _fallback_draft(payload)
        text = result.get("draft", "") if isinstance(result, dict) else result.draft
        for word in text.split(" "):
            yield f"data: {json.dumps({'token': word + ' '})}\n\n"
        yield f"data: [DONE]\n\n"
        return

    system_prompt, user_prompt = build_generation_prompt(payload)

    try:
        stream = client.chat.completions.create(
            model=settings.groq_generation_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.82,
            max_tokens=600,
            stream=True,
        )
        for chunk in stream:
            delta = chunk.choices[0].delta
            if hasattr(delta, "content") and delta.content:
                yield f"data: {json.dumps({'token': delta.content})}\n\n"
        yield f"data: [DONE]\n\n"
    except Exception as exc:
        logger.warning("Streaming failed, falling back: %s", exc)
        result = _fallback_draft(payload)
        text = result.get("draft", "") if isinstance(result, dict) else result.draft
        for word in text.split(" "):
            yield f"data: {json.dumps({'token': word + ' '})}\n\n"
        yield f"data: [DONE]\n\n"
