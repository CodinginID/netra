"""Application configuration via environment variables (pydantic-settings)."""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


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
    log_json: bool = Field(default=True, description="Emit JSON log lines (set false for pretty dev console)")
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
    # NoDecode: keep pydantic-settings from JSON-decoding the env value so our
    # validator can accept BOTH a comma-separated list ("a,b,c") AND a JSON
    # array ('["a","b"]'). Prevents SettingsError on the common comma format.
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: [
            "http://localhost:5173",  # Vite dev server (default)
            "http://localhost:7002",
            "http://localhost:3000",
        ]
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _parse_cors_origins(cls, v: object) -> object:
        """Accept comma-separated string, JSON array string, or a real list."""
        if isinstance(v, str):
            s = v.strip()
            if not s:
                return []
            if s.startswith("["):
                import json

                return json.loads(s)
            return [o.strip() for o in s.split(",") if o.strip()]
        return v

    # --- Face recognition engine ---
    embedding_dim: int = 512  # InsightFace ArcFace buffalo_s
    match_threshold: float = 0.45  # min cosine similarity to accept a 1:N identify
    # "fake" => deterministic numpy engine (dev/test, no ML deps).
    # "insightface" => real buffalo_s via onnxruntime (install the `recognition` extra).
    face_engine: str = Field(default="fake")

    # --- Liveness / anti-spoofing ---
    # "fake" => deterministic (dev/test). "silentface" => Silent-Face (recognition extra).
    liveness_engine: str = Field(default="fake")
    liveness_threshold: float = Field(default=0.5)  # min score to accept as live
    # Path to the MiniFASNetV2 ONNX weights. Auto-downloaded from HuggingFace on first use.
    silentface_model_path: str = Field(default="models/silentface.onnx")

    # Root directory for InsightFace model files (buffalo_s). InsightFace will look
    # for models under <insightface_model_root>/models/buffalo_s/*.onnx.
    # In Docker, set to /app/models/insightface (model baked in at build time).
    insightface_model_root: str = Field(default="")

    # --- Embed integration (render netra flows inside a client app) ---
    # Public base URL of the netra FRONTEND (SPA), used to build the embed link
    # returned by POST /integration/embed-sessions, e.g. https://netra.flowbiz.id.
    # MUST be set in staging/production — empty falls back to the backend's own
    # request URL, which is the API domain, not the SPA, and is almost never
    # what you want for an iframe src.
    embed_base_url: str = Field(default="")
    # Minutes an embed session token stays valid after minting.
    embed_ttl_minutes: int = Field(default=15, ge=1, le=1440)

    # --- Billing --- #
    # Default payment terms: days from issue date to due date. Applied when an
    # invoice is issued without an explicit due_date; a caller may still send
    # one to negotiate terms per tenant.
    invoice_net_days: int = Field(default=14, ge=1, le=180)

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()


settings = get_settings()
