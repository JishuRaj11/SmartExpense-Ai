"""The dashboard and the three analytics endpoints."""

from datetime import date


def test_the_dashboard_totals_the_expenses(client, auth_headers):
    client.post(
        "/expenses",
        json={
            "title": "Pizza",
            "amount": 500,
            "category": "Food",
            "date": "2026-03-09",
        },
        headers=auth_headers,
    )
    client.post(
        "/expenses",
        json={
            "title": "Cab",
            "amount": 300,
            "category": "Travel",
            "date": "2026-03-10",
        },
        headers=auth_headers,
    )

    response = client.get("/dashboard", headers=auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["total_expenses"] == 800
    assert body["top_category"] == "Food"
    assert body["top_category_amount"] == 500
    assert len(body["recent_transactions"]) == 2


def test_the_dashboard_is_empty_for_a_new_user(client, auth_headers):
    response = client.get("/dashboard", headers=auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["total_expenses"] == 0
    assert body["top_category"] == "—"
    assert body["recent_transactions"] == []


def test_the_dashboard_shows_the_budget(client, auth_headers):
    month = date.today().strftime("%Y-%m")
    client.post(
        "/budget",
        json={"amount": 1000, "month": month},
        headers=auth_headers,
    )
    client.post(
        "/expenses",
        json={
            "title": "Pizza",
            "amount": 250,
            "category": "Food",
            "date": date.today().isoformat(),
        },
        headers=auth_headers,
    )

    body = client.get("/dashboard", headers=auth_headers).json()

    assert body["budget"] == 1000
    assert body["this_month"] == 250
    assert body["remaining_budget"] == 750
    assert body["budget_used_percentage"] == 25


def test_analytics_by_category(client, auth_headers):
    client.post(
        "/expenses",
        json={"title": "Pizza", "amount": 500, "category": "Food", "date": "2026-03-09"},
        headers=auth_headers,
    )
    client.post(
        "/expenses",
        json={"title": "Pizza 2", "amount": 200, "category": "Food", "date": "2026-03-10"},
        headers=auth_headers,
    )
    client.post(
        "/expenses",
        json={"title": "Cab", "amount": 100, "category": "Travel", "date": "2026-03-11"},
        headers=auth_headers,
    )

    response = client.get("/analytics/category", headers=auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["Food"] == 700
    assert body["Travel"] == 100
    # Sorted by amount, biggest first.
    assert list(body.keys())[0] == "Food"


def test_analytics_by_month(client, auth_headers):
    client.post(
        "/expenses",
        json={"title": "A", "amount": 100, "category": "Food", "date": "2026-03-09"},
        headers=auth_headers,
    )
    client.post(
        "/expenses",
        json={"title": "B", "amount": 250, "category": "Food", "date": "2026-04-02"},
        headers=auth_headers,
    )

    response = client.get("/analytics/monthly", headers=auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["March"] == 100
    assert body["April"] == 250


def test_analytics_by_day(client, auth_headers):
    client.post(
        "/expenses",
        json={"title": "A", "amount": 100, "category": "Food", "date": "2026-03-09"},
        headers=auth_headers,
    )
    client.post(
        "/expenses",
        json={"title": "B", "amount": 250, "category": "Food", "date": "2026-03-20"},
        headers=auth_headers,
    )

    response = client.get("/analytics/daily?month=2026-03", headers=auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["09"] == 100
    assert body["20"] == 250


def test_the_analytics_only_show_the_users_own_data(
    client, auth_headers, other_auth_headers
):
    client.post(
        "/expenses",
        json={"title": "A", "amount": 100, "category": "Food", "date": "2026-03-09"},
        headers=auth_headers,
    )

    response = client.get("/analytics/category", headers=other_auth_headers)

    assert response.status_code == 200
    assert response.json() == {}
