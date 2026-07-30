from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # ── LLM ─────────────────────────────────────────────────────────────────
    groq_api_key: str | None = None
    groq_generation_model: str = "llama-3.3-70b-versatile"
    groq_review_model: str = "llama-3.1-8b-instant"

    # ── Database ─────────────────────────────────────────────────────────────
    database_url: str = "sqlite:///./personapost.db"

    # ── CORS ─────────────────────────────────────────────────────────────────
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # ── Draft quality ────────────────────────────────────────────────────────
    min_approval_score: int = 75

    # ── Auth (JWT) ───────────────────────────────────────────────────────────
    # Generate with: python -c "import secrets; print(secrets.token_hex(32))"
    secret_key: str = "change-me-in-production-use-openssl-rand-hex-32"
    admin_username: str = "admin"
    # Generate with: python -c "from passlib.context import CryptContext; print(CryptContext(['bcrypt']).hash('your_password'))"
    admin_password_hash: str = ""

    # ── Rate limiting ────────────────────────────────────────────────────────
    rate_limit_generation_per_minute: int = 10

    # ── Observability ────────────────────────────────────────────────────────
    # Leave empty to disable Sentry; set to your DSN to enable.
    sentry_dsn: str | None = None

    # ── Google OAuth ─────────────────────────────────────────────────────────
    google_client_id: str = ""
    google_client_secret: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
