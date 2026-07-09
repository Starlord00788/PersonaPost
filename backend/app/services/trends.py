import httpx

from app.schemas import TrendItem, TrendResponse


def _fallback_trends(niche: str) -> list[TrendItem]:
    trend_bases = [
        (f"How {niche} teams are using AI agents for workflow automation", 0.94, "fallback:hackernews"),
        (f"Practical retrieval-augmented generation patterns for {niche}", 0.89, "fallback:reddit"),
        (f"What the latest {niche} builders are learning from small models", 0.85, "fallback:google-trends"),
    ]
    return [TrendItem(title=title, score=score, source=source) for title, score, source in trend_bases]


def _reddit_trend(niche: str) -> TrendItem | None:
    subreddit = niche.replace(" ", "")
    url = f"https://www.reddit.com/r/{subreddit}/hot.json"
    headers = {"User-Agent": "PersonaPostAI/0.1"}
    with httpx.Client(timeout=5.0) as client:
        resp = client.get(url, headers=headers)
        if resp.status_code != 200:
            return None
        children = resp.json().get("data", {}).get("children", [])
        if not children:
            return None
        top = children[0].get("data", {})
        title = top.get("title")
        ups = int(top.get("ups", 1))
        if not title:
            return None
        score = min(0.99, 0.6 + min(ups, 10000) / 25000)
        return TrendItem(title=title, score=round(score, 2), source="reddit")


def _hn_trend() -> TrendItem | None:
    topstories_url = "https://hacker-news.firebaseio.com/v0/topstories.json"
    with httpx.Client(timeout=5.0) as client:
        ids_resp = client.get(topstories_url)
        if ids_resp.status_code != 200:
            return None
        ids = ids_resp.json() or []
        if not ids:
            return None
        item_resp = client.get(f"https://hacker-news.firebaseio.com/v0/item/{ids[0]}.json")
        if item_resp.status_code != 200:
            return None
        data = item_resp.json() or {}
        title = data.get("title")
        points = int(data.get("score", 1))
        if not title:
            return None
        score = min(0.99, 0.62 + min(points, 1000) / 2500)
        return TrendItem(title=title, score=round(score, 2), source="hackernews")


def _google_like_trend(niche: str) -> TrendItem:
    return TrendItem(
        title=f"Rising search interest around {niche} implementation playbooks",
        score=0.78,
        source="google-trends:fallback",
    )


def fetch_trends(niche: str) -> TrendResponse:
    trends: list[TrendItem] = []

    for getter in (_hn_trend, lambda: _reddit_trend(niche)):
        try:
            item = getter()
            if item:
                trends.append(item)
        except Exception:
            continue

    trends.append(_google_like_trend(niche))

    if len(trends) < 2:
        trends = _fallback_trends(niche)

    trends = sorted(trends, key=lambda trend: trend.score, reverse=True)
    return TrendResponse(niche=niche, trends=trends)
