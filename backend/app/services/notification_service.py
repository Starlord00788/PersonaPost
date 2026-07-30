"""Notification service — creates and retrieves user notifications."""
import logging
from typing import List

from sqlalchemy.orm import Session

from app.cache import TTL_NOTIFICATIONS, cache
from app.repositories import calendar_repo, notification_repo
from app.schemas import NotificationCountResponse, NotificationItem, NotificationListResponse

logger = logging.getLogger(__name__)


def _to_item(n) -> NotificationItem:
    return NotificationItem(
        id=n.id,
        type=n.type,
        title=n.title,
        message=n.message,
        is_read=n.is_read,
        action_url=n.action_url,
        created_at=n.created_at,
    )


def create_welcome(db: Session, user_id: int, display_name: str) -> None:
    notification_repo.create(
        db, user_id=user_id, type_="welcome",
        title="Welcome to PersonaPost AI! 🎉",
        message=f"Hi {display_name}! Start by building your Voice Profile — paste 3-5 of your best posts to create your AI writing fingerprint.",
        action_url="/voice",
    )
    cache.delete(f"notif_count:{user_id}")


def create_score_alert(db: Session, user_id: int, score: int) -> None:
    if score >= 85:
        notification_repo.create(
            db, user_id=user_id, type_="score_alert",
            title=f"🌟 High-scoring draft ready ({score}/100)",
            message="Your latest draft scored above 85 — it's ready to post! Head to the Draft tab to copy and publish.",
            action_url="/draft",
        )
        cache.delete(f"notif_count:{user_id}")


def get_count(db: Session, user_id: int) -> NotificationCountResponse:
    cache_key = f"notif_count:{user_id}"
    cached = cache.get(cache_key)
    if cached is not None:
        return NotificationCountResponse(unread=cached)
    count = notification_repo.count_unread(db, user_id)
    cache.set(cache_key, count, ttl_seconds=TTL_NOTIFICATIONS)
    return NotificationCountResponse(unread=count)


def get_list(db: Session, user_id: int, limit: int = 20) -> NotificationListResponse:
    items = notification_repo.find_by_user(db, user_id, limit=limit)
    unread = sum(1 for n in items if not n.is_read)
    return NotificationListResponse(
        items=[_to_item(n) for n in items],
        unread_count=unread,
    )


def mark_all_read(db: Session, user_id: int) -> dict:
    count = notification_repo.mark_all_read(db, user_id)
    cache.delete(f"notif_count:{user_id}")
    return {"marked_read": count}


def mark_one_read(db: Session, notification_id: int, user_id: int) -> bool:
    result = notification_repo.mark_read(db, notification_id, user_id)
    if result:
        cache.delete(f"notif_count:{user_id}")
    return result


def check_upcoming_posts(db: Session, user_id: int) -> dict:
    """Scan next 24h scheduled posts and create reminder notifications."""
    entries = calendar_repo.find_upcoming_24h(db, user_id)
    created = 0
    for entry in entries:
        scheduled = entry.scheduled_for
        if scheduled:
            time_str = scheduled.strftime("%b %d at %I:%M %p")
            notification_repo.create(
                db, user_id=user_id, type_="scheduled_post",
                title=f"📅 Scheduled post coming up",
                message=f'Your post "{entry.title[:60]}" is scheduled for {time_str}.',
                action_url="/calendar",
            )
            calendar_repo.mark_notified(db, entry.id)
            created += 1
    if created:
        cache.delete(f"notif_count:{user_id}")
    return {"notifications_created": created}
