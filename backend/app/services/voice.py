from hashlib import sha1
import re

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


def build_voice_profile(payload: VoiceProfileRequest) -> VoiceProfileResponse:
    sample_text = " ".join(payload.samples).lower()
    casual_hits = _count_matches(payload.samples, ("honestly", "kinda", "gonna", "hey", "btw"))
    formal_hits = _count_matches(payload.samples, ("therefore", "furthermore", "however", "additionally"))

    if casual_hits > formal_hits:
        tone = "conversational"
        formality = 3
        cta_style = "question"
    elif formal_hits > casual_hits:
        tone = "professional"
        formality = 8
        cta_style = "directive"
    else:
        tone = "balanced"
        formality = 6
        cta_style = "mixed"

    long_sentence_markers = sample_text.count(",") + sample_text.count(";")
    sentence_length = "short" if long_sentence_markers < 6 else "medium"
    emoji_usage = "moderate" if EMOJI_PATTERN.search(sample_text) else "low"
    confidence = min(0.98, 0.55 + (len(payload.samples) * 0.07))

    profile_seed = sha1("||".join(payload.samples).encode("utf-8")).hexdigest()[:12]
    signals = VoiceSignals(
        tone=tone,
        formality=formality,
        sentence_length=sentence_length,
        cta_style=cta_style,
        emoji_usage=emoji_usage,
        confidence=round(confidence, 2),
    )
    summary = f"Voice profile inferred from {len(payload.samples)} samples with a {tone} tone and {sentence_length} sentences."
    return VoiceProfileResponse(profile_id=f"vp_{profile_seed}", signals=signals, summary=summary)
