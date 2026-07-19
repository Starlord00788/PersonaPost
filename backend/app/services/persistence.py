import json
from datetime import datetime
from typing import Optional

from app.db import SessionLocal
from app.models import CalendarEntry, Draft, VoiceProfile
from app.schemas import (
    CalendarEntryItem,
    CalendarEntryUpdate,
    CalendarResponse,
    DraftRequest,
    DraftResponse,
    DraftUpdateResponse,
    VoiceProfileResponse,
)


def save_voice_profile(profile: VoiceProfileResponse) -> None:
    """Upsert voice profile by profile_id."""
    with SessionLocal() as session:
        row = (
            session.query(VoiceProfile)
            .filter(VoiceProfile.profile_id == profile.profile_id)
            .first()
        )
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


def save_draft(payload: DraftRequest, response: DraftResponse) -> int:
    """Persist every generated draft (approved=False initially).

    Returns the draft row ID so the frontend can reference it for inline editing.
    """
    with SessionLocal() as session:
        draft_row = Draft(
            niche=payload.niche,
            goal=payload.goal,
            platform=getattr(payload, "platform", "linkedin"),
            plan=response.plan,
            draft=response.draft,
            reviewer_score=response.reviewer_score,
            revision_notes_json=json.dumps(response.revision_notes),
            approved=False,
        )
        session.add(draft_row)
        session.commit()
        session.refresh(draft_row)
        return draft_row.id


def approve_draft(draft_id: int, response: DraftResponse) -> int:
    """Mark a draft as approved and create a calendar entry.

    Returns the calendar entry ID.
    """
    with SessionLocal() as session:
        draft_row = session.query(Draft).filter(Draft.id == draft_id).first()
        if draft_row:
            draft_row.approved = True
            session.flush()

        entry = CalendarEntry(
            draft_id=draft_id,
            title=response.plan[:255],
            draft_excerpt=response.draft[:500],
            platform=getattr(draft_row, "platform", "linkedin") if draft_row else "linkedin",
            status="approved",
        )
        session.add(entry)
        session.commit()
        session.refresh(entry)
        return entry.id


# ── Legacy helper kept for backward compatibility with existing tests ────────
def save_approved_draft(payload: DraftRequest, response: DraftResponse) -> int:
    """Save draft + approve atomically.  Returns calendar entry id."""
    draft_id = save_draft(payload, response)
    return approve_draft(draft_id, response)


def update_draft_text(draft_id: int, new_text: str) -> None:
    """Persist inline text edits from the frontend draft editor."""
    with SessionLocal() as session:
        row = session.query(Draft).filter(Draft.id == draft_id).first()
        if not row:
            raise ValueError(f"Draft {draft_id} not found")
        row.draft = new_text
        session.commit()


def update_calendar_entry(
    entry_id: int, update: CalendarEntryUpdate
) -> CalendarEntryItem:
    """Update calendar entry status and / or scheduled_for date."""
    with SessionLocal() as session:
        entry = (
            session.query(CalendarEntry)
            .filter(CalendarEntry.id == entry_id)
            .first()
        )
        if not entry:
            raise ValueError(f"Calendar entry {entry_id} not found")
        if update.status is not None:
            entry.status = update.status
        if update.scheduled_for is not None:
            entry.scheduled_for = update.scheduled_for
        session.commit()
        session.refresh(entry)
        return CalendarEntryItem(
            entry_id=entry.id,
            draft_id=entry.draft_id,
            title=entry.title,
            draft_excerpt=entry.draft_excerpt,
            status=entry.status,
            platform=getattr(entry, "platform", "linkedin"),
            scheduled_for=entry.scheduled_for,
            created_at=entry.created_at,
        )


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
            platform=getattr(row, "platform", "linkedin"),
            scheduled_for=row.scheduled_for,
            created_at=row.created_at,
        )
        for row in rows
    ]
    return CalendarResponse(items=items)
