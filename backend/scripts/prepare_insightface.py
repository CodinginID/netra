"""Download and prepare InsightFace buffalo_s model at Docker build time.

Uses InsightFace's own downloader so the model is saved in the directory
structure that FaceAnalysis expects: <root>/models/buffalo_s/*.onnx

Run via the venv Python:
    .venv/bin/python scripts/prepare_insightface.py
"""

import os
import sys

MODEL_ROOT = os.environ.get("INSIGHTFACE_MODEL_ROOT", "models/insightface")

print(f"Preparing InsightFace buffalo_s in {MODEL_ROOT} …")

try:
    from insightface.app import FaceAnalysis
except ImportError:
    print("ERROR: insightface not installed. Run `uv sync --extra recognition` first.")
    sys.exit(1)

app = FaceAnalysis(name="buffalo_s", root=MODEL_ROOT, providers=["CPUExecutionProvider"])
app.prepare(ctx_id=-1, det_size=(640, 640))

model_dir = os.path.join(MODEL_ROOT, "models", "buffalo_s")
files = os.listdir(model_dir) if os.path.isdir(model_dir) else []
print(f"[OK] buffalo_s ready in {model_dir}: {', '.join(sorted(files))}")
