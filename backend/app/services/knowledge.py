import json
import logging
import re
from collections.abc import Iterable

logger = logging.getLogger(__name__)

from app.db import SessionLocal
from app.models import KnowledgeChunk
from app.schemas import (
    KnowledgeIngestRequest,
    KnowledgeIngestResponse,
    KnowledgeRetrieveRequest,
    KnowledgeRetrieveResponse,
    KnowledgeSnippet,
)

TOKEN_RE = re.compile(r"[a-zA-Z0-9]{2,}")

# Suffixes ordered longest-first so we strip the most specific one first.
_SUFFIXES = ("tion", "ness", "ment", "ing", "ess", "er", "ed", "ly", "es", "s")


def _stem(word: str) -> str:
    """Lightweight suffix-stripping stemmer — no external dependency."""
    for suffix in _SUFFIXES:
        if word.endswith(suffix) and len(word) - len(suffix) >= 3:
            return word[: -len(suffix)]
    return word


def _tokenize(text: str) -> set[str]:
    """Return raw tokens PLUS their stemmed forms for better recall."""
    raw = {token.lower() for token in TOKEN_RE.findall(text)}
    return raw | {_stem(t) for t in raw}


def _chunk_text(text: str, size: int = 80, overlap: int = 20) -> list[str]:
    words = text.split()
    if not words:
        return []
    chunks: list[str] = []
    start = 0
    step = max(1, size - overlap)
    while start < len(words):
        window = words[start : start + size]
        chunks.append(" ".join(window).strip())
        start += step
    return [chunk for chunk in chunks if chunk]


def _score(query_tokens: set[str], candidate_tokens: set[str]) -> float:
    if not query_tokens or not candidate_tokens:
        return 0.0
    overlap = len(query_tokens.intersection(candidate_tokens))
    denom = len(query_tokens.union(candidate_tokens))
    return overlap / denom if denom else 0.0


def ingest_knowledge(payload: KnowledgeIngestRequest) -> KnowledgeIngestResponse:
    rows = []
    for document in payload.documents:
        for chunk in _chunk_text(document):
            tokens = sorted(_tokenize(chunk))
            if not tokens:
                continue
            rows.append(
                KnowledgeChunk(
                    niche=payload.niche,
                    text=chunk,
                    tokens_json=json.dumps(tokens),
                )
            )

    if rows:
        with SessionLocal() as session:
            session.add_all(rows)
            session.commit()

    return KnowledgeIngestResponse(niche=payload.niche, chunks_saved=len(rows))


def _candidate_rows(niche: str) -> Iterable[KnowledgeChunk]:
    with SessionLocal() as session:
        rows = (
            session.query(KnowledgeChunk)
            .filter(KnowledgeChunk.niche == niche)
            .order_by(KnowledgeChunk.created_at.desc())
            .limit(500)
            .all()
        )
    return rows


def _rerank_with_groq(
    query: str, candidates: list[tuple[float, str]], top_k: int = 5
) -> list[tuple[float, str]]:
    """Use Groq LLM to semantically rerank Jaccard candidates.

    Takes the top-20 Jaccard candidates, asks Groq to pick the top *top_k*
    most relevant ones, and returns them with assigned relevance scores.
    Falls back to the original Jaccard order if Groq is unavailable or fails.
    """
    import json as _json  # noqa: PLC0415 (local import for optional dep)

    from app.services.generation import (  # noqa: PLC0415
        _parse_groq_json,
        _strip_fences,
        get_groq_client,
    )
    from app.config import settings as _settings  # noqa: PLC0415

    client = get_groq_client()
    if not client:
        return candidates[:top_k]

    # Limit to top-20 for the reranking prompt
    pool = candidates[:20]
    numbered = "\n".join(
        f"{i + 1}. {text[:300]}" for i, (_, text) in enumerate(pool)
    )

    prompt = (
        f"You are a relevance ranking assistant.\n\n"
        f"QUERY: {query}\n\n"
        f"CANDIDATE PASSAGES:\n{numbered}\n\n"
        f"Select the {top_k} passages most semantically relevant to the query. "
        f"Return ONLY a JSON object like:\n"
        f'{{\"ranked\": [{{"index": 1, "score": 0.95}}, ...]}}\n'
        f"where index refers to the passage number above (1-based) and score is 0-1."
    )

    try:
        response = client.chat.completions.create(
            model=_settings.groq_review_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
        )
        raw = _strip_fences(response.choices[0].message.content or "")
        parsed = _parse_groq_json(raw)
        ranked_entries = parsed.get("ranked", [])
        reranked: list[tuple[float, str]] = []
        for entry in ranked_entries:
            idx = int(entry.get("index", 0)) - 1  # convert 1-based → 0-based
            score = float(entry.get("score", 0.0))
            if 0 <= idx < len(pool):
                reranked.append((score, pool[idx][1]))
        if reranked:
            return reranked[:top_k]
    except Exception as exc:  # noqa: BLE001
        logger.warning("Groq reranking failed, falling back to Jaccard order: %s", exc)

    return candidates[:top_k]


def retrieve_knowledge(payload: KnowledgeRetrieveRequest) -> KnowledgeRetrieveResponse:
    top_k = max(1, min(payload.top_k, 10))
    query_tokens = _tokenize(payload.query)
    scored: list[tuple[float, str]] = []

    for row in _candidate_rows(payload.niche):
        candidate_tokens = set(json.loads(row.tokens_json))
        score = _score(query_tokens, candidate_tokens)
        if score > 0:
            scored.append((score, row.text))

    scored.sort(key=lambda item: item[0], reverse=True)

    # Semantic reranking when there are more candidates than needed
    if len(scored) > top_k:
        scored = _rerank_with_groq(payload.query, scored, top_k=top_k)
    else:
        scored = scored[:top_k]

    snippets = [
        KnowledgeSnippet(text=text, score=round(score, 4))
        for score, text in scored
    ]

    return KnowledgeRetrieveResponse(
        niche=payload.niche, query=payload.query, snippets=snippets
    )
