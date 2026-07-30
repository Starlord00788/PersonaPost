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


def save_voice_profile(profile: VoiceProfileResponse, user_id: Optional[int] = None) -> None:
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
            if user_id:
                row.user_id = user_id
        else:
            row = VoiceProfile(
                profile_id=profile.profile_id,
                user_id=user_id,
                summary=profile.summary,
                signals_json=profile.signals.model_dump_json(),
            )
            session.add(row)
        session.commit()


def save_draft(payload: DraftRequest, response: DraftResponse, user_id: Optional[int] = None) -> int:
    """Persist generated draft. Returns draft row ID."""
    with SessionLocal() as session:
        draft_row = Draft(
            user_id=user_id,
            niche=payload.niche,
            goal=payload.goal,
            platform=getattr(payload, "platform", "linkedin"),
            trend_title=getattr(payload, "trend_title", None),
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


def approve_draft(draft_id: int, response: DraftResponse, user_id: Optional[int] = None) -> int:
    """Mark draft approved and create calendar entry. Returns calendar entry ID."""
    with SessionLocal() as session:
        draft_row = session.query(Draft).filter(Draft.id == draft_id).first()
        if draft_row:
            draft_row.approved = True
            if user_id and not draft_row.user_id:
                draft_row.user_id = user_id
            session.flush()

        entry = CalendarEntry(
            user_id=user_id,
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


def save_approved_draft(payload: DraftRequest, response: DraftResponse, user_id: Optional[int] = None) -> int:
    """Save + approve atomically. Returns calendar entry id."""
    draft_id = save_draft(payload, response, user_id=user_id)
    return approve_draft(draft_id, response, user_id=user_id)


def update_draft_text(draft_id: int, new_text: str, user_id: Optional[int] = None) -> None:
    """Persist inline text edits."""
    with SessionLocal() as session:
        q = session.query(Draft).filter(Draft.id == draft_id)
        if user_id:
            q = q.filter(Draft.user_id == user_id)
        row = q.first()
        if not row:
            raise ValueError(f"Draft {draft_id} not found")
        row.draft = new_text
        session.commit()


def update_calendar_entry(
    entry_id: int, update: CalendarEntryUpdate, user_id: Optional[int] = None
) -> CalendarEntryItem:
    """Update calendar entry status and/or scheduled_for."""
    with SessionLocal() as session:
        q = session.query(CalendarEntry).filter(CalendarEntry.id == entry_id)
        if user_id:
            q = q.filter(CalendarEntry.user_id == user_id)
        entry = q.first()
        if not entry:
            raise ValueError(f"Calendar entry {entry_id} not found")
        if update.status is not None:
            entry.status = update.status
        if update.scheduled_for is not None:
            entry.scheduled_for = update.scheduled_for
            entry.notified = False  # Reset notification when rescheduled
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


def list_calendar_entries(limit: int = 50, user_id: Optional[int] = None) -> CalendarResponse:
    with SessionLocal() as session:
        q = session.query(CalendarEntry)
        if user_id:
            q = q.filter(CalendarEntry.user_id == user_id)
        rows = q.order_by(CalendarEntry.created_at.desc()).limit(limit).all()

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
