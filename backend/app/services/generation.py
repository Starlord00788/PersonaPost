from app.schemas import DraftRequest, DraftResponse


def generate_draft(payload: DraftRequest) -> DraftResponse:
    trend_title = payload.trend_title or f"{payload.niche.title()} workflows that save time"
    plan = f"Build an educational post about {trend_title} with a clear hook, one practical insight, and a call to action."
    draft = (
        f"{trend_title} is changing how teams work. "
        f"The useful part is not the hype; it is the repeatable process behind it. "
        f"If your goal is {payload.goal}, focus on one workflow you can improve this week."
    )
    reviewer_score = 84 if payload.voice_profile else 72
    revision_notes = ["Tighten the hook", "Add one concrete example", "Keep the tone aligned with the voice profile"]
    return DraftResponse(plan=plan, draft=draft, reviewer_score=reviewer_score, revision_notes=revision_notes)
