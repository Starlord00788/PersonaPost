"""Unit tests for app.services.knowledge — pure functions + integration."""
import json

import pytest
from fastapi.testclient import TestClient

from app.services.knowledge import (
    _chunk_text,
    _score,
    _stem,
    _tokenize,
)


# ── _stem ─────────────────────────────────────────────────────────────────────

def test_stem_removes_ing():
    assert _stem("automating") == "automat"


def test_stem_removes_tion():
    assert _stem("automation") == "automa"


def test_stem_removes_ment():
    assert _stem("improvement") == "improve"


def test_stem_removes_er():
    assert _stem("builder") == "build"


def test_stem_does_not_over_strip_short_words():
    # Result must keep at least 3 chars
    assert _stem("act") == "act"  # 'act' - 'ed' would leave 'a', too short


def test_stem_passthrough_no_suffix():
    assert _stem("workflow") == "workflow"


# ── _tokenize ─────────────────────────────────────────────────────────────────

def test_tokenize_returns_set():
    result = _tokenize("running fast")
    assert isinstance(result, set)


def test_tokenize_includes_stemmed_form():
    tokens = _tokenize("automation")
    # Should contain the raw token AND the stemmed form
    assert "automation" in tokens
    assert "automa" in tokens


def test_tokenize_lowercases():
    tokens = _tokenize("RUNNING")
    assert "running" in tokens


def test_tokenize_filters_short_tokens():
    tokens = _tokenize("a to the")
    # TOKEN_RE requires length >= 2; "a" is len 1 and filtered
    assert "a" not in tokens


# ── _chunk_text ───────────────────────────────────────────────────────────────

def test_chunk_text_single_chunk_for_short_text():
    text = "hello world foo bar baz"
    chunks = _chunk_text(text, size=10, overlap=2)
    assert len(chunks) >= 1
    assert "hello" in chunks[0]


def test_chunk_text_produces_overlap():
    words = list(range(20))
    text = " ".join(str(w) for w in words)
    chunks = _chunk_text(text, size=10, overlap=3)
    # With overlap, adjacent chunks share words
    assert len(chunks) >= 2
    first_end = set(chunks[0].split()[-3:])
    second_start = set(chunks[1].split()[:3])
    assert first_end & second_start  # overlap exists


def test_chunk_text_empty_returns_empty():
    assert _chunk_text("") == []


def test_chunk_text_all_words_covered():
    text = " ".join(f"word{i}" for i in range(50))
    chunks = _chunk_text(text, size=10, overlap=2)
    combined = " ".join(chunks)
    assert "word0" in combined
    assert "word49" in combined


# ── _score ────────────────────────────────────────────────────────────────────

def test_score_identical_sets_returns_one():
    tokens = {"hello", "world"}
    assert _score(tokens, tokens) == 1.0


def test_score_disjoint_sets_returns_zero():
    assert _score({"hello"}, {"world"}) == 0.0


def test_score_partial_overlap():
    a = {"hello", "world", "foo"}
    b = {"hello", "world", "bar"}
    s = _score(a, b)
    assert 0 < s < 1


def test_score_empty_query_returns_zero():
    assert _score(set(), {"hello", "world"}) == 0.0


# ── Integration: ingest + retrieve via HTTP routes ────────────────────────────

def test_knowledge_ingest_and_retrieve_integration():
    from app.main import app

    client = TestClient(app)

    ingest_resp = client.post(
        "/api/knowledge/ingest",
        json={
            "niche": "test_knowledge_niche",
            "documents": [
                "Machine learning models improve over time with more training data.",
                "Data quality is critical for model performance.",
            ],
        },
    )
    assert ingest_resp.status_code == 200
    assert ingest_resp.json()["chunks_saved"] >= 1

    retrieve_resp = client.post(
        "/api/knowledge/retrieve",
        json={
            "niche": "test_knowledge_niche",
            "query": "machine learning training",
            "top_k": 3,
        },
    )
    assert retrieve_resp.status_code == 200
    data = retrieve_resp.json()
    assert data["niche"] == "test_knowledge_niche"
    assert len(data["snippets"]) >= 1
    # Top result should be relevant
    assert data["snippets"][0]["score"] > 0
