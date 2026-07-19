"""Add platform column to drafts and calendar_entries; add indexes.

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-19

NOTE: These columns already exist in the 0001 migration for fresh installs.
This migration handles upgrades from a pre-platform schema (if any).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table: str, column: str) -> bool:
    """Check if a column already exists (safe for idempotent upgrades)."""
    conn = op.get_bind()
    result = conn.execute(sa.text(f"PRAGMA table_info({table})"))
    return any(row[1] == column for row in result)


def _index_exists(index_name: str) -> bool:
    conn = op.get_bind()
    result = conn.execute(
        sa.text("SELECT name FROM sqlite_master WHERE type='index' AND name=:name"),
        {"name": index_name},
    )
    return result.fetchone() is not None


def upgrade() -> None:
    # ── platform column on drafts ─────────────────────────────────────────
    if not _column_exists("drafts", "platform"):
        op.add_column(
            "drafts",
            sa.Column("platform", sa.String(30), nullable=False, server_default="linkedin"),
        )

    # ── platform column on calendar_entries ───────────────────────────────
    if not _column_exists("calendar_entries", "platform"):
        op.add_column(
            "calendar_entries",
            sa.Column("platform", sa.String(30), nullable=False, server_default="linkedin"),
        )

    # ── composite index on knowledge_chunks ───────────────────────────────
    if not _index_exists("ix_knowledge_chunks_niche_created_at"):
        op.create_index(
            "ix_knowledge_chunks_niche_created_at",
            "knowledge_chunks",
            ["niche", "created_at"],
        )

    # ── index on calendar_entries.created_at ──────────────────────────────
    if not _index_exists("ix_calendar_entries_created_at"):
        op.create_index(
            "ix_calendar_entries_created_at",
            "calendar_entries",
            ["created_at"],
        )


def downgrade() -> None:
    op.drop_index("ix_calendar_entries_created_at", table_name="calendar_entries")
    op.drop_index("ix_knowledge_chunks_niche_created_at", table_name="knowledge_chunks")
    # SQLite doesn't support DROP COLUMN; skip for SQLite downgrade.
    # For PostgreSQL: uncomment below.
    # op.drop_column("calendar_entries", "platform")
    # op.drop_column("drafts", "platform")
