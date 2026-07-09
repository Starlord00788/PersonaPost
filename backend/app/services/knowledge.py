import json
import re
from collections.abc import Iterable

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
    snippets = [
        KnowledgeSnippet(text=text, score=round(score, 4))
        for score, text in scored[:top_k]
    ]

    return KnowledgeRetrieveResponse(
        niche=payload.niche, query=payload.query, snippets=snippets
    )
