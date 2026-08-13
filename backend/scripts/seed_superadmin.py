"""Seed the first platform Super Admin.

Usage:
    uv run python -m scripts.seed_superadmin --email owner@netra.app --password secret123
"""

from __future__ import annotations

import argparse
import asyncio

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import get_session
from app.models import Role, User


async def seed(email: str, password: str, full_name: str) -> None:
    # Unscoped session (platform context) — super admin has tenant_id = NULL.
    # platform=True sets app.platform_context='on' so RLS policies allow writes
    # to tenant-scoped tables when tenant_id is NULL (platform-level records).
    normalized = email.strip().lower()
    async with get_session(tenant_id=None, platform=True) as session:
        existing = (
            await session.execute(select(User).where(User.email == normalized))
        ).scalar_one_or_none()
        if existing:
            print(f"Super admin '{normalized}' already exists ({existing.id}).")
            return
        admin = User(
            tenant_id=None,
            email=normalized,
            full_name=full_name,
            role=Role.super_admin,
            password_hash=hash_password(password),
            is_active=True,
        )
        session.add(admin)
        await session.flush()
        print(f"Created super admin '{normalized}' (id={admin.id}).")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed platform super admin")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--full-name", default="Platform Owner")
    args = parser.parse_args()
    asyncio.run(seed(args.email, args.password, args.full_name))


if __name__ == "__main__":
    main()
