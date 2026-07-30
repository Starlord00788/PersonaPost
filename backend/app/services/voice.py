"""Voice profile extraction service.

build_voice_profile() uses Groq LLM to deeply analyse writing samples and
extract tone, formality, sentence patterns, CTA style, emoji usage,
vocabulary level, key phrases, and structural writing patterns.

Falls back to lightweight heuristics when Groq is unavailable.

When payload.merge=True and a saved profile exists for the same profile_id,
the new signals are blended with the existing ones rather than overwriting them.
"""
import json
import logging
import re
from hashlib import sha1
from typing import Any

from app.schemas import VoiceProfileRequest, VoiceProfileResponse, VoiceSignals

logger = logging.getLogger(__name__)

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


# ---------------------------------------------------------------------------
# Groq-powered extraction
# ---------------------------------------------------------------------------

def _get_groq_client() -> Any | None:
    try:
        from app.config import settings  # noqa: PLC0415
        if not settings.groq_api_key:
            return None
        from groq import Groq  # type: ignore[import-untyped]  # noqa: PLC0415
        return Groq(api_key=settings.groq_api_key)
    except Exception as exc:
        logger.warning("Groq client unavailable for voice profiling: %s", exc)
        return None


def _extract_signals_groq(payload: VoiceProfileRequest) -> VoiceSignals | None:
    """Use Groq LLM to extract rich voice signals from writing samples."""
    client = _get_groq_client()
    if not client:
        return None

    samples_text = "\n---\n".join(payload.samples)
    prompt = f"""You are an expert writing style analyst. Analyze these {len(payload.samples)} writing sample(s) and extract precise voice signals.

WRITING SAMPLES:
{samples_text}

Return a JSON object with EXACTLY these fields (no extra text, no markdown):
{{
  "tone": "one of: conversational | professional | authoritative | inspirational | educational | casual | technical",
  "formality": <integer 1-10, where 1=very casual, 10=very formal>,
  "sentence_length": "one of: short | medium | long | varied",
  "cta_style": "one of: question | directive | invitation | challenge | mixed",
  "emoji_usage": "one of: none | low | moderate | high",
  "confidence": <float 0.0-1.0 based on how many samples were provided and how consistent they are>,
  "vocabulary_level": "one of: basic | intermediate | advanced | expert",
  "key_phrases": ["up to 6 characteristic phrases, words, or expressions this writer uses"],
  "writing_patterns": ["up to 5 structural patterns you notice, e.g. 'leads with a bold claim', 'uses contrasting pairs', 'ends with a question'"]
}}

Be specific and accurate. key_phrases should be actual words/phrases from the samples. writing_patterns should describe HOW they write, not just WHAT they write about."""

    try:
        from app.config import settings  # noqa: PLC0415
        response = client.chat.completions.create(
            model=settings.groq_generation_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
        )
        raw = (response.choices[0].message.content or "").strip()
        # Strip any markdown fences
        raw = re.sub(r"^```[a-z]*\n?", "", raw, flags=re.MULTILINE)
        raw = raw.replace("```", "").strip()
        # Extract JSON object
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start == -1 or end == 0:
            raise ValueError("No JSON object found in response")
        parsed = json.loads(raw[start:end])

        # Validate and clamp
        formality = int(parsed.get("formality", 5))
        formality = max(1, min(10, formality))
        confidence = float(parsed.get("confidence", 0.75))
        confidence = max(0.0, min(1.0, confidence))

        key_phrases = parsed.get("key_phrases", [])
        if not isinstance(key_phrases, list):
            key_phrases = []
        key_phrases = [str(p) for p in key_phrases[:6]]

        writing_patterns = parsed.get("writing_patterns", [])
        if not isinstance(writing_patterns, list):
            writing_patterns = []
        writing_patterns = [str(p) for p in writing_patterns[:5]]

        return VoiceSignals(
            tone=str(parsed.get("tone", "balanced")),
            formality=formality,
            sentence_length=str(parsed.get("sentence_length", "medium")),
            cta_style=str(parsed.get("cta_style", "mixed")),
            emoji_usage=str(parsed.get("emoji_usage", "low")),
            confidence=round(confidence, 2),
            vocabulary_level=str(parsed.get("vocabulary_level", "intermediate")),
            key_phrases=key_phrases,
            writing_patterns=writing_patterns,
        )
    except Exception as exc:
        logger.warning("Groq voice extraction failed (%s: %s), falling back to heuristics", type(exc).__name__, exc)
        return None


# ---------------------------------------------------------------------------
# Heuristic fallback
# ---------------------------------------------------------------------------

def _count_matches(samples: list[str], words: tuple[str, ...]) -> int:
    haystack = " ".join(samples).lower()
    return sum(haystack.count(word) for word in words)


