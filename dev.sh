#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -x backend/venv/bin/uvicorn ]; then
  echo "backend/venv missing — run: python3 -m venv backend/venv && backend/venv/bin/pip install -r backend/requirements.txt" >&2
  exit 1
fi

if ! docker compose up -d --wait; then
  echo "Postgres/Redis failed to start — is Docker running?" >&2
  exit 1
fi

exec npm run dev
