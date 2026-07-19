"""Integration tests for persistence service — via HTTP routes and direct calls."""
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


# ── Voice profile upsert ──────────────────────────────────────────────────────

def test_voice_profile_created_and_returned():
    resp = client.post(
        "/api/voice-profile",
        json={"samples": ["I write practical notes.", "My style is direct and concise."]},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["profile_id"].startswith("vp_")
    assert "signals" in data
    assert "summary" in data


def test_voice_profile_upsert_same_samples():
    """Calling with identical samples should upsert (not duplicate) the row."""
    payload = {"samples": ["Consistent sample text for upsert test."]}
    resp1 = client.post("/api/voice-profile", json=payload)
    resp2 = client.post("/api/voice-profile", json=payload)
    assert resp1.status_code == 200
    assert resp2.status_code == 200
    # Both calls must return the same profile_id (upsert, not duplicate insert)
    assert resp1.json()["profile_id"] == resp2.json()["profile_id"]


# ── Draft save + approval + calendar ─────────────────────────────────────────

def test_draft_route_saves_and_returns_draft_id(monkeypatch):
    from app.services import generation, review

    monkeypatch.setattr(generation, "get_groq_client", lambda: None)
    monkeypatch.setattr(review, "get_groq_client", lambda: None)
    monkeypatch.setattr(generation, "review_draft", lambda d, p: (90, ["Strong draft"]))

    resp = client.post(
        "/api/draft",
        json={"niche": "ai", "goal": "educational", "knowledge_snippets": ["context"], "approve": False},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["draft"]
    assert data["plan"]
    # draft_id should be set (draft was saved to DB)
    assert data["draft_id"] is not None
    assert isinstance(data["draft_id"], int)


def test_draft_route_approve_creates_calendar_entry(monkeypatch):
    from app.services import generation, review

    monkeypatch.setattr(generation, "get_groq_client", lambda: None)
    monkeypatch.setattr(review, "get_groq_client", lambda: None)
    monkeypatch.setattr(generation, "review_draft", lambda d, p: (90, ["Excellent"]))

    resp = client.post(
        "/api/draft",
        json={"niche": "ai", "goal": "educational", "knowledge_snippets": ["ctx"], "approve": True},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["persisted"] is True
    assert data["draft_id"] is not None

    # Calendar should now have at least one entry
    cal_resp = client.get("/api/calendar")
    assert cal_resp.status_code == 200
    items = cal_resp.json()["items"]
    assert len(items) >= 1


def test_draft_below_threshold_not_persisted(monkeypatch):
    from app.services import generation, review

    monkeypatch.setattr(generation, "get_groq_client", lambda: None)
    monkeypatch.setattr(review, "get_groq_client", lambda: None)
    monkeypatch.setattr(generation, "review_draft", lambda d, p: (50, ["Needs work"]))

    resp = client.post(
        "/api/draft",
        json={"niche": "ai", "goal": "educational", "knowledge_snippets": ["ctx"], "approve": True},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["persisted"] is False
    assert data["reviewer_score"] == 50


# ── Inline draft edit ─────────────────────────────────────────────────────────

def test_update_draft_text(monkeypatch):
    from app.services import generation, review

    monkeypatch.setattr(generation, "get_groq_client", lambda: None)
    monkeypatch.setattr(review, "get_groq_client", lambda: None)
    monkeypatch.setattr(generation, "review_draft", lambda d, p: (80, ["OK"]))

    # First generate a draft to get a draft_id
    gen_resp = client.post(
        "/api/draft",
        json={"niche": "ai", "goal": "test_edit", "knowledge_snippets": [], "approve": False},
    )
    assert gen_resp.status_code == 200
    draft_id = gen_resp.json()["draft_id"]
    assert draft_id is not None

    # Now edit the draft text
    edit_resp = client.put(
        f"/api/draft/{draft_id}",
        json={"text": "Manually edited post content.", "approve": False},
    )
    assert edit_resp.status_code == 200
    edit_data = edit_resp.json()
    assert edit_data["updated"] is True
    assert edit_data["draft_id"] == draft_id


def test_update_nonexistent_draft_returns_404():
    resp = client.put("/api/draft/999999", json={"text": "something", "approve": False})
    assert resp.status_code == 404


# ── Calendar ordering ─────────────────────────────────────────────────────────

def test_calendar_returns_items_ordered_newest_first(monkeypatch):
    from app.services import generation, review

    monkeypatch.setattr(generation, "get_groq_client", lambda: None)
    monkeypatch.setattr(review, "get_groq_client", lambda: None)
    monkeypatch.setattr(generation, "review_draft", lambda d, p: (90, ["OK"]))

    # Create two approved drafts
    for goal in ["first_goal", "second_goal"]:
        client.post(
            "/api/draft",
            json={"niche": "ai", "goal": goal, "knowledge_snippets": [], "approve": True},
        )

    cal_resp = client.get("/api/calendar?limit=50")
    assert cal_resp.status_code == 200
    items = cal_resp.json()["items"]
    assert len(items) >= 2
    # Newest first: created_at should be descending
    if len(items) >= 2:
        from datetime import datetime

        dt0 = datetime.fromisoformat(items[0]["created_at"].replace("Z", "+00:00"))
        dt1 = datetime.fromisoformat(items[1]["created_at"].replace("Z", "+00:00"))
        assert dt0 >= dt1
