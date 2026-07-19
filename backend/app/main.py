import logging
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import init_db
from app.routes import router
from app.routes_auth import router as auth_router


def _configure_logging() -> None:
    """Structured JSON-style logging to stdout."""
    logging.basicConfig(
        level=logging.INFO,
        format=(
            '{"time": "%(asctime)s", "level": "%(levelname)s", '
            '"name": "%(name)s", "message": "%(message)s"}'
        ),
        stream=sys.stdout,
        force=True,
    )


def _init_sentry() -> None:
    """Initialise Sentry if SENTRY_DSN is configured; silently skip otherwise."""
    if not settings.sentry_dsn:
        return
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration

        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            integrations=[FastApiIntegration()],
            traces_sample_rate=0.2,
            send_default_pii=False,
        )
        logging.getLogger(__name__).info("Sentry initialised")
    except ImportError:
        logging.getLogger(__name__).warning(
            "sentry-sdk not installed — error tracking disabled. "
            "Run: pip install sentry-sdk[fastapi]"
        )


def create_app() -> FastAPI:
    _configure_logging()
    _init_sentry()

    app = FastAPI(
        title="PersonaPost AI",
        version="0.2.0",
        description=(
            "AI-powered social content drafting platform. "
            "Voice profiling → Trend discovery → RAG → Draft → Review → Calendar."
        ),
        docs_url="/docs",
        redoc_url="/redoc",
    )

    init_db()

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list(),
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Accept"],
    )

    # Auth routes first so /api/auth/token is registered before protected routes
    app.include_router(auth_router, prefix="/api")
    app.include_router(router, prefix="/api")

    return app


app = create_app()
