# SmartExpenses AI

Expense tracking with JWT authentication, monthly budgets, analytics and two
machine-learning predictions (category guessing from an expense title, and
next month's spending forecast).

- `backend/` — FastAPI application (auth, expenses, budgets, analytics, ML)
- `frontend/` — the static front-end (plain HTML, CSS and JavaScript)
- `ml/` — the scikit-learn models and the datasets they are trained on

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

## Deploying the front-end to GitHub Pages

The front-end is a static site, so it is published straight from the `frontend/`
folder by `.github/workflows/pages.yml`.

### 1. Turn on GitHub Pages

Repository → **Settings** → **Pages** → **Build and deployment** → **Source**:
**GitHub Actions**.

### 2. Tell the site where the backend lives

The published site has to know the URL of the deployed API. Two ways to set it:

**a. A repository variable (no commit needed)**

Repository → **Settings** → **Secrets and variables** → **Actions** →
**Variables** → create `API_BASE_URL` with the value of your deployed backend,
for example `https://smartexpenses-api.onrender.com`.

The workflow writes this value into `frontend/config.js` before publishing, so
you can change the backend later without touching the code.

**b. Editing `frontend/config.js`**

Set `API_BASE_URL` in that file to the same value and push. Use this when you
prefer the URL to live in version control.

The value is one of:

| `API_BASE_URL` | Behaviour |
| --- | --- |
| `""` | Automatic: `http://127.0.0.1:8001` on localhost, the page's own origin anywhere else |
| `"same-origin"` | Always use the page's own origin |
| `"https://api.example.com"` | A separately hosted backend |

Two temporary overrides exist for testing without editing any file:

```
https://<user>.github.io/<repo>/login.html?api=https://api.example.com
```

and `localStorage.setItem("smartexpenses.apiBaseUrl", "https://api.example.com")`,
which persists across every page of the site.

### 3. Push

```bash
git push origin main
```

The workflow publishes the site to
`https://<user>.github.io/<repo>/`. Every push that touches `frontend/` redeploys.

---

## Deploying the backend

The API can run anywhere Python runs. On Render, Railway, Fly.io or a VPS:

```bash
uvicorn backend.main:app --host 0.0.0.0 --port $PORT
```

Set these environment variables on the host:

| Variable | Required | Meaning |
| --- | --- | --- |
| `APP_ENV` | yes | `production` |
| `JWT_SECRET_KEY` | yes | Random secret, at least 32 characters |
| `CORS_ORIGINS` | yes | The front-end origin, e.g. `https://<user>.github.io` |
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
ml/
  category_prediction.py   TF-IDF + logistic regression over expense titles
  spending_prediction.py   next month's forecast
```
