# ── Stage 1: dependency builder ───────────────────────────────────────────────
FROM python:3.12-slim AS builder

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

WORKDIR /app

# Copy dependency manifests first so this layer is cached
COPY pyproject.toml uv.lock ./

# Install production deps including the ML recognition stack (onnxruntime, opencv, insightface).
# These are now required dependencies (not optional) — uv sync installs them automatically.
# insightface pulls in opencv-python (GUI, needs libxcb) as a transitive dep — uninstall it
# immediately after sync so only opencv-python-headless (no X11 deps) remains.
RUN uv sync --frozen --no-dev --no-install-project \
 && uv pip uninstall --python .venv/bin/python opencv-python opencv-python-headless \
 && uv pip install --python .venv/bin/python "opencv-python-headless==4.13.0.92"

# Download models at build time so they are baked into the image.
# No internet access required at runtime.
COPY scripts/prepare_silentface.py scripts/prepare_insightface.py scripts/

# SilentFace MiniFASNetV2 ONNX (~1.7 MB) — only needs stdlib, uses system python
RUN python scripts/prepare_silentface.py

# InsightFace buffalo_s (~90 MB) — needs the installed venv
ENV INSIGHTFACE_MODEL_ROOT=/app/models/insightface
RUN .venv/bin/python scripts/prepare_insightface.py

# ── Stage 2: runtime image ────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

# Non-root user
RUN addgroup --system --gid 1001 appgroup \
 && adduser  --system --uid 1001 --ingroup appgroup --no-create-home appuser

WORKDIR /app

# Copy the pre-built venv from the builder stage (same path = shebangs stay valid)
COPY --from=builder /app/.venv /app/.venv

# Copy application code
COPY app/ app/

# Copy all pre-downloaded models from the builder stage
COPY --from=builder /app/models/ /app/models/

# Make the venv the active Python environment
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONPATH="/app" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    SILENTFACE_MODEL_PATH=/app/models/silentface.onnx \
    INSIGHTFACE_MODEL_ROOT=/app/models/insightface

RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 5170

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "5170"]
