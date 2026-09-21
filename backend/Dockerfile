FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Pin the UID/GID so the /app/data volume owner cannot drift with the base image.
RUN groupadd --gid 10001 app \
    && useradd --uid 10001 --gid 10001 --home-dir /app --no-create-home \
        --shell /usr/sbin/nologin app

COPY backend/pyproject.toml backend/uv.lock ./

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project --compile-bytecode

ENV PATH="/app/.venv/bin:$PATH"

COPY --chown=app:app backend/app app
COPY --chown=app:app clearurls-rules.json data.json ./

RUN mkdir -p /app/data && chown app:app /app/data

ENV SAFELINK_STATS_DB=/app/data/safelink_stats.sqlite3

USER app

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"]

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
