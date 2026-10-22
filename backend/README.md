# SmartExpenses AI — Backend

The FastAPI service behind [SmartExpenses AI](../README.md): JWT accounts,
expenses, budgets, analytics and two machine-learning predictions.

---

## Quick start

```bash
# 1. install the dependencies
pip install -r backend/requirements.txt

# 2. (optional) create your own settings
copy backend\.env.example backend\.env        # Windows
cp backend/.env.example backend/.env          # macOS / Linux

# 3. run the API from the project root
uvicorn backend.main:app --reload --port 8001
```

The API is then on <http://127.0.0.1:8001> and the interactive documentation
on <http://127.0.0.1:8001/docs>.

> The server has to be started from the **project root**, because it imports
> the `ml/` package that sits next to `backend/`.

The front-end expects the API on port **8001**. Run it like this:

```bash
cd frontend
python serve.py           # http://127.0.0.1:5500
```

---

## Configuration

Every setting is read from the environment by `backend/config.py`. Copy
`backend/.env.example` to `backend/.env` for local work, or set the variables
in your hosting dashboard. Real environment variables always win over the
file.

| Variable | Default | What it does |
|---|---|---|
| `APP_ENV` | `development` | `production` makes the server refuse to start with an unsafe secret |
| `PORT` | `8001` | The port the API listens on |
| `JWT_SECRET_KEY` | dev key | Signs the access tokens. **Required in production**, 32+ characters |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | How long a token stays valid |
| `CORS_ORIGINS` | `*` | Comma separated list of origins allowed to call the API |
| `EXPENSES_DB_PATH` | `backend/expenses.db` | Where the expenses and budgets live |
| `SIGNUP_DB_PATH` | `backend/signup.db` | Where the accounts live |
| `PREDICTION_MIN_MONTHS` | `5` | Months of history needed before a forecast is offered |
| `CATEGORY_CONFIDENCE_THRESHOLD` | `0.3` | Below this, a predicted category becomes `Other` |

Generate a production secret with:

```bash
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

---

## The API

Interactive documentation: <http://127.0.0.1:8001/docs>

### Public

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness check |
| `GET` | `/` | Service banner |
| `POST` | `/register` | Create an account, returns the user |
| `POST` | `/login` | Sign in, returns `access_token` |
| `POST` | `/predict-category` | Guess the category from a title |

### Private — send `Authorization: Bearer <token>`

| Method | Path | Description |
|---|---|---|
| `GET` | `/dashboard` | Every figure for the dashboard |
| `GET` | `/expenses` | List, with `?category=` `?date=` `?month=` filters |
| `POST` | `/expenses` | Create an expense |
| `GET` | `/expenses/{id}` | Read one expense |
| `PUT` | `/expenses/{id}` | Update an expense |
| `DELETE` | `/expenses/{id}` | Delete an expense |
| `GET` | `/budget` | Read one month's budget |
| `GET` | `/budgets` | List every budget |
| `POST` | `/budget` | Save a month's budget |
| `PUT` | `/budget` | Save a month's budget |
| `PUT` | `/budget/{month}` | Update one month |
| `DELETE` | `/budget/{month}` | Remove one month |
| `GET` | `/analytics/category` | Total per category |
| `GET` | `/analytics/monthly` | Total per month |
| `GET` | `/analytics/daily` | Total per day of the month |
| `GET` | `/predict-spending` | Next month's spending for the logged-in user |

Every private endpoint is scoped to the user in the token. One account can
never read or change another account's rows, and no endpoint accepts a user
id from the request.

---

## Layout

```
backend/
├── __init__.py
├── config.py       all settings, read from the environment
├── database.py     engines, sessions, SQLite pragmas
├── models.py       the tables (expenses, budgets, users)
├── schemas.py      request validation (Pydantic)
├── auth.py         /register and /login
├── jwt_auth.py     issuing and verifying the access tokens
├── password.py     bcrypt hashing
├── main.py         the FastAPI app and every route
├── requirements.txt
├── .env.example
├── Dockerfile
└── tests/          the test suite
```

The two SQLite files are separate on purpose: the accounts survive when the
expense data is wiped, and each file can be backed up on its own.

---

## Tests

```bash
python -m pytest
```

The suite uses its own temporary databases, so your development data is never
touched. It covers the authentication flow, the isolation between accounts,
the CRUD endpoints, the budgets, the analytics and the configuration guard
rails.

---

## Deployment

### Docker

```bash
docker build -f backend/Dockerfile -t smartexpenses-api .
docker run -p 8001:8001 --env-file backend/.env smartexpenses-api
```

or with the included compose file:

```bash
docker compose up --build
```

The databases are written to `/app/data` inside the container. Mount a volume
there to keep them between deployments.

### Heroku / Railway / Render

The repository contains a `Procfile`:

```
web: uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8001}
```

Set these environment variables on the host:

```
APP_ENV=production
JWT_SECRET_KEY=<64 random characters>
CORS_ORIGINS=https://your-frontend.example.com
```

### Before you go live

- [ ] `APP_ENV=production`
- [ ] `JWT_SECRET_KEY` set to a unique random value (32+ characters)
- [ ] `CORS_ORIGINS` narrowed down to the real front-end origin
- [ ] The database files stored somewhere that survives a restart, and backed up
- [ ] HTTPS terminated in front of the API
- [ ] `ACCESS_TOKEN_EXPIRE_MINUTES` reviewed

---

## The machine-learning parts

### Category prediction

`POST /predict-category` runs a TF-IDF vectorizer and a logistic regression
over the expense title. The trained files live in `ml/models/` and are part of
the repository, so a deployment does not have to train first.

To retrain:

```bash
python ml/category_prediction.py
```

### Spending prediction

`GET /predict-spending` fits a linear regression over **this user's own**
monthly totals and answers with next month's estimate. It never reads another
account's rows and never trains on the sample dataset.

```bash
python ml/spending_prediction.py --user 3
python ml/spending_prediction.py --benchmark      # score the sample dataset
```

---

## Notes

- Passwords are hashed with bcrypt. A plain-text password is never stored.
- The token is the only source of identity for the private endpoints.
- `GET /predict-category` is public on purpose: it only runs the model over
  the text it was given and never touches user data.
