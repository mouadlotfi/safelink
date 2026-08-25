FROM python:3.12-slim

WORKDIR /app

ENV UV_SYSTEM_PYTHON=1
ENV UV_NO_CACHE=1

RUN pip install --no-cache-dir uv \
    && groupadd --system app \
    && useradd --system --gid app --home-dir /app app

COPY backend/pyproject.toml backend/uv.lock ./

RUN uv sync --frozen --no-dev --no-install-project

ENV PATH="/app/.venv/bin:$PATH"

COPY --chown=app:app backend/app app
COPY --chown=app:app clearurls-rules.json data.json ./

RUN mkdir -p /app/data && chown app:app /app/data

ENV SAFELINK_STATS_DB=/app/data/safelink_stats.sqlite3

USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"]

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
