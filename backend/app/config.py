from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    groq_api_key: str | None = None
    database_url: str = "sqlite:///./personapost.db"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    groq_generation_model: str = "llama-3.3-70b-versatile"
    groq_review_model: str = "llama-3.1-8b-instant"
    min_approval_score: int = 75

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
