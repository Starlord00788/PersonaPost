"""Voice profile extraction service.

build_voice_profile() extracts tone, formality, sentence length, CTA style,
emoji usage, and confidence from writing samples.

When payload.merge=True and a saved profile exists for the same profile_id,
the new signals are blended with the existing ones rather than overwriting them.
"""
import json
import re
from hashlib import sha1

from app.schemas import VoiceProfileRequest, VoiceProfileResponse, VoiceSignals

EMOJI_PATTERN = re.compile(
    "["
    "\U0001F600-\U0001F64F"
    "\U0001F300-\U0001F5FF"
    "\U0001F680-\U0001F6FF"
    "\U0001F1E0-\U0001F1FF"
    "\U00002700-\U000027BF"
    "\U0001F900-\U0001F9FF"
    "]+",
    flags=re.UNICODE,
)


def _count_matches(samples: list[str], words: tuple[str, ...]) -> int:
    haystack = " ".join(samples).lower()
    return sum(haystack.count(word) for word in words)


def _extract_signals(payload: VoiceProfileRequest) -> VoiceSignals:
    """Extract raw signals from the provided writing samples using dynamic text heuristics."""
    sample_text = " ".join(payload.samples).lower()
    words = sample_text.split()
    word_count = len(words) or 1

    # 1. Punctuation counters
    exclamations = sample_text.count("!")
    questions = sample_text.count("?")
    commas_semis = sample_text.count(",") + sample_text.count(";")

    # 2. Pronoun counters (conversational indicators)
    pronoun_words = ("i", "me", "my", "myself", "we", "us", "our", "ours")
    pronoun_count = sum(1 for w in words if w.strip(".,!?") in pronoun_words)

    # 3. Formal/Informal matches
    casual_hits = _count_matches(
        payload.samples, ("honestly", "kinda", "gonna", "hey", "btw", "so ", "like ", "cool", "awesome")
    )
    formal_hits = _count_matches(
        payload.samples, ("therefore", "furthermore", "however", "additionally", "consequently", "whereas", "hereby")
    )

    # 4. Lexical length analysis
    sentences = max(1, sample_text.count(".") + exclamations + questions)
    avg_sentence_len = word_count / sentences
    avg_word_len = sum(len(w.strip(".,!?")) for w in words) / word_count

    # 5. Formality calculation (base 5, ranges 1-10)
    formality = 5
    if avg_word_len > 5.2:
        formality += 2
    elif avg_word_len < 4.4:
        formality -= 2

    if formal_hits > casual_hits:
        formality += 2
    elif casual_hits > formal_hits:
        formality -= 2

    if pronoun_count / word_count > 0.05:
        formality -= 2
    if exclamations > 0:
        formality -= 1

    formality = max(1, min(formality, 10))

    # 6. Tone classification
    if formality <= 4:
        tone = "conversational"
    elif formality >= 7:
        tone = "professional"
    else:
        tone = "balanced"

    # 7. Sentence length classification
    if avg_sentence_len < 10:
        sentence_length = "short"
    elif avg_sentence_len > 18:
        sentence_length = "long"
    else:
        sentence_length = "medium"

    # 8. CTA Style
    if questions > 0:
        cta_style = "question"
    elif formality >= 7:
        cta_style = "directive"
    else:
        cta_style = "mixed"

    # 9. Emoji usage
    emoji_count = len(EMOJI_PATTERN.findall(sample_text))
    if emoji_count > 2:
        emoji_usage = "high"
    elif emoji_count > 0:
        emoji_usage = "moderate"
    else:
        emoji_usage = "low"

    confidence = min(0.98, 0.55 + (len(payload.samples) * 0.07))

    return VoiceSignals(
        tone=tone,
        formality=formality,
        sentence_length=sentence_length,
        cta_style=cta_style,
        emoji_usage=emoji_usage,
        confidence=round(confidence, 2),
    )


def _merge_signals(existing: VoiceSignals, new_signals: VoiceSignals) -> VoiceSignals:
    """Blend existing and new signals with equal weight.

    Numeric fields are averaged; categorical fields favour the newer signal
    (so incremental uploads gradually shift the profile).
    """
    return VoiceSignals(
        # Categorical: take the new value (more recent samples win)
        tone=new_signals.tone,
        cta_style=new_signals.cta_style,
        sentence_length=new_signals.sentence_length,
        emoji_usage=new_signals.emoji_usage,
        # Numeric: blend 50/50
        formality=round((existing.formality + new_signals.formality) / 2),
        confidence=round((existing.confidence + new_signals.confidence) / 2, 2),
    )


def _load_existing_signals(profile_id: str) -> VoiceSignals | None:
    """Load previously saved VoiceSignals from the DB, or return None."""
    try:
        from app.db import SessionLocal  # noqa: PLC0415
        from app.models import VoiceProfile  # noqa: PLC0415

        with SessionLocal() as session:
            row = (
                session.query(VoiceProfile)
                .filter(VoiceProfile.profile_id == profile_id)
                .first()
            )
            if row:
                return VoiceSignals.model_validate(json.loads(row.signals_json))
    except Exception:
        pass
    return None


def build_voice_profile(payload: VoiceProfileRequest) -> VoiceProfileResponse:
    """Build (or merge) a voice profile from writing samples.

    Args:
        payload: Contains samples and a merge flag.

    Returns:
        VoiceProfileResponse with profile_id, signals, and a human summary.
    """
    new_signals = _extract_signals(payload)

    # Deterministic profile_id — same samples always produce the same seed.
    # When merging, we keep using the seed of the NEW samples so the profile
    # ID reflects the latest upload.
    profile_seed = sha1("|".join(payload.samples).encode("utf-8")).hexdigest()[:12]
    profile_id = f"vp_{profile_seed}"

    final_signals = new_signals
    if payload.merge:
        existing = _load_existing_signals(profile_id)
        if existing is not None:
            final_signals = _merge_signals(existing, new_signals)

    summary = (
        f"Voice profile inferred from {len(payload.samples)} sample(s) — "
        f"{final_signals.tone} tone, {final_signals.sentence_length} sentences, "
        f"formality {final_signals.formality}/10."
        + (" (merged with existing profile)" if payload.merge and final_signals != new_signals else "")
    )

    return VoiceProfileResponse(
        profile_id=profile_id,
        signals=final_signals,
        summary=summary,
    )
