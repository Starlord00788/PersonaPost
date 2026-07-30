from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from fastapi.responses import StreamingResponse

from app.auth import get_current_user
from app.config import settings
from app.middleware.rate_limit import generation_rate_limit
from app.models import User
from app.schemas import (
    CalendarEntryUpdate,
    CalendarResponse,
    CompetitorAnalysisRequest,
    CompetitorAnalysisResponse,
    DraftRequest,
    DraftResponse,
    DraftUpdateRequest,
    DraftUpdateResponse,
    HealthResponse,
    KnowledgeIngestRequest,
    KnowledgeIngestResponse,
    KnowledgeRetrieveRequest,
    KnowledgeRetrieveResponse,
    MultiPlatformDraftResponse,
    RefinementRequest,
    TrendResponse,
    UsageStats,
    VoiceProfileRequest,
    VoiceProfileResponse,
)
from app.services.competitor import analyze_competitor_post
from app.services.generation import generate_draft, generate_multi_platform, stream_draft
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
from app.services.review import review_draft as _review_draft
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
    current_user: User = Depends(get_current_user),
) -> VoiceProfileResponse:
    profile = build_voice_profile(payload)
    save_voice_profile(profile, user_id=current_user.id)
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
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
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
        draft_id = save_draft(payload, result, user_id=current_user.id)
    except Exception:
        pass

    persisted = False
    if payload.approve and result.reviewer_score >= settings.min_approval_score:
        try:
            if draft_id is not None:
                approve_draft(draft_id, result, user_id=current_user.id)
            else:
                save_approved_draft(payload, result, user_id=current_user.id)
            persisted = True
        except Exception:
            pass

    # Score alert notification (background, non-blocking)
    if result.reviewer_score >= 85:
        from app.services.notification_service import create_score_alert
        from app.db import SessionLocal as SL
        try:
            with SL() as ndb:
                create_score_alert(ndb, current_user.id, result.reviewer_score)
        except Exception:
            pass

    return result.model_copy(update={"persisted": persisted, "draft_id": draft_id})


# ---------------------------------------------------------------------------
# Draft Refinement  — auth + rate limited
# ---------------------------------------------------------------------------


@router.post("/draft/refine", response_model=DraftResponse, tags=["draft"])
def draft_refine(
    payload: RefinementRequest,
    current_user: User = Depends(get_current_user),
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
            draft_id = save_draft(draft_payload, result, user_id=current_user.id)
            approve_draft(draft_id, result, user_id=current_user.id)
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
    current_user: User = Depends(get_current_user),
) -> DraftUpdateResponse:
    try:
        update_draft_text(draft_id, payload.text, user_id=current_user.id)
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
            calendar_entry_id = approve_draft(draft_id, dummy, user_id=current_user.id)
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
def calendar(
    limit: int = 50,
    current_user: User = Depends(get_current_user),
) -> CalendarResponse:
    return list_calendar_entries(limit=limit, user_id=current_user.id)


