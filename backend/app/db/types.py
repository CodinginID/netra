"""Custom SQLAlchemy column types — OPS-5: encryption at rest.

``EncryptedStr`` transparently encrypts a string column on write and decrypts
on read using Fernet (authenticated symmetric encryption). The ciphertext is
what lands on disk; application code sees plaintext.

Fernet ciphertext is NON-deterministic (random IV per encryption), so a column
of this type CANNOT be used directly in a uniqueness constraint. Where we need
to enforce uniqueness on an encrypted value (e.g. (tenant_id, external_id)), we
store a separate deterministic SHA-256 hash column and constrain on that
instead — see app.models.User.external_id_hash and external_id_digest().
"""

from __future__ import annotations

import hashlib

from sqlalchemy import String
from sqlalchemy.types import TypeDecorator

from app.core.security import decrypt_field, encrypt_field


class EncryptedStr(TypeDecorator[str]):
    """A string column encrypted at rest with Fernet."""

    impl = String
    cache_ok = True

    def process_bind_param(self, value: str | None, dialect: object) -> str | None:
        if value is None:
            return None
        return encrypt_field(value)

    def process_result_value(self, value: str | None, dialect: object) -> str | None:
        if value is None:
            return None
        return decrypt_field(value)


def external_id_digest(value: str | None) -> str | None:
    """Deterministic digest used for the (tenant_id, external_id) uniqueness check.

    SHA-256 over the plaintext lets two identical external_ids collide on the
    hash column even though their Fernet ciphertexts differ. Uniqueness is still
    scoped per-tenant via the composite constraint (tenant_id, external_id_hash).
    """
    if value is None:
        return None
    return hashlib.sha256(value.encode()).hexdigest()
