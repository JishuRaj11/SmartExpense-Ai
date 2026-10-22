"""Shared test setup.

The tests must never touch the real development databases, so the database
paths are pointed at a temporary folder *before* `backend.config` is imported.
That is why the environment is prepared here, at the top of the file, and not
inside a fixture: the settings are read once, when the module is imported.
"""

import os
import pathlib
import shutil
import sys
import tempfile
from itertools import count

import pytest

# ---------------- PATHS ----------------

PROJECT_ROOT = pathlib.Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


# ---------------- ISOLATED ENVIRONMENT ----------------

TMP_DIR = pathlib.Path(tempfile.mkdtemp(prefix="smartexpenses-tests-"))

os.environ["APP_ENV"] = "test"
os.environ["EXPENSES_DB_PATH"] = str(TMP_DIR / "expenses.db")
os.environ["SIGNUP_DB_PATH"] = str(TMP_DIR / "signup.db")
os.environ["JWT_SECRET_KEY"] = "test-secret-key-not-used-anywhere-else"
os.environ["ACCESS_TOKEN_EXPIRE_MINUTES"] = "30"
os.environ["CORS_ORIGINS"] = "*"

from fastapi.testclient import TestClient  # noqa: E402

from backend.main import app  # noqa: E402


# ---------------- FIXTURES ----------------


def _unique_gmail(prefix):
    """A gmail address that is not used by any other test."""
    counter = next(_COUNTER)
    return f"{prefix}.{counter}@example.com"


_COUNTER = count(1)


@pytest.fixture(scope="session", autouse=True)
def _cleanup_temp_databases():
    """Remove the temporary databases when the test session ends."""
    yield
    shutil.rmtree(TMP_DIR, ignore_errors=True)


@pytest.fixture()
def client():
    """A test client with the application lifespan running."""
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def auth_headers(client):
    """Register a user and return the headers needed to call the API.

    The token is created directly instead of going through /login so the
    fixture stays fast and does not depend on the auth endpoints. Every test
    gets its own address, because the gmail column is unique.
    """
    from backend.database import SignupSessionLocal
    from backend.jwt_auth import create_access_token
    from backend.models import SignupModel
    from backend.password import hash_password

    db = SignupSessionLocal()
    try:
        user = SignupModel(
            name="Test User",
            gmail=_unique_gmail("test.user"),
            password=hash_password("supersecret123"),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        user_id = user.id
    finally:
        db.close()

    token = create_access_token(user_id)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def other_auth_headers(client):
    """Headers for a second user, used to prove the data is isolated."""
    from backend.database import SignupSessionLocal
    from backend.jwt_auth import create_access_token
    from backend.models import SignupModel
    from backend.password import hash_password

    db = SignupSessionLocal()
    try:
        user = SignupModel(
            name="Other User",
            gmail=_unique_gmail("other.user"),
            password=hash_password("supersecret123"),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        user_id = user.id
    finally:
        db.close()

    token = create_access_token(user_id)
    return {"Authorization": f"Bearer {token}"}


def register_and_login(client, name, gmail, password):
    """Register an account and return the login response body."""
    response = client.post(
        "/register",
        json={"name": name, "gmail": gmail, "password": password},
    )
    assert response.status_code == 200, response.text

    return client.post(
        "/login",
        json={"gmail": gmail, "password": password},
    )
