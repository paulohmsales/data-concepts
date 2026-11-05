# Content API. Build context: a folder holding api/ and content/ (deploy.sh assembles it).
FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:0.9 /uv /bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy CONTENT_DIR=/app/content CONTENT_DB=/app/content.db
COPY api/pyproject.toml api/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY api/app ./app
COPY content ./content
# validate every content file and build the database now, so bad content fails the build
RUN uv run --no-sync python -m app.seed
EXPOSE 8000
CMD ["uv", "run", "--no-sync", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
