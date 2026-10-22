"""Budgets: create, read, update, list and delete."""


def test_creating_a_budget(client, auth_headers):
    response = client.post(
        "/budget",
        json={"amount": 15000, "month": "2026-03"},
        headers=auth_headers,
    )

    assert response.status_code == 200
    budget = response.json()["Budget"]
    assert budget["amount"] == 15000
    assert budget["month"] == "2026-03"


def test_reading_a_budget(client, auth_headers):
    client.post(
        "/budget",
        json={"amount": 15000, "month": "2026-03"},
        headers=auth_headers,
    )

    response = client.get("/budget?month=2026-03", headers=auth_headers)

    assert response.status_code == 200
    assert response.json()["Budget"]["amount"] == 15000


def test_reading_a_budget_that_does_not_exist(client, auth_headers):
    response = client.get("/budget?month=2030-01", headers=auth_headers)

    assert response.status_code == 404


def test_saving_the_same_month_twice_updates_it(client, auth_headers):
    client.post(
        "/budget",
        json={"amount": 15000, "month": "2026-03"},
        headers=auth_headers,
    )
    client.post(
        "/budget",
        json={"amount": 20000, "month": "2026-03"},
        headers=auth_headers,
    )

    listed = client.get("/budgets", headers=auth_headers).json()["Budgets"]
    matching = [item for item in listed if item["month"] == "2026-03"]

    assert len(matching) == 1
    assert matching[0]["amount"] == 20000


def test_updating_a_budget_by_month(client, auth_headers):
    client.post(
        "/budget",
        json={"amount": 15000, "month": "2026-03"},
        headers=auth_headers,
    )

    response = client.put(
        "/budget/2026-03",
        json={"amount": 18000},
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert response.json()["Budget"]["amount"] == 18000


def test_updating_a_budget_with_a_bad_month(client, auth_headers):
    response = client.put(
        "/budget/2026-13",
        json={"amount": 18000},
        headers=auth_headers,
    )

    assert response.status_code == 422


def test_creating_a_budget_with_a_bad_month(client, auth_headers):
    response = client.post(
        "/budget",
        json={"amount": 18000, "month": "March"},
        headers=auth_headers,
    )

    assert response.status_code == 422


def test_a_budget_amount_must_be_positive(client, auth_headers):
    response = client.post(
        "/budget",
        json={"amount": 0, "month": "2026-03"},
        headers=auth_headers,
    )

    assert response.status_code == 422


def test_deleting_a_budget(client, auth_headers):
    client.post(
        "/budget",
        json={"amount": 15000, "month": "2026-03"},
        headers=auth_headers,
    )

    response = client.delete("/budget/2026-03", headers=auth_headers)
    assert response.status_code == 200

    again = client.get("/budget?month=2026-03", headers=auth_headers)
    assert again.status_code == 404


def test_budgets_are_scoped_to_the_user(client, auth_headers, other_auth_headers):
    client.post(
        "/budget",
        json={"amount": 15000, "month": "2026-03"},
        headers=auth_headers,
    )

    response = client.get("/budget?month=2026-03", headers=other_auth_headers)

    assert response.status_code == 404
