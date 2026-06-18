from datetime import datetime, timedelta
from typing import Optional

import bcrypt
import jwt

from .config import settings

ALGORITHM = "HS256"


def _to_bytes(password: str) -> bytes:
    # bcrypt hard-limits input to 72 bytes; truncate defensively.
    return password.encode("utf-8")[:72]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_to_bytes(password), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(_to_bytes(plain), hashed.encode("utf-8"))


def create_access_token(subject: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": subject, "exp": expire}
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        return payload.get("sub")
    except jwt.PyJWTError:
        return None
