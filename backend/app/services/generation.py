import json
import logging
import re
from typing import Any

from app.config import settings
from app.schemas import DraftRequest, DraftResponse
from app.services.review import review_draft

logger = logging.getLogger(__name__)

_FENCE_RE = re.compile(r"^```[a-z]*\n?", re.MULTILINE)

# Per-platform constraints injected into the generation prompt.
_PLATFORM_RULES: dict[str, str] = {
    "linkedin": (
        "LinkedIn post: 150-300 words. Professional, insight-led tone. "
        "Use short paragraphs (2-3 lines). End with a question or clear call-to-action."
    ),
    "x": (
        "X / Twitter post: max 280 characters total. "
        "Punchy, opinionated opener. 1-2 hashtags maximum. No filler words."
    ),
    "instagram": (
        "Instagram caption: conversational and warm, 50-150 words. "
        "Lead with the most engaging sentence. "
        "Add 3-5 targeted hashtags on a new line at the end."
    ),
}


def _strip_fences(text: str) -> str:
    """Remove markdown code fences that models sometimes wrap JSON in."""
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
        return "Balanced and practical"
    return (
        f"tone={voice_profile.tone}, formality={voice_profile.formality}, "
        f"sentence_length={voice_profile.sentence_length}, cta_style={voice_profile.cta_style}, "
        f"emoji_usage={voice_profile.emoji_usage}"
    )


def _fallback_draft(payload: DraftRequest) -> DraftResponse:
    trend_title = payload.trend_title or f"{payload.niche.title()} workflows that save time"
    plan = (
        f"Build an educational post about {trend_title} "
        f"with a clear hook, one practical insight, and a call to action."
    )
    draft = (
        f"{trend_title} is changing how teams work. "
        f"The useful part is not the hype; it is the repeatable process behind it. "
        f"If your goal is {payload.goal}, focus on one workflow you can improve this week."
    )
    reviewer_score, revision_notes = review_draft(draft, payload)
    return DraftResponse(
        plan=plan,
        draft=draft,
        reviewer_score=reviewer_score,
        revision_notes=revision_notes,
    )


def _call_groq(client: Any, payload: DraftRequest) -> DraftResponse:
    """Single Groq call — raises on any failure so callers can catch and fallback."""
    trend_title = payload.trend_title or payload.niche
    context = " ".join(payload.knowledge_snippets) or "none"
    voice_desc = _describe_voice(payload.voice_profile)
    platform_rules = _PLATFORM_RULES.get(payload.platform, _PLATFORM_RULES["linkedin"])

    prompt = f"""Write a social media post.

Topic: {trend_title}
Niche: {payload.niche}
Goal: {payload.goal}
Voice: {voice_desc}
Platform rules: {platform_rules}
Context snippets: {context}

Return JSON only — no extra text, no markdown fences:
{{"plan": "one sentence describing your content plan", "draft": "the full post text"}}
"""
    response = client.chat.completions.create(
        model=settings.groq_generation_model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.7,
    )
    raw = response.choices[0].message.content or ""
    cleaned = _strip_fences(raw)
    parsed = json.loads(cleaned)
    plan = str(parsed.get("plan", "")).strip()
    draft_text = str(parsed.get("draft", "")).strip()
    if not plan or not draft_text:
        raise ValueError("Missing plan or draft in model response")

    reviewer_score, revision_notes = review_draft(draft_text, payload)
    return DraftResponse(
        plan=plan,
        draft=draft_text,
        reviewer_score=reviewer_score,
        revision_notes=revision_notes,
    )


def _do_refine(refine_payload: Any) -> "DraftResponse":
    """Thin wrapper so tests can monkeypatch this without circular-import issues."""
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
                    "Improve the hook, strengthen the call to action, "
                    "and better align with the stated voice profile."
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
            # All retries exhausted, score still below threshold
            result = result.model_copy(update={"needs_manual_edit": True})

    return result
