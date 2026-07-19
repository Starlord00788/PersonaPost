from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import settings


def _create_engine():
    """Create a SQLAlchemy engine configured for the current DATABASE_URL.

    SQLite:   thread-safety flag set; no connection pooling needed.
    Postgres: pool_size=5, max_overflow=10, pool_pre_ping=True for production.
    """
    url = settings.database_url
    is_sqlite = url.startswith("sqlite")

    if is_sqlite:
        return create_engine(
            url,
            connect_args={"check_same_thread": False},
        )

    # PostgreSQL / production settings
    return create_engine(
        url,
        pool_size=5,
        max_overflow=10,
        pool_pre_ping=True,         # recycle stale connections before use
        pool_recycle=1800,          # recycle connections after 30 min
        echo=False,
    )


engine = _create_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def init_db() -> None:
    from app import models  # noqa: F401 — registers ORM models with Base

    Base.metadata.create_all(bind=engine)


def get_db():
    """FastAPI dependency for explicit session injection (used in future routes)."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
