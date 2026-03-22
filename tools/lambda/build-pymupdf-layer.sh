#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LAYER_DIR="$ROOT_DIR/infra/layers/pymupdf"
PYTHON_DIR="$LAYER_DIR/python"
REQ_FILE="$LAYER_DIR/requirements.txt"

if [[ ! -f "$REQ_FILE" ]]; then
  echo "Missing requirements file: $REQ_FILE" >&2
  exit 1
fi

IMAGE="${PYMUPDF_LAYER_BUILD_IMAGE:-public.ecr.aws/lambda/python:3.12-arm64}"
PLATFORM="${PYMUPDF_LAYER_PLATFORM:-linux/arm64}"

rm -rf "$PYTHON_DIR"
mkdir -p "$PYTHON_DIR"

if command -v docker >/dev/null 2>&1; then
  echo "Building PyMuPDF layer using $IMAGE ($PLATFORM)..."
  docker run --rm \
    --platform "$PLATFORM" \
    -u "$(id -u):$(id -g)" \
    -v "$PYTHON_DIR:/asset-output/python" \
    -v "$REQ_FILE:/tmp/requirements.txt:ro" \
    "$IMAGE" \
    /bin/sh -lc "
      python -m pip install --no-cache-dir -r /tmp/requirements.txt -t /asset-output/python &&
      PYTHONPATH=/asset-output/python python - <<'PY'
import pymupdf
print('PyMuPDF layer validation OK:', pymupdf.__version__)
PY
    "
else
  echo "Docker not found. Falling back to host python build (not guaranteed Lambda-compatible)." >&2
  python3 -m pip install --no-cache-dir -r "$REQ_FILE" -t "$PYTHON_DIR"
  PYTHONPATH="$PYTHON_DIR" python3 - <<'PY'
import pymupdf
print('PyMuPDF layer validation OK (host build):', pymupdf.__version__)
PY
fi

find "$PYTHON_DIR" -type d -name '__pycache__' -prune -exec rm -rf {} + >/dev/null 2>&1 || true
find "$PYTHON_DIR" -type f -name '*.pyc' -delete >/dev/null 2>&1 || true

echo "Layer ready at $LAYER_DIR"
