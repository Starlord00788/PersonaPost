"""Notification endpoints."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import get_db
from app.models import User
from app.schemas import NotificationCountResponse, NotificationListResponse
from app.services import notification_service

router = APIRouter(tags=["notifications"])


@router.get("/notifications", response_model=NotificationListResponse)
def get_notifications(
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NotificationListResponse:
    return notification_service.get_list(db, current_user.id, limit=limit)


@router.get("/notifications/count", response_model=NotificationCountResponse)
def get_notification_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NotificationCountResponse:
    return notification_service.get_count(db, current_user.id)


@router.post("/notifications/read-all")
def read_all(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    return notification_service.mark_all_read(db, current_user.id)


@router.post("/notifications/{notification_id}/read")
def read_one(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    ok = notification_service.mark_one_read(db, notification_id, current_user.id)
    return {"success": ok}


@router.post("/notifications/check")
def check_upcoming(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    return notification_service.check_upcoming_posts(db, current_user.id)
