"""User repository — all user-related DB queries."""
import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models import User

logger = logging.getLogger(__name__)


def find_by_username(db: Session, username: str) -> Optional[User]:
    return db.query(User).filter(User.username == username, User.is_active == True).first()


def find_by_email(db: Session, email: str) -> Optional[User]:
    return db.query(User).filter(User.email == email.lower(), User.is_active == True).first()


def find_by_google_id(db: Session, google_id: str) -> Optional[User]:
    return db.query(User).filter(User.google_id == google_id).first()


def find_by_id(db: Session, user_id: int) -> Optional[User]:
    return db.query(User).filter(User.id == user_id, User.is_active == True).first()


def create(db: Session, username: str, email: str, password_hash: Optional[str] = None,
           display_name: str = "", google_id: Optional[str] = None) -> User:
    user = User(
        username=username,
        email=email.lower(),
        password_hash=password_hash,
        display_name=display_name or username,
        google_id=google_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    logger.info("Created user id=%s username=%s", user.id, user.username)
    return user


def update_last_login(db: Session, user: User) -> None:
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()


def update_password(db: Session, user: User, new_hash: str) -> None:
    user.password_hash = new_hash
    db.commit()


def update_display_name(db: Session, user: User, display_name: str) -> None:
    user.display_name = display_name
    db.commit()


def username_exists(db: Session, username: str) -> bool:
    return db.query(User.id).filter(User.username == username).first() is not None


def email_exists(db: Session, email: str) -> bool:
    return db.query(User.id).filter(User.email == email.lower()).first() is not None