@router.patch("/calendar/{entry_id}", tags=["calendar"])
def calendar_update(
    entry_id: int,
    payload: CalendarEntryUpdate,
    current_user: User = Depends(get_current_user),
) -> dict:
    try:
        item = update_calendar_entry(entry_id, payload, user_id=current_user.id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return item.model_dump()


# ---------------------------------------------------------------------------
# Multi-platform draft  — auth + rate limited
# ---------------------------------------------------------------------------


@router.post("/draft/multi-platform", response_model=MultiPlatformDraftResponse, tags=["draft"])
def draft_multi_platform(
    payload: DraftRequest,
    current_user: User = Depends(get_current_user),
    __: None = Depends(generation_rate_limit),
) -> MultiPlatformDraftResponse:
    """Generate LinkedIn, X, and Instagram drafts in one call."""
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
    return generate_multi_platform(payload)


# ---------------------------------------------------------------------------
# Competitor analysis  — auth required
# ---------------------------------------------------------------------------


@router.post("/competitor/analyze", response_model=CompetitorAnalysisResponse, tags=["draft"])
def competitor_analyze(
    payload: CompetitorAnalysisRequest,
    current_user: User = Depends(get_current_user),
) -> CompetitorAnalysisResponse:
    """Analyze a competitor post and rewrite it in the user's voice."""
    return analyze_competitor_post(payload)


# ---------------------------------------------------------------------------
# Streaming Draft  — auth required
# ---------------------------------------------------------------------------

@router.post("/draft/stream", tags=["draft"])
def draft_stream(
    payload: DraftRequest,
    current_user: User = Depends(get_current_user),
    _: None = Depends(generation_rate_limit),
) -> StreamingResponse:
    """Stream the draft text token by token using SSE."""
    return StreamingResponse(
        stream_draft(payload),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# Usage Stats  — auth required
# ---------------------------------------------------------------------------

@router.get("/stats", response_model=UsageStats, tags=["system"])
def get_stats(
    current_user: User = Depends(get_current_user),
) -> UsageStats:
    """Return usage statistics for the authenticated user."""
    from datetime import datetime, timedelta, timezone
    from app.db import SessionLocal
    from app.models import Draft
    import statistics

    with SessionLocal() as db:
        all_drafts = (
            db.query(Draft)
            .filter(Draft.user_id == current_user.id)
            .all()
        )

    if not all_drafts:
        return UsageStats(
            total_drafts=0, drafts_this_week=0, avg_score=0.0,
            top_platform="linkedin", top_niche="—", best_score=0,
            streak_days=0, score_distribution={"0-50": 0, "51-70": 0, "71-85": 0, "86-100": 0}
        )

    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)

    scores = [d.reviewer_score for d in all_drafts]
    this_week = [d for d in all_drafts if d.created_at and d.created_at.replace(tzinfo=timezone.utc) >= week_ago]

    # Top platform
    platform_counts: dict[str, int] = {}
    for d in all_drafts:
        platform_counts[d.platform] = platform_counts.get(d.platform, 0) + 1
    top_platform = max(platform_counts, key=platform_counts.get) if platform_counts else "linkedin"

    # Top niche
    niche_counts: dict[str, int] = {}
    for d in all_drafts:
        niche_counts[d.niche] = niche_counts.get(d.niche, 0) + 1
    top_niche = max(niche_counts, key=niche_counts.get) if niche_counts else "—"

    # Streak
    dates = sorted(set(
        d.created_at.date() for d in all_drafts if d.created_at
    ), reverse=True)
    streak = 0
    if dates:
        check = now.date()
        for date in dates:
            if date == check or date == check - timedelta(days=1):
                streak += 1
                check = date
            else:
                break

    # Score distribution
    dist = {"0-50": 0, "51-70": 0, "71-85": 0, "86-100": 0}
    for s in scores:
        if s <= 50: dist["0-50"] += 1
        elif s <= 70: dist["51-70"] += 1
        elif s <= 85: dist["71-85"] += 1
        else: dist["86-100"] += 1

    return UsageStats(
        total_drafts=len(all_drafts),
        drafts_this_week=len(this_week),
        avg_score=round(statistics.mean(scores), 1) if scores else 0.0,
        top_platform=top_platform,
        top_niche=top_niche,
        best_score=max(scores) if scores else 0,
        streak_days=streak,
        score_distribution=dist,
    )


# ---------------------------------------------------------------------------
# Export Drafts  — auth required
# ---------------------------------------------------------------------------

@router.get("/drafts/export", tags=["draft"])
def export_drafts(
    format: str = "csv",
    current_user: User = Depends(get_current_user),
):
    """Export all user drafts as CSV or JSON."""
    import csv
    import io
    import json
    from fastapi.responses import Response
    from app.db import SessionLocal
    from app.models import Draft

    with SessionLocal() as db:
        drafts = (
            db.query(Draft)
            .filter(Draft.user_id == current_user.id)
            .order_by(Draft.created_at.desc())
            .all()
        )

    rows = [
        {
            "id": d.id,
            "platform": d.platform,
            "niche": d.niche,
            "goal": d.goal,
            "trend_title": d.trend_title or "",
            "draft": d.draft,
            "score": d.reviewer_score,
            "approved": d.approved,
            "created_at": d.created_at.isoformat() if d.created_at else "",
        }
        for d in drafts
    ]

    if format.lower() == "json":
        return Response(
            content=json.dumps(rows, indent=2, ensure_ascii=False),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=personapost_drafts.json"},
        )

    # Default: CSV
    output = io.StringIO()
    if rows:
        writer = csv.DictWriter(output, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)
    else:
        output.write("No drafts found.")

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=personapost_drafts.csv"},
    )


# ---------------------------------------------------------------------------
# Review-only endpoint — takes existing draft text, returns score + analytics
# ---------------------------------------------------------------------------

class ReviewOnlyRequest(BaseModel):
    draft_text: str
    platform: str = "linkedin"
    niche: str = "general"
    goal: str = "educational"


class ReviewOnlyResponse(BaseModel):
    reviewer_score: int
    reviewer_notes: list
    hook_strength: int
    best_time_to_post: str
    reach_tier: str
    readability_grade: str


@router.post("/draft/review-text", response_model=ReviewOnlyResponse, tags=["draft"])
def review_text_only(
    payload: ReviewOnlyRequest,
    current_user: User = Depends(get_current_user),
) -> ReviewOnlyResponse:
    """Score and analyze an existing draft text without regenerating it."""
    from app.schemas import DraftRequest as _DR
    from app.services.generation import _compute_analytics

    # review_draft expects a DraftRequest payload; build a minimal one
    _dummy_payload = _DR(
        niche=payload.niche,
        goal=payload.goal,
        platform=payload.platform,
    )
    # review_draft returns a tuple: (score: int, notes: list[str])
    score, notes = _review_draft(payload.draft_text, _dummy_payload)
    # Compute analytics
    analytics = _compute_analytics(payload.draft_text, payload.platform, payload.niche)
    return ReviewOnlyResponse(
        reviewer_score=score,
        reviewer_notes=notes,
        hook_strength=analytics.get("hook_strength", 0),
        best_time_to_post=analytics.get("best_time_to_post", ""),
        reach_tier=analytics.get("reach_tier", "Niche"),
        readability_grade=analytics.get("readability_grade", "Medium"),
    )
