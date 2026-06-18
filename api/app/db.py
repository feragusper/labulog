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


def init_db() -> None:
    # MVP: create tables directly. Swap for Alembic migrations before prod.
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
