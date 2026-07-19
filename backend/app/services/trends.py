import time
import httpx

from app.schemas import TrendItem, TrendResponse

# ---------------------------------------------------------------------------
# TTL Cache — avoids hammering HN/Reddit on every page load.
# 5-minute window; keyed by niche string.
# ---------------------------------------------------------------------------

_CACHE_TTL = 300  # seconds
_cache: dict[str, tuple[float, TrendResponse]] = {}


def _cache_get(niche: str) -> TrendResponse | None:
    if niche in _cache:
        timestamp, response = _cache[niche]
        if time.monotonic() - timestamp < _CACHE_TTL:
            return response
        del _cache[niche]
    return None


def _cache_set(niche: str, response: TrendResponse) -> None:
    _cache[niche] = (time.monotonic(), response)


def clear_trends_cache() -> None:
    """Clear the global trends cache, useful for unit tests."""
    _cache.clear()


# ---------------------------------------------------------------------------
# Trend sources
# ---------------------------------------------------------------------------


def _fallback_trends(niche: str) -> list[TrendItem]:
    return [
        TrendItem(
            title=f"How {niche} teams are using AI agents for workflow automation",
            score=0.96,
            source="fallback:hackernews",
        ),
        TrendItem(
            title=f"Practical retrieval-augmented generation patterns for {niche}",
            score=0.91,
            source="fallback:reddit",
        ),
        TrendItem(
            title=f"What the latest {niche} builders are learning from small models",
            score=0.88,
            source="fallback:google-trends",
        ),
        TrendItem(
            title=f"Deploying local LLMs for secure {niche} document indexing",
            score=0.84,
            source="fallback:hackernews",
        ),
        TrendItem(
            title=f"Standardizing metadata schemas in {niche} agent networks",
            score=0.81,
            source="fallback:reddit",
        ),
        TrendItem(
            title=f"Reducing latency in real-time {niche} text processing pipelines",
            score=0.78,
            source="fallback:google-trends",
        ),
        TrendItem(
            title=f"Optimizing prompt construction for structured JSON outputs in {niche}",
            score=0.74,
            source="fallback:hackernews",
        ),
        TrendItem(
            title=f"The shift from monolithic pipelines to distributed {niche} tools",
            score=0.71,
            source="fallback:reddit",
        ),
        TrendItem(
            title=f"Lessons learned scale-testing vector databases with {niche} chunks",
            score=0.68,
            source="fallback:google-trends",
        ),
        TrendItem(
            title=f"Securing API key rotation schemes in multi-agent {niche} loops",
            score=0.64,
            source="fallback:hackernews",
        ),
    ]


def _reddit_trend(niche: str) -> TrendItem | None:
    subreddit = niche.replace(" ", "")
    url = f"https://www.reddit.com/r/{subreddit}/hot.json"
    headers = {"User-Agent": "PersonaPostAI/0.2"}
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
        score = min(0.99, 0.6 + min(ups, 10_000) / 25_000)
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
        score = min(0.99, 0.62 + min(points, 1_000) / 2_500)
        return TrendItem(title=title, score=round(score, 2), source="hackernews")


def _google_like_trend(niche: str) -> TrendItem:
    return TrendItem(
        title=f"Rising search interest around {niche} implementation playbooks",
        score=0.78,
        source="google-trends:fallback",
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def fetch_trends(niche: str) -> TrendResponse:
    # Serve from cache if still fresh
    cached = _cache_get(niche)
    if cached is not None:
        return cached.model_copy(update={"cached": True})

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

    trends = sorted(trends, key=lambda t: t.score, reverse=True)
    response = TrendResponse(niche=niche, trends=trends, cached=False)
    _cache_set(niche, response)
    return response
