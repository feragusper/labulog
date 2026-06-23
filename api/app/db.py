from sqlalchemy import inspect, text
from sqlmodel import Session, SQLModel, create_engine

from .config import settings


def _normalize(url: str) -> str:
    # Render/Heroku hand out 'postgresql://' (or legacy 'postgres://'); pin the
    # psycopg3 driver so SQLAlchemy doesn't reach for the uninstalled psycopg2.
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


db_url = _normalize(settings.database_url)

# sqlite needs check_same_thread off for FastAPI's threadpool.
connect_args = {"check_same_thread": False} if db_url.startswith("sqlite") else {}

engine = create_engine(db_url, echo=False, connect_args=connect_args)


# Additive columns introduced after the first deploy. create_all() only creates
# missing tables, not missing columns, so we add them idempotently here. (Both
# Postgres and SQLite support plain ALTER TABLE ADD COLUMN.) Swap for Alembic
# once migrations get non-trivial.
_ENSURE_COLUMNS = {
    "application": [
        ("priority", "VARCHAR"),
        ("follow_up_date", "TIMESTAMP"),
    ],
    "jobposting": [
        ("country", "VARCHAR"),
    ],
}


def init_db() -> None:
    SQLModel.metadata.create_all(engine)
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    for table, cols in _ENSURE_COLUMNS.items():
        if table not in tables:
            continue
        existing = {c["name"] for c in inspector.get_columns(table)}
        with engine.begin() as conn:
            for name, sqltype in cols:
                if name not in existing:
                    conn.execute(text(f'ALTER TABLE "{table}" ADD COLUMN {name} {sqltype}'))
    _ensure_enum_values()
    _ensure_nullable()


def _ensure_enum_values() -> None:
    # Postgres stores AppStatus as a native enum type; create_all never adds new
    # members. Add any missing ones so newly-introduced statuses are storable.
    if engine.dialect.name != "postgresql":
        return
    from .models import AppStatus

    with engine.connect() as conn:
        conn = conn.execution_options(isolation_level="AUTOCOMMIT")
        exists = conn.execute(
            text("SELECT 1 FROM pg_type WHERE typname = 'appstatus'")
        ).first()
        if not exists:
            return
        for member in AppStatus:
            conn.execute(text(f"ALTER TYPE appstatus ADD VALUE IF NOT EXISTS '{member.value}'"))


# Columns that became nullable after first deploy (Postgres only; dev sqlite is
# recreated from the models). Idempotent: DROP NOT NULL is a no-op if already null.
_ENSURE_NULLABLE = {"jobposting": ["url"]}


def _ensure_nullable() -> None:
    if engine.dialect.name != "postgresql":
        return
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    with engine.begin() as conn:
        for table, cols in _ENSURE_NULLABLE.items():
            if table not in tables:
                continue
            current = {c["name"]: c for c in inspector.get_columns(table)}
            for name in cols:
                col = current.get(name)
                if col is not None and not col.get("nullable", True):
                    conn.execute(text(f'ALTER TABLE "{table}" ALTER COLUMN {name} DROP NOT NULL'))


def get_session():
    with Session(engine) as session:
        yield session
