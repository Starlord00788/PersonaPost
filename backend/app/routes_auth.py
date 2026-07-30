"""Auth routes: register, login, Google OAuth, profile management."""
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import (
    create_access_token, get_current_user, get_password_hash, verify_password
)
from app.config import settings
from app.db import get_db
from app.models import User
from app.repositories import user_repo
from app.schemas import ChangePasswordRequest, GoogleAuthRequest, UserCreate, UserInfo

logger = logging.getLogger(__name__)
router = APIRouter(tags=["auth"])


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict = {}


# ---------------------------------------------------------------------------
# Register
# ---------------------------------------------------------------------------

@router.post("/auth/register", response_model=Token, status_code=201)
def register(
    payload: UserCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> Token:
    """Create a new user account."""
    if user_repo.username_exists(db, payload.username):
        raise HTTPException(status_code=409, detail="Username already taken.")
    if user_repo.email_exists(db, payload.email):
        raise HTTPException(status_code=409, detail="Email already registered.")

    password_hash = get_password_hash(payload.password)
    user = user_repo.create(
        db,
        username=payload.username,
        email=payload.email,
        password_hash=password_hash,
        display_name=payload.display_name or payload.username,
    )

    # Welcome notification in background (non-blocking)
    background_tasks.add_task(_send_welcome, user.id, user.display_name)

    token = create_access_token(data={"sub": user.username, "user_id": user.id})
    return Token(
        access_token=token,
        user={"user_id": user.id, "username": user.username, "display_name": user.display_name},
    )


def _send_welcome(user_id: int, display_name: str) -> None:
    from app.db import SessionLocal
    from app.services import notification_service
    with SessionLocal() as db:
        try:
            notification_service.create_welcome(db, user_id, display_name)
        except Exception as e:
            logger.warning("Failed to create welcome notification: %s", e)


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------

@router.post("/auth/token", response_model=Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
) -> Token:
    user = user_repo.find_by_username(db, form_data.username)

    # Legacy: auto-create admin from env on first boot
    if not user and form_data.username == settings.admin_username:
        try:
            if settings.admin_password_hash and verify_password(form_data.password, settings.admin_password_hash):
                user = user_repo.create(
                    db,
                    username=settings.admin_username,
                    email=f"{settings.admin_username}@personapost.local",
                    password_hash=settings.admin_password_hash,
                    display_name="Admin",
                )
        except Exception as e:
            logger.warning("Legacy admin auto-create failed: %s", e)

    if not user or not verify_password(form_data.password, user.password_hash or ""):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Update last login (non-blocking, best effort)
    try:
        user_repo.update_last_login(db, user)
    except Exception:
        pass

    token = create_access_token(data={"sub": user.username, "user_id": user.id})
    return Token(
        access_token=token,
        user={"user_id": user.id, "username": user.username, "display_name": user.display_name},
    )


# ---------------------------------------------------------------------------
# Google OAuth
# ---------------------------------------------------------------------------

@router.post("/auth/google", response_model=Token)
def google_auth(payload: GoogleAuthRequest, db: Session = Depends(get_db)) -> Token:
    try:
        from google.oauth2 import id_token as google_id_token
        from google.auth.transport import requests as google_requests

        if not settings.google_client_id:
            raise HTTPException(status_code=503, detail="Google OAuth not configured")

        id_info = google_id_token.verify_oauth2_token(
            payload.id_token, google_requests.Request(), settings.google_client_id
        )
        email = id_info.get("email", "").lower()
        name = id_info.get("name", email)
        google_sub = id_info.get("sub", "")

        if not email:
            raise HTTPException(status_code=400, detail="Google token missing email")

        # Find existing user by google_id or email
        user = user_repo.find_by_google_id(db, google_sub)
        if not user:
            user = user_repo.find_by_email(db, email)

        if not user:
            # Register new Google user
            base_username = email.split("@")[0].replace(".", "_")[:30]
            username = base_username
            counter = 1
            while user_repo.username_exists(db, username):
                username = f"{base_username}{counter}"
                counter += 1
            user = user_repo.create(
                db, username=username, email=email,
                display_name=name, google_id=google_sub
            )

        token = create_access_token(data={"sub": user.username, "user_id": user.id})
        return Token(
            access_token=token,
            user={"user_id": user.id, "username": user.username, "display_name": user.display_name},
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=401, detail=f"Google auth failed: {exc}") from exc


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------

@router.get("/auth/me", response_model=UserInfo)
def me(current_user: User = Depends(get_current_user)) -> UserInfo:
    return UserInfo(
        user_id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        display_name=current_user.display_name,
        plan=current_user.plan,
        created_at=current_user.created_at,
    )


@router.post("/auth/change-password")
def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    if not verify_password(payload.current_password, current_user.password_hash or ""):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    user_repo.update_password(db, current_user, get_password_hash(payload.new_password))
    return {"success": True, "message": "Password updated successfully."}
