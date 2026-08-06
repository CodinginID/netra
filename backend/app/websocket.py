"""WebSocket connection manager for real-time event push.

Tracks connections per tenant_id, device_id, and user_id.
Provides broadcast methods called from services when events occur.
"""
from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any

from fastapi import WebSocket

from app.core.logging import get_logger

log = get_logger("netra.ws")


class ConnectionManager:
    """Manages WebSocket connections grouped by channel (tenant/device/user)."""

    def __init__(self) -> None:
        # channel_key -> set of WebSocket instances
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)
        # Track which Channels each websocket subscribes to
        self._ws_channels: dict[WebSocket, set[str]] = defaultdict(set)

    async def connect(self, websocket: WebSocket, channels: list[str]) -> None:
        """Accept a WebSocket and subscribe it to the given channels."""
        await websocket.accept()
        for ch in channels:
            self._connections[ch].add(websocket)
            self._ws_channels[websocket].add(ch)
        log.info("ws_connected", channels=channels)

    def disconnect(self, websocket: WebSocket) -> None:
        """Remove a WebSocket from all its channels."""
        for ch in self._ws_channels.pop(websocket, set()):
            self._connections[ch].discard(websocket)
            if not self._connections[ch]:
                del self._connections[ch]
        log.info("ws_disconnected")

    async def broadcast(self, channel: str, message: dict[str, Any]) -> None:
        """Push a JSON message to all WebSockets subscribed to a channel."""
        import json

        text = json.dumps(message)
        dead: list[WebSocket] = []
        for ws in self._connections.get(channel, set()):
            try:
                await ws.send_text(text)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    async def broadcast_to_tenants(self, tenant_ids: list[str], message: dict[str, Any]) -> None:
        """Push to all tenants in the list."""
        for tid in tenant_ids:
            await self.broadcast(f"tenant:{tid}", message)


# Singleton
manager = ConnectionManager()
