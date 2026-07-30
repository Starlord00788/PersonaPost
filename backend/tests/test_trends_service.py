from app.services import trends


def test_fetch_trends_uses_fallback_when_live_sources_unavailable(monkeypatch) -> None:
    monkeypatch.setattr(trends, "_get_groq_client", lambda: None)

    result = trends.fetch_trends("ai")

    assert result.niche == "ai"
    assert len(result.trends) > 0
    assert all(item.source.startswith("fallback") or "curated" in item.source or item.source == "curated" for item in result.trends)


def test_fetch_trends_sorts_by_score_desc(monkeypatch) -> None:
    monkeypatch.setattr(trends, "_get_groq_client", lambda: None)

    result = trends.fetch_trends("ai")
    scores = [item.score for item in result.trends]

    assert scores == sorted(scores, reverse=True)
