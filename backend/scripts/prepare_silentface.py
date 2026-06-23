"""Download and cache the MiniFASNetV2 ONNX model for liveness detection.

Run once before starting the server with LIVENESS_ENGINE=silentface:

    cd backend
    python scripts/prepare_silentface.py

The model is downloaded from HuggingFace (~1.7 MB) and saved to
SILENTFACE_MODEL_PATH (default: models/silentface.onnx).
SHA-256 is verified automatically.
"""

from __future__ import annotations

import hashlib
import sys
import urllib.request
from pathlib import Path

MODEL_URL = (
    "https://huggingface.co/garciafido/minifasnet-v2-anti-spoofing-onnx"
    "/resolve/main/minifasnet_v2.onnx"
)
MODEL_SHA256 = "d7b3cd9ba8a7ceb13baa8c4720902e27ca3112eff52f926c08804af6b6eecc7b"


def main() -> None:
    # Resolve destination path from .env / Settings if available, else default
    try:
        import sys, os
        sys.path.insert(0, str(Path(__file__).parent.parent))
        os.chdir(Path(__file__).parent.parent)  # ensure .env is found
        from app.core.config import settings
        dest = Path(settings.silentface_model_path)
    except Exception:
        dest = Path("models/silentface.onnx")

    if dest.is_file():
        digest = hashlib.sha256(dest.read_bytes()).hexdigest()
        if digest == MODEL_SHA256:
            print(f"[OK] Model already cached at {dest} (SHA-256 verified)")
            return
        print(f"[WARN] Existing file at {dest} has wrong SHA-256 — re-downloading")

    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"Downloading MiniFASNetV2 ONNX (~1.7 MB) from HuggingFace …")

    req = urllib.request.Request(MODEL_URL, headers={"User-Agent": "netra/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            total = int(r.headers.get("content-length", 0))
            downloaded = 0
            chunks = []
            while chunk := r.read(65536):
                chunks.append(chunk)
                downloaded += len(chunk)
                if total:
                    pct = downloaded * 100 // total
                    print(f"\r  {pct:3d}%  {downloaded // 1024} KB / {total // 1024} KB", end="", flush=True)
            print()
            data = b"".join(chunks)
    except OSError as exc:
        print(f"\n[ERROR] Download failed: {exc}", file=sys.stderr)
        sys.exit(1)

    digest = hashlib.sha256(data).hexdigest()
    if digest != MODEL_SHA256:
        print(f"[ERROR] SHA-256 mismatch — expected {MODEL_SHA256}, got {digest}", file=sys.stderr)
        sys.exit(1)

    dest.write_bytes(data)
    print(f"[OK] Saved to {dest}  ({len(data) // 1024} KB, SHA-256 verified)")


if __name__ == "__main__":
    main()
