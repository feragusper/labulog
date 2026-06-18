import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlmodel import Session, select

from ..config import settings
from ..db import get_session
from ..deps import get_current_user
from ..models import User
from ..schemas import Token, UserCreate, UserRead
from ..security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


class GoogleCredential(BaseModel):
    credential: str  # the ID token (JWT) from Google Identity Services


class AuthConfig(BaseModel):
    google_client_id: str


@router.get("/config", response_model=AuthConfig)
def auth_config():
    """Lets the SPA know whether Google login is enabled and with which client id."""
    return AuthConfig(google_client_id=settings.google_client_id)


@router.post("/register", response_model=UserRead, status_code=201)
def register(data: UserCreate, session: Session = Depends(get_session)):
    existing = session.exec(select(User).where(User.email == data.email)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(email=data.email, hashed_password=hash_password(data.password))
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@router.post("/login", response_model=Token)
def login(
    form: OAuth2PasswordRequestForm = Depends(),
    session: Session = Depends(get_session),
):
    # OAuth2 form uses 'username' — we treat it as email.
    user = session.exec(select(User).where(User.email == form.username)).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    return Token(access_token=create_access_token(user.email))


@router.post("/google", response_model=Token)
def google_login(data: GoogleCredential, session: Session = Depends(get_session)):
    if not settings.google_client_id:
        raise HTTPException(status_code=400, detail="Google login not configured")

    # Imported lazily so the app boots even if google-auth isn't installed yet.
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token

    try:
        info = id_token.verify_oauth2_token(
            data.credential, google_requests.Request(), settings.google_client_id
        )
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    email = info.get("email")
    if not email or not info.get("email_verified"):
        raise HTTPException(status_code=401, detail="Google email not verified")

    # Match by verified email (Google proves ownership) — merges with any
    # password account on the same address. No extra schema needed.
    user = session.exec(select(User).where(User.email == email)).first()
    if not user:
        # Google users never sign in with a password; store an unusable hash.
        user = User(email=email, hashed_password=hash_password(secrets.token_hex(32)))
        session.add(user)
        session.commit()
        session.refresh(user)

    return Token(access_token=create_access_token(user.email))


@router.get("/me", response_model=UserRead)
def me(current: User = Depends(get_current_user)):
    return current
