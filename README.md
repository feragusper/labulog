# LaburoLog

Tracker de postulaciones a laburo + intel de mercado. Estilo [linprofi](https://linprofi.com/):
seguí tus postulaciones, su timeline de estados, y cruzá cualquier job posting por URL
para saber **si ya aplicaste y cómo te fue** — anti ghost-job.

- **Postings y empresas** son globales (data de mercado compartida entre usuarios).
- **Postulaciones** son privadas por usuario.
- Deploy **monolítico**: FastAPI sirve la API *y* el React buildeado. Un solo servicio.

## Stack

| Capa | Tech |
|------|------|
| Backend | Python 3.11 · FastAPI · SQLModel · JWT (bcrypt + PyJWT) |
| Frontend | React 18 · Vite · TypeScript · TanStack Query |
| DB | SQLite (local) · Postgres (prod) |
| Deploy | Docker single service → Render + Postgres |

```
api/   FastAPI app (app/main.py monta la SPA buildeada en /)
web/   React + Vite (build → web/dist, servido por FastAPI)
Dockerfile      multi-stage: buildea web, después corre la API
render.yaml     blueprint: 1 web service docker + 1 Postgres
```

## Correr local

Dos terminales (front con hot-reload, back con la API):

**Backend** (`:8000`)
```bash
cd api
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # default: sqlite local
uvicorn app.main:app --reload
```

**Frontend** (`:5173`, proxea /api → :8000)
```bash
cd web
npm install
npm run dev
```

Abrí http://localhost:5173 — registrate y entrá.

### Probar el monolito (como en prod)
```bash
cd web && npm run build          # genera web/dist
cd ../api && uvicorn app.main:app # sirve API + SPA en :8000
```

## Deploy (Render, un solo servicio)

1. Subí el repo a GitHub.
2. Render → **New → Blueprint** → apuntá a este repo. `render.yaml` crea:
   - el web service Docker (buildea front + corre API)
   - un Postgres free (conecta vía `DATABASE_URL` auto)
3. Listo. `SECRET_KEY` se genera solo.

> Postgres free de Render expira ~90 días. Para DB durable gratis: creá una en
> [Neon](https://neon.tech) y cambiá la env var `DATABASE_URL` (el código ya
> normaliza la URL al driver psycopg3).

## API (resumen)

| Método | Ruta | Qué hace |
|--------|------|----------|
| POST | `/api/auth/register` · `/login` · GET `/me` | auth JWT |
| GET | `/api/postings/lookup?url=` | **¿ya apliqué a esta URL?** |
| GET/POST | `/api/applications` | listar / crear (upsert posting + company) |
| PATCH/DELETE | `/api/applications/{id}` | cambiar estado (genera timeline) / borrar |
| GET | `/api/stats/funnel` | total, tasa respuesta/entrevista, ghosts |

Docs interactivas en `/docs` (Swagger).

## Roadmap

- [ ] Migraciones con Alembic (hoy `create_all` al boot — ok para MVP)
- [ ] Detección de ghost jobs (posting activo X días post-aplicación sin respuesta)
- [ ] Agregados de mercado (salarios por seniority/empresa cruzando usuarios)
- [ ] Scraper de LinkedIn como worker aparte para completar data de postings
- [ ] Recordatorios de follow-up
