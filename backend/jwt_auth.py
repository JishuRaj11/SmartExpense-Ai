import os
from datetime import datetime, timedelta, timezone

from jose import jwt, JWTError


# The signing key can be supplied through the environment in production.
# The fallback keeps the original value so tokens issued before this change
# stay valid until they expire.
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "my-secret-key")

ALGORITHM = "HS256"

ACCESS_TOKEN_EXPIRE_MINUTES = int(
    os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30")
)


def create_access_token(user_id: int) -> str:
    """Create a signed JWT for the given user id.

    The payload keeps the original `user_id` key for backwards compatibility and
    also sets the standard `sub` claim.
    """
    if user_id is None:
        raise ValueError("user_id is required")

    expire = datetime.now(timezone.utc) + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )

    payload = {
        "user_id": user_id,
        "sub": str(user_id),
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }

    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_access_token(token: str):
    """Return the user id from a valid token, or None when it is not usable.

    None is returned for malformed, tampered and expired tokens so the caller can
    answer with a single 401 in every case.
    """
    if not token or not isinstance(token, str):
        return None

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        # Expired signature / bad token / wrong key.
        return None

    user_id = payload.get("user_id")

    if user_id is None:
        # Fall back to the standard claim for tokens issued elsewhere.
        user_id = payload.get("sub")

    if user_id is None:
        return None

    try:
        return int(user_id)
    except (TypeError, ValueError):
        return None