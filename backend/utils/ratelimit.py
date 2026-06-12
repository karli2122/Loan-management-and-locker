"""Shared rate limiter accessor.

Route modules import ``limit`` and apply it as a decorator on sensitive
endpoints (e.g. login). If slowapi is not installed, ``limit`` becomes a no-op
so the app still runs.
"""
import logging

logger = logging.getLogger(__name__)

try:
    from slowapi import Limiter
    from slowapi.util import get_remote_address

    limiter = Limiter(key_func=get_remote_address, default_limits=["1000/hour"])
    _ENABLED = True
except ImportError:  # pragma: no cover
    limiter = None
    _ENABLED = False


def limit(rule: str):
    """Return a decorator applying a rate-limit rule, or a no-op if disabled."""
    if _ENABLED and limiter is not None:
        return limiter.limit(rule)

    def _noop(func):
        return func

    return _noop
