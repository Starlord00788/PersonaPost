import json
import logging
from typing import Any

from app.config import settings
from app.schemas import DraftRequest, DraftResponse, RefinementRequest
from app.services.generation import _describe_voice, _strip_fences, get_groq_client
from app.services.review import review_draft

logger = logging.getLogger(__name__)


def _fallback_refinement(payload: RefinementRequest) -> DraftResponse:
    """Deterministic refinement when Groq is unavailable.

    Applies a light heuristic edit so the demo still shows something changed.
    """
    instruction = payload.instruction.strip().lower()
    draft = payload.original_draft.strip()

    if "shorter" in instruction:
        sentences = draft.split(". ")
        draft = ". ".join(sentences[: max(1, len(sentences) // 2)])
        if not draft.endswith("."):
            draft += "."
    elif "bullet" in instruction:
        sentences = [s.strip() for s in draft.split(". ") if s.strip()]
        draft = "\n".join(f"- {s.rstrip('.')}" for s in sentences)
    else:
        draft = f"{draft}\n\n(Revised: {payload.instruction.strip()})"

    plan = f"Applied requested revision: {payload.instruction.strip()}"

    fake_request = DraftRequest(
        niche=payload.niche,
        goal=payload.goal,
        trend_title=None,
        knowledge_snippets=[],
        voice_profile=payload.voice_profile,
        platform=payload.platform,
    )
    reviewer_score, revision_notes = review_draft(draft, fake_request)
    return DraftResponse(
        plan=plan,
        draft=draft,
        reviewer_score=reviewer_score,
        revision_notes=revision_notes,
    )


def refine_draft(payload: RefinementRequest) -> DraftResponse:
    """Takes an existing draft plus reviewer feedback and a user instruction
    (e.g. 'make it shorter', 'add more bullet points') and produces a
    revised draft, re-scored by the same reviewer used in generation.
    """
    client = get_groq_client()
    if not client:
        return _fallback_refinement(payload)

    voice_desc = _describe_voice(payload.voice_profile)
    notes = "; ".join(payload.revision_notes) if payload.revision_notes else "none"

    prompt = f"""Revise the following social media post based on the user's instruction.

Original post:
{payload.original_draft}

Reviewer notes from last pass: {notes}
User instruction: {payload.instruction}
Niche: {payload.niche}
Goal: {payload.goal}
Voice: {voice_desc}
Platform: {payload.platform}

Return JSON only — no extra text, no markdown fences:
{{"plan": "one sentence describing what changed and why", "draft": "the full revised post text"}}
"""
    try:
        response = client.chat.completions.create(
            model=settings.groq_generation_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.6,
        )
        raw = response.choices[0].message.content or ""
        cleaned = _strip_fences(raw)
        parsed = json.loads(cleaned)
        plan = str(parsed.get("plan", "")).strip()
        draft = str(parsed.get("draft", "")).strip()
        if not plan or not draft:
            raise ValueError("Missing plan or draft in model response")
    except Exception as exc:
        logger.warning("Groq refinement failed (%s: %s), using fallback", type(exc).__name__, exc)
        return _fallback_refinement(payload)

    fake_request = DraftRequest(
        niche=payload.niche,
        goal=payload.goal,
        trend_title=None,
        knowledge_snippets=[],
        voice_profile=payload.voice_profile,
        platform=payload.platform,
    )
    reviewer_score, revision_notes = review_draft(draft, fake_request)
    return DraftResponse(
        plan=plan,
        draft=draft,
        reviewer_score=reviewer_score,
        revision_notes=revision_notes,
    )