"""Unit tests for app.services.review."""
from unittest.mock import MagicMock

import pytest

from app.schemas import DraftRequest
from app.services.review import _extract_json, _fallback_review, review_draft


def _payload(**kwargs) -> DraftRequest:
    return DraftRequest(niche="ai", goal="educational", **kwargs)


# ── _extract_json ─────────────────────────────────────────────────────────────

def test_extract_json_plain_passthrough():
    raw = '{"score": 80, "revision_notes": ["good"]}'
    result = _extract_json(raw)
    assert result == raw


def test_extract_json_strips_markdown_fence():
    raw = '```json\n{"score": 75, "revision_notes": ["ok"]}\n```'
    result = _extract_json(raw)
    import json
    parsed = json.loads(result)
    assert parsed["score"] == 75


def test_extract_json_finds_object_in_prose():
    raw = 'Here is my review: {"score": 90, "revision_notes": ["great hook"]} — done.'
    result = _extract_json(raw)
    import json
    parsed = json.loads(result)
    assert parsed["score"] == 90


def test_extract_json_empty_string():
    result = _extract_json("")
    assert result == ""


# ── _fallback_review ──────────────────────────────────────────────────────────

def test_fallback_review_base_score_no_voice():
    score, notes = _fallback_review("Short draft.", _payload())
    assert 70 <= score <= 95
    assert len(notes) >= 1


def test_fallback_review_higher_score_with_voice_and_long_draft():
    from app.schemas import VoiceSignals

    signals = VoiceSignals(
        tone="professional",
        formality=8,
        sentence_length="medium",
        cta_style="directive",
        emoji_usage="none",
        confidence=0.9,
    )
    long_draft = "A " * 120  # > 220 chars
    score, notes = _fallback_review(long_draft, _payload(voice_profile=signals))
    assert 0 <= score <= 100
    assert len(notes) >= 1


def test_fallback_review_score_capped_at_95():
    from app.schemas import VoiceSignals

    signals = VoiceSignals(
        tone="professional", formality=8, sentence_length="long",
        cta_style="directive", emoji_usage="none", confidence=0.99,
    )
    long_draft = "B " * 200
    score, _ = _fallback_review(long_draft, _payload(voice_profile=signals))
    assert 0 <= score <= 100


# ── review_draft ──────────────────────────────────────────────────────────────

def test_review_draft_uses_fallback_when_no_client(monkeypatch):
    monkeypatch.setattr("app.services.review.get_groq_client", lambda: None)
    score, notes = review_draft("Some draft text.", _payload())
    assert isinstance(score, int)
    assert 0 <= score <= 100
    assert len(notes) >= 1


def test_review_draft_uses_fallback_on_groq_exception(monkeypatch):
    mock_client = MagicMock()
    mock_client.chat.completions.create.side_effect = RuntimeError("timeout")
    monkeypatch.setattr("app.services.review.get_groq_client", lambda: mock_client)
    score, notes = review_draft("Some draft.", _payload())
    assert 0 <= score <= 100


def test_review_draft_clamps_score_to_valid_range(monkeypatch):
    """If the LLM returns an out-of-range score, clamp to [0, 100]."""
    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = MagicMock(
        choices=[
            MagicMock(
                message=MagicMock(
                    content='{"score": 999, "revision_notes": ["over the top"]}'
                )
            )
        ]
    )
    monkeypatch.setattr("app.services.review.get_groq_client", lambda: mock_client)
    score, _ = review_draft("Some draft.", _payload())
    assert score == 100


def test_review_draft_clamps_negative_score(monkeypatch):
    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = MagicMock(
        choices=[
            MagicMock(
                message=MagicMock(
                    content='{"score": -50, "revision_notes": ["terrible"]}'
                )
            )
        ]
    )
    monkeypatch.setattr("app.services.review.get_groq_client", lambda: mock_client)
    score, _ = review_draft("Some draft.", _payload())
    assert score == 0


def test_review_draft_handles_empty_notes_from_llm(monkeypatch):
    """If notes list is empty, fallback notes are inserted."""
    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = MagicMock(
        choices=[
            MagicMock(
                message=MagicMock(content='{"score": 78, "revision_notes": []}')
            )
        ]
    )
    monkeypatch.setattr("app.services.review.get_groq_client", lambda: mock_client)
    _, notes = review_draft("Some draft.", _payload())
    assert len(notes) >= 1
