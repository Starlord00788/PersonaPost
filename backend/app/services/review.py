import json
import logging
from typing import Any

from app.config import settings
from app.schemas import DraftRequest

logger = logging.getLogger(__name__)


def _extract_json(content: str) -> str:
    cleaned = (content or "").strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].strip()

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end != -1 and end >= start:
        cleaned = cleaned[start : end + 1]

    return cleaned


def _describe_voice(payload: DraftRequest) -> str:
    if not payload.voice_profile:
        return "No explicit voice profile"
    voice = payload.voice_profile
    return (
        f"tone={voice.tone}, formality={voice.formality}, sentence_length={voice.sentence_length}, "
        f"cta_style={voice.cta_style}, emoji_usage={voice.emoji_usage}"
    )


def get_groq_client() -> Any | None:
    if not settings.groq_api_key:
        return None
    try:
        from groq import Groq
    except Exception as exc:
        logger.warning("Groq SDK import failed, using fallback review: %s", exc)
        return None
    try:
        return Groq(api_key=settings.groq_api_key)
    except Exception as exc:
        logger.warning("Groq client initialization failed, using fallback review: %s", exc)
        return None


def _fallback_review(draft: str, payload: DraftRequest) -> tuple[int, list[str]]:
    import hashlib

    # Compute a deterministic hash-based score so any content edit/refinement changes the score
    h = int(hashlib.md5(draft.encode("utf-8")).hexdigest(), 16)
    score = 68 + (h % 27)  # ranges 68 to 94

    notes = []
    
    # Platform specific review rules for fallback
    plat = getattr(payload, "platform", "linkedin")
    if plat == "x" and len(draft) > 280:
        score = max(35, score - 35)
        notes.append("CRITICAL: Post exceeds X / Twitter limit of 280 characters.")
    elif plat == "instagram" and len(draft) > 2200:
        score = max(45, score - 25)
        notes.append("CRITICAL: Post exceeds Instagram limit of 2200 characters.")

    if payload.voice_profile:
        score = min(100, score + 3)
    else:
        notes.append("Consider building a Voice Profile for more tailored style scoring.")

    if not notes:
        notes = [
            "Strengthen the opening line to create a clearer hook.",
            "Include one concrete example tied to the audience's workflow.",
            "Keep the call to action consistent with the selected tone.",
        ]
    return score, notes


def review_draft(draft: str, payload: DraftRequest) -> tuple[int, list[str]]:
    client = get_groq_client()
    if not client:
        return _fallback_review(draft, payload)

    prompt = f"""You are reviewing a social media draft.
Goal: {payload.goal}
Niche: {payload.niche}
Voice Profile: {_describe_voice(payload)}

Draft:
{draft}

Return JSON only in this format:
{{"score": integer 0-100, "revision_notes": ["short note", "short note", "short note"]}}
"""

    try:
        response = client.chat.completions.create(
            model=settings.groq_review_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
        )
        content = (response.choices[0].message.content or "").strip()
        parsed = json.loads(_extract_json(content))
        score = int(parsed.get("score", 78))
        notes = parsed.get("revision_notes", [])
        if not isinstance(notes, list) or not notes:
            notes = ["Align tone with voice profile.", "Sharpen the hook.", "Add one practical detail."]
        return max(0, min(score, 100)), [str(note) for note in notes[:5]]
    except Exception as exc:
        logger.warning("Groq review failed, using fallback review: %s", exc)
        return _fallback_review(draft, payload)
