from fastapi import APIRouter, Depends, HTTPException, Request

from app.auth import get_current_user
from app.config import settings
from app.middleware.rate_limit import generation_rate_limit
from app.schemas import (
    CalendarEntryUpdate,
    CalendarResponse,
    DraftRequest,
    DraftResponse,
    DraftUpdateRequest,
    DraftUpdateResponse,
    HealthResponse,
    KnowledgeIngestRequest,
    KnowledgeIngestResponse,
    KnowledgeRetrieveRequest,
    KnowledgeRetrieveResponse,
    RefinementRequest,
    TrendResponse,
    VoiceProfileRequest,
    VoiceProfileResponse,
)
from app.services.generation import generate_draft
from app.services.knowledge import ingest_knowledge, retrieve_knowledge
from app.services.persistence import (
    approve_draft,
    list_calendar_entries,
    save_approved_draft,
    save_draft,
    save_voice_profile,
    update_calendar_entry,
    update_draft_text,
)
from app.services.refinement import refine_draft
from app.services.trends import fetch_trends
from app.services.voice import build_voice_profile

router = APIRouter()

# ---------------------------------------------------------------------------
# Health  — public
# ---------------------------------------------------------------------------


@router.get("/health", response_model=HealthResponse, tags=["system"])
def health() -> HealthResponse:
    return HealthResponse(status="ok", service="PersonaPost AI")


# ---------------------------------------------------------------------------
# Voice Profile  — auth required
# ---------------------------------------------------------------------------


@router.post("/voice-profile", response_model=VoiceProfileResponse, tags=["voice"])
def voice_profile(
    payload: VoiceProfileRequest,
    _: dict = Depends(get_current_user),
) -> VoiceProfileResponse:
    profile = build_voice_profile(payload)
    save_voice_profile(profile)
    return profile


# ---------------------------------------------------------------------------
# Trends  — public GET (read-only, no auth required)
# ---------------------------------------------------------------------------


@router.get("/trends", response_model=TrendResponse, tags=["trends"])
def trends(niche: str = "ai") -> TrendResponse:
    return fetch_trends(niche=niche)


# ---------------------------------------------------------------------------
# Knowledge  — ingest requires auth; retrieve is public
# ---------------------------------------------------------------------------


@router.post("/knowledge/ingest", response_model=KnowledgeIngestResponse, tags=["knowledge"])
def knowledge_ingest(
    payload: KnowledgeIngestRequest,
    _: dict = Depends(get_current_user),
) -> KnowledgeIngestResponse:
    return ingest_knowledge(payload)


@router.post("/knowledge/retrieve", response_model=KnowledgeRetrieveResponse, tags=["knowledge"])
def knowledge_retrieve(payload: KnowledgeRetrieveRequest) -> KnowledgeRetrieveResponse:
    return retrieve_knowledge(payload)


# ---------------------------------------------------------------------------
# Draft Generation  — auth + rate limited
# ---------------------------------------------------------------------------


@router.post("/draft", response_model=DraftResponse, tags=["draft"])
def draft(
    payload: DraftRequest,
    _: dict = Depends(get_current_user),
    __: None = Depends(generation_rate_limit),
) -> DraftResponse:
    # Auto-retrieve knowledge context when not supplied by the client
    if payload.auto_retrieve_knowledge and not payload.knowledge_snippets:
        query = " ".join(
            part for part in [payload.trend_title or "", payload.goal] if part
        ).strip()
        retrieval = retrieve_knowledge(
            KnowledgeRetrieveRequest(
                niche=payload.niche,
                query=query or payload.niche,
                top_k=3,
            )
        )
        payload = payload.model_copy(
            update={"knowledge_snippets": [item.text for item in retrieval.snippets]}
        )

    result = generate_draft(payload)

    # Always save draft so the frontend can inline-edit it
    draft_id: int | None = None
    try:
        draft_id = save_draft(payload, result)
    except Exception:
        pass

    persisted = False
    if payload.approve and result.reviewer_score >= settings.min_approval_score:
        try:
            if draft_id is not None:
                approve_draft(draft_id, result)
            else:
                save_approved_draft(payload, result)
            persisted = True
        except Exception:
            pass

    return result.model_copy(update={"persisted": persisted, "draft_id": draft_id})


# ---------------------------------------------------------------------------
# Draft Refinement  — auth + rate limited
# ---------------------------------------------------------------------------


@router.post("/draft/refine", response_model=DraftResponse, tags=["draft"])
def draft_refine(
    payload: RefinementRequest,
    _: dict = Depends(get_current_user),
    __: None = Depends(generation_rate_limit),
) -> DraftResponse:
    try:
        result = refine_draft(payload)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Refinement failed: {exc}") from exc

    persisted = False
    draft_id: int | None = None

    if payload.approve and result.reviewer_score >= settings.min_approval_score:
        draft_payload = DraftRequest(
            niche=payload.niche,
            goal=payload.goal,
            voice_profile=payload.voice_profile,
            trend_title=None,
            knowledge_snippets=[],
            approve=True,
            platform=payload.platform,
        )
        try:
            draft_id = save_draft(draft_payload, result)
            approve_draft(draft_id, result)
            persisted = True
        except Exception:
            pass

    return result.model_copy(update={"persisted": persisted, "draft_id": draft_id})


# ---------------------------------------------------------------------------
# Draft Inline Edit  — auth required
# ---------------------------------------------------------------------------


@router.put("/draft/{draft_id}", response_model=DraftUpdateResponse, tags=["draft"])
def update_draft(
    draft_id: int,
    payload: DraftUpdateRequest,
    _: dict = Depends(get_current_user),
) -> DraftUpdateResponse:
    try:
        update_draft_text(draft_id, payload.text)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    calendar_entry_id: int | None = None
    if payload.approve:
        from app.schemas import DraftResponse as DR

        dummy = DR(
            plan="Manual edit",
            draft=payload.text,
            reviewer_score=settings.min_approval_score,
            revision_notes=[],
        )
        try:
            calendar_entry_id = approve_draft(draft_id, dummy)
        except Exception:
            pass

    return DraftUpdateResponse(
        draft_id=draft_id,
        updated=True,
        calendar_entry_id=calendar_entry_id,
    )


# ---------------------------------------------------------------------------
# Calendar  — GET public, PATCH auth required
# ---------------------------------------------------------------------------


@router.get("/calendar", response_model=CalendarResponse, tags=["calendar"])
def calendar(limit: int = 50) -> CalendarResponse:
    return list_calendar_entries(limit=limit)


@router.patch("/calendar/{entry_id}", tags=["calendar"])
def calendar_update(
    entry_id: int,
    payload: CalendarEntryUpdate,
    _: dict = Depends(get_current_user),
) -> dict:
    try:
        item = update_calendar_entry(entry_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return item.model_dump()
