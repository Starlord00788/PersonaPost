# ADR 001 - Free LLM and local embedding stack

## Status

Accepted

## Context

The internship project needs to work without paid API keys so it can be demonstrated easily and kept affordable for students.

## Decision

Use Groq as the primary LLM provider when a key is available, and keep a local fallback path for development. Use deterministic local logic for the initial embedding and style-extraction layer so the product still works without external services.

## Consequences

- the project can run in demo mode with no paid subscriptions
- development is not blocked when an API key is missing
- the code must support both remote and local execution paths

## Notes

This ADR will be revisited if the team later adds a different provider or a self-hosted model.

Backend environment note: use Python 3.11 or 3.12 for backend development. Newer CPython versions may fail on some compiled dependencies (for example pydantic-core) until upstream wheels catch up.
