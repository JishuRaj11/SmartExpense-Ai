"""Configuration, JWT handling and the shared helpers."""

import pytest
from jose import jwt

from backend import config
from backend.jwt_auth import create_access_token, verify_access_token
from backend.main import normalize_category


# ---------------- CONFIGURATION ----------------


def test_production_refuses_to_start_with_the_dev_secret(monkeypatch):
    monkeypatch.setattr(config, "IS_PRODUCTION", True)
    monkeypatch.setattr(config, "JWT_SECRET_KEY", config.DEV_JWT_SECRET)

    with pytest.raises(config.ConfigurationError):
        config.validate_runtime_settings()


def test_production_refuses_a_short_secret(monkeypatch):
    monkeypatch.setattr(config, "IS_PRODUCTION", True)
    monkeypatch.setattr(config, "JWT_SECRET_KEY", "tooshort")

    with pytest.raises(config.ConfigurationError):
        config.validate_runtime_settings()


def test_production_accepts_a_strong_secret(monkeypatch):
    monkeypatch.setattr(config, "IS_PRODUCTION", True)
    monkeypatch.setattr(
        config, "JWT_SECRET_KEY", "a-very-long-and-random-secret-value"
    )
    monkeypatch.setattr(config, "CORS_ORIGINS", ["http://localhost:5500"])

    assert config.validate_runtime_settings() == []


def test_production_warns_about_a_wide_open_cors(monkeypatch):
    monkeypatch.setattr(config, "IS_PRODUCTION", True)
    monkeypatch.setattr(
        config, "JWT_SECRET_KEY", "a-very-long-and-random-secret-value"
    )
    monkeypatch.setattr(config, "CORS_ORIGINS", ["*"])

    warnings = config.validate_runtime_settings()

    assert len(warnings) == 1
    assert "CORS_ORIGINS" in warnings[0]


def test_the_sqlite_url_uses_forward_slashes():
    url = config.sqlite_url(config.EXPENSES_DB_PATH)

    assert url.startswith("sqlite:///")


# ---------------- JWT ----------------


def test_a_token_round_trips():
    token = create_access_token(42)

    assert verify_access_token(token) == 42


def test_a_token_signed_with_another_key_is_rejected():
    token = jwt.encode(
        {"user_id": 1, "sub": "1"},
        "some-other-key",
        algorithm="HS256",
    )

    assert verify_access_token(token) is None


def test_a_tampered_token_is_rejected():
    token = create_access_token(7)

    assert verify_access_token(token[:-3] + "aaa") is None


def test_an_empty_token_is_rejected():
    assert verify_access_token("") is None
    assert verify_access_token(None) is None


def test_a_token_without_a_user_is_rejected():
    token = jwt.encode({"sub": ""}, config.JWT_SECRET_KEY, algorithm="HS256")

    assert verify_access_token(token) is None


# ---------------- CATEGORY HELPER ----------------


@pytest.mark.parametrize(
    "value,expected",
    [
        ("Food", "Food"),
        ("food", "Food"),
        ("  TRAVEL  ", "Travel"),
        ("unknown", "Other"),
        ("", "Other"),
        (None, "Other"),
    ],
)
def test_normalize_category(value, expected):
    assert normalize_category(value) == expected
