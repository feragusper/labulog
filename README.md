# Labulog

**Tracker de postulaciones a trabajo + intel de mercado.** Estilo [linprofi](https://linprofi.com/):
seguí cada postulación a lo largo de su pipeline, reconstruí el timeline de etapas,
medí cuánto tarda cada proceso y cuánto invertís en entrevistas, y cruzá cualquier
job posting por URL para saber **si ya aplicaste y cómo te fue** — anti ghost-job.

🔗 **Live:** https://labulog.onrender.com · **Repo:** https://github.com/feragusper/labulog

---

## De qué la va

Buscar trabajo genera un caos de procesos en paralelo: decenas de empresas, cada una
en una etapa distinta, muchas que te ghostean, otras que se caen solas. Labulog ordena
eso:

- **Trackeo de postulaciones** con pipeline granular (saved → applied → first contact →
  screening → entrevista técnica → entrevista con manager → propuesta → oferta) y estados
  terminales (rechazada, cancelada, ghosteada, retirada).
- **Timeline por postulación**: cada cambio de etapa es un evento con fecha y nota; ABM
  completo para corregir el historial.
- **Métricas**: tasa de respuesta, tasa de entrevista, rondas de entrevista, tiempo
  estimado en entrevistas, duración media de los procesos, follow-ups vencidos.
- **Lookup anti ghost-job**: pegás la URL de un posting y te dice si ya aplicaste y en qué
  estado quedó. Los postings son globales (data de mercado compartida); las postulaciones
  son privadas por usuario.
- **Vistas**: lista con orden y filtros, o tablero Kanban con drag entre etapas.
- **Import**: CSV de scouting (reconstruye timeline desde columnas de fecha, parsea
  salarios, infiere el resultado del texto). **Export** a CSV.
- **UX**: temas claro/oscuro/sistema, español/inglés, sidebar colapsable, responsive.

## Stack

| Capa | Tecnología |
|------|-----------|
| **Backend** | Python 3.11 · [FastAPI](https://fastapi.tiangolo.com/) · [SQLModel](https://sqlmodel.tiangolo.com/) (SQLAlchemy + Pydantic) |
| **Auth** | JWT propio (PyJWT) + bcrypt · Login con Google (Google Identity Services, verificado con `google-auth`) |
| **Frontend** | React 18 · TypeScript · [Vite](https://vitejs.dev/) · [TanStack Query](https://tanstack.com/query) · React Router · CSS plano (sin framework) |
| **i18n / theming** | Context propio liviano (ES/EN) · variables CSS por tema |
| **DB** | SQLite (dev) · PostgreSQL (prod) — mismo código vía SQLModel |
| **Driver DB** | psycopg 3 (la URL se normaliza a `postgresql+psycopg://` en runtime) |
| **Empaquetado** | Docker multi-stage |
| **Hosting** | [Render](https://render.com) (web service Docker + Postgres) |

## Arquitectura

**Monolito.** Un solo deployable: FastAPI sirve la API bajo `/api/*` y el SPA de React
buildeado (`web/dist`) en el resto de las rutas, con fallback a `index.html` para el
ruteo del lado del cliente. Un repo, un servicio, un dominio.

```
┌────────────────────────────────────────────┐
│  FastAPI (uvicorn)                           │
│                                              │
│   /api/auth        login / register / google │
│   /api/postings    lookup por URL, CRUD      │
│   /api/applications CRUD + ABM de eventos    │
│   /api/stats       funnel / métricas         │
│   /api/import      import CSV                 │
│   /api/health      status + dialect de DB    │
│                                              │
│   /  (catch-all)   → sirve web/dist (SPA)    │
└───────────────────────┬──────────────────────┘
                        │  SQLModel
                ┌───────▼────────┐
                │   PostgreSQL    │  (SQLite en dev)
                └────────────────┘
```

### Modelo de datos

```
User         (id, email, hashed_password)
Company      (id, name, …)                      ── global
JobPosting   (id, company_id, title, url UNIQUE, salary, source, …)  ── global
Application  (id, user_id, posting_id, status, priority, follow_up_date, …)  ── privada
StatusEvent  (id, application_id, status, at, note)   ── timeline de la postulación
```

- **`JobPosting.url` es único** = la clave del lookup "¿ya apliqué?" y del anti-ghost.
- **Postings/Companies globales** → intel de mercado compartida entre usuarios.
- **Applications/StatusEvents privadas** → cada uno ve solo lo suyo.
- El **estado actual** vive en `Application.status`; los **eventos** son el historial
  editable. Las rondas de entrevista (Technical I/II, Manager I/II) son múltiples
  `StatusEvent`, no estados distintos.

### Estructura del repo

```
api/                  Backend FastAPI
  app/
    main.py           App, CORS, montaje del SPA, /health
    config.py         Settings (pydantic-settings, lee env)
    db.py             Engine, init_db, migraciones idempotentes (ver abajo)
    models.py         Tablas SQLModel + enums (AppStatus, Priority)
    schemas.py        DTOs Pydantic (request/response)
    security.py       Hash bcrypt + JWT
    deps.py           get_current_user (OAuth2 bearer)
    crud.py           upsert de posting / get-or-create company
    routers/          auth, postings, applications, stats, imports
  requirements.txt
web/                  Frontend React + Vite
  src/
    main.tsx          Bootstrap (QueryClient, providers, tema, i18n)
    App.tsx           Rutas + gate de auth
    Layout.tsx        Shell con sidebar colapsable
    api.ts            Cliente fetch tipado + tipos
    i18n.tsx          Diccionario ES/EN + provider
    theme.ts          Tema claro/oscuro/sistema
    components/ui.tsx Badges, constantes de estado, helpers
    pages/            Overview, Applications, ApplicationDetail, Lookup, Settings, AuthPage
Dockerfile            Build multi-stage (Node → Python)
render.yaml           Blueprint de Render (web service + Postgres)
```

### Migraciones

MVP sin Alembic todavía. `init_db()` corre al arrancar y:
1. `SQLModel.metadata.create_all()` — crea tablas faltantes.
2. **ADD COLUMN idempotente** para columnas nuevas (`create_all` no altera tablas
   existentes) — ej. `priority`, `follow_up_date`.
3. **Auto-extensión del enum** de Postgres (`ALTER TYPE appstatus ADD VALUE IF NOT
   EXISTS …`) para estados nuevos, ya que `create_all` no toca enums nativos.

Así el esquema se auto-cura en cada deploy sin migraciones manuales. (Alembic está en el
roadmap cuando los cambios se pongan no triviales.)

## Environment

Variables (ver [`api/.env.example`](api/.env.example)):

| Var | Default | Descripción |
|-----|---------|-------------|
| `DATABASE_URL` | `sqlite:///labulog.db` | Conexión. En prod, la URL de Postgres (se normaliza a psycopg3). |
| `SECRET_KEY` | `dev-secret-change-me` | Firma de los JWT. **Cambiar en prod** (`generateValue` en Render). |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `10080` | Vida del token (7 días). |
| `CORS_ORIGINS` | `http://localhost:5173` | Orígenes permitidos. Vacío en prod (mismo origen, el SPA lo sirve la API). |
| `GOOGLE_CLIENT_ID` | `""` | OAuth client id. Vacío = login con Google deshabilitado (el botón no aparece). |

## Correr local

Dos terminales (front con hot-reload + back con la API):

**Backend** (`:8000`)
```bash
cd api
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # default: sqlite local
uvicorn app.main:app --reload
```

**Frontend** (`:5173`, proxea `/api` → `:8000`)
```bash
cd web
npm install
npm run dev
```

Abrí http://localhost:5173, registrate y entrá. Docs interactivas de la API en
http://localhost:8000/docs (Swagger).

### Probar el monolito (como en prod)
```bash
cd web && npm run build           # genera web/dist
cd ../api && uvicorn app.main:app # sirve API + SPA en :8000
```

### Docker
```bash
docker build -t labulog .
docker run -p 8000:8000 -e SECRET_KEY=dev labulog   # sqlite efímero
```

## CI/CD

- **CD:** push a `main` en GitHub → Render rebuildea la imagen Docker y redeploya
  automáticamente. El [`render.yaml`](render.yaml) define el web service + el Postgres
  como blueprint; `DATABASE_URL` se inyecta solo desde la DB y `SECRET_KEY` se genera.
  Health check en `/api/health` (devuelve el dialect de la DB para confirmar que prod
  está sobre Postgres y no sobre sqlite efímero).
- **Build:** [`Dockerfile`](Dockerfile) multi-stage — stage Node buildea el SPA, stage
  Python instala deps y corre uvicorn sirviendo API + estáticos.
- **CI:** todavía no hay pipeline de tests/lint en GitHub Actions (roadmap). Hoy la
  verificación es `npm run build` (typecheck con `tsc`) local y smoke tests manuales del
  backend vía TestClient.

> ⚠️ El Postgres free de Render expira ~90 días. Para una DB durable gratis, creá una en
> [Neon](https://neon.tech) y cambiá `DATABASE_URL` (el código ya normaliza el driver).

## Roadmap

- [ ] CI en GitHub Actions (pytest + lint + typecheck en cada PR)
- [ ] Migraciones con Alembic
- [ ] Detección automática de ghost jobs (posting activo X días post-aplicación sin respuesta)
- [ ] Agregados de mercado (salarios por seniority/empresa cruzando usuarios)
- [ ] Scraper de LinkedIn como worker aparte para completar data de postings
- [ ] Vistas calendario y Sankey (flow del pipeline)
- [ ] Duración real de entrevistas (hoy se estima por rondas)
