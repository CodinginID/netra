"""Security primitives: password hashing, JWT, and field encryption."""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

from cryptography.fernet import Fernet
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

# Argon2 for password hashing (PRD: argon2/bcrypt).
_pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")


# --------------------------------------------------------------------------- #
# Password hashing
# --------------------------------------------------------------------------- #
def hash_password(plain: str) -> str:
    return _pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)


# --------------------------------------------------------------------------- #
# JWT
# --------------------------------------------------------------------------- #
def _create_token(claims: dict[str, Any], expires_delta: timedelta) -> str:
    to_encode = claims.copy()
    now = datetime.now(UTC)
    to_encode.update({"iat": now, "exp": now + expires_delta})
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.jwt_algorithm)


def create_access_token(
    *, subject: str, tenant_id: str | None, role: str, external_id: str | None = None
) -> str:
    """Issue an access token carrying tenant_id, role, external_id claims."""
    claims: dict[str, Any] = {"sub": subject, "role": role, "type": "access"}
    if tenant_id is not None:
        claims["tenant_id"] = tenant_id
    if external_id is not None:
        claims["external_id"] = external_id
    return _create_token(claims, timedelta(minutes=settings.access_token_expire_minutes))


def create_refresh_token(*, subject: str, tenant_id: str | None) -> str:
    claims: dict[str, Any] = {"sub": subject, "type": "refresh"}
    if tenant_id is not None:
        claims["tenant_id"] = tenant_id
    return _create_token(claims, timedelta(days=settings.refresh_token_expire_days))


def decode_token(token: str) -> dict[str, Any]:
    """Decode & verify a JWT. Raises JWTError on failure."""
    return jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])


# --------------------------------------------------------------------------- #
# Field encryption (biometric embeddings, sensitive external_id like NIK)
# --------------------------------------------------------------------------- #
def _fernet() -> Fernet:
    key = settings.encryption_key
    if not key:
        # Dev fallback: derive a stable Fernet key from secret_key.
        digest = hashlib.sha256(settings.secret_key.encode()).digest()
        key = base64.urlsafe_b64encode(digest).decode()
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_field(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_field(ciphertext: str) -> str:
    return _fernet().decrypt(ciphertext.encode()).decode()


# --------------------------------------------------------------------------- #
# Device tokens (kiosk auth — AUTH-5)
# --------------------------------------------------------------------------- #
def generate_device_token() -> str:
    """Return a high-entropy URL-safe device token (shown to the admin once)."""
    return secrets.token_urlsafe(32)


def hash_device_token(token: str) -> str:
    """Hash a device token for at-rest storage.

    Device tokens are high-entropy (unlike user passwords), so a fast SHA-256
    digest is sufficient and lets us look up by hash. Never store plaintext.
    """
    return hashlib.sha256(token.encode()).hexdigest()


def verify_device_token(token: str, token_hash: str) -> bool:
    """Constant-time comparison of a presented token against a stored hash."""
    return hmac.compare_digest(hash_device_token(token), token_hash)


# --------------------------------------------------------------------------- #
# API keys (server-to-server tenant integration)
# --------------------------------------------------------------------------- #
API_KEY_PREFIX = "ntr_live_"


def generate_api_key() -> str:
    """Return a high-entropy API key with an identifying prefix (shown once)."""
    return f"{API_KEY_PREFIX}{secrets.token_urlsafe(32)}"


def hash_api_key(key: str) -> str:
    """SHA-256 digest for at-rest storage + constant-time lookup by hash."""
    return hashlib.sha256(key.encode()).hexdigest()


def verify_api_key(key: str, key_hash: str) -> bool:
    return hmac.compare_digest(hash_api_key(key), key_hash)


def api_key_display_prefix(key: str) -> str:
    """Non-secret fragment for the dashboard so admins can tell keys apart."""
    return key[: len(API_KEY_PREFIX) + 6]


# --------------------------------------------------------------------------- #
# Embed session tokens (server-to-server tenant integration — embed flow)
# --------------------------------------------------------------------------- #
EMBED_TOKEN_PREFIX = "ntr_embed_"


def generate_embed_token() -> str:
    """High-entropy one-time token carried in the embed URL (shown once)."""
    return f"{EMBED_TOKEN_PREFIX}{secrets.token_urlsafe(32)}"


def hash_embed_token(token: str) -> str:
    """SHA-256 digest for at-rest storage + lookup by hash."""
    return hashlib.sha256(token.encode()).hexdigest()


__all__ = [
    "hash_password",
    "verify_password",
    "create_access_token",
    "create_refresh_token",
    "decode_token",
    "encrypt_field",
    "decrypt_field",
    "generate_device_token",
    "hash_device_token",
    "verify_device_token",
    "generate_api_key",
    "hash_api_key",
    "verify_api_key",
    "api_key_display_prefix",
    "API_KEY_PREFIX",
    "generate_embed_token",
    "hash_embed_token",
    "EMBED_TOKEN_PREFIX",
    "JWTError",
]
