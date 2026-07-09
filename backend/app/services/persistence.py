import json

from app.db import SessionLocal
from app.models import CalendarEntry, Draft, VoiceProfile
from app.schemas import CalendarEntryItem, CalendarResponse, DraftRequest, DraftResponse, VoiceProfileResponse


def save_voice_profile(profile: VoiceProfileResponse) -> None:
    with SessionLocal() as session:
        row = session.query(VoiceProfile).filter(VoiceProfile.profile_id == profile.profile_id).first()
        if row:
            row.summary = profile.summary
            row.signals_json = profile.signals.model_dump_json()
        else:
            row = VoiceProfile(
                profile_id=profile.profile_id,
                summary=profile.summary,
                signals_json=profile.signals.model_dump_json(),
            )
            session.add(row)
        session.commit()


def save_approved_draft(payload: DraftRequest, response: DraftResponse) -> int:
    with SessionLocal() as session:
        draft_row = Draft(
            niche=payload.niche,
            goal=payload.goal,
            plan=response.plan,
            draft=response.draft,
            reviewer_score=response.reviewer_score,
            revision_notes_json=json.dumps(response.revision_notes),
            approved=True,
        )
        session.add(draft_row)
        session.flush()

        entry = CalendarEntry(
            draft_id=draft_row.id,
            title=response.plan[:255],
            draft_excerpt=response.draft[:500],
            status="approved",
        )
        session.add(entry)
        session.commit()
        session.refresh(entry)
        return entry.id


def list_calendar_entries(limit: int = 50) -> CalendarResponse:
    with SessionLocal() as session:
        rows = (
            session.query(CalendarEntry)
            .order_by(CalendarEntry.created_at.desc())
            .limit(limit)
            .all()
        )

    items = [
        CalendarEntryItem(
            entry_id=row.id,
            draft_id=row.draft_id,
            title=row.title,
            draft_excerpt=row.draft_excerpt,
            status=row.status,
            scheduled_for=row.scheduled_for,
            created_at=row.created_at,
        )
        for row in rows
    ]
    return CalendarResponse(items=items)
