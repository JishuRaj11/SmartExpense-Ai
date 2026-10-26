# SmartExpenses AI

Expense tracking with JWT authentication, monthly budgets, analytics and two
machine-learning predictions (category guessing from an expense title, and
next month's spending forecast).

- `backend/` — FastAPI application (auth, expenses, budgets, analytics, ML)
- `backend/ml/` — the scikit-learn models and the datasets they are trained on
- `frontend/` — the static front-end (plain HTML, CSS and JavaScript)

---

## Running it locally

### 1. Backend

```bash
pip install -r requirements.txt
uvicorn backend.main:app --reload --port 8001
```

The API is then on <http://127.0.0.1:8001> and its interactive docs on
<http://127.0.0.1:8001/docs>.

### 2. Front-end

```bash
cd frontend
python serve.py
```

The front-end is then on <http://127.0.0.1:5500>. It talks to the backend at
`http://127.0.0.1:8001` automatically, because `frontend/config.js` leaves the
API URL on "automatic" and the page is served from localhost.

### 3. Tests

```bash
python -m pytest
```

---

## Deploying the front-end

The front-end is deployed with the API as the `frontend` service in the same
Vercel project; see [Vercel](#vercel) below. No separate static host or
`API_BASE_URL` repository variable is required.

`frontend/config.js` uses `/api`, which reaches the backend on the same origin.
During local development it falls back to `http://127.0.0.1:8001` on localhost.

The value is one of:

| `API_BASE_URL` | Behaviour |
| --- | --- |
| `""` | Automatic: `http://127.0.0.1:8001` on localhost, the page's own origin anywhere else |
| `"same-origin"` | Always use the page's own origin |
| `"/api"` | Vercel Services: same origin, with the backend behind the `/api` rewrite |
| `"https://api.example.com"` | A separately hosted backend |

Two temporary overrides exist for testing without editing any file:

```
https://<site>/login.html?api=https://api.example.com
```

and `localStorage.setItem("smartexpenses.apiBaseUrl", "https://api.example.com")`,
which persists across every page of the site.

---

## Deploying the backend

The API can run anywhere Python runs. On Render, Railway, Fly.io or a VPS:

```bash
uvicorn backend.main:app --host 0.0.0.0 --port $PORT
```

### Vercel

The root `vercel.json` deploys the API and the static front-end as two
[Vercel Services](https://vercel.com/docs/services) in one project:

- `backend` uses the repository root, the FastAPI preset, and the root
  `main.py` entrypoint. It is public at `/api/*`.
- `frontend` serves `frontend/` at every other path.

Requests to `/api/expenses` reach FastAPI as `/expenses`; the backend strips
the `/api` prefix before routing. The committed `frontend/config.js` uses
`/api`, so the front-end calls the backend on the same origin. No service
bindings are needed because the front-end is static and calls the API from the
browser.

Vercel's bundle is read-only, so the SQLite files default to `/tmp` there and
do not survive cold starts. For durable data, deploy the Docker image to a host
with a persistent disk (for example Render) or point `EXPENSES_DB_PATH` and
`SIGNUP_DB_PATH` at a persistent database volume.

Set these environment variables on the host:

| Variable | Required | Meaning |
| --- | --- | --- |
| `APP_ENV` | yes | `production` |
| `JWT_SECRET_KEY` | yes | Random secret, at least 32 characters |
| `CORS_ORIGINS` | yes | The front-end origin, e.g. `https://<project>.vercel.app` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | no | Token lifetime, default `30` |
| `EXPENSES_DB_PATH` | no | SQLite file for expenses and budgets |
| `SIGNUP_DB_PATH` | no | SQLite file for users |
| `PREDICTION_MIN_MONTHS` | no | Months of history needed for a forecast, default `5` |

Generate a secret with:

```bash
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

`CORS_ORIGINS` is the one that is easy to forget: without the front-end's
origin listed, the browser blocks every request and the app shows a network
error. With `APP_ENV=production` the backend refuses to start unless
`JWT_SECRET_KEY` is set to a strong value.

The SQLite files live on the host's disk, so they must be on a persistent
volume if the platform uses an ephemeral filesystem.

---

## Project layout

```
backend/
  main.py        FastAPI app: expenses, budgets, analytics, predictions
  auth.py        /register and /login
  jwt_auth.py    token creation and verification
  config.py      every setting, resolved from the environment
  database.py    SQLAlchemy engines and sessions
  models.py      Expense, Budget and User tables
  schemas.py     request and response models
  tests/         pytest suite
  ml/
    category_prediction.py   TF-IDF + logistic regression over expense titles
    spending_prediction.py   next month's forecast
    import_dataset.py        seed expenses.db with the practice dataset
    dataset/                  benchmark and processed CSV data
    models/                   trained model artefacts
frontend/
  index.html     entry point, routes to the dashboard or the login page
  landing.html   marketing page
  login.html     sign in
  signup.html    create an account
  dashboard.html summary of the current month
  expenses.html  the expense list
  add-expense.html / edit-expense.html
  analytics.html charts
  budget.html    monthly budget
  config.js      the backend URL — the only file to edit for a deployment
  js/api.js      every request to the backend goes through here
  serve.py       development static server
```

## Retraining / importing ML data

Run these from the project root:

```bash
python -m backend.ml.category_prediction
python -m backend.ml.spending_prediction --user 3
python -m backend.ml.spending_prediction --benchmark
python -m backend.ml.import_dataset --dry-run
```
