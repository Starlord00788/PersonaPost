from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: str


# ---------------------------------------------------------------------------
# Voice
# ---------------------------------------------------------------------------

class VoiceProfileRequest(BaseModel):
    samples: List[str] = Field(default_factory=list, min_length=1)
    merge: bool = Field(
        default=False,
        description="When True, merge new signals with an existing saved profile instead of overwriting.",
    )


class VoiceSignals(BaseModel):
    tone: str
    formality: int
    sentence_length: str
    cta_style: str
    emoji_usage: str
    confidence: float


class VoiceProfileResponse(BaseModel):
    profile_id: str
    signals: VoiceSignals
    summary: str


# ---------------------------------------------------------------------------
# Trends
# ---------------------------------------------------------------------------

class TrendItem(BaseModel):
    title: str
    score: float
    source: str


class TrendResponse(BaseModel):
    niche: str
    trends: List[TrendItem]
    cached: bool = False


# ---------------------------------------------------------------------------
# Draft
# ---------------------------------------------------------------------------

class DraftRequest(BaseModel):
    niche: str = "ai"
    goal: str = "educational"
    voice_profile: Optional[VoiceSignals] = None
    trend_title: Optional[str] = None
    knowledge_snippets: List[str] = Field(default_factory=list)
    approve: bool = False
    auto_retrieve_knowledge: bool = True
    max_retries: int = Field(
        default=0,
        ge=0,
        le=3,
        description="Auto-refinement retries when score < threshold. 0 = disabled.",
    )
    platform: Literal["linkedin", "x", "instagram"] = Field(
        default="linkedin",
        description="Target platform determines tone and length constraints.",
    )


class DraftResponse(BaseModel):
    plan: str
    draft: str
    reviewer_score: int
    revision_notes: List[str]
    persisted: bool = False
    needs_manual_edit: bool = Field(
        default=False,
        description="True when auto-retries are exhausted and score is still below threshold.",
    )
    draft_id: Optional[int] = Field(
        default=None,
        description="DB id of the saved draft row — used for inline editing.",
    )


class DraftUpdateRequest(BaseModel):
    """Payload for PUT /api/draft/{draft_id} — inline text editor save."""
    text: str = Field(min_length=1, description="Updated full post text.")
    approve: bool = Field(
        default=False,
        description="If True and not already on the calendar, create a calendar entry.",
    )


class DraftUpdateResponse(BaseModel):
    draft_id: int
    updated: bool = True
    calendar_entry_id: Optional[int] = None


# ---------------------------------------------------------------------------
# Refinement
# ---------------------------------------------------------------------------

class RefinementRequest(BaseModel):
    niche: str = "ai"
    goal: str = "educational"
    voice_profile: Optional[VoiceSignals] = None
    original_draft: str
    instruction: str
    revision_notes: List[str] = Field(default_factory=list)
    approve: bool = False
    platform: Literal["linkedin", "x", "instagram"] = "linkedin"


# ---------------------------------------------------------------------------
# Calendar
# ---------------------------------------------------------------------------

class CalendarEntryItem(BaseModel):
    entry_id: int
    draft_id: Optional[int] = None
    title: str
    draft_excerpt: str
    status: str
    platform: str = "linkedin"
    scheduled_for: Optional[datetime] = None
    created_at: datetime


class CalendarResponse(BaseModel):
    items: List[CalendarEntryItem]


class CalendarEntryUpdate(BaseModel):
    """Payload for PATCH /api/calendar/{entry_id}."""
    status: Optional[Literal["approved", "scheduled", "published", "archived"]] = None
    scheduled_for: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Knowledge
# ---------------------------------------------------------------------------

class KnowledgeIngestRequest(BaseModel):
    niche: str = "general"
    documents: List[str] = Field(default_factory=list, min_length=1)


class KnowledgeIngestResponse(BaseModel):
    niche: str
    chunks_saved: int


class KnowledgeRetrieveRequest(BaseModel):
    niche: str = "general"
    query: str
    top_k: int = 3


class KnowledgeSnippet(BaseModel):
    text: str
    score: float


class KnowledgeRetrieveResponse(BaseModel):
    niche: str
    query: str
    snippets: List[KnowledgeSnippet]
