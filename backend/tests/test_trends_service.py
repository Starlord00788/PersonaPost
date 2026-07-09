from app.schemas import TrendItem
from app.services import trends


def test_fetch_trends_uses_fallback_when_live_sources_unavailable(monkeypatch) -> None:
    monkeypatch.setattr(trends, "_hn_trend", lambda: None)
    monkeypatch.setattr(trends, "_reddit_trend", lambda niche: None)

    result = trends.fetch_trends("ai")

    assert result.niche == "ai"
    assert len(result.trends) == 3
    assert all(item.source.startswith("fallback") for item in result.trends)


def test_fetch_trends_sorts_by_score_desc(monkeypatch) -> None:
    monkeypatch.setattr(trends, "_hn_trend", lambda: TrendItem(title="HN", score=0.61, source="hackernews"))
    monkeypatch.setattr(trends, "_reddit_trend", lambda niche: TrendItem(title="Reddit", score=0.91, source="reddit"))
    monkeypatch.setattr(
        trends,
        "_google_like_trend",
        lambda niche: TrendItem(title="Google", score=0.78, source="google-trends:fallback"),
    )

    result = trends.fetch_trends("ai")
    scores = [item.score for item in result.trends]

    assert scores == sorted(scores, reverse=True)
    assert result.trends[0].title == "Reddit"
