from app.schemas import TrendItem, TrendResponse


def fetch_trends(niche: str) -> TrendResponse:
    trend_bases = [
        (f"How {niche} teams are using AI agents for workflow automation", 0.94, "hackernews"),
        (f"Practical retrieval-augmented generation patterns for {niche}", 0.89, "reddit"),
        (f"What the latest {niche} builders are learning from small models", 0.85, "google-trends"),
    ]
    trends = [TrendItem(title=title, score=score, source=source) for title, score, source in trend_bases]
    return TrendResponse(niche=niche, trends=trends)
