"""Auth routes: token issuance and current-user introspection."""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel

from app.auth import create_access_token, get_current_user, verify_password
from app.config import settings

router = APIRouter(tags=["auth"])


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserInfo(BaseModel):
    username: str


@router.post("/auth/token", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends()) -> Token:
    """Exchange username + password for a JWT access token.

    Uses OAuth2 password flow (application/x-www-form-urlencoded body).
    """
    is_valid = (
        form_data.username == settings.admin_username
        and verify_password(form_data.password, settings.admin_password_hash)
    )
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(data={"sub": form_data.username})
    return Token(access_token=access_token)


@router.get("/auth/me", response_model=UserInfo)
async def me(current_user: dict = Depends(get_current_user)) -> UserInfo:
    """Return the authenticated user's info (token introspection)."""
    return UserInfo(username=current_user["username"])
