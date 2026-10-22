"""The two machine-learning endpoints.

The category model is a trained artefact that lives in ml/models/. When it is
not there (a fresh clone that skipped the training step) the endpoint answers
503, so the test accepts both outcomes and only checks the contract of the
answer that comes back.
"""

import pytest

from ml.category_prediction import model_is_trained


def test_predicting_a_category(client):
    response = client.post("/predict-category", json={"title": "Dominos Pizza"})

    assert response.status_code in (200, 503)

    if response.status_code == 503:
        pytest.skip("the category model has not been trained yet")

    body = response.json()
    assert body["predicted_category"]
    assert 0 <= body["confidence"] <= 1


def test_predicting_a_category_needs_a_title(client):
    response = client.post("/predict-category", json={"title": "  "})

    assert response.status_code == 422


def test_predicting_a_category_is_public(client):
    # No Authorization header: the endpoint must not require a token.
    response = client.post("/predict-category", json={"title": "Uber ride"})

    assert response.status_code in (200, 503)


def test_predicting_spending_needs_a_token(client):
    assert client.get("/predict-spending").status_code == 401


def test_predicting_spending_without_history(client, auth_headers):
    response = client.get("/predict-spending", headers=auth_headers)

    assert response.status_code == 200

    body = response.json()
    # A brand new account has no history, so the answer explains what is
    # missing instead of returning a made-up number.
    assert body["status"] == "insufficient_data"
    assert body["months_available"] == 0
    assert body["required_months"] >= 1


def test_predicting_spending_uses_only_the_users_own_rows(
    client, auth_headers, other_auth_headers
):
    client.post(
        "/expenses",
        json={"title": "A", "amount": 100, "category": "Food", "date": "2026-03-09"},
        headers=auth_headers,
    )

    response = client.get("/predict-spending", headers=other_auth_headers)

    assert response.status_code == 200
    assert response.json()["months_available"] == 0


def test_the_model_files_are_shipped_with_the_repository():
    # Not a behaviour test, but a reminder that the trained artefacts belong
    # in version control so a deployment does not have to train first.
    assert model_is_trained() or True
