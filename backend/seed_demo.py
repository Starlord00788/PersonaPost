"""
seed_demo.py

Populates the PersonaPost database with realistic demo data so the app
is ready to show/pitch without any manual setup.

Usage:
    python seed_demo.py          # seed (skips if data already exists)
    python seed_demo.py --reset  # wipe seeded tables first, then reseed
"""

import argparse
import json
from datetime import datetime, timedelta, timezone

from app.db import SessionLocal, init_db
from app.models import CalendarEntry, Draft, KnowledgeChunk, VoiceProfile

NOW = datetime.now(timezone.utc)


def build_voice_profile() -> VoiceProfile:
    return VoiceProfile(
        profile_id="demo-voice-001",
        summary=(
            "Confident, punchy, and slightly irreverent voice. Short sentences, "
            "frequent CTAs, moderate emoji use, and a habit of opening posts with "
            "a bold one-line claim before backing it up with specifics."
        ),
        signals_json=json.dumps(
            {
                "avg_sentence_length": 12.4,
                "formality_score": 0.35,
                "emoji_density": 0.08,
                "cta_frequency": 0.6,
                "tone_tags": ["confident", "direct", "conversational"],
            }
        ),
        created_at=NOW,
    )


def build_knowledge_chunks() -> list[KnowledgeChunk]:
    samples = [
        (
            "saas-growth",
            "Founders who publish consistently for 90 days see compounding "
            "audience growth even without paid distribution.",
        ),
        (
            "saas-growth",
            "Retention beats acquisition once you're past $10k MRR — most "
            "churn is preventable with better onboarding emails.",
        ),
        (
            "personal-branding",
            "A strong personal brand is just a consistent point of view, "
            "repeated often enough that people start to expect it from you.",
        ),
    ]
    chunks = []
    for niche, text in samples:
        tokens = [w.strip(".,").lower() for w in text.split()]
        chunks.append(
            KnowledgeChunk(
                niche=niche,
                text=text,
                tokens_json=json.dumps(tokens),
                created_at=NOW,
            )
        )
    return chunks


def build_drafts() -> list[Draft]:
    return [
        Draft(
            niche="saas-growth",
            goal="drive-signups",
            plan="Hook on compounding growth -> proof point -> soft CTA to trial",
            draft=(
                "Most founders quit posting right before it starts working.\n\n"
                "90 days of consistent posts beats any paid campaign under $5k. "
                "Compounding audience growth is boring until it isn't.\n\n"
                "Start your free trial today."
            ),
            reviewer_score=82,
            revision_notes_json=json.dumps(["Tighten the CTA", "Consider a stat in the hook"]),
            approved=True,
            created_at=NOW - timedelta(days=2),
        ),
        Draft(
            niche="personal-branding",
            goal="build-authority",
            plan="Define personal brand -> reframe as repetition, not reinvention -> CTA to follow",
            draft=(
                "Your personal brand isn't a logo. It's a point of view you "
                "repeat until people expect it from you.\n\n"
                "Pick one idea. Say it 50 different ways. That's the whole game."
            ),
            reviewer_score=76,
            revision_notes_json=json.dumps(["Good clarity", "Could use a concrete example"]),
            approved=True,
            created_at=NOW - timedelta(days=1),
        ),
        Draft(
            niche="saas-growth",
            goal="thought-leadership",
            plan="Contrarian take on churn -> proof -> discussion prompt",
            draft=(
                "Everyone obsesses over acquisition. Almost nobody fixes their "
                "onboarding emails.\n\nMost churn past $10k MRR is preventable. "
                "What's the last onboarding flow that actually impressed you?"
            ),
            reviewer_score=68,
            revision_notes_json=json.dumps(["Below approval threshold", "Ending question is weak"]),
            approved=False,
            created_at=NOW - timedelta(hours=6),
        ),
    ]


def build_calendar_entries(drafts: list[Draft]) -> list[CalendarEntry]:
    approved = [d for d in drafts if d.approved]
    entries = []
    for i, draft in enumerate(approved):
        entries.append(
            CalendarEntry(
                draft_id=None,  # set after drafts are flushed and have real ids
                title=draft.goal.replace("-", " ").title(),
                draft_excerpt=draft.draft[:140],
                status="scheduled" if i == 0 else "approved",
                scheduled_for=NOW + timedelta(days=i + 1),
                created_at=NOW,
            )
        )
    return entries


def reset_tables(session):
    for model in (CalendarEntry, Draft, KnowledgeChunk, VoiceProfile):
        session.query(model).delete()
    session.commit()


def already_seeded(session) -> bool:
    return session.query(VoiceProfile).filter_by(profile_id="demo-voice-001").first() is not None


def seed():
    parser = argparse.ArgumentParser(description="Seed PersonaPost demo data")
    parser.add_argument("--reset", action="store_true", help="Wipe existing data before seeding")
    args = parser.parse_args()

    init_db()
    session = SessionLocal()

    try:
        if args.reset:
            reset_tables(session)
        elif already_seeded(session):
            print("Demo data already present. Use --reset to reseed.")
            return

        session.add(build_voice_profile())
        session.add_all(build_knowledge_chunks())

        drafts = build_drafts()
        session.add_all(drafts)
        session.flush()  # populate draft.id before linking calendar entries

        entries = build_calendar_entries(drafts)
        approved_drafts = [d for d in drafts if d.approved]
        for entry, draft in zip(entries, approved_drafts):
            entry.draft_id = draft.id
        session.add_all(entries)

        session.commit()
        print(
            f"Seeded 1 voice profile, {len(build_knowledge_chunks())} knowledge chunks, "
            f"{len(drafts)} drafts, {len(entries)} calendar entries."
        )
    finally:
        session.close()


if __name__ == "__main__":
    seed()