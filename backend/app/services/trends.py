"""Trend discovery service — AI-driven source routing.

For ANY niche, Groq first decides which sources from the library would give
the most relevant and engaging content, then fetches those sources, then
filters the results by niche relevance and adds a "why this matters" reason.

No hardcoded niche → source mapping. The AI figures it out dynamically.
"""
import logging
import re
import time
from typing import Any

import httpx

from app.schemas import TrendItem, TrendResponse

logger = logging.getLogger(__name__)

_CACHE_TTL = 300  # 5 minutes
_cache: dict[str, tuple[float, TrendResponse]] = {}


# ---------------------------------------------------------------------------
# Source Library — Groq picks from this for any niche
# ---------------------------------------------------------------------------

SOURCE_LIBRARY = [
    # ── Tech / AI / Programming ───────────────────────────────────────────
    {
        "id": "hn_top",
        "name": "Hacker News Top Stories",
        "description": "Tech, AI, software engineering, startups, science, programming, LLMs, open source",
        "type": "hn_api",
        "url": None,
    },
    {
        "id": "techcrunch",
        "name": "TechCrunch",
        "description": "Startup funding, tech business, venture capital, product launches, Silicon Valley",
        "type": "rss",
        "url": "https://techcrunch.com/feed/",
    },
    {
        "id": "the_verge",
        "name": "The Verge",
        "description": "Consumer tech, gadgets, apps, social media platforms, tech culture, policy",
        "type": "rss",
        "url": "https://www.theverge.com/rss/index.xml",
    },
    {
        "id": "ars_technica",
        "name": "Ars Technica",
        "description": "Deep-dive tech, science, space, security, hardware, AI research",
        "type": "rss",
        "url": "https://feeds.arstechnica.com/arstechnica/index",
    },
    {
        "id": "wired",
        "name": "Wired",
        "description": "Tech culture, future of work, cybersecurity, AI ethics, society and technology",
        "type": "rss",
        "url": "https://www.wired.com/feed/rss",
    },
    # ── Gaming ────────────────────────────────────────────────────────────
    {
        "id": "ign",
        "name": "IGN Gaming",
        "description": "Video game reviews, announcements, gaming hardware, esports, game releases",
        "type": "rss",
        "url": "https://feeds.ign.com/ign/all",
    },
    {
        "id": "eurogamer",
        "name": "Eurogamer",
        "description": "Game reviews, industry news, indie games, gaming culture, developer interviews",
        "type": "rss",
        "url": "https://www.eurogamer.net/feed",
    },
    {
        "id": "pcgamer",
        "name": "PC Gamer",
        "description": "PC gaming news, hardware reviews, game mods, gaming performance, AAA and indie",
        "type": "rss",
        "url": "https://www.pcgamer.com/rss/",
    },
    {
        "id": "rock_paper_shotgun",
        "name": "Rock Paper Shotgun",
        "description": "PC game criticism, indie game discovery, opinionated gaming commentary",
        "type": "rss",
        "url": "https://www.rockpapershotgun.com/feed",
    },
    # ── Finance / Crypto / Business ───────────────────────────────────────
    {
        "id": "coindesk",
        "name": "CoinDesk",
        "description": "Cryptocurrency, Bitcoin, DeFi, Web3, blockchain regulation, NFTs",
        "type": "rss",
        "url": "https://www.coindesk.com/arc/outboundfeeds/rss/",
    },
    {
        "id": "cointelegraph",
        "name": "CoinTelegraph",
        "description": "Crypto markets, altcoins, blockchain projects, Web3 development",
        "type": "rss",
        "url": "https://cointelegraph.com/rss",
    },
    {
        "id": "fast_company",
        "name": "Fast Company",
        "description": "Business innovation, leadership, workplace culture, entrepreneurship, creative industries",
        "type": "rss",
        "url": "https://www.fastcompany.com/latest/rss",
    },
    # ── Health / Science ──────────────────────────────────────────────────
    {
        "id": "science_daily",
        "name": "Science Daily",
        "description": "Scientific research, health breakthroughs, medicine, psychology, biology, neuroscience",
        "type": "rss",
        "url": "https://www.sciencedaily.com/rss/all.xml",
    },
    {
        "id": "medical_news_today",
        "name": "Medical News Today",
        "description": "Health news, clinical research, nutrition, mental health, wellness, disease",
        "type": "rss",
        "url": "https://www.medicalnewstoday.com/rss/all",
    },
    {
        "id": "nih_news",
        "name": "NIH News in Health",
        "description": "Health research, fitness science, nutrition studies, medicine, disease prevention",
        "type": "rss",
        "url": "https://newsinhealth.nih.gov/rss/news",
    },
    # ── Marketing / Content / Creator Economy ─────────────────────────────
    {
        "id": "search_engine_journal",
        "name": "Search Engine Journal",
        "description": "SEO, content marketing, social media strategy, digital advertising, Google updates",
        "type": "rss",
        "url": "https://www.searchenginejournal.com/feed/",
    },
    {
        "id": "social_media_today",
        "name": "Social Media Today",
        "description": "Social media trends, platform updates, creator economy, influencer marketing, LinkedIn/Instagram/TikTok",
        "type": "rss",
        "url": "https://www.socialmediatoday.com/rss.xml",
    },
    # ── Entertainment / Pop Culture ───────────────────────────────────────
    {
        "id": "variety",
        "name": "Variety",
        "description": "Film, TV, streaming, Hollywood, music industry, celebrity, entertainment business",
        "type": "rss",
        "url": "https://variety.com/feed/",
    },
    {
        "id": "rolling_stone",
        "name": "Rolling Stone",
        "description": "Music, pop culture, politics, film, celebrity interviews, cultural commentary",
        "type": "rss",
        "url": "https://www.rollingstone.com/feed/",
    },
    # ── Sports ────────────────────────────────────────────────────────────
    {
        "id": "bbc_sport",
        "name": "BBC Sport",
        "description": "Football, cricket, tennis, athletics, Formula 1, Olympics, global sports news",
        "type": "rss",
        "url": "https://feeds.bbci.co.uk/sport/rss.xml",
    },
    {
        "id": "espn",
        "name": "ESPN",
        "description": "American sports, NFL, NBA, MLB, soccer, college sports, athlete news",
        "type": "rss",
        "url": "https://www.espn.com/espn/rss/news",
    },
    # ── Environment / Climate ─────────────────────────────────────────────
    {
        "id": "the_guardian_environment",
        "name": "The Guardian Environment",
        "description": "Climate change, sustainability, renewable energy, environmental policy, nature",
        "type": "rss",
        "url": "https://www.theguardian.com/environment/rss",
    },
]


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------

