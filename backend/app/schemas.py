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


class DraftResponse(BaseModel):
    plan: str
    draft: str
    reviewer_score: int
    revision_notes: List[str]
