from app.schemas import VoiceProfileRequest
from app.services.voice import build_voice_profile


def test_build_voice_profile_detects_conversational_tone() -> None:
    payload = VoiceProfileRequest(
        samples=[
            "Honestly, this is the fastest way to ship.",
            "Hey team, we're gonna keep this simple.",
        ]
    )

    result = build_voice_profile(payload)
    assert result.signals.tone == "conversational"
    assert result.signals.formality <= 4
    assert result.summary


def test_build_voice_profile_detects_emoji_usage() -> None:
    payload = VoiceProfileRequest(samples=["This workflow is clear and practical 😄"])
    result = build_voice_profile(payload)

    assert result.signals.emoji_usage == "moderate"
