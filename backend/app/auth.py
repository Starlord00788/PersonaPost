"""JWT authentication — multi-user, DB-backed."""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token", auto_error=False)


def verify_password(plain: str, hashed: str) -> bool:
    if not hashed:
        return False
    return pwd_context.verify(plain, hashed)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode["exp"] = expire
    return jwt.encode(to_encode, settings.secret_key, algorithm=ALGORITHM)


def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    """Validate Bearer token and return the User ORM object."""
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials — please log in again.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_exc
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        user_id: Optional[int] = payload.get("user_id")
        username: Optional[str] = payload.get("sub")
    except JWTError:
        raise credentials_exc

    from app.repositories import user_repo  # lazy import to avoid circular
    from app.models import User

    user = None
    # Support tokens with user_id (new) or username only (legacy admin tokens)
    if user_id:
        user = user_repo.find_by_id(db, user_id)
    elif username:
        user = user_repo.find_by_username(db, username)
        # Also allow legacy admin if not in DB yet (first boot)
        if not user and username == settings.admin_username:
            # Auto-create admin user on first login with new system
            try:
                user = user_repo.create(
                    db,
                    username=settings.admin_username,
                    email=f"{settings.admin_username}@personapost.local",
                    password_hash=settings.admin_password_hash,
                    display_name="Admin",
                )
            except Exception:
                pass

    if not user or not user.is_active:
        raise credentials_exc

    return user
