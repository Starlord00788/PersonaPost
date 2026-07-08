from fastapi import APIRouter

from app.schemas import (
    DraftRequest,
    DraftResponse,
    HealthResponse,
    TrendResponse,
    VoiceProfileRequest,
    VoiceProfileResponse,
)
from app.services.generation import generate_draft
from app.services.trends import fetch_trends
from app.services.voice import build_voice_profile

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", service="PersonaPost AI")


@router.post("/voice-profile", response_model=VoiceProfileResponse)
def voice_profile(payload: VoiceProfileRequest) -> VoiceProfileResponse:
    return build_voice_profile(payload)


@router.get("/trends", response_model=TrendResponse)
def trends(niche: str = "ai") -> TrendResponse:
    return fetch_trends(niche=niche)


@router.post("/draft", response_model=DraftResponse)
def draft(payload: DraftRequest) -> DraftResponse:
    return generate_draft(payload)
