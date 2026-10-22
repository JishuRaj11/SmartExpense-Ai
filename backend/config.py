"""Central configuration for the SmartExpenses backend.

Every setting the backend needs is resolved here, once, from the environment.
Nothing else in the code base reads `os.environ` directly, so there is a single
place to look when you want to know what a deployment is configured with.

    APP_ENV                 development | production   (default: development)
    JWT_SECRET_KEY          signing key for the access tokens
    ACCESS_TOKEN_EXPIRE_MINUTES   token lifetime in minutes (default: 30)
    CORS_ORIGINS            comma separated list of allowed origins
    EXPENSES_DB_PATH        path to the expenses/budgets SQLite file
    SIGNUP_DB_PATH          path to the users SQLite file
    PREDICTION_MIN_MONTHS   months of history required for a forecast

Copy backend/.env.example to backend/.env for local development, or set the
variables in your host's dashboard (Render, Railway, Fly, Docker...).
"""

import os
from pathlib import Path

# ---------------- PATHS ----------------
# Resolved from this file's location, so the backend behaves the same no
# matter which directory the server was started from.

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent
ML_DIR = PROJECT_ROOT / "ml"


# ---------------- ENV FILE LOADER ----------------


def load_env_file(path: Path = None) -> None:
    """Load KEY=value pairs from a .env file into os.environ.

    A deliberately small loader so the backend needs no extra dependency
    (no python-dotenv). Existing environment variables always win, because a
    real deployment sets them through the host, not through a file.

    Missing file -> nothing happens, so this is safe to call unconditionally.
    """
    target = path or (BACKEND_DIR / ".env")
    if not target.exists():
        return

    for line in target.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue

        key, _, value = stripped.partition("=")
        key = key.strip()
        value = value.strip().strip("'").strip('"')

        if key and key not in os.environ:
            os.environ[key] = value


# The .env file is read first, so everything below can rely on the values it
# contains. Variables already present in the real environment are never
# overwritten.
load_env_file()


# ---------------- ENVIRONMENT ----------------

APP_ENV = os.getenv("APP_ENV", "development").strip().lower()
IS_PRODUCTION = APP_ENV in {"production", "prod"}


def _env_path(name: str, default: Path) -> Path:
    """Read a filesystem path from the environment, or fall back to `default`.

    A relative path in the environment is resolved against the project root so
    it does not depend on the working directory of the process.
    """
    raw = os.getenv(name, "").strip()
    if not raw:
        return default

    path = Path(raw).expanduser()
    if not path.is_absolute():
        path = PROJECT_ROOT / path

    return path.resolve()


# ---------------- DATABASES ----------------

EXPENSES_DB_PATH = _env_path("EXPENSES_DB_PATH", BACKEND_DIR / "expenses.db")
SIGNUP_DB_PATH = _env_path("SIGNUP_DB_PATH", BACKEND_DIR / "signup.db")


def sqlite_url(path: Path) -> str:
    """Build a SQLAlchemy SQLite URL for an absolute path.

    Forward slashes are used because they are the only separator SQLAlchemy
    understands consistently across platforms (Windows accepts them too).
    """
    return f"sqlite:///{path.as_posix()}"


EXPENSES_DATABASE_URL = sqlite_url(EXPENSES_DB_PATH)
SIGNUP_DATABASE_URL = sqlite_url(SIGNUP_DB_PATH)

# ---------------- AUTH ----------------

# Only ever used outside production. In production the variable is mandatory
# and the server refuses to start without it (see `validate_runtime_settings`).
DEV_JWT_SECRET = "dev-only-insecure-secret-do-not-use-in-production"


def _jwt_secret() -> str:
    raw = os.getenv("JWT_SECRET_KEY", "").strip()
    if raw:
        return raw
    return DEV_JWT_SECRET


JWT_SECRET_KEY = _jwt_secret()
JWT_ALGORITHM = "HS256"

ACCESS_TOKEN_EXPIRE_MINUTES = int(
    os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30")
)

# ---------------- CORS ----------------
# The front-end is a static site served from a different origin than the API,
# so the browser needs to be told which origins may call it.

DEFAULT_DEV_ORIGINS = "*"


def _cors_origins() -> list:
    raw = os.getenv("CORS_ORIGINS", "").strip()
    if not raw:
        return [DEFAULT_DEV_ORIGINS]

    origins = [item.strip() for item in raw.split(",") if item.strip()]
    return origins or [DEFAULT_DEV_ORIGINS]


CORS_ORIGINS = _cors_origins()

# ---------------- ML ----------------

# Months of history a user needs before a spending forecast is offered.
PREDICTION_MIN_MONTHS = int(os.getenv("PREDICTION_MIN_MONTHS", "5"))

# ---------------- SERVER ----------------

API_HOST = os.getenv("HOST", "0.0.0.0")
API_PORT = int(os.getenv("PORT", "8001"))

# ---------------- VALIDATION ----------------


class ConfigurationError(RuntimeError):
    """Raised when the environment is not safe enough to serve traffic."""


def validate_runtime_settings() -> list:
    """Check the settings that must be right before serving real traffic.

    Returns the list of warnings (non-fatal). Raises `ConfigurationError` for
    anything that must not be ignored.
    """
    warnings: list = []

    if IS_PRODUCTION:
        if JWT_SECRET_KEY == DEV_JWT_SECRET:
            raise ConfigurationError(
                "JWT_SECRET_KEY must be set to a unique random value when "
                "APP_ENV=production. Generate one with:\n"
                '    python -c "import secrets; print(secrets.token_urlsafe(64))"'
            )

        if len(JWT_SECRET_KEY) < 32:
            raise ConfigurationError(
                "JWT_SECRET_KEY must be at least 32 characters long when "
                "APP_ENV=production."
            )

        if "*" in CORS_ORIGINS:
            warnings.append(
                "CORS_ORIGINS is '*'. Set it to the real front-end origin "
                "(for example http://localhost:5500) before going live."
            )
    elif JWT_SECRET_KEY == DEV_JWT_SECRET:
        warnings.append(
            "Using the built-in development JWT secret. Set JWT_SECRET_KEY "
            "before running anywhere other than your own machine."
        )

    return warnings
