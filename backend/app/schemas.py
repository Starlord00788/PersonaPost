from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: str


class VoiceProfileRequest(BaseModel):
    samples: List[str] = Field(default_factory=list, min_length=1)


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


class TrendItem(BaseModel):
    title: str
    score: float
    source: str


class TrendResponse(BaseModel):
    niche: str
    trends: List[TrendItem]


class DraftRequest(BaseModel):
    niche: str = "ai"
    goal: str = "educational"
    voice_profile: Optional[VoiceSignals] = None
    trend_title: Optional[str] = None
    knowledge_snippets: List[str] = Field(default_factory=list)
    approve: bool = False
    auto_retrieve_knowledge: bool = True


class DraftResponse(BaseModel):
    plan: str
    draft: str
    reviewer_score: int
    revision_notes: List[str]
    persisted: bool = False


class CalendarEntryItem(BaseModel):
    entry_id: int
    draft_id: Optional[int] = None
    title: str
    draft_excerpt: str
    status: str
    scheduled_for: Optional[datetime] = None
    created_at: datetime


class CalendarResponse(BaseModel):
    items: List[CalendarEntryItem]


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
