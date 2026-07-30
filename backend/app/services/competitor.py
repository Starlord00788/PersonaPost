"""Competitor post analysis service.

Analyzes a competitor's post and generates an improved version in the user's voice.
"""
import logging

from app.schemas import CompetitorAnalysisRequest, CompetitorAnalysisResponse

logger = logging.getLogger(__name__)


def analyze_competitor_post(payload: CompetitorAnalysisRequest) -> CompetitorAnalysisResponse:
    """Use Groq to analyze competitor post and rewrite it in user's voice."""
    from app.services.generation import get_groq_client, _describe_voice, _parse_groq_json, _strip_fences  # noqa: PLC0415
    from app.config import settings  # noqa: PLC0415

    client = get_groq_client()
    voice_desc = _describe_voice(payload.voice_profile) if payload.voice_profile else "Balanced, direct tone"

    if not client:
        return CompetitorAnalysisResponse(
            strengths=["Has a clear topic", "Uses direct language"],
            weaknesses=["Generic hook", "No specific data points", "Weak CTA"],
            rewritten_post=(
                f"[Groq unavailable] Original post rewritten for {payload.niche} niche "
                f"with stronger hook and CTA."
            ),
            improvement_summary="Added specificity and stronger hook based on voice profile.",
        )

    prompt = f"""Analyze this social media post from a competitor and then rewrite it in a different creator's voice.

COMPETITOR'S POST:
{payload.competitor_post}

NICHE: {payload.niche}
GOAL: {payload.goal}

YOUR VOICE PROFILE:
{voice_desc}

Return JSON only:
{{"strengths": ["strength 1", "strength 2", "strength 3"], "weaknesses": ["weakness 1", "weakness 2", "weakness 3"], "rewritten_post": "full rewritten post in the user's voice that improves on all the weaknesses", "improvement_summary": "one sentence explaining the key improvement"}}"""

    try:
        response = client.chat.completions.create(
            model=settings.groq_generation_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.6,
        )
        raw = _strip_fences(response.choices[0].message.content or "")
        parsed = _parse_groq_json(raw)
        return CompetitorAnalysisResponse(
            strengths=[str(s) for s in parsed.get("strengths", [])[:4]],
            weaknesses=[str(w) for w in parsed.get("weaknesses", [])[:4]],
            rewritten_post=str(parsed.get("rewritten_post", "")).strip(),
            improvement_summary=str(parsed.get("improvement_summary", "")).strip(),
        )
    except Exception as exc:
        logger.warning("Competitor analysis failed: %s", exc)
        return CompetitorAnalysisResponse(
            strengths=["Has a topic focus"],
            weaknesses=["Hook could be stronger", "Needs more specificity"],
            rewritten_post="Unable to generate rewrite. Please try again.",
            improvement_summary="Analysis unavailable.",
        )
