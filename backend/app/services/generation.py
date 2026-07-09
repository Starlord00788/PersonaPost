import json
import logging
import re
from typing import Any

from app.config import settings
from app.schemas import DraftRequest, DraftResponse
from app.services.review import review_draft

logger = logging.getLogger(__name__)

_FENCE_RE = re.compile(r"^```[a-z]*\n?", re.MULTILINE)


def _strip_fences(text: str) -> str:
    """Remove markdown code fences that models sometimes wrap JSON in."""
    text = _FENCE_RE.sub("", text)
    return text.replace("```", "").strip()


def get_groq_client() -> Any | None:
    if not settings.groq_api_key:
        return None
    try:
        from groq import Groq
    except Exception as exc:
        logger.warning("Groq SDK import failed, using fallback generation: %s", exc)
        return None
    try:
        return Groq(api_key=settings.groq_api_key)
    except Exception as exc:
        logger.warning(
            "Groq client initialization failed, using fallback generation: %s", exc
        )
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


def generate_draft(payload: DraftRequest) -> DraftResponse:
    client = get_groq_client()
    if not client:
        return _fallback_draft(payload)

    trend_title = payload.trend_title or payload.niche
    context = " ".join(payload.knowledge_snippets) or "none"
    voice_desc = _describe_voice(payload.voice_profile)

    prompt = f"""Write a social media post.

Topic: {trend_title}
Niche: {payload.niche}
Goal: {payload.goal}
Voice: {voice_desc}
Context: {context}

Return JSON only — no extra text, no markdown fences:
{{"plan": "one sentence describing your content plan", "draft": "the full post text"}}
"""

    try:
        response = client.chat.completions.create(
            model=settings.groq_generation_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
        )
        raw = response.choices[0].message.content or ""
        cleaned = _strip_fences(raw)
        parsed = json.loads(cleaned)
        plan = str(parsed.get("plan", "")).strip()
        draft = str(parsed.get("draft", "")).strip()
        if not plan or not draft:
            raise ValueError("Missing plan or draft in model response")
    except Exception as exc:
        logger.warning("Groq generation failed, using fallback: %s", exc)
        return _fallback_draft(payload)

    reviewer_score, revision_notes = review_draft(draft, payload)
    return DraftResponse(
        plan=plan,
        draft=draft,
        reviewer_score=reviewer_score,
        revision_notes=revision_notes,
    )