def _extract_signals_heuristic(payload: VoiceProfileRequest) -> VoiceSignals:
    """Lightweight heuristic fallback — used only when Groq is unavailable."""
    sample_text = " ".join(payload.samples).lower()
    words = sample_text.split()
    word_count = len(words) or 1

    exclamations = sample_text.count("!")
    questions = sample_text.count("?")
    pronoun_words = ("i", "me", "my", "myself", "we", "us", "our", "ours")
    pronoun_count = sum(1 for w in words if w.strip(".,!?") in pronoun_words)

    casual_hits = _count_matches(payload.samples, ("honestly", "kinda", "gonna", "hey", "btw", "so ", "like ", "cool", "awesome"))
    formal_hits = _count_matches(payload.samples, ("therefore", "furthermore", "however", "additionally", "consequently", "whereas", "hereby"))

    sentences = max(1, sample_text.count(".") + exclamations + questions)
    avg_sentence_len = word_count / sentences
    avg_word_len = sum(len(w.strip(".,!?")) for w in words) / word_count

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

    tone = "conversational" if formality <= 4 else "professional" if formality >= 7 else "balanced"
    sentence_length = "short" if avg_sentence_len < 10 else "long" if avg_sentence_len > 18 else "medium"
    cta_style = "question" if questions > 0 else "directive" if formality >= 7 else "mixed"

    emoji_count = len(EMOJI_PATTERN.findall(sample_text))
    emoji_usage = "high" if emoji_count > 2 else "moderate" if emoji_count > 0 else "none"

    vocab = "advanced" if avg_word_len > 5.5 else "basic" if avg_word_len < 4.0 else "intermediate"
    confidence = min(0.82, 0.45 + (len(payload.samples) * 0.07))

    return VoiceSignals(
        tone=tone,
        formality=formality,
        sentence_length=sentence_length,
        cta_style=cta_style,
        emoji_usage=emoji_usage,
        confidence=round(confidence, 2),
        vocabulary_level=vocab,
        key_phrases=[],
        writing_patterns=[],
    )


# ---------------------------------------------------------------------------
# Merge
# ---------------------------------------------------------------------------

def _merge_signals(existing: VoiceSignals, new_signals: VoiceSignals) -> VoiceSignals:
    """Blend existing and new signals with equal weight."""
    merged_phrases = list(dict.fromkeys(new_signals.key_phrases + existing.key_phrases))[:6]
    merged_patterns = list(dict.fromkeys(new_signals.writing_patterns + existing.writing_patterns))[:5]
    return VoiceSignals(
        tone=new_signals.tone,
        cta_style=new_signals.cta_style,
        sentence_length=new_signals.sentence_length,
        emoji_usage=new_signals.emoji_usage,
        vocabulary_level=new_signals.vocabulary_level,
        key_phrases=merged_phrases,
        writing_patterns=merged_patterns,
        formality=round((existing.formality + new_signals.formality) / 2),
        confidence=round((existing.confidence + new_signals.confidence) / 2, 2),
    )


def _load_existing_signals(profile_id: str) -> VoiceSignals | None:
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


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def build_voice_profile(payload: VoiceProfileRequest) -> VoiceProfileResponse:
    """Build (or merge) a voice profile from writing samples.

    First tries Groq LLM for deep analysis; falls back to heuristics.
    """
    # Try Groq first, then heuristic fallback
    new_signals = _extract_signals_groq(payload) or _extract_signals_heuristic(payload)
    used_llm = bool(new_signals.key_phrases or new_signals.writing_patterns)

    profile_seed = sha1("|".join(payload.samples).encode("utf-8")).hexdigest()[:12]
    profile_id = f"vp_{profile_seed}"

    final_signals = new_signals
    merged = False
    if payload.merge:
        existing = _load_existing_signals(profile_id)
        if existing is not None:
            final_signals = _merge_signals(existing, new_signals)
            merged = True

    # Build a rich, specific summary
    phrase_snippet = ""
    if final_signals.key_phrases:
        phrase_snippet = f" Key phrases: {', '.join(final_signals.key_phrases[:3])}."

    pattern_snippet = ""
    if final_signals.writing_patterns:
        pattern_snippet = f" Style: {final_signals.writing_patterns[0]}."

    method = "AI-analyzed" if used_llm else "heuristic-analyzed"
    merge_note = " (merged with existing profile)" if merged else ""

    summary = (
        f"{method.capitalize()} {len(payload.samples)} sample(s) — "
        f"{final_signals.tone} tone, {final_signals.vocabulary_level} vocabulary, "
        f"formality {final_signals.formality}/10.{phrase_snippet}{pattern_snippet}{merge_note}"
    )

    return VoiceProfileResponse(
        profile_id=profile_id,
        signals=final_signals,
        summary=summary,
    )
