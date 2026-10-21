import bcrypt


# Prefixes of every bcrypt hash variant bcrypt can produce.
# Used to tell a genuine hash apart from a legacy/plaintext value.
BCRYPT_PREFIXES = ("$2a$", "$2b$", "$2y$", "$2x$")


def hash_password(password: str) -> str:
    """Hash a plain-text password with bcrypt and return it as a string."""
    if password is None:
        raise ValueError("Password is required")

    # bcrypt silently truncates beyond 72 bytes, so reject instead of ignoring.
    encoded = password.encode("utf-8")
    if len(encoded) > 72:
        raise ValueError("Password must be 72 bytes or fewer")

    return bcrypt.hashpw(encoded, bcrypt.gensalt()).decode("utf-8")


def is_bcrypt_hash(value: str) -> bool:
    """True when the stored value looks like a bcrypt hash.

    The users table historically contained a few plaintext passwords, which made
    bcrypt.checkpw() raise ValueError("Invalid salt") and turned a failed login
    into an HTTP 500. This helper lets the caller reject those rows cleanly.
    """
    if not value or not isinstance(value, str):
        return False

    return value.startswith(BCRYPT_PREFIXES)


def verify_password(password: str, hashed_password: str) -> bool:
    """Check a plain-text password against a stored hash.

    Never raises: a malformed or legacy stored value returns False so the login
    endpoint can answer with a clean 401 instead of a 500.
    """
    if not password or not hashed_password:
        return False

    if not is_bcrypt_hash(hashed_password):
        return False

    try:
        return bcrypt.checkpw(
            password.encode("utf-8"),
            hashed_password.encode("utf-8"),
        )
    except (ValueError, TypeError):
        # Corrupt hash in the database: treat as a failed login, not a crash.
        return False