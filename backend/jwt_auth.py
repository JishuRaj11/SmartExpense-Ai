"""JWT issuing and verification.

The signing key, the algorithm and the token lifetime all come from
`backend/config.py`, which reads them from the environment. In production the
key is mandatory; the server refuses to start without it.
"""

from datetime import datetime, timedelta, timezone

from jose import jwt, JWTError

from . import config


def create_access_token(user_id: int) -> str:
    """Create a signed JWT for the given user id.

    The payload keeps the original `user_id` key for backwards compatibility and
    also sets the standard `sub` claim.
    """
    if user_id is None:
        raise ValueError("user_id is required")

    expire = datetime.now(timezone.utc) + timedelta(
        minutes=config.ACCESS_TOKEN_EXPIRE_MINUTES
    )

    payload = {
        "user_id": user_id,
        "sub": str(user_id),
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }

    return jwt.encode(
        payload,
        config.JWT_SECRET_KEY,
        algorithm=config.JWT_ALGORITHM,
    )


def verify_access_token(token: str):
    """Return the user id from a valid token, or None when it is not usable.

    None is returned for malformed, tampered and expired tokens so the caller can
    answer with a single 401 in every case.
    """
    if not token or not isinstance(token, str):
        return None

    try:
        payload = jwt.decode(
            token,
            config.JWT_SECRET_KEY,
            algorithms=[config.JWT_ALGORITHM],
        )
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
