# Repository Guidelines

Safelink is a privacy-first URL cleaner and alternative frontend resolver. It strips tracking parameters (e.g., UTM, Facebook `fbclid`, Instagram `ig*`, Spotify `si`/`pi`/`sci`, TikTok, LinkedIn) and resolves privacy-friendly frontends (e.g., Invidious, Redlib, Nitter, Imginn). The Next.js frontend is a thin client; all URL cleaning, expansion, and redirect resolution logic lives exclusively in the FastAPI backend.

---

## Architecture & Data Flow

```
Browser (React 19 / UI)
   │
   ▼
lib/api-client.ts (In-flight request deduplication)
   │
   ▼
Next.js API Proxy (app/api/{clean,alt,stats}/route.ts)
   │  • Sliding-window rate limiting (60 req/min public, 600 req/min keyed)
   │  • URL validation (HTTP/HTTPS, max 8192 chars)
   │
   ▼
lib/url-service.ts (Server-side fetch with 45s timeout)
   │
   ▼
FastAPI Backend (backend/app/main.py -> backend/app/routes/)
   │
   ▼
backend/app/lib/url_service.py (Pipeline orchestrator)
   ├─► url_expander.py (Resolves short links: Reddit, TikTok, Facebook, LinkedIn)
   ├─► clearurls.py (Applies ClearURLs rules + platform tracker patterns)
   ├─► custom_frontends.py (Static overrides: Imginn, Invidious, Nitter, Redlib)
   └─► alternative_frontends.py (LibRedirect data.json + live HTTP HEAD probing)
   │
   ▼
backend/app/lib/stats.py (Atomic SQLite counter: links_cleaned in safelink_stats.sqlite3)
```

### Core Architecture Rules
1. **Backend-Only Processing**: URL processing logic belongs in `backend/app/lib/`. The frontend `lib/` contains only API clients, history storage, clipboard, and DOM helpers.
2. **Mandatory Proxy Chain**: Browser calls Next.js proxy routes (`/api/*`), which forward to FastAPI via `SAFELINK_BACKEND_URL`. The browser never talks directly to the backend.
3. **Shared Async HTTP Client**: Backend routes use a singleton `httpx.AsyncClient` managed via FastAPI lifespan (`app.state.http_client` / `get_http_client()`). Never instantiate `httpx.AsyncClient` or `requests` per request.
4. **Offline Resilience**: ClearURLs rules and LibRedirect instances are fetched remotely with a 1-hour in-memory cache, falling back to bundled `clearurls-rules.json` and `data.json` if offline or unreachable.

---

## Key Directories

```
.
├── app/                  # Next.js App Router (pages, layout, proxy route handlers)
│   ├── api/              # Proxy routes: /api/clean, /api/alt, /api/stats
│   ├── api-docs/         # Interactive API documentation page
│   ├── history/          # Cleaned URLs local history page
│   └── info/             # Privacy & supported services documentation
├── components/           # React UI components (UrlProcessor, HistoryView, Navigation, Toast)
├── lib/                  # Thin frontend utilities (api-client, history, clipboard, url-extract)
├── backend/              # FastAPI Python backend service
│   ├── app/
│   │   ├── main.py       # FastAPI application entrypoint and lifespan
│   │   ├── routes/       # Route handlers (/api/clean, /api/alt, /api/stats)
│   │   └── lib/          # Core URL processing engine (url_service, expander, clearurls, etc.)
│   └── tests/            # Pytest test suite (76 tests)
├── clearurls-rules.json  # Bundled ClearURLs ruleset fallback
└── data.json             # Bundled LibRedirect instances dataset fallback
```

---

## Development Commands

### Frontend (Bun)
```bash
bun install             # Install dependencies (pinned to bun@1.3.6)
bun dev                 # Start Next.js development server (http://localhost:3000)
bun run build           # Build production Next.js bundle
bun run test            # Run Vitest unit tests (37 tests)
bun run lint            # Run ESLint (ESLint 9 flat config)
bunx tsc --noEmit       # Typecheck TypeScript without emitting JS
```

### Backend (Python / uv)
```bash
cd backend
uv sync --extra dev     # Create/sync local virtual environment with dev dependencies
uv run uvicorn app.main:app --reload --port 8000  # Start backend server
uv run pytest           # Run backend test suite (76 tests)
uv run ruff check .     # Run Ruff linter
uv run ruff format .    # Run Ruff code formatter
```

### Docker
```bash
# Production Compose (Coolify deployment via prebuilt GHCR images)
docker compose up -d

# Local Development Compose (builds from source)
docker compose -f docker-compose.dev.yml up --build
```

---

## Code Conventions & Common Patterns

### Frontend Patterns (Next.js / React)
- **Client Components**: Mark interactive UI with `"use client"` at the top (`url-processor.tsx`, `history-view.tsx`, `toast.tsx`).
- **In-Flight Request Deduplication**: `lib/api-client.ts` wraps fetch calls in `withInflight(key, factory)` to prevent duplicate concurrent network requests for the same URL.
- **Local History Management**: `lib/history.ts` encapsulates all `localStorage` reads/writes under key `safelink-history`. Components must use `appendHistory`, `readHistory`, `clearHistory`, or `findByOriginalUrl`. History is capped at 400 entries / 30-day expiry / 4 MB storage with automatic halving on quota errors.
- **Toast Notifications**: Managed through `useToast()` hook and `<ToastProvider>` in `app/layout.tsx`.
- **Text & Multiline URL Extraction**: `lib/url-extract.ts` uses regex to extract and replace URLs in freeform text without mangling surrounding punctuation.

