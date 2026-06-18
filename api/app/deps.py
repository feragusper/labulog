from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import Session, select

from .db import get_session
from .models import User
from .security import decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    session: Session = Depends(get_session),
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    subject = decode_token(token)
    if subject is None:
        raise credentials_error
    user = session.exec(select(User).where(User.email == subject)).first()
    if user is None:
        raise credentials_error
    return user
