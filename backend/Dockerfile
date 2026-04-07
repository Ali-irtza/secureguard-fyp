# ---------------------------------------------------------------------------
# Stage 1: Builder
# ---------------------------------------------------------------------------
# We use a slim Python image to keep the final image small.
# python:3.11-slim = Python 3.11 on Debian slim (no extras, ~50MB vs ~900MB full)
# ---------------------------------------------------------------------------
FROM python:3.11-slim AS builder

# Set working directory inside the container
WORKDIR /app

# Copy only requirements first — Docker caches this layer.
# If requirements.txt hasn't changed, pip install is skipped on rebuild.
# This makes rebuilds much faster during development.
COPY requirements.txt .

# Install dependencies into a separate folder so we can copy them cleanly
# --no-cache-dir = don't store pip cache (saves space in image)
# --prefix=/install = install to /install instead of system Python
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt


# ---------------------------------------------------------------------------
# Stage 2: Runtime
# ---------------------------------------------------------------------------
# Fresh slim image — only copy what we need from the builder.
# This keeps the final image lean (no build tools, no pip cache).
# ---------------------------------------------------------------------------
FROM python:3.11-slim

WORKDIR /app

# Copy installed packages from builder stage
COPY --from=builder /install /usr/local

# Copy application source code
COPY app/ ./app/

# ---------------------------------------------------------------------------
# Runtime configuration
# ---------------------------------------------------------------------------
# These are defaults — docker-compose.yml or .env can override them.
# ENV vars set here are available inside the container at runtime.
# ---------------------------------------------------------------------------
ENV APP_HOST=0.0.0.0
ENV APP_PORT=8000
ENV APP_ENV=production

# Expose the port the app runs on
# This is documentation — it doesn't actually publish the port.
# Port publishing happens in docker-compose.yml or `docker run -p`
EXPOSE 8000

# ---------------------------------------------------------------------------
# Start command
# ---------------------------------------------------------------------------
# uvicorn = ASGI server that runs our FastAPI app
# app.main:app = module path : FastAPI instance name
# --host 0.0.0.0 = listen on all interfaces (required inside Docker)
# --port 8000 = port to listen on
# No --reload in production (reload is dev-only, watches for file changes)
# ---------------------------------------------------------------------------
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