### Backend Patterns (FastAPI / Python)
- **Async Everywhere**: All endpoint handlers and library operations are strictly `async def`. Blocking operations (e.g. SQLite queries, file reads) use `asyncio.to_thread`.
- **Local Request/Response Schemas**: Each route file in `backend/app/routes/` defines its own Pydantic models (`CleanRequest`, `CleanResponse`, `AltRequest`, `AltResponse`, `StatsResponse`). Do not share request models across routes.
- **URL Validation**: Common validation lives in `backend/app/routes/_shared.py` (`validate_url`) checking scheme (`http`/`https`), length (≤ 8192 chars), host structure, and whitespace.
- **Error Handling**: Raise `HTTPException` with explicit status codes (`400` for validation, `502` for upstream network/processing failure, `500` for DB failure). Use `raise HTTPException(...) from e` to preserve stack context.
- **Logging**: Use standard Python `logging.getLogger(__name__)`. Never use `print()`.
- **Database Access**: SQLite stats persistence (`backend/app/lib/stats.py`) uses stdlib `sqlite3` in WAL mode with `5000ms` busy timeout and `BEGIN IMMEDIATE` transactions wrapped in `asyncio.to_thread`.

---

## Important Files

| File | Purpose |
|---|---|
| `backend/app/main.py` | FastAPI entrypoint, CORS setup, router mounting, shared `httpx.AsyncClient` lifespan |
| `backend/app/lib/url_service.py` | Core pipeline combining URL expansion, ClearURLs rules, and alternative resolution |
| `backend/app/lib/url_expander.py` | Resolves short links (Reddit, TikTok, Facebook, LinkedIn) via HTTP redirects, `HTMLParser`, and optional `yt-dlp` |
| `backend/app/lib/clearurls.py` | Compiles ClearURLs regex rules and applies domain-specific tracking parameter filters |
| `backend/app/lib/alternative_frontends.py` | Matches target domains to LibRedirect services and probes instances via HTTP HEAD |
| `backend/app/lib/custom_frontends.py` | Hardcoded primary instances (e.g., Imginn for Instagram, Invidious for YouTube) |
| `components/url-processor.tsx` | Main user-facing cleaning interface (single/multi URL & freeform text modes) |
| `lib/api-client.ts` | Browser-side API client with in-flight Promise deduplication |
| `lib/url-service.ts` | Next.js server-side proxy client connecting to FastAPI backend |
| `.github/workflows/ci.yml` | Unified CI/CD workflow running tests, building Docker images, and deploying to Coolify |

---

## Runtime & Tooling Preferences

- **Package Manager (Frontend)**: **Bun** (`bun@1.3.6`). Always use `bun install`, `bun run`, `bun test`.
- **Package Manager (Backend)**: **uv**. Always use `uv sync`, `uv run pytest`, `uv run ruff`.
- **Python Version**: Python `>= 3.11` (`3.12-slim` in Docker).
- **Node/Next Version**: Next.js 16 (App Router) with React 19.
- **Linter & Formatter**:
  - Frontend: ESLint 9 (flat config in `eslint.config.mjs`).
  - Backend: Ruff (`pyproject.toml`, target `py311`, line length `100`, select `["E", "F", "I", "W"]`).

---

## Testing & QA

### Running Test Suites
```bash
# Frontend tests (Vitest + JSDOM + React Testing Library)
bun run test

# Backend tests (Pytest + pytest-asyncio)
cd backend && uv run pytest
```

### Testing Conventions
- **Frontend (`*.test.ts`, `*.test.tsx`)**:
  - Global setup in `vitest.setup.ts` polyfills `window.matchMedia` and provides a fallback `localStorage` adapter.
  - Component tests use `vi.hoisted()` and `vi.mock()` to isolate external API and clipboard calls.
  - Reset mocks in `beforeEach` / `afterEach` with `vi.clearAllMocks()` and clear `localStorage`.
- **Backend (`backend/tests/test_*.py`)**:
  - API integration tests (`test_api.py`) use `starlette.testclient.TestClient(app)` to exercise real HTTP endpoints.
  - Unit tests use `pytest.mark.asyncio` (implicit in `auto` mode) and `monkeypatch` to mock network responses and upstream resolvers.
  - Standard test helper `build_url(hostname, path, params)` constructs reproducible URLs for rule testing.

---

## Environment Variables

| Variable | Scope | Description | Default |
|---|---|---|---|
| `SAFELINK_BACKEND_URL` | Frontend | URL of the FastAPI backend service | `http://localhost:8000` |
| `NEXT_PUBLIC_WEBSITE_URL` | Frontend | Canonical site URL (used in API docs & metadata) | `http://localhost:3000` |
| `API_KEYS` | Frontend | Comma-separated list of valid `x-api-key` headers for elevated rate limits | None |
| `SAFELINK_STATS_DB` | Backend | Path to SQLite statistics database file | `backend/safelink_stats.sqlite3` |
