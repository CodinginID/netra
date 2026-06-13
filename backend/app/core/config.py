"""Application configuration via environment variables (pydantic-settings)."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central app settings. All values overridable via env / .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- App ---
    app_name: str = "netra"
    environment: str = Field(default="development")  # development | staging | production
    debug: bool = Field(default=True)
    api_v1_prefix: str = "/api/v1"

    # --- Database ---
    database_url: str = Field(
        default="postgresql+asyncpg://netra_app:netra_app@localhost:5432/netra",
        description="Async SQLAlchemy DSN (asyncpg driver). App connects as the "
        "least-privilege, NOBYPASSRLS role so RLS is actually enforced.",
    )
    # Superuser/owner DSN used ONLY by Alembic migrations (CREATE ROLE, GRANT,
    # ALTER DEFAULT PRIVILEGES). Empty => fall back to database_url. The app
    # runtime never uses this.
    database_admin_url: str = Field(default="")
    db_echo: bool = Field(default=False)

    # --- Security / JWT ---
    secret_key: str = Field(
        default="CHANGE_ME_dev_only_secret_key_min_32_chars_long",
        description="HMAC signing key for JWTs. MUST be overridden in production.",
    )
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 30

    # --- Field encryption (biometric / sensitive at-rest) ---
    encryption_key: str = Field(
        default="",
        description=(
            "Fernet key (base64, 32 bytes) for encrypting sensitive fields. "
            "Empty = derive from secret_key in dev."
        ),
    )

    # --- CORS ---
    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:7002", "http://localhost:3000"]
    )

    # --- Face recognition engine (Phase 3+; declared now for completeness) ---
    embedding_dim: int = 512  # InsightFace ArcFace buffalo_s
    match_threshold: float = 0.45  # cosine similarity default; per-tenant override later

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()


settings = get_settings()
