"""Registration, login and the protection of the private endpoints."""

from backend.database import SignupSessionLocal
from backend.models import SignupModel
from backend.password import is_bcrypt_hash


def test_register_creates_an_account(client):
    response = client.post(
        "/register",
        json={
            "name": "Jishu Raj",
            "gmail": "jishu@example.com",
            "password": "strongpassword",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["Message"] == "User registered successfully"
    assert body["User"]["name"] == "Jishu Raj"
    assert body["User"]["gmail"] == "jishu@example.com"
    assert body["User"]["id"] > 0
    # The password must never come back out of the API.
    assert "password" not in body["User"]


def test_register_stores_a_bcrypt_hash(client):
    client.post(
        "/register",
        json={
            "name": "Hash Check",
            "gmail": "hash@example.com",
            "password": "strongpassword",
        },
    )

    db = SignupSessionLocal()
    try:
        user = db.query(SignupModel).filter(
            SignupModel.gmail == "hash@example.com"
        ).first()
        assert user is not None
        assert user.password != "strongpassword"
        assert is_bcrypt_hash(user.password)
    finally:
        db.close()


def test_register_rejects_a_duplicate_gmail(client):
    payload = {
        "name": "First",
        "gmail": "dupe@example.com",
        "password": "strongpassword",
    }

    assert client.post("/register", json=payload).status_code == 200

    duplicate = client.post(
        "/register",
        json={**payload, "name": "Second"},
    )
    assert duplicate.status_code == 400
    assert "already exists" in duplicate.json()["detail"].lower()


def test_register_treats_the_gmail_case_insensitively(client):
    first = client.post(
        "/register",
        json={
            "name": "Case",
            "gmail": "Case.User@Example.com",
            "password": "strongpassword",
        },
    )
    assert first.status_code == 200
    assert first.json()["User"]["gmail"] == "case.user@example.com"

    second = client.post(
        "/register",
        json={
            "name": "Case",
            "gmail": "case.user@example.com",
            "password": "strongpassword",
        },
    )
    assert second.status_code == 400


def test_register_validates_the_payload(client):
    too_short = client.post(
        "/register",
        json={"name": "A", "gmail": "a@b.co", "password": "123456"},
    )
    assert too_short.status_code == 422


def test_login_returns_a_token(client):
    client.post(
        "/register",
        json={
            "name": "Login User",
            "gmail": "login@example.com",
            "password": "strongpassword",
        },
    )

    response = client.post(
        "/login",
        json={"gmail": "login@example.com", "password": "strongpassword"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["Message"] == "User login successful"
    assert body["access_token"]
    assert body["User"]["gmail"] == "login@example.com"


def test_login_with_the_wrong_password_fails(client):
    client.post(
        "/register",
        json={
            "name": "Login User",
            "gmail": "wrong@example.com",
            "password": "strongpassword",
        },
    )

    response = client.post(
        "/login",
        json={"gmail": "wrong@example.com", "password": "nottherightone"},
    )

    assert response.status_code == 401
    assert "incorrect" in response.json()["detail"].lower()


def test_login_with_an_unknown_account_fails(client):
    response = client.post(
        "/login",
        json={"gmail": "ghost@example.com", "password": "strongpassword"},
    )

    assert response.status_code == 404


def test_protected_routes_need_a_token(client):
    # FastAPI answers 401 when the Authorization header is missing entirely.
    assert client.get("/expenses").status_code == 401
    assert client.get("/dashboard").status_code == 401


def test_a_garbage_token_is_rejected(client):
    response = client.get(
        "/expenses",
        headers={"Authorization": "Bearer not.a.real.token"},
    )

    assert response.status_code == 401


def test_the_token_identifies_the_user(client, auth_headers):
    response = client.get("/expenses", headers=auth_headers)

    assert response.status_code == 200
    assert "Expenses" in response.json()
