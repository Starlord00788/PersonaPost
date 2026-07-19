"""Unit tests for app.services.refinement."""
from unittest.mock import MagicMock

import pytest

from app.schemas import RefinementRequest
from app.services.refinement import _fallback_refinement, refine_draft


def _payload(**kwargs) -> RefinementRequest:
    defaults = {
        "niche": "ai",
        "goal": "educational",
        "original_draft": "Automation is great. It saves time. Teams love it. Start with one workflow.",
        "instruction": "make it shorter",
    }
    defaults.update(kwargs)
    return RefinementRequest(**defaults)



# ── _fallback_refinement — heuristic edits ────────────────────────────────────

def test_fallback_shorter_halves_sentences(monkeypatch):
    monkeypatch.setattr(
        "app.services.refinement.review_draft", lambda d, p: (75, ["OK"])
    )
    result = _fallback_refinement(_payload(instruction="make it shorter"))
    original_sentences = _payload().original_draft.split(". ")
    result_sentences = [s for s in result.draft.split(". ") if s]
    assert len(result_sentences) <= len(original_sentences)


def test_fallback_bullet_converts_to_list(monkeypatch):
    monkeypatch.setattr(
        "app.services.refinement.review_draft", lambda d, p: (76, ["OK"])
    )
    result = _fallback_refinement(_payload(instruction="add bullet points"))
    assert "- " in result.draft


def test_fallback_other_instruction_appends_note(monkeypatch):
    monkeypatch.setattr(
        "app.services.refinement.review_draft", lambda d, p: (72, ["OK"])
    )
    instruction = "add a statistic"
    result = _fallback_refinement(_payload(instruction=instruction))
    assert instruction in result.draft


def test_fallback_plan_references_instruction(monkeypatch):
    monkeypatch.setattr(
        "app.services.refinement.review_draft", lambda d, p: (74, ["Note"])
    )
    result = _fallback_refinement(_payload(instruction="be more concise"))
    assert "be more concise" in result.plan


# ── refine_draft — Groq path ─────────────────────────────────────────────────

def test_refine_draft_uses_fallback_when_no_client(monkeypatch):
    monkeypatch.setattr("app.services.refinement.get_groq_client", lambda: None)
    monkeypatch.setattr(
        "app.services.refinement.review_draft", lambda d, p: (77, ["OK"])
    )
    result = refine_draft(_payload())
    assert result.draft
    assert result.plan


def test_refine_draft_falls_back_on_groq_exception(monkeypatch):
    mock_client = MagicMock()
    mock_client.chat.completions.create.side_effect = ConnectionError("api down")
    monkeypatch.setattr("app.services.refinement.get_groq_client", lambda: mock_client)
    monkeypatch.setattr(
        "app.services.refinement.review_draft", lambda d, p: (73, ["note"])
    )
    result = refine_draft(_payload())
    assert result.draft  # heuristic fallback


def test_refine_draft_falls_back_on_malformed_json(monkeypatch):
    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = MagicMock(
        choices=[MagicMock(message=MagicMock(content="not valid json"))]
    )
    monkeypatch.setattr("app.services.refinement.get_groq_client", lambda: mock_client)
    monkeypatch.setattr(
        "app.services.refinement.review_draft", lambda d, p: (70, ["note"])
    )
    result = refine_draft(_payload())
    assert result.draft


def test_refine_draft_successful_groq_response(monkeypatch):
    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = MagicMock(
        choices=[
            MagicMock(
                message=MagicMock(
                    content='{"plan": "Tightened the hook.", "draft": "Revised: automation saves time."}'
                )
            )
        ]
    )
    monkeypatch.setattr("app.services.refinement.get_groq_client", lambda: mock_client)
    monkeypatch.setattr(
        "app.services.refinement.review_draft", lambda d, p: (88, ["Nice"])
    )
    result = refine_draft(_payload())
    assert result.draft == "Revised: automation saves time."
    assert result.plan == "Tightened the hook."
    assert result.reviewer_score == 88


def test_refine_draft_platform_passed_to_review(monkeypatch):
    """Ensure platform is forwarded to the fake_request inside refine_draft."""
    captured: dict = {}

    def capturing_review(draft, payload):
        captured["platform"] = payload.platform
        return 80, ["OK"]

    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = MagicMock(
        choices=[
            MagicMock(
                message=MagicMock(
                    content='{"plan": "Revised.", "draft": "New draft text."}'
                )
            )
        ]
    )
    monkeypatch.setattr("app.services.refinement.get_groq_client", lambda: mock_client)
    monkeypatch.setattr("app.services.refinement.review_draft", capturing_review)

    refine_draft(_payload(platform="x"))
    assert captured.get("platform") == "x"
