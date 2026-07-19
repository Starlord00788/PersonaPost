"""In-process sliding-window rate limiter for generation endpoints.

NOTE: This is per-process and in-memory.  For multi-worker deployments
(Render with >1 worker / Gunicorn), replace with a Redis-backed solution
(e.g. slowapi + redis) so the window is shared across workers.
For a single-process MVP deployment this is perfectly sufficient.
"""
from collections import defaultdict, deque
from time import monotonic

from fastapi import HTTPException, Request

from app.config import settings


class _SlidingWindowLimiter:
    """Thread-unsafe sliding-window rate limiter keyed by client IP."""

    def __init__(self, max_requests: int, window_seconds: int = 60) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._windows: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> None:
        now = monotonic()
        window = self._windows[key]
        cutoff = now - self.window_seconds

        # Evict timestamps outside the current window
        while window and window[0] < cutoff:
            window.popleft()

        if len(window) >= self.max_requests:
            oldest = window[0]
            retry_after = int(self.window_seconds - (now - oldest)) + 1
            raise HTTPException(
                status_code=429,
                detail=(
                    f"Rate limit exceeded: max {self.max_requests} generation "
                    f"requests per {self.window_seconds}s. Please wait."
                ),
                headers={"Retry-After": str(retry_after)},
            )

        window.append(now)


# Module-level singleton shared across requests in one process
_generation_limiter = _SlidingWindowLimiter(
    max_requests=settings.rate_limit_generation_per_minute,
    window_seconds=60,
)


def generation_rate_limit(request: Request) -> None:
    """FastAPI dependency — inject into draft generation endpoints.

    Keyed by client IP (X-Forwarded-For header respected for proxies).
    """
    forwarded_for = request.headers.get("X-Forwarded-For")
    client_ip = (
        forwarded_for.split(",")[0].strip()
        if forwarded_for
        else (request.client.host if request.client else "unknown")
    )
    _generation_limiter.check(client_ip)
