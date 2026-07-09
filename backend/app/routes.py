from fastapi import APIRouter

from app.config import settings
from app.schemas import (
    CalendarResponse,
    DraftRequest,
    DraftResponse,
    HealthResponse,
    KnowledgeIngestRequest,
    KnowledgeIngestResponse,
    KnowledgeRetrieveRequest,
    KnowledgeRetrieveResponse,
    TrendResponse,
    VoiceProfileRequest,
    VoiceProfileResponse,
)
from app.services.generation import generate_draft
from app.services.knowledge import ingest_knowledge, retrieve_knowledge
from app.services.persistence import list_calendar_entries, save_approved_draft, save_voice_profile
from app.services.trends import fetch_trends
from app.services.voice import build_voice_profile

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", service="PersonaPost AI")


@router.post("/voice-profile", response_model=VoiceProfileResponse)
def voice_profile(payload: VoiceProfileRequest) -> VoiceProfileResponse:
    profile = build_voice_profile(payload)
    save_voice_profile(profile)
    return profile


@router.get("/trends", response_model=TrendResponse)
def trends(niche: str = "ai") -> TrendResponse:
    return fetch_trends(niche=niche)


@router.post("/knowledge/ingest", response_model=KnowledgeIngestResponse)
def knowledge_ingest(payload: KnowledgeIngestRequest) -> KnowledgeIngestResponse:
    return ingest_knowledge(payload)


@router.post("/knowledge/retrieve", response_model=KnowledgeRetrieveResponse)
def knowledge_retrieve(payload: KnowledgeRetrieveRequest) -> KnowledgeRetrieveResponse:
    return retrieve_knowledge(payload)


@router.post("/draft", response_model=DraftResponse)
def draft(payload: DraftRequest) -> DraftResponse:
    if payload.auto_retrieve_knowledge and not payload.knowledge_snippets:
        query = " ".join(part for part in [payload.trend_title or "", payload.goal] if part).strip()
        retrieval = retrieve_knowledge(
            KnowledgeRetrieveRequest(niche=payload.niche, query=query or payload.niche, top_k=3)
        )
        payload = payload.model_copy(update={"knowledge_snippets": [item.text for item in retrieval.snippets]})

    result = generate_draft(payload)
    persisted = False
    if payload.approve and result.reviewer_score >= settings.min_approval_score:
        save_approved_draft(payload, result)
        persisted = True
    return result.model_copy(update={"persisted": persisted})


@router.get("/calendar", response_model=CalendarResponse)
def calendar(limit: int = 50) -> CalendarResponse:
    return list_calendar_entries(limit=limit)
