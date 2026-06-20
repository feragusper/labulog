import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .db import init_db
from .routers import applications, auth, imports, postings, stats


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Labulog API", version="0.1.0", lifespan=lifespan)

if settings.cors_origin_list:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(auth.router)
app.include_router(postings.router)
app.include_router(applications.router)
app.include_router(stats.router)
app.include_router(imports.router)


@app.get("/api/health")
def health():
    # 'db' lets you confirm prod is on Postgres (persistent), not ephemeral sqlite.
    from .db import engine
    return {"status": "ok", "db": engine.dialect.name}


# ---- serve the built React SPA (monolith deploy) ----
# Path to web/dist relative to this file: api/app/main.py -> ../../web/dist
DIST_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "web", "dist")

if os.path.isdir(DIST_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(DIST_DIR, "assets")), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        # Serve a real dist file if it exists (favicon.svg, robots.txt, ...);
        # otherwise fall back to index.html for client-side routing.
        base = os.path.abspath(DIST_DIR)
        if full_path:
            candidate = os.path.normpath(os.path.join(base, full_path))
            if candidate.startswith(base) and os.path.isfile(candidate):
                return FileResponse(candidate)
        return FileResponse(os.path.join(base, "index.html"))
