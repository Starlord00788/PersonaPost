"""Initial schema — clean slate with all 4 tables.

Revision ID: 0001
Revises:
Create Date: 2026-07-19
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------ #
    # voice_profiles                                                       #
    # ------------------------------------------------------------------ #
    op.create_table(
        "voice_profiles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("profile_id", sa.String(64), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("signals_json", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("profile_id"),
    )
    op.create_index("ix_voice_profiles_id", "voice_profiles", ["id"])
    op.create_index("ix_voice_profiles_profile_id", "voice_profiles", ["profile_id"])

    # ------------------------------------------------------------------ #
    # drafts                                                               #
    # ------------------------------------------------------------------ #
    op.create_table(
        "drafts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("niche", sa.String(120), nullable=False),
        sa.Column("goal", sa.String(120), nullable=False),
        sa.Column("platform", sa.String(30), nullable=False, server_default="linkedin"),
        sa.Column("plan", sa.Text(), nullable=False),
        sa.Column("draft", sa.Text(), nullable=False),
        sa.Column("reviewer_score", sa.Integer(), nullable=False),
        sa.Column("revision_notes_json", sa.Text(), nullable=False),
        sa.Column("approved", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_drafts_id", "drafts", ["id"])
    op.create_index("ix_drafts_niche", "drafts", ["niche"])

    # ------------------------------------------------------------------ #
    # calendar_entries                                                     #
    # ------------------------------------------------------------------ #
    op.create_table(
        "calendar_entries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("draft_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("draft_excerpt", sa.Text(), nullable=False),
        sa.Column("platform", sa.String(30), nullable=False, server_default="linkedin"),
        sa.Column("status", sa.String(50), nullable=False, server_default="approved"),
        sa.Column("scheduled_for", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["draft_id"], ["drafts.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_calendar_entries_id", "calendar_entries", ["id"])
    op.create_index("ix_calendar_entries_created_at", "calendar_entries", ["created_at"])

    # ------------------------------------------------------------------ #
    # knowledge_chunks                                                     #
    # ------------------------------------------------------------------ #
    op.create_table(
        "knowledge_chunks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("niche", sa.String(120), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("tokens_json", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_knowledge_chunks_id", "knowledge_chunks", ["id"])
    op.create_index("ix_knowledge_chunks_niche", "knowledge_chunks", ["niche"])
    op.create_index(
        "ix_knowledge_chunks_niche_created_at",
        "knowledge_chunks",
        ["niche", "created_at"],
    )


def downgrade() -> None:
    op.drop_table("knowledge_chunks")
    op.drop_table("calendar_entries")
    op.drop_table("drafts")
    op.drop_table("voice_profiles")
