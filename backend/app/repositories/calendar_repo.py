"""Calendar repository."""
import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from sqlalchemy.orm import Session

from app.models import CalendarEntry

logger = logging.getLogger(__name__)


def find_by_user(db: Session, user_id: int, limit: int = 50) -> List[CalendarEntry]:
    return (
        db.query(CalendarEntry)
        .filter(CalendarEntry.user_id == user_id)
        .order_by(CalendarEntry.created_at.desc())
        .limit(limit)
        .all()
    )


def find_upcoming_24h(db: Session, user_id: int) -> List[CalendarEntry]:
    """Find scheduled entries in the next 24 hours that haven't been notified."""
    now = datetime.now(timezone.utc)
    cutoff = now + timedelta(hours=24)
    return (
        db.query(CalendarEntry)
        .filter(
            CalendarEntry.user_id == user_id,
            CalendarEntry.scheduled_for != None,
            CalendarEntry.scheduled_for >= now,
            CalendarEntry.scheduled_for <= cutoff,
            CalendarEntry.notified == False,
        )
        .all()
    )


def mark_notified(db: Session, entry_id: int) -> None:
    entry = db.query(CalendarEntry).filter(CalendarEntry.id == entry_id).first()
    if entry:
        entry.notified = True
        db.commit()


def find_by_id_and_user(db: Session, entry_id: int, user_id: int) -> Optional[CalendarEntry]:
    return (
        db.query(CalendarEntry)
        .filter(CalendarEntry.id == entry_id, CalendarEntry.user_id == user_id)
        .first()
    )
