"""SmartExpenses AI — FastAPI application.

This module owns the HTTP API: authentication, expenses, budgets, analytics
and the two machine-learning predictions.

Run it from the project root:

    uvicorn backend.main:app --reload --port 8001

The interactive documentation is then at http://127.0.0.1:8001/docs.
"""

import os
from contextlib import asynccontextmanager
from datetime import date, datetime
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func
from sqlalchemy.orm import Session

from . import config
from .auth import router as auth_router
from .database import ExpensesSessionLocal, get_db, init_db
from .jwt_auth import verify_access_token
from .models import BudgetModel, ExpenseModel
from .schemas import (
    BudgetAmount,
    BudgetCreate,
    CategoryPredictRequest,
    ExpenseCreate,
    ExpenseUpdate,
)


# ---------------- ML MODULES ----------------
# The ML code is part of the backend package (backend/ml). The spending
# predictor reads PREDICTION_MIN_MONTHS when it is imported, so the value is
# published first.

os.environ.setdefault(
    "PREDICTION_MIN_MONTHS", str(config.PREDICTION_MIN_MONTHS)
)

from .ml.category_prediction import (  # noqa: E402
    ModelNotTrainedError,
    predict_category,
)
from .ml.spending_prediction import predict_next_month_spending  # noqa: E402


# ---------------- CATEGORIES ----------------

CATEGORIES = [
    "Food",
    "Travel",
    "Shopping",
    "Bills",
    "Entertainment",
    "Education",
    "Health",
    "Other",
]

MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]


# ---------------- HELPERS ----------------


def normalize_category(value) -> str:
    """Map a category to one of CATEGORIES, matching case-insensitively.

    Existing rows were written with values such as "food", so a case-sensitive
    comparison against "Food" silently returned nothing. Unknown values fall back
    to "Other" instead of creating a new category behind the front-end's back.
    """
    text = str(value or "").strip()

    for name in CATEGORIES:
        if name.lower() == text.lower():
            return name

    return "Other"


def normalize_existing_categories(db: Session) -> int:
    """Repair the casing of already-stored categories.

    Idempotent, and only touches values that match a known category once the
    first letter is capitalised, so no user data is lost.
    """
    changed = 0

    rows = db.query(ExpenseModel).all()
    for row in rows:
        for name in CATEGORIES:
            if row.category and row.category.lower() == name.lower():
                if row.category != name:
                    row.category = name
                    changed += 1
                break

    if changed:
        db.commit()

    return changed


def serialize_expense(expense: ExpenseModel) -> dict:
    return {
        "id": expense.id,
        "title": expense.title,
        "amount": expense.amount,
        "category": expense.category,
        "date": expense.date,
    }


def current_month_key() -> str:
    return date.today().strftime("%Y-%m")


def today_iso() -> str:
    return date.today().isoformat()


def get_budget_row(db: Session, user_id: int, month: str):
    """Newest budget row for this user and month, or None."""
    return (
        db.query(BudgetModel)
        .filter(
            BudgetModel.user_id == user_id,
            BudgetModel.month == month,
        )
        .order_by(BudgetModel.id.desc())
        .first()
    )


def upsert_budget(db: Session, user_id: int, month: str, amount: float):
    """Create or update the single budget row for a user/month pair.

    The endpoint used to always insert a row, so repeated saves piled up
    duplicate budgets for the same month. This updates the existing row instead.
    """
    existing = get_budget_row(db, user_id, month)

    if existing is None:
        existing = BudgetModel(user_id=user_id, month=month, amount=amount)
        db.add(existing)
    else:
        existing.amount = amount

    db.commit()
    db.refresh(existing)

    return existing


def month_label(month: str) -> str:
    """'2026-03' -> 'March'."""
    try:
        return MONTH_NAMES[int(month.split("-")[1]) - 1]
    except (IndexError, ValueError):
        return "Unknown"


def user_expenses(
    db: Session,
    user_id: int,
    category: Optional[str] = None,
    expense_date: Optional[str] = None,
    month: Optional[str] = None,
) -> list:
    """Expenses belonging to one user, with optional filters.

    Every query is scoped by user_id, which is what stops one account from
    reading or modifying another account's rows.
    """
    query = db.query(ExpenseModel).filter(
        ExpenseModel.user_id == user_id
    )

    if category:
        # Case-insensitive so legacy rows stored as "food" still match "Food".
        query = query.filter(
            func.lower(ExpenseModel.category) == category.strip().lower()
        )

    if expense_date:
        query = query.filter(ExpenseModel.date == expense_date)

    if month:
        query = query.filter(ExpenseModel.date.like(f"{month}-%"))

    # Newest first; the id breaks ties so the order is stable.
    return query.order_by(
        ExpenseModel.date.desc(),
        ExpenseModel.id.desc()
    ).all()


