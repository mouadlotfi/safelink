#!/usr/bin/env bash
# Run the FastAPI backend and the Next.js frontend together for local development.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

if [[ ! -d node_modules ]]; then
  echo "error: node_modules not found. Run: bun install" >&2
  exit 1
fi
if [[ ! -x backend/.venv/bin/uvicorn ]]; then
  echo "error: backend virtualenv not found. Run: (cd backend && uv sync --extra dev)" >&2
  exit 1
fi

echo "backend  -> http://localhost:8000"
echo "frontend -> http://localhost:3000"

(cd backend && exec uv run uvicorn app.main:app --reload --port 8000) &
backend_pid=$!
bun run dev &
frontend_pid=$!

trap 'kill "$backend_pid" "$frontend_pid" 2>/dev/null || true' EXIT INT TERM
wait -n "$backend_pid" "$frontend_pid"
