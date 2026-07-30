"""Simple in-memory TTL cache with a Redis-swappable interface.

For production at scale, swap the in-memory store for a Redis client
by implementing the same get/set/delete/delete_pattern interface.
"""
import logging
import threading
import time
from typing import Any, Optional

logger = logging.getLogger(__name__)


class _MemoryCache:
    """Thread-safe in-memory TTL cache."""

    def __init__(self) -> None:
        self._store: dict[str, tuple[Any, float]] = {}  # key -> (value, expires_at)
        self._lock = threading.RLock()

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            value, expires_at = entry
            if time.time() > expires_at:
                del self._store[key]
                return None
            return value

    def set(self, key: str, value: Any, ttl_seconds: int = 300) -> None:
        with self._lock:
            self._store[key] = (value, time.time() + ttl_seconds)

    def delete(self, key: str) -> None:
        with self._lock:
            self._store.pop(key, None)

    def delete_pattern(self, prefix: str) -> int:
        """Delete all keys starting with prefix. Returns count deleted."""
        with self._lock:
            keys = [k for k in self._store if k.startswith(prefix)]
            for k in keys:
                del self._store[k]
            return len(keys)

    def cleanup_expired(self) -> int:
        """Remove expired entries. Call periodically."""
        now = time.time()
        with self._lock:
            expired = [k for k, (_, exp) in self._store.items() if now > exp]
            for k in expired:
                del self._store[k]
            return len(expired)


# Singleton cache instance
cache = _MemoryCache()

# TTL constants (seconds)
TTL_TRENDS = 300       # 5 minutes
TTL_NOTIFICATIONS = 60 # 1 minute
TTL_VOICE = 1800       # 30 minutes
TTL_KNOWLEDGE = 600    # 10 minutes
