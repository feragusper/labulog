# ---- stage 1: build the React SPA ----
FROM node:20-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json* ./
RUN npm install
COPY web/ ./
RUN npm run build

# ---- stage 2: python API that also serves the built SPA ----
FROM python:3.11-slim AS api
WORKDIR /app

COPY api/requirements.txt ./api/requirements.txt
RUN pip install --no-cache-dir -r api/requirements.txt

COPY api/ ./api/
# main.py looks for ../../web/dist relative to api/app -> /app/web/dist
COPY --from=web /web/dist ./web/dist

WORKDIR /app/api
EXPOSE 8000
# Render injects $PORT; default 8000 for local docker run.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
