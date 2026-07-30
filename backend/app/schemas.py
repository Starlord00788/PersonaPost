from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator


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
    # Richer fields extracted by LLM (empty when heuristic fallback is used)
    vocabulary_level: str = Field(default="intermediate", description="basic | intermediate | advanced | expert")
    key_phrases: List[str] = Field(default_factory=list, description="Characteristic phrases / words from the samples")
    writing_patterns: List[str] = Field(default_factory=list, description="Structural patterns observed in the writing")


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
    reason: str = Field(default="", description="Why this topic is relevant to the user's niche")


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
    # Analytics fields
    hook_strength: int = Field(default=0, description="0-10 score for hook quality")
    best_time_to_post: str = Field(default="", description="Recommended posting time")
    reach_tier: str = Field(default="", description="Niche / Broad / Viral")
    readability_grade: str = Field(default="", description="Easy / Medium / Advanced")


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


# ---------------------------------------------------------------------------
# Multi-platform
# ---------------------------------------------------------------------------


class MultiPlatformDraftResponse(BaseModel):
    linkedin: DraftResponse
    x: DraftResponse
    instagram: DraftResponse


# ---------------------------------------------------------------------------
# Competitor Analysis
# ---------------------------------------------------------------------------


class CompetitorAnalysisRequest(BaseModel):
    competitor_post: str
    niche: str = "general"
    voice_profile: Optional[VoiceSignals] = None
    goal: str = "educational"


class CompetitorAnalysisResponse(BaseModel):
    strengths: List[str]
    weaknesses: List[str]
    rewritten_post: str
    improvement_summary: str


# ---------------------------------------------------------------------------
# Google OAuth
# ---------------------------------------------------------------------------


class GoogleAuthRequest(BaseModel):
    id_token: str


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


# ---------------------------------------------------------------------------
# Auth / User
# ---------------------------------------------------------------------------

class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    email: str = Field(min_length=5)
    password: str = Field(min_length=8)
    display_name: str = Field(default="", max_length=255)

class UserInfo(BaseModel):
    user_id: int
    username: str
    email: str
    display_name: str
    plan: str
    created_at: datetime

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)

# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------

class NotificationItem(BaseModel):
    id: int
    type: str
    title: str
    message: str
    is_read: bool
    action_url: Optional[str] = None
    created_at: datetime

class NotificationCountResponse(BaseModel):
    unread: int

class NotificationListResponse(BaseModel):
    items: List[NotificationItem]
    unread_count: int


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------

class UsageStats(BaseModel):
    total_drafts: int
    drafts_this_week: int
    avg_score: float
    top_platform: str
    top_niche: str
    best_score: int
    streak_days: int  # consecutive days with at least one draft
    score_distribution: dict  # {"0-50": int, "51-70": int, "71-85": int, "86-100": int}
