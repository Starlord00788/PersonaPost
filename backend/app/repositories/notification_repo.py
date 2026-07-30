"""Notification repository."""
import logging
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy.orm import Session

from app.models import Notification

logger = logging.getLogger(__name__)


def create(db: Session, user_id: int, type_: str, title: str, message: str,
           action_url: Optional[str] = None) -> Notification:
    notif = Notification(
        user_id=user_id,
        type=type_,
        title=title,
        message=message,
        action_url=action_url,
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)
    return notif


def find_by_user(db: Session, user_id: int, limit: int = 20) -> List[Notification]:
    now = datetime.now(timezone.utc)
    return (
        db.query(Notification)
        .filter(
            Notification.user_id == user_id,
            (Notification.expires_at == None) | (Notification.expires_at > now),
        )
        .order_by(Notification.is_read.asc(), Notification.created_at.desc())
        .limit(limit)
        .all()
    )


def count_unread(db: Session, user_id: int) -> int:
    return (
        db.query(Notification)
        .filter(Notification.user_id == user_id, Notification.is_read == False)
        .count()
    )


def mark_read(db: Session, notification_id: int, user_id: int) -> bool:
    notif = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.user_id == user_id)
        .first()
    )
    if notif:
        notif.is_read = True
        db.commit()
        return True
    return False


def mark_all_read(db: Session, user_id: int) -> int:
    count = (
        db.query(Notification)
        .filter(Notification.user_id == user_id, Notification.is_read == False)
        .update({"is_read": True})
    )
    db.commit()
    return count
