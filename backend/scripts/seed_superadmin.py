"""Seed the first platform Super Admin.

Usage:
    uv run python -m scripts.seed_superadmin --username owner --password secret123
"""

from __future__ import annotations

import argparse
import asyncio

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import get_session
from app.models import Role, User


async def seed(username: str, password: str, full_name: str) -> None:
    # Unscoped session (platform context) — super admin has tenant_id = NULL.
    async with get_session(tenant_id=None) as session:
        existing = (
            await session.execute(
                select(User).where(User.username == username, User.tenant_id.is_(None))
            )
        ).scalar_one_or_none()
        if existing:
            print(f"Super admin '{username}' already exists ({existing.id}).")
            return
        admin = User(
            tenant_id=None,
            username=username,
            full_name=full_name,
            role=Role.super_admin,
            password_hash=hash_password(password),
            is_active=True,
        )
        session.add(admin)
        await session.flush()
        print(f"Created super admin '{username}' (id={admin.id}).")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed platform super admin")
    parser.add_argument("--username", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--full-name", default="Platform Owner")
    args = parser.parse_args()
    asyncio.run(seed(args.username, args.password, args.full_name))


if __name__ == "__main__":
    main()