def sum_amounts(expenses: list) -> float:
    return round(sum(float(item.amount or 0) for item in expenses), 2)


def repair_legacy_categories() -> None:
    """Repair the casing of already-stored categories.

    Idempotent, and only touches values that match a known category once the
    first letter is capitalised, so no user data is lost.
    """
    db = ExpensesSessionLocal()
    try:
        changed = normalize_existing_categories(db)
        if changed:
            print(f"[startup] normalised {changed} expense categorie(s)")
    finally:
        db.close()


# ---------------- APP SETUP ----------------


@asynccontextmanager
async def lifespan(application: FastAPI):
    """Prepare the database and validate the configuration on startup."""
    warnings = config.validate_runtime_settings()
    for warning in warnings:
        print(f"[startup] warning: {warning}")

    init_db()
    repair_legacy_categories()

    print(f"[startup] SmartExpenses API ready (env={config.APP_ENV})")
    yield


app = FastAPI(
    title="SmartExpenses API",
    description=(
        "Expense tracking with JWT authentication, budgets, analytics and "
        "machine-learning category / spending predictions."
    ),
    version="1.0.0",
    lifespan=lifespan,
)


# The front-end is served from a different origin (a static file server), so
# without this the browser blocks every request before it reaches FastAPI.
# Set CORS_ORIGINS="http://localhost:5500" to narrow it down.
raw_origins = os.getenv(
    "CORS_ORIGINS",
    "https://smartexpense-ai-frontend.vercel.app",
)
origins = [o.strip().rstrip("/") for o in raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    # also allows Vercel preview URLs for the frontend project
    allow_origin_regex=r"https://smartexpense-ai-frontend.*\.vercel\.app",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# /register and /login lived in a separate FastAPI instance that was never
# mounted, so they were unreachable on this port. They are served here now.
app.include_router(auth_router)


security = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Resolve the logged-in user from the bearer token.

    The token is the only source of identity: no endpoint accepts a user id
    from the query string or the body.
    """
    token = credentials.credentials

    user_id = verify_access_token(token)

    if user_id is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token",
        )

    return user_id


# ---------------- ROUTES ----------------


@app.get("/health")
def health():
    """Unauthenticated liveness check."""
    return {"status": "ok", "service": "SmartExpenses API"}


@app.get("/")
def home():
    return {
        "Message": "SmartExpense backend is running",
        "Docs": "/docs",
        "Health": "/health",
    }


# ---------------- DASHBOARD ----------------


@app.get("/dashboard")
def get_dashboard(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    """All figures for the dashboard, computed from this user's data only."""
    expenses = user_expenses(db, user_id)

    total_expenses = sum_amounts(expenses)

    month = current_month_key()
    this_month = sum_amounts([
        item for item in expenses
        if item.date.startswith(month + "-")
    ])

    today = today_iso()
    today_total = sum_amounts([
        item for item in expenses
        if item.date == today
    ])

    budget_row = get_budget_row(db, user_id, month)
    budget = float(budget_row.amount) if budget_row else 0.0

    remaining_budget = round(budget - this_month, 2)
    budget_used_percentage = (
        round((this_month / budget) * 100) if budget > 0 else 0
    )

    # Category totals, used for the top-category card.
    category_totals = {}
    for item in expenses:
        key = item.category or "Other"
        category_totals[key] = round(
            category_totals.get(key, 0.0) + float(item.amount or 0), 2
        )

    top_category = "—"
    top_category_amount = 0.0
    if category_totals:
        top_category = max(category_totals, key=category_totals.get)
        top_category_amount = category_totals[top_category]

    # Month-by-month totals for the summary list.
    monthly_totals = {}
    for item in expenses:
        key = (item.date or "")[:7]
        if len(key) != 7 or key[4] != "-":
            continue
        monthly_totals[key] = round(
            monthly_totals.get(key, 0.0) + float(item.amount or 0), 2
        )

    monthly_summary = [
        {
            "month": key,
            "label": month_label(key),
            "year": int(key[:4]),
            "total": monthly_totals[key],
        }
        for key in sorted(monthly_totals)
    ]

    recent = expenses[:6]

    return {
        "total_expenses": total_expenses,
        "this_month": this_month,
        "today": today_total,
        "budget": budget,
        "remaining_budget": remaining_budget,
        "budget_used_percentage": budget_used_percentage,
        "top_category": top_category,
        "top_category_amount": top_category_amount,
        "recent_transactions": [serialize_expense(item) for item in recent],
        "monthly_summary": monthly_summary,
    }


# ---------------- EXPENSES ----------------


@app.post("/expenses")
def create_expense(
    expense: ExpenseCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    new_expense = ExpenseModel(
        title=expense.title,
        amount=float(expense.amount),
        category=normalize_category(expense.category),
        date=str(expense.date),
        user_id=user_id
    )

    db.add(new_expense)
    db.commit()
    db.refresh(new_expense)

    return {
        "Message": "Expense created successfully",
        "Expense": serialize_expense(new_expense),
    }


@app.get("/expenses")
def get_expenses(
    category: str = Query(None),
    date: str = Query(None),
    month: str = Query(None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    expenses = user_expenses(
        db,
        user_id,
        category=category,
        expense_date=date,
        month=month
    )

    return {
        "Message": "Expenses fetched successfully",
        "Expenses": [serialize_expense(item) for item in expenses],
    }


@app.get("/expenses/{expense_id}")
def get_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    # Scoped by user_id: a missing row and someone else's row both 404, so the
    # endpoint cannot be used to discover which ids exist.
    expense = (
        db.query(ExpenseModel)
        .filter(
            ExpenseModel.id == expense_id,
            ExpenseModel.user_id == user_id
        )
        .first()
    )

    if expense is None:
        raise HTTPException(status_code=404, detail="Expense not found")

    return {
        "Message": "Expense fetched successfully",
        "Expense": serialize_expense(expense),
    }


@app.put("/expenses/{expense_id}")
def update_expense(
    expense_id: int,
    expense_data: ExpenseUpdate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    expense = (
        db.query(ExpenseModel)
        .filter(
            ExpenseModel.id == expense_id,
            ExpenseModel.user_id == user_id
        )
        .first()
    )

    if expense is None:
        raise HTTPException(status_code=404, detail="Expense not found")

    expense.title = expense_data.title
    expense.amount = float(expense_data.amount)
    expense.category = normalize_category(expense_data.category)
    expense.date = str(expense_data.date)

    db.commit()
    db.refresh(expense)

    return {
        "Message": "Expense updated successfully",
        "Expense": serialize_expense(expense),
    }


@app.delete("/expenses/{expense_id}")
def delete_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    expense = (
        db.query(ExpenseModel)
        .filter(
            ExpenseModel.id == expense_id,
            ExpenseModel.user_id == user_id
        )
        .first()
    )

    if expense is None:
        raise HTTPException(status_code=404, detail="Expense not found")

    db.delete(expense)
    db.commit()

    return {
        "Message": "Expense deleted Successfully",
        "Expense ID": expense_id,
    }


# ---------------- AI CATEGORY PREDICTION ----------------


@app.post("/predict-category")
def predict_expense_category(payload: CategoryPredictRequest):
    """Suggest a category from an expense title (TF-IDF + Logistic Regression).

    Public endpoint: it never reads or writes user data, only runs the model
    over the text that was sent. No JWT is required.
    """
    try:
        result = predict_category(payload.title)
    except ModelNotTrainedError as exc:
        # The .pkl files do not exist yet (model never trained).
        raise HTTPException(status_code=503, detail=str(exc))

    return {
        "predicted_category": result["predicted_category"],
        "confidence": result["confidence"],
    }


# ---------------- ANALYTICS ----------------


@app.get("/analytics/category")
def analytics_category(
    month: str = Query(None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    """Total spend per category, e.g. {"Food": 4500, "Travel": 2500}."""
    expenses = user_expenses(db, user_id, month=month)

    totals = {}
    for item in expenses:
        key = item.category or "Other"
        totals[key] = round(totals.get(key, 0.0) + float(item.amount or 0), 2)

    return dict(sorted(totals.items(), key=lambda pair: pair[1], reverse=True))


@app.get("/analytics/monthly")
def analytics_monthly(
    year: int = Query(None),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    """Total spend per month name, e.g. {"January": 8000, "February": 6500}."""
    expenses = user_expenses(db, user_id)

    totals = {}
    for item in expenses:
        key = (item.date or "")[:7]
        if len(key) != 7 or key[4] != "-":
            continue
        if year and int(key[:4]) != year:
            continue
        label = month_label(key)
        totals[label] = round(
            totals.get(label, 0.0) + float(item.amount or 0), 2
        )

    # Return the months in calendar order rather than alphabetical.
    ordered = {
        name: totals[name]
        for name in MONTH_NAMES
        if name in totals
    }

    return ordered


@app.get("/analytics/daily")
def analytics_daily(
    month: str = Query(None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    """Total spend per day-of-month for one month, e.g. {"01": 300}."""
    target = month or current_month_key()

    expenses = user_expenses(db, user_id, month=target)

    totals = {}
    for item in expenses:
        day = (item.date or "")[8:10]
        if not day:
            continue
        totals[day] = round(totals.get(day, 0.0) + float(item.amount or 0), 2)

    return dict(sorted(totals.items()))


# ---------------- BUDGET ----------------


@app.get("/budget")
def read_budget(
    month: str = Query(None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    """Read one month's budget, or the current month when month is omitted."""
    target = month or current_month_key()

    budget = get_budget_row(db, user_id, target)

    if budget is None:
        raise HTTPException(status_code=404, detail="Budget not found")

    return {
        "Message": "Budget fetched successfully",
        "Budget": {
            "id": budget.id,
            "amount": budget.amount,
            "month": budget.month,
        },
    }


@app.get("/budgets")
def list_budgets(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    """Every budget set for this user, newest month first."""
    rows = (
        db.query(BudgetModel)
        .filter(BudgetModel.user_id == user_id)
        .order_by(BudgetModel.month.desc(), BudgetModel.id.desc())
        .all()
    )

    # Older duplicates are collapsed so each month appears once.
    seen = set()
    result = []
    for row in rows:
        if row.month in seen:
            continue
        seen.add(row.month)
        result.append({
            "id": row.id,
            "amount": row.amount,
            "month": row.month,
        })

    return {
        "Message": "Budgets fetched successfully",
        "Budgets": result,
    }


@app.post("/budget")
def create_budget(
    budget: BudgetCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    new_budget = upsert_budget(
        db, user_id, budget.month, float(budget.amount)
    )

    return {
        "Message": "Budget created successfully",
        "Budget": {
            "id": new_budget.id,
            "amount": new_budget.amount,
            "month": new_budget.month,
        },
    }


@app.put("/budget")
def update_budget(
    budget: BudgetCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    updated = upsert_budget(
        db, user_id, budget.month, float(budget.amount)
    )

    return {
        "Message": "Budget updated successfully",
        "Budget": {
            "id": updated.id,
            "amount": updated.amount,
            "month": updated.month,
        },
    }


@app.put("/budget/{month}")
def update_budget_for_month(
    month: str,
    payload: BudgetAmount,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    """Update one month's budget by putting the month in the path."""
    try:
        datetime.strptime(month, "%Y-%m")
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail="Month must use the YYYY-MM format",
        )

    updated = upsert_budget(
        db, user_id, month, float(payload.amount)
    )

    return {
        "Message": "Budget updated successfully",
        "Budget": {
            "id": updated.id,
            "amount": updated.amount,
            "month": updated.month,
        },
    }


@app.delete("/budget/{month}")
def delete_budget(
    month: str,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user)
):
    budget = get_budget_row(db, user_id, month)

    if budget is None:
        raise HTTPException(status_code=404, detail="Budget not found")

    db.delete(budget)
    db.commit()

    return {
        "Message": "Budget deleted successfully",
        "Month": month,
    }


# ---------------- NEXT MONTH SPENDING PREDICTION ----------------


@app.get("/predict-spending")
def predict_spending(
    user_id: int = Depends(get_current_user),
):
    """Predict next month's spending ONLY for the currently authenticated user.

    Never accepts user_id from query/body. The JWT (get_current_user) is the
    sole source of identity. The prediction is computed from this user's own
    expense history in the expenses database.
    """
    result = predict_next_month_spending(
        user_id,
        db_path=str(config.EXPENSES_DB_PATH),
    )

    if result.get("status") != "success":
        return result

    # Round monetary values sensibly (amounts rounded to nearest 0 as produced)
    payload = {
        "status": "success",
        "next_month": result.get("next_month"),
        "next_month_key": result.get("next_month_key"),
        "current_month": result.get("current_month"),
        "current_month_label": result.get("current_month_label"),
        "current_month_key": result.get("current_month_key"),
        "predicted_amount": result.get("predicted_amount"),
        "expected_change": result.get("expected_change"),
        "change_percentage": result.get("change_percentage"),
        "history_months": result.get("history_months"),
        "model": result.get("model"),
        "mae": result.get("mae"),
        "mae_percent": result.get("mae_percent"),
        "monthly_history": result.get("monthly_history", []),
        "trend_direction": result.get("trend_direction"),
        "disclaimer": result.get("disclaimer"),
    }

    # Ensure current_month is 0-safe when computing change if front-end recomputes
    payload["expected_change"] = payload["predicted_amount"] - payload["current_month"]
    if payload["current_month"] and payload["current_month"] > 0:
        payload["change_percentage"] = round(
            (payload["expected_change"] / payload["current_month"]) * 100, 2
        )
    else:
        payload["change_percentage"] = 0.0

    return payload


if __name__ == "__main__":  # pragma: no cover
    import uvicorn

    uvicorn.run(
        "backend.main:app",
        host=config.API_HOST,
        port=config.API_PORT,
        reload=True,
    )
