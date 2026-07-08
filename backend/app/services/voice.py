from hashlib import sha1

from app.schemas import VoiceProfileRequest, VoiceProfileResponse, VoiceSignals


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
    emoji_usage = "low" if "😀" not in sample_text and ":" not in sample_text else "moderate"
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
