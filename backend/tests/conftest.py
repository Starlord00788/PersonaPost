"""Shared pytest fixtures for PersonaPost AI backend tests.

Sets DATABASE_URL to a temp file-based SQLite *before* any app module is
imported, so pydantic-settings picks up the override in Settings().
"""
import os

# Must be set before any `from app.*` import happens.
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_personapost.db")
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-production-32chars")
os.environ.setdefault("ADMIN_USERNAME", "testadmin")
from passlib.hash import bcrypt
os.environ.setdefault("ADMIN_PASSWORD_HASH", bcrypt.hash("testpassword"))

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.db as db_module


@pytest.fixture(scope="session", autouse=True)
def test_database():
    """Create a fresh test-only SQLite database for the entire test session.

    Patches db_module.engine and db_module.SessionLocal so all services that
    do ``from app.db import SessionLocal`` via their module-level import will
    use the patched session when accessed through db_module.SessionLocal().
    The services use ``SessionLocal()`` as a context manager at call time, so
    patching the factory object works correctly.
    """
    from app.db import Base
    from app import models  # noqa: F401 — registers ORM models

    test_url = os.environ["DATABASE_URL"]
    engine = create_engine(test_url, connect_args={"check_same_thread": False})
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    # Patch module-level references; services that import the module reference
    # (``app.db.SessionLocal``) will pick this up.
    original_engine = db_module.engine
    original_session = db_module.SessionLocal
    db_module.engine = engine
    db_module.SessionLocal = TestSession

    yield

    db_module.engine = original_engine
    db_module.SessionLocal = original_session
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def override_auth():
    """Bypass JWT auth validation by overriding get_current_user in FastAPI app."""
    from app.main import app
    from app.auth import get_current_user
    from app.models import User
    mock_user = User(id=1, username="testadmin", email="testadmin@example.com", display_name="Test Admin")
    app.dependency_overrides[get_current_user] = lambda: mock_user
    yield
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def clear_cache_fixture():
    """Clear trends in-memory TTL cache before each test to prevent pollution."""
    from app.services.trends import clear_trends_cache
    clear_trends_cache()
    yield

