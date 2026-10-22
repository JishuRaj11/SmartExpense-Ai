"""Creating, reading, updating and deleting expenses."""


def create_expense(client, headers, **overrides):
    payload = {
        "title": "Dominos Pizza",
        "amount": 450.5,
        "category": "Food",
        "date": "2026-03-09",
    }
    payload.update(overrides)

    return client.post("/expenses", json=payload, headers=headers)


def test_create_an_expense(client, auth_headers):
    response = create_expense(client, auth_headers)

    assert response.status_code == 200
    expense = response.json()["Expense"]
    assert expense["id"] > 0
    assert expense["title"] == "Dominos Pizza"
    assert expense["amount"] == 450.5
    assert expense["category"] == "Food"
    assert expense["date"] == "2026-03-09"


def test_the_category_is_normalised(client, auth_headers):
    response = create_expense(client, auth_headers, category="food")

    assert response.status_code == 200
    assert response.json()["Expense"]["category"] == "Food"


def test_an_unknown_category_becomes_other(client, auth_headers):
    response = create_expense(client, auth_headers, category="Crypto")

    assert response.status_code == 200
    assert response.json()["Expense"]["category"] == "Other"


def test_a_blank_title_is_rejected(client, auth_headers):
    response = create_expense(client, auth_headers, title="   ")

    assert response.status_code == 422


def test_a_negative_amount_is_rejected(client, auth_headers):
    response = create_expense(client, auth_headers, amount=-10)

    assert response.status_code == 422


def test_a_zero_amount_is_rejected(client, auth_headers):
    response = create_expense(client, auth_headers, amount=0)

    assert response.status_code == 422


def test_listing_expenses_is_scoped_to_the_user(client, auth_headers, other_auth_headers):
    create_expense(client, auth_headers, title="Mine")
    create_expense(client, other_auth_headers, title="Theirs")

    mine = client.get("/expenses", headers=auth_headers).json()["Expenses"]
    theirs = client.get("/expenses", headers=other_auth_headers).json()["Expenses"]

    assert [item["title"] for item in mine] == ["Mine"]
    assert [item["title"] for item in theirs] == ["Theirs"]


def test_reading_one_expense(client, auth_headers):
    created = create_expense(client, auth_headers).json()["Expense"]

    response = client.get(f"/expenses/{created['id']}", headers=auth_headers)

    assert response.status_code == 200
    assert response.json()["Expense"]["title"] == "Dominos Pizza"


def test_another_users_expense_is_not_found(client, auth_headers, other_auth_headers):
    created = create_expense(client, auth_headers).json()["Expense"]

    response = client.get(f"/expenses/{created['id']}", headers=other_auth_headers)

    assert response.status_code == 404


def test_an_unknown_expense_is_not_found(client, auth_headers):
    response = client.get("/expenses/999999", headers=auth_headers)

    assert response.status_code == 404


def test_updating_an_expense(client, auth_headers):
    created = create_expense(client, auth_headers).json()["Expense"]

    response = client.put(
        f"/expenses/{created['id']}",
        json={
            "title": "McDonalds burger",
            "amount": 220,
            "category": "food",
            "date": "2026-03-10",
        },
        headers=auth_headers,
    )

    assert response.status_code == 200
    expense = response.json()["Expense"]
    assert expense["title"] == "McDonalds burger"
    assert expense["amount"] == 220
    assert expense["category"] == "Food"
    assert expense["date"] == "2026-03-10"


def test_updating_another_users_expense_is_not_found(
    client, auth_headers, other_auth_headers
):
    created = create_expense(client, auth_headers).json()["Expense"]

    response = client.put(
        f"/expenses/{created['id']}",
        json={
            "title": "Hijacked",
            "amount": 1,
            "category": "Other",
            "date": "2026-03-10",
        },
        headers=other_auth_headers,
    )

    assert response.status_code == 404


def test_deleting_an_expense(client, auth_headers):
    created = create_expense(client, auth_headers).json()["Expense"]

    response = client.delete(f"/expenses/{created['id']}", headers=auth_headers)
    assert response.status_code == 200

    again = client.get(f"/expenses/{created['id']}", headers=auth_headers)
    assert again.status_code == 404


def test_deleting_another_users_expense_is_not_found(
    client, auth_headers, other_auth_headers
):
    created = create_expense(client, auth_headers).json()["Expense"]

    response = client.delete(
        f"/expenses/{created['id']}", headers=other_auth_headers
    )

    assert response.status_code == 404


def test_filtering_by_category(client, auth_headers):
    create_expense(client, auth_headers, title="Pizza", category="Food")
    create_expense(client, auth_headers, title="Train ticket", category="Travel")

    response = client.get("/expenses?category=Food", headers=auth_headers)

    assert response.status_code == 200
    titles = [item["title"] for item in response.json()["Expenses"]]
    assert titles == ["Pizza"]


def test_filtering_by_date(client, auth_headers):
    create_expense(client, auth_headers, title="One", date="2026-03-09")
    create_expense(client, auth_headers, title="Two", date="2026-03-11")

    response = client.get("/expenses?date=2026-03-11", headers=auth_headers)

    titles = [item["title"] for item in response.json()["Expenses"]]
    assert titles == ["Two"]


def test_filtering_by_month(client, auth_headers):
    create_expense(client, auth_headers, title="March", date="2026-03-09")
    create_expense(client, auth_headers, title="April", date="2026-04-02")

    response = client.get("/expenses?month=2026-03", headers=auth_headers)

    titles = [item["title"] for item in response.json()["Expenses"]]
    assert titles == ["March"]


def test_expenses_are_sorted_newest_first(client, auth_headers):
    create_expense(client, auth_headers, title="Older", date="2026-03-01")
    create_expense(client, auth_headers, title="Newer", date="2026-03-20")

    response = client.get("/expenses", headers=auth_headers)

    titles = [item["title"] for item in response.json()["Expenses"]]
    assert titles == ["Newer", "Older"]
