# Labulog

**Job-application tracker + market intel.** In the spirit of [linprofi](https://linprofi.com/):
follow every application through its pipeline, reconstruct the timeline of stages,
measure how long each process takes and how much time you sink into interviews, and
cross-check any job posting by URL to know **whether you already applied and how it went**
— anti ghost-job.

🔗 **Live:** https://labulog.onrender.com · **Repo:** https://github.com/feragusper/labulog

---

## What it's about

Job hunting spawns a mess of parallel processes: dozens of companies, each at a different
stage, many that ghost you, others that fall through on their own. Labulog brings order:

- **Application tracking** with a granular pipeline (saved → applied → first contact →
  screening → technical interview → manager interview → proposal → offer → accepted) and
  terminal outcomes (rejected, cancelled, ghosted, withdrawn).
- **Per-application timeline**: every stage change is an event with a date and note; full
  CRUD to fix the history.
- **Metrics**: response rate, interview rate, interview rounds, estimated interview time,
  average process length, overdue follow-ups.
- **Anti ghost-job lookup**: paste a posting URL and it tells you whether you already
  applied and what state it ended in. Postings are global (shared market data);
  applications are private per user.
- **Views**: a sortable/filterable list, or a Kanban board with drag-between-stages.
- **Import**: scouting CSV (rebuilds the timeline from date columns, parses salaries,
  infers the outcome from the free text). **Export** to CSV.
- **UX**: light/dark/system themes, English/Spanish, collapsible sidebar, responsive.

## Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Python 3.11 · [FastAPI](https://fastapi.tiangolo.com/) · [SQLModel](https://sqlmodel.tiangolo.com/) (SQLAlchemy + Pydantic) |
| **Auth** | Own JWT (PyJWT) + bcrypt · Google sign-in (Google Identity Services, verified with `google-auth`) |
| **Frontend** | React 18 · TypeScript · [Vite](https://vitejs.dev/) · [TanStack Query](https://tanstack.com/query) · React Router · plain CSS (no framework) |
| **i18n / theming** | Small custom context (EN/ES) · per-theme CSS variables |
| **DB** | SQLite (dev) · PostgreSQL (prod) — same code via SQLModel |
| **DB driver** | psycopg 3 (the URL is normalized to `postgresql+psycopg://` at runtime) |
| **Packaging** | Multi-stage Docker |
| **Hosting** | [Render](https://render.com) (Docker web service) · [Neon](https://neon.tech) (Postgres) |

## Architecture

**Monolith.** A single deployable: FastAPI serves the API under `/api/*` and the built
React SPA (`web/dist`) on every other route, falling back to `index.html` for client-side
routing. One repo, one service, one domain.

```
┌────────────────────────────────────────────┐
│  FastAPI (uvicorn)                           │
│                                              │
│   /api/auth         login / register / google│
│   /api/postings     lookup by URL, CRUD      │
│   /api/applications CRUD + event ABM         │
│   /api/stats        funnel / metrics         │
│   /api/import       CSV import               │
│   /api/health       status + DB dialect      │
│                                              │
│   /  (catch-all)    → serves web/dist (SPA)  │
└───────────────────────┬──────────────────────┘
                        │  SQLModel
                ┌───────▼────────┐
                │   PostgreSQL    │  (SQLite in dev)
                └────────────────┘
```

### Data model

```
User         (id, email, hashed_password)
Company      (id, name, …)                      ── global
JobPosting   (id, company_id, title, url UNIQUE, salary, source, …)  ── global
Application  (id, user_id, posting_id, status, priority, follow_up_date, …)  ── private
StatusEvent  (id, application_id, status, at, note)   ── application timeline
```

- **`JobPosting.url` is unique** = the key for the "did I already apply?" lookup and the
  anti-ghost feature.
- **Postings/Companies are global** → market intel shared across users.
- **Applications/StatusEvents are private** → each user sees only their own.
- The **current status** lives on `Application.status`; the **events** are the editable
  history. Interview rounds (Technical I/II, Manager I/II) are multiple `StatusEvent`s,
  not separate statuses.

### Repo layout

```
api/                  FastAPI backend
  app/
    main.py           App, CORS, SPA mounting, /health
    config.py         Settings (pydantic-settings, reads env)
    db.py             Engine, init_db, idempotent migrations (see below)
    models.py         SQLModel tables + enums (AppStatus, Priority)
    schemas.py        Pydantic DTOs (request/response)
    security.py       bcrypt hashing + JWT
    deps.py           get_current_user (OAuth2 bearer)
    crud.py           posting upsert / get-or-create company
    routers/          auth, postings, applications, stats, imports
  requirements.txt
web/                  React + Vite frontend
  src/
    main.tsx          Bootstrap (QueryClient, providers, theme, i18n)
    App.tsx           Routes + auth gate
    Layout.tsx        Shell with collapsible sidebar
    api.ts            Typed fetch client + types
    i18n.tsx          EN/ES dictionary + provider
    theme.ts          Light/dark/system theme
    components/ui.tsx Badges, status constants, helpers
    pages/            Overview, Applications, ApplicationDetail, Lookup, Settings, AuthPage
Dockerfile            Multi-stage build (Node → Python)
render.yaml           Render blueprint (web service; DB is external on Neon)
```

### Migrations

No Alembic yet (MVP). `init_db()` runs at startup and:
1. `SQLModel.metadata.create_all()` — creates missing tables.
2. **Idempotent ADD COLUMN** for new columns (`create_all` doesn't alter existing
   tables) — e.g. `priority`, `follow_up_date`.
3. **Postgres enum auto-extend** (`ALTER TYPE appstatus ADD VALUE IF NOT EXISTS …`) for
   new statuses, since `create_all` never touches native enums.

So the schema self-heals on every deploy with no manual migrations. (Alembic is on the
roadmap once changes get non-trivial.)

## Environment

Variables (see [`api/.env.example`](api/.env.example)):

| Var | Default | Description |
|-----|---------|-------------|
| `DATABASE_URL` | `sqlite:///labulog.db` | Connection. In prod, the Postgres URL (normalized to psycopg3). |
| `SECRET_KEY` | `dev-secret-change-me` | JWT signing key. **Change in prod** (`generateValue` on Render). |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `10080` | Token lifetime (7 days). |
| `CORS_ORIGINS` | `http://localhost:5173` | Allowed origins. Empty in prod (same origin — the API serves the SPA). |
| `GOOGLE_CLIENT_ID` | `""` | OAuth client id. Empty = Google sign-in disabled (button hidden). |

## Run locally

Two terminals (front with hot-reload + back with the API):

**Backend** (`:8000`)
```bash
cd api
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # default: local sqlite
uvicorn app.main:app --reload
```

**Frontend** (`:5173`, proxies `/api` → `:8000`)
```bash
cd web
npm install
npm run dev
```

Open http://localhost:5173, register and sign in. Interactive API docs at
http://localhost:8000/docs (Swagger).

### Run the monolith (like prod)
```bash
cd web && npm run build           # produces web/dist
cd ../api && uvicorn app.main:app # serves API + SPA on :8000
```

### Docker
```bash
docker build -t labulog .
docker run -p 8000:8000 -e SECRET_KEY=dev labulog   # ephemeral sqlite
```

## CI/CD

- **CD:** push to `main` on GitHub → Render rebuilds the Docker image and redeploys
  automatically. [`render.yaml`](render.yaml) defines the web service + Postgres as a
  blueprint; `DATABASE_URL` is set manually in the dashboard (points at Neon) and
  `SECRET_KEY` is generated. Health check at `/api/health` (returns the DB dialect to
  confirm prod is on Postgres, not ephemeral sqlite).
- **Build:** multi-stage [`Dockerfile`](Dockerfile) — a Node stage builds the SPA, a
  Python stage installs deps and runs uvicorn serving API + static assets.
- **CI:** no GitHub Actions test/lint pipeline yet (roadmap). For now verification is a
  local `npm run build` (typecheck via `tsc`) plus manual backend smoke tests through
  TestClient.

> ℹ️ Postgres runs on [Neon](https://neon.tech)'s durable free tier (Render's free
> Postgres expires). `DATABASE_URL` is the Neon pooler connection string, set manually in
> the Render dashboard; the code normalizes the driver to psycopg3 automatically.

## Roadmap

- [ ] CI on GitHub Actions (pytest + lint + typecheck on every PR)
- [ ] Alembic migrations
- [ ] Automatic ghost-job detection (posting still live X days post-application with no reply)
- [ ] Market aggregates (salaries by seniority/company across users)
- [ ] LinkedIn scraper as a separate worker to enrich posting data
- [ ] Calendar and Sankey (pipeline flow) views
- [ ] Real interview durations (currently estimated by round count)
```
