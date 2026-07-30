"""Unit tests for app.services.generation."""
from unittest.mock import MagicMock

import pytest

from app.schemas import DraftRequest, DraftResponse, VoiceSignals
from app.services.generation import (
    _describe_voice,
    _fallback_draft,
    _strip_fences,
    generate_draft,
)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _payload(**kwargs) -> DraftRequest:
    return DraftRequest(niche="ai", goal="educational", **kwargs)


# ── _strip_fences ─────────────────────────────────────────────────────────────

def test_strip_fences_removes_json_fence():
    raw = '```json\n{"plan": "p", "draft": "d"}\n```'
    assert _strip_fences(raw) == '{"plan": "p", "draft": "d"}'


def test_strip_fences_removes_plain_fence():
    raw = '```\n{"key": "val"}\n```'
    result = _strip_fences(raw)
    assert "```" not in result
    assert '"key"' in result


def test_strip_fences_passthrough_plain_json():
    raw = '{"plan": "p", "draft": "d"}'
    assert _strip_fences(raw) == raw


# ── _describe_voice ───────────────────────────────────────────────────────────

def test_describe_voice_returns_default_when_none():
    assert "Balanced and practical" in _describe_voice(None)


def test_describe_voice_with_signals():
    signals = VoiceSignals(
        tone="direct",
        formality=7,
        sentence_length="short",
        cta_style="question",
        emoji_usage="none",
        confidence=0.9,
    )
    desc = _describe_voice(signals)
    assert "direct" in desc
    assert "7" in desc
    assert "short" in desc


# ── _fallback_draft ───────────────────────────────────────────────────────────

def test_fallback_draft_returns_valid_response(monkeypatch):
    monkeypatch.setattr(
        "app.services.generation.review_draft", lambda d, p: (74, ["Improve hook"])
    )
    result = _fallback_draft(_payload())
    assert result.plan
    assert result.draft
    assert result.reviewer_score == 74
    assert result.needs_manual_edit is False


def test_fallback_draft_incorporates_trend_title(monkeypatch):
    monkeypatch.setattr(
        "app.services.generation.review_draft", lambda d, p: (80, [])
    )
    result = _fallback_draft(_payload(trend_title="Zero-shot prompting"))
    assert "Zero-shot prompting" in result.draft or "Zero-shot prompting" in result.plan


# ── generate_draft — fallback paths ──────────────────────────────────────────

def test_generate_draft_uses_fallback_when_no_api_key(monkeypatch):
    monkeypatch.setattr("app.services.generation.get_groq_client", lambda: None)
    monkeypatch.setattr(
        "app.services.generation.review_draft", lambda d, p: (80, ["OK"])
    )
    result = generate_draft(_payload())
    assert result.draft
    assert result.plan


def test_generate_draft_falls_back_on_groq_exception(monkeypatch):
    mock_client = MagicMock()
    mock_client.chat.completions.create.side_effect = RuntimeError("connection refused")
    monkeypatch.setattr("app.services.generation.get_groq_client", lambda: mock_client)
    monkeypatch.setattr(
        "app.services.generation.review_draft", lambda d, p: (82, ["OK"])
    )
    result = generate_draft(_payload())
    assert result.draft  # deterministic fallback fired


def test_generate_draft_falls_back_on_malformed_json(monkeypatch):
    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = MagicMock(
        choices=[MagicMock(message=MagicMock(content="not json at all"))]
    )
    monkeypatch.setattr("app.services.generation.get_groq_client", lambda: mock_client)
    monkeypatch.setattr(
        "app.services.generation.review_draft", lambda d, p: (78, ["OK"])
    )
    result = generate_draft(_payload())
    assert result.draft


# ── generate_draft — retry loop ───────────────────────────────────────────────

def test_generate_draft_retry_calls_refine_when_below_threshold(monkeypatch):
    """When score < threshold and max_retries > 0, _do_refine must be called."""
    refine_calls: list[str] = []

    def fake_refine(payload):
        refine_calls.append(payload.instruction)
        return DraftResponse(
            plan="Refined plan",
            draft="Refined draft",
            reviewer_score=85,
            revision_notes=["Good"],
        )

    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = MagicMock(
        choices=[MagicMock(message=MagicMock(content='{"plan": "P", "draft": "D"}'))]
    )
    monkeypatch.setattr("app.services.generation.get_groq_client", lambda: mock_client)
    monkeypatch.setattr(
        "app.services.generation.review_draft", lambda d, p: (50, ["Weak hook"])
    )
    monkeypatch.setattr("app.services.generation._do_refine", fake_refine)

    result = generate_draft(_payload(max_retries=1))
    assert len(refine_calls) >= 1
    assert result.reviewer_score == 85


def test_generate_draft_needs_manual_edit_when_retries_exhausted(monkeypatch):
    """After max_retries passes, needs_manual_edit=True when still below threshold."""

    def fake_refine(payload):
        return DraftResponse(
            plan="Plan",
            draft="Still weak",
            reviewer_score=40,
            revision_notes=["Still bad"],
        )

    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = MagicMock(
        choices=[MagicMock(message=MagicMock(content='{"plan": "P", "draft": "D"}'))]
    )
    monkeypatch.setattr("app.services.generation.get_groq_client", lambda: mock_client)
    monkeypatch.setattr(
        "app.services.generation.review_draft", lambda d, p: (40, ["Too weak"]
    ))
    monkeypatch.setattr("app.services.generation._do_refine", fake_refine)

    result = generate_draft(_payload(max_retries=2))
    assert result.needs_manual_edit is True


def test_generate_draft_no_retry_when_max_retries_zero(monkeypatch):
    """max_retries=0 means the retry loop is skipped entirely."""
    refine_calls: list = []

    def fake_refine(payload):
        refine_calls.append(1)
        return DraftResponse(plan="P", draft="D", reviewer_score=90, revision_notes=[])

    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = MagicMock(
        choices=[MagicMock(message=MagicMock(content='{"plan": "P", "draft": "D"}'))]
    )
    monkeypatch.setattr("app.services.generation.get_groq_client", lambda: mock_client)
    monkeypatch.setattr(
        "app.services.generation.review_draft", lambda d, p: (30, ["Very weak"])
    )
    monkeypatch.setattr("app.services.generation._do_refine", fake_refine)

    generate_draft(_payload(max_retries=0))
    assert len(refine_calls) == 0