def _cache_get(niche: str) -> TrendResponse | None:
    if niche in _cache:
        ts, response = _cache[niche]
        if time.monotonic() - ts < _CACHE_TTL:
            return response
        del _cache[niche]
    return None


def _cache_set(niche: str, response: TrendResponse) -> None:
    _cache[niche] = (time.monotonic(), response)


def clear_trends_cache() -> None:
    _cache.clear()


# ---------------------------------------------------------------------------
# Groq client
# ---------------------------------------------------------------------------

def _get_groq_client() -> Any | None:
    try:
        from app.config import settings  # noqa: PLC0415
        if not settings.groq_api_key:
            return None
        from groq import Groq  # type: ignore[import-untyped]  # noqa: PLC0415
        return Groq(api_key=settings.groq_api_key)
    except Exception as exc:
        logger.warning("Groq client unavailable: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Step 1: Groq picks the best sources for the niche
# ---------------------------------------------------------------------------

def _groq_pick_sources(niche: str, client: Any) -> list[str]:
    """Ask Groq which source IDs from SOURCE_LIBRARY best fit this niche."""
    import json as _json  # noqa: PLC0415

    source_descriptions = "\n".join(
        f'- id="{s["id"]}" | {s["name"]}: {s["description"]}'
        for s in SOURCE_LIBRARY
    )

    prompt = f"""A content creator works in the "{niche}" niche.

Available news sources:
{source_descriptions}

Which 3-4 sources from this list would give the most relevant, engaging, and genuine content for someone creating content about "{niche}"?

Think carefully — pick sources that would have real stories their audience would care about, not just loosely related ones.

Return JSON array of source IDs only, no extra text:
["id1", "id2", "id3"]"""

    try:
        from app.config import settings  # noqa: PLC0415
        response = client.chat.completions.create(
            model=settings.groq_generation_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
        )
        raw = (response.choices[0].message.content or "").strip()
        raw = re.sub(r"^```[a-z]*\n?", "", raw, flags=re.MULTILINE)
        raw = raw.replace("```", "").strip()
        start = raw.find("[")
        end = raw.rfind("]") + 1
        if start == -1 or end == 0:
            raise ValueError("No JSON array found")
        ids = _json.loads(raw[start:end])
        valid = {s["id"] for s in SOURCE_LIBRARY}
        chosen = [i for i in ids if i in valid]
        logger.info("Groq picked sources for niche=%s: %s", niche, chosen)
        return chosen[:4]
    except Exception as exc:
        logger.warning("Groq source picking failed: %s — using first 3 sources", exc)
        return ["hn_top", SOURCE_LIBRARY[5]["id"], SOURCE_LIBRARY[6]["id"]]


# ---------------------------------------------------------------------------
# Step 2: Fetch stories from chosen sources
# ---------------------------------------------------------------------------

def _parse_rss(xml: str, source_name: str, limit: int = 15) -> list[dict]:
    """Extract titles from RSS/Atom XML without external parser."""
    stories: list[dict] = []
    # Try <item> (RSS) then <entry> (Atom)
    blocks = re.findall(r"<item>(.*?)</item>", xml, re.DOTALL)
    if not blocks:
        blocks = re.findall(r"<entry>(.*?)</entry>", xml, re.DOTALL)
    for block in blocks[:limit]:
        m = re.search(r"<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</title>", block, re.DOTALL)
        if not m:
            continue
        title = m.group(1).strip()
        # Clean HTML entities and tags
        title = re.sub(r"<[^>]+>", "", title)
        for ent, rep in [("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"),
                          ("&#8217;", "'"), ("&#8216;", "'"), ("&#8220;", '"'),
                          ("&#8221;", '"'), ("&nbsp;", " "), ("&#39;", "'")]:
            title = title.replace(ent, rep)
        title = title.strip()
        if title and len(title) > 15:
            stories.append({"title": title, "source_name": source_name})
    return stories


def _fetch_hn(count: int = 25) -> list[dict]:
    stories: list[dict] = []
    all_ids: list[int] = []
    seen: set[int] = set()
    with httpx.Client(timeout=8.0) as client:
        for url in [
            "https://hacker-news.firebaseio.com/v0/topstories.json",
            "https://hacker-news.firebaseio.com/v0/beststories.json",
        ]:
            try:
                resp = client.get(url)
                if resp.status_code == 200:
                    for sid in (resp.json() or [])[:20]:
                        if sid not in seen:
                            seen.add(sid)
                            all_ids.append(sid)
            except Exception:
                pass
        for sid in all_ids[:count]:
            try:
                r = client.get(f"https://hacker-news.firebaseio.com/v0/item/{sid}.json", timeout=3.0)
                if r.status_code == 200:
                    d = r.json() or {}
                    t = d.get("title", "").strip()
                    if t:
                        stories.append({"title": t, "source_name": "Hacker News"})
            except Exception:
                pass
    return stories


def _fetch_sources(source_ids: list[str]) -> list[dict]:
    """Fetch stories from selected sources, return combined list."""
    all_stories: list[dict] = []
    source_map = {s["id"]: s for s in SOURCE_LIBRARY}

    with httpx.Client(
        timeout=8.0,
        headers={"User-Agent": "Mozilla/5.0 PersonaPostAI/1.0"},
        follow_redirects=True,
    ) as client:
        for sid in source_ids:
            source = source_map.get(sid)
            if not source:
                continue

            try:
                if source["type"] == "hn_api":
                    stories = _fetch_hn(count=20)
                    all_stories.extend(stories)
                    logger.info("Fetched %d stories from Hacker News", len(stories))
                elif source["type"] == "rss" and source.get("url"):
                    resp = client.get(source["url"], timeout=7.0)
                    if resp.status_code == 200:
                        stories = _parse_rss(resp.text, source["name"], limit=15)
                        all_stories.extend(stories)
                        logger.info("Fetched %d stories from %s", len(stories), source["name"])
                    else:
                        logger.debug("RSS %s returned %d", source["name"], resp.status_code)
            except Exception as exc:
                logger.warning("Failed to fetch %s: %s", source.get("name"), exc)

    return all_stories


# ---------------------------------------------------------------------------
# Step 3: Groq filters and ranks by niche relevance
# ---------------------------------------------------------------------------

def _groq_filter_and_rank(stories: list[dict], niche: str, client: Any) -> list[TrendItem]:
    import json as _json  # noqa: PLC0415

    if not stories:
        return []

    # Deduplicate by title
    seen: set[str] = set()
    unique: list[dict] = []
    for s in stories:
        key = s["title"].lower()[:50]
        if key not in seen:
            seen.add(key)
            unique.append(s)

    story_list = "\n".join(
        f"{i+1}. [{s['source_name']}] {s['title']}"
        for i, s in enumerate(unique[:50])
    )

    prompt = f"""You are a content strategist for a "{niche}" creator.

Here are recent headlines from curated sources:
{story_list}

Select the 6-8 headlines that a "{niche}" content creator's audience would GENUINELY care about.
Be strict — only include stories with real relevance, not loose connections.

For each, provide:
- score: 0.0-1.0 (genuine relevance to "{niche}" content)
- reason: one sentence explaining WHY this is worth posting about for a "{niche}" creator

Return JSON array only:
[
  {{
    "title": "exact headline from the list",
    "source": "source name from brackets",
    "score": 0.88,
    "reason": "why a {niche} creator's audience would engage with this"
  }}
]

Minimum score 0.6. Order by score descending."""

    try:
        from app.config import settings  # noqa: PLC0415
        response = client.chat.completions.create(
            model=settings.groq_generation_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
        )
        raw = (response.choices[0].message.content or "").strip()
        raw = re.sub(r"^```[a-z]*\n?", "", raw, flags=re.MULTILINE)
        raw = raw.replace("```", "").strip()
        start = raw.find("[")
        end = raw.rfind("]") + 1
        if start == -1 or end == 0:
            raise ValueError("No array found")
        items = _json.loads(raw[start:end])

        result: list[TrendItem] = []
        for item in items:
            title = str(item.get("title", "")).strip()
            source = str(item.get("source", "news")).strip()
            score = float(item.get("score", 0.6))
            reason = str(item.get("reason", "")).strip()
            if title and score >= 0.6:
                result.append(TrendItem(
                    title=title,
                    score=round(min(0.99, score), 2),
                    source=source,
                    reason=reason,
                ))
        return sorted(result, key=lambda t: t.score, reverse=True)[:8]

    except Exception as exc:
        logger.warning("Groq filtering failed: %s", exc)
        return []


# ---------------------------------------------------------------------------
# Curated fallback (when all sources fail)
# ---------------------------------------------------------------------------

_CURATED_BY_THEME = {
    "gaming": [
        ("FromSoftware's no-difficulty-setting philosophy is reshaping what players expect from challenge", "The difficulty debate is the #1 ongoing conversation in gaming — perfect content territory.", 0.95),
        ("Why Baldur's Gate 3 proved players still want deep, complex RPG experiences", "BG3's success challenges the industry assumption that simpler games always win.", 0.91),
        ("The indie game renaissance: why small studios are consistently beating AAA on story and design", "Indie game discourse drives massive engagement in gaming communities.", 0.88),
        ("Black Myth: Wukong breaks records and sparks debate about AA game development", "This title sparked global debate about game quality, cultural storytelling, and dev expectations.", 0.85),
        ("Game preservation crisis: thousands of titles are disappearing and nobody is talking about it", "Preservation is an emotionally charged topic that core gaming audiences care deeply about.", 0.82),
        ("The cozy gaming genre grew 200% and AAA studios still haven't figured out why", "Cozy games resonate with a huge underserved audience — great content angle for any gaming creator.", 0.79),
        ("Xbox Game Pass changed how people discover indie games — is that good for developers?", "The subscription vs. ownership debate touches every gamer and drives strong engagement.", 0.76),
        ("Speedrunning went mainstream: what happens to a subculture when everyone finds it", "Speedrunning community crossover is a compelling angle on gaming identity.", 0.73),
    ],
    "tech": [
        ("Small language models are outperforming GPT-4 on specific tasks — the era of specialization", "Specialized AI is displacing general AI — key topic for any tech content creator.", 0.95),
        ("The agentic AI stack in 2025: tools, memory, planning and what actually works", "Agentic workflows are the hottest topic in tech right now.", 0.91),
        ("Open-source LLMs close the gap: what it means for the AI industry", "OSS model progress drives active debate among technical audiences.", 0.88),
        ("RAG vs fine-tuning: when to use each and why most teams get it wrong", "Practical AI architecture decisions drive massive engagement from technical readers.", 0.85),
    ],
    "default": [
        ("Building in public: lessons from creators who share the journey openly", "Transparency-driven content performs well across all creator niches.", 0.88),
        ("The trust problem: why audiences crave authentic expert voices in 2025", "Authenticity signals are the most important content theme right now.", 0.85),
        ("Short-form vs long-form: what the algorithm actually rewards today", "Platform strategy is something every content creator wants to understand.", 0.82),
        ("The creator economy is consolidating — what that means for independent voices", "Platform power dynamics affect every content creator's strategy.", 0.79),
        ("Why niche audiences outperform mass audiences for engagement in 2025", "Going deep on a specific topic is the winning strategy — resonates with every creator.", 0.76),
        ("The attention economy is broken — here's what actually builds loyal audiences", "Attention and audience loyalty are core concerns for all content creators.", 0.73),
    ],
}


def _curated_fallback(niche: str) -> list[TrendItem]:
    niche_lower = niche.lower()
    if any(k in niche_lower for k in ["gaming", "game", "gamer", "esport"]):
        rows = _CURATED_BY_THEME["gaming"]
    elif any(k in niche_lower for k in ["tech", "ai", "software", "startup", "saas", "code"]):
        rows = _CURATED_BY_THEME["tech"]
    else:
        rows = _CURATED_BY_THEME["default"]

    return [
        TrendItem(title=title, score=score, source="curated", reason=reason)
        for title, reason, score in rows
    ]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def fetch_trends(niche: str) -> TrendResponse:
    cached = _cache_get(niche)
    if cached is not None:
        return cached.model_copy(update={"cached": True})

    client = _get_groq_client()
    trends: list[TrendItem] = []

    if client:
        # Step 1: Groq picks best sources for this niche
        source_ids = _groq_pick_sources(niche, client)

        # Step 2: Fetch from those sources
        stories = _fetch_sources(source_ids)
        logger.info("Total stories fetched: %d for niche=%s", len(stories), niche)

        # Step 3: Groq filters for relevance + adds reasons
        if stories:
            trends = _groq_filter_and_rank(stories, niche, client)
            logger.info("Final filtered trends: %d", len(trends))

    # Pad with curated fallback if needed
    if len(trends) < 4:
        logger.info("Padding with curated fallback (got %d trends)", len(trends))
        fallback = _curated_fallback(niche)
        existing = {t.title.lower() for t in trends}
        for item in fallback:
            if item.title.lower() not in existing:
                trends.append(item)
            if len(trends) >= 8:
                break

    trends = sorted(trends, key=lambda t: t.score, reverse=True)[:8]
    response = TrendResponse(niche=niche, trends=trends, cached=False)
    _cache_set(niche, response)
    return response
