from fastapi.testclient import TestClient

from app.main import app


def test_voice_profile_route_persists() -> None:
    client = TestClient(app)
    payload = {
        "samples": [
            "Honestly this workflow is simple and clear.",
            "Hey team, here is one useful practical tip.",
        ]
    }
    response = client.post("/api/voice-profile", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["profile_id"].startswith("vp_")
    assert "signals" in data


def test_trends_route_returns_items() -> None:
    client = TestClient(app)
    response = client.get("/api/trends", params={"niche": "ai"})
    assert response.status_code == 200
    data = response.json()
    assert data["niche"] == "ai"
    assert len(data["trends"]) >= 1


def test_knowledge_ingest_and_retrieve_routes() -> None:
    client = TestClient(app)
    ingest_payload = {
        "niche": "ai",
        "documents": [
            "Agentic workflows improve onboarding speed and reduce manual status reporting.",
            "Teams should measure baseline task duration before introducing automation.",
        ],
    }
    ingest_response = client.post("/api/knowledge/ingest", json=ingest_payload)
    assert ingest_response.status_code == 200
    ingest_data = ingest_response.json()
    assert ingest_data["chunks_saved"] >= 1

    retrieve_payload = {
        "niche": "ai",
        "query": "workflow automation onboarding",
        "top_k": 2,
    }
    retrieve_response = client.post("/api/knowledge/retrieve", json=retrieve_payload)
    assert retrieve_response.status_code == 200
    retrieve_data = retrieve_response.json()
    assert retrieve_data["niche"] == "ai"
    assert len(retrieve_data["snippets"]) >= 1


def test_draft_route_fallback_and_approve(monkeypatch) -> None:
    from app.services import generation, review

    monkeypatch.setattr(generation, "get_groq_client", lambda: None)
    monkeypatch.setattr(review, "get_groq_client", lambda: None)
    monkeypatch.setattr(generation, "review_draft", lambda draft, payload: (90, ["Strong draft"]))

    client = TestClient(app)
    payload = {
        "niche": "ai",
        "goal": "educational",
        "knowledge_snippets": ["Focus on process over hype."],
        "approve": True,
    }
    response = client.post("/api/draft", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["plan"]
    assert data["draft"]
    assert isinstance(data["reviewer_score"], int)
    assert len(data["revision_notes"]) >= 1
    assert data["persisted"] is True


def test_draft_route_approve_below_threshold_not_persisted(monkeypatch) -> None:
    from app.services import generation, review

    monkeypatch.setattr(generation, "get_groq_client", lambda: None)
    monkeypatch.setattr(review, "get_groq_client", lambda: None)
    monkeypatch.setattr(generation, "review_draft", lambda draft, payload: (60, ["Needs revision"]))

    client = TestClient(app)
    payload = {
        "niche": "ai",
        "goal": "educational",
        "knowledge_snippets": ["Focus on process over hype."],
        "approve": True,
    }
    response = client.post("/api/draft", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["reviewer_score"] == 60
    assert data["persisted"] is False


def test_draft_route_auto_retrieves_knowledge(monkeypatch) -> None:
    from app.services import generation

    captured_payload = {}

    def fake_generate(payload):
        captured_payload["knowledge_snippets"] = payload.knowledge_snippets
        return generation.DraftResponse(
            plan="Plan",
            draft="Draft",
            reviewer_score=88,
            revision_notes=["Note"],
            persisted=False,
        )

    monkeypatch.setattr("app.routes.generate_draft", fake_generate)

    client = TestClient(app)
    client.post(
        "/api/knowledge/ingest",
        json={
            "niche": "ai",
            "documents": ["Knowledge chunk about ai workflow optimization and practical execution."],
        },
    )

    response = client.post(
        "/api/draft",
        json={
            "niche": "ai",
            "goal": "educational",
            "trend_title": "workflow automation",
            "knowledge_snippets": [],
            "auto_retrieve_knowledge": True,
        },
    )

    assert response.status_code == 200
    assert len(captured_payload.get("knowledge_snippets", [])) >= 1


def test_calendar_route_returns_saved_items() -> None:
    client = TestClient(app)
    response = client.get("/api/calendar")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
