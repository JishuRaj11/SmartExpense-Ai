"""Next Month Spending Prediction (user-specific).

What this file does, in plain words:

    one user's expenses (backend/expenses.db, read-only)
          |
          v
    group rows by month          2026-01 -> 8000, 2026-02 -> 8500, ...
          |
          v
    chronological month index     0, 1, 2, 3, ...   (target = monthly total)
          |
          v
    LinearRegression              learns THIS user's own spending trend
          |
          v
    predict next month            index n -> rupees

IMPORTANT — this is intentionally per-user. There is no shared/global model:
predict_next_month_spending(user_id) reads only that user's rows, trains on
only those rows and returns only that user's numbers. User A's history can
never reach User B's response.

Why no model.pkl is written (PHASE 7)
-------------------------------------
The model is a single straight line fitted over at most a few dozen points,
so training takes less time than reading the database. A cached .pkl would
only risk going stale (a saved model would keep predicting yesterday's trend
after the user adds new expenses) and would need strict per-user naming to
avoid cross-user leaks. Training on demand is cheaper AND safer here. The
backend/ml/models/ directory is reserved for the heavy text models in
category_prediction.py.

Evaluation (PHASE 3)
--------------------
Monthly data is time-series data, so nothing is shuffled. The last month is
held out, the line is fitted on all earlier months, and the error on that
held-out month is reported as MAE (mean absolute error). The prediction is a
trend extrapolation, not a guarantee — the disclaimer field says so.

External dataset (PHASE 8)
--------------------------
preprocess_dataset() converts a transaction-level CSV under
backend/ml/dataset/ into monthly totals (`month,amount` files). It is for
development, testing and benchmarking ONLY — those rows are never inserted
into expenses.db, and the production prediction always reads the logged-in
user's own expenses.

Run directly (from the project root):

    python -m backend.ml.spending_prediction --user 3            # predict for user 3
    python -m backend.ml.spending_prediction --user 3 --json     # raw JSON
    python -m backend.ml.spending_prediction --benchmark         # score the dataset
"""

import argparse
import csv
import json
import os
import sqlite3
import sys
from collections import OrderedDict
from datetime import date, datetime

from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error


# ---------------- PATHS ----------------
# Resolved from this file's location so the module works from any CWD.

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_PATH = os.path.join(BASE_DIR, "..", "expenses.db")
DATASET_DIR = os.path.join(BASE_DIR, "dataset")
MODELS_DIR = os.path.join(BASE_DIR, "models")


# ---------------- CONFIGURATION ----------------

# Minimum months of history before a prediction is offered. Change this one
# constant (or set the PREDICTION_MIN_MONTHS environment variable) to make the
# requirement stricter/looser everywhere: ML module, API and front-end message.
# 5 matches the history depth of backend/ml/dataset of spending.csv (see
# backend/ml/import_dataset.py), so an imported account can forecast
# immediately.
MIN_MONTHS_HISTORY = int(os.getenv("PREDICTION_MIN_MONTHS", "5"))

MODEL_NAME = "LinearRegression"

MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]

# Guard rails for messy data. Anything outside these bounds is skipped for the
# prediction only (the row itself is never deleted or edited).
MAX_REASONABLE_AMOUNT = 1_000_000_000_000  # 1 trillion per transaction

DISCLAIMER = (
    "LinearRegression estimate built from your own monthly spending trend. "
    "It is a directional forecast, not a guarantee."
)


class InsufficientDataError(Exception):
    """Raised only by helper callers that require a prediction unconditionally.

    predict_next_month_spending() never raises this — it returns an
    {"status": "insufficient_data", ...} payload so the API can answer 200
    with a helpful message instead of an error.
    """


# ---------------- STEP 1: DATA EXTRACTION ----------------

def parse_date(raw):
    """Turn a stored date string into a datetime, or None when unusable.

    The expenses.date column is TEXT, so anything can sit there. Accepted
    shapes: "2026-01-05", "2026-01-05 10:30:00", "2026-01-05T10:30:00",
    "2026-01-05T10:30:00Z", "2026/01/05" and "05/01/2026".
    """
    if raw is None:
        return None

    text = str(raw).strip()
    if not text:
        return None

    # datetime.fromisoformat handles plain dates, space and T separators and
    # (on Python 3.11+) the trailing Z of UTC timestamps.
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        pass

    for fmt in ("%Y/%m/%d", "%d/%m/%Y", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue

    return None


def load_user_expense_rows(user_id, db_path=DATABASE_PATH):
    """Read (date_text, amount) for ONE user from the existing expenses.db.

    Plain sqlite3, read-only: FastAPI keeps serving at the same time and no
    row is ever written back. The WHERE clause is what makes the prediction
    user-specific — another user's rows are never selected.

    Returns (rows, skipped) where skipped counts the unusable rows.
    """
    rows = []
    skipped = {"invalid_date": 0, "invalid_amount": 0, "future_dated": 0}

    if not os.path.exists(db_path):
        return rows, skipped

    # mode=ro would fail on a :memory: style path; uri=False + a plain connect
    # is enough because every statement below is a SELECT.
    connection = sqlite3.connect(db_path)
    try:
        cursor = connection.cursor()
        cursor.execute(
            "SELECT date, amount FROM expenses WHERE user_id = ?",
            (user_id,),
        )
        raw_rows = cursor.fetchall()
    finally:
        connection.close()

    today = date.today()
    # Anything after the end of the current calendar month is "the future":
    # spending that has not happened yet must not shape a trend that ends now.
    end_of_this_month = date(today.year, today.month, 1)
    if end_of_this_month.month == 12:
        end_of_this_month = date(end_of_this_month.year + 1, 1, 1)
    else:
        end_of_this_month = date(
            end_of_this_month.year, end_of_this_month.month + 1, 1
        )

    for raw_date, raw_amount in raw_rows:
        parsed = parse_date(raw_date)
        if parsed is None:
            skipped["invalid_date"] += 1
            continue

        try:
            amount = float(raw_amount)
        except (TypeError, ValueError):
            skipped["invalid_amount"] += 1
            continue

        # NaN/inf and negative refunds are not spending — skip for the model
        # but leave the record untouched in the database.
        if amount != amount or amount in (float("inf"), float("-inf")):
            skipped["invalid_amount"] += 1
            continue
        if amount < 0 or amount > MAX_REASONABLE_AMOUNT:
            skipped["invalid_amount"] += 1
            continue

        if parsed.date() >= end_of_this_month:
            skipped["future_dated"] += 1
            continue

        rows.append((parsed, amount))

    return rows, skipped


def build_monthly_series(rows):
    """Aggregate (datetime, amount) rows into a chronological month series.

    Missing months BETWEEN the first and last observed month are filled with
    0 — a month the user recorded nothing in genuinely spent 0. Months before
    the first row / after the last row are NOT padded, because "no data yet"
    is not the same as "spent nothing".

    Returns (series, keys):
        series = OrderedDict {"2026-01": 8000.0, "2026-02": 8500.0, ...}
        keys   = chronological list of month keys
    """
    observed = OrderedDict()

    for parsed, amount in rows:
        key = parsed.strftime("%Y-%m")
        observed[key] = observed.get(key, 0.0) + amount

    if not observed:
        return OrderedDict(), []

    ordered_observed = OrderedDict(sorted(observed.items()))
    first_key = next(iter(ordered_observed))
    last_key = next(reversed(ordered_observed))

    series = OrderedDict()
    year, month = int(first_key[:4]), int(first_key[5:7])

    while True:
        key = f"{year:04d}-{month:02d}"
        # Gaps become 0, observed months keep their real total.
        series[key] = round(ordered_observed.get(key, 0.0), 2)

        if key == last_key:
            break

        month += 1
        if month > 12:
            month, year = 1, year + 1

    return series, list(series.keys())


# ---------------- STEP 2: LABELS + MONTH MATH ----------------

def month_label(key):
    """'2026-03' -> 'March 2026' (safe fallback: the raw key)."""
    try:
        name = MONTH_NAMES[int(key[5:7]) - 1]
        return f"{name} {key[:4]}"
    except (IndexError, ValueError):
        return key


def months_between(start_key, end_key):
    """Whole months from start_key to end_key. 2026-01 -> 2026-07 is 6."""
    return (
        (int(end_key[:4]) - int(start_key[:4])) * 12
        + (int(end_key[5:7]) - int(start_key[5:7]))
    )


def add_months(key, count):
    """Shift a 'YYYY-MM' key by count months (count may be negative)."""
    year, month = int(key[:4]), int(key[5:7])
    index = (year * 12 + (month - 1)) + count
    return f"{index // 12:04d}-{index % 12 + 1:02d}"


def month_key_today(today=None):
    target = today or date.today()
    return target.strftime("%Y-%m")


# ---------------- STEP 3: MODEL + EVALUATION ----------------

def fit_line(x_values, y_values):
    """Fit and return a LinearRegression over the given points."""
    model = LinearRegression()
    model.fit(
        [[float(v)] for v in x_values],
        [float(v) for v in y_values],
    )
    return model


def evaluate_holdout(months, amounts):
    """Time-series-safe error estimate: train on the past, test on the latest.

    Nothing is shuffled. The LAST month is held out, the line is fitted on
    every earlier month, and MAE measures how far that held-out prediction
    was from reality. Returns (mae, predicted_last, actual_last).

    Returns (None, None, None) when there are too few points to hold one back.
    """
    if len(months) < 3:
        return None, None, None

    x_train = [[float(i)] for i in range(len(months) - 1)]
    y_train = [float(v) for v in amounts[:-1]]

    eval_model = LinearRegression()
    eval_model.fit(x_train, y_train)

    predicted_last = float(
        eval_model.predict([[float(len(months) - 1)]])[0]
    )
    actual_last = float(amounts[-1])

    mae = float(mean_absolute_error([actual_last], [predicted_last]))
    return round(mae, 2), round(predicted_last, 2), actual_last


# ---------------- STEP 4: PREDICTION ----------------

def predict_from_series(series, today=None, skipped=None):
    """Core prediction from a {'YYYY-MM': total} series.

    Used directly by tests and by the benchmark runner, and wrapped by
    predict_next_month_spending() for the API. Never raises for small data —
    it answers with status: "insufficient_data".
    """
    keys = list(series.keys())
    amounts = [series[key] for key in keys]
    target_today = today or date.today()
    next_key = add_months(month_key_today(target_today), 1)

    history_payload = [
        {"month": month_label(key), "amount": round(series[key], 2)}
        for key in keys
    ]

    if len(keys) < MIN_MONTHS_HISTORY:
        return {
            "status": "insufficient_data",
            "message": (
                f"At least {MIN_MONTHS_HISTORY} months of spending history "
                "is required for prediction."
            ),
            "months_available": len(keys),
            "required_months": MIN_MONTHS_HISTORY,
            "next_month": month_label(next_key),
            "monthly_history": history_payload,
        }

    # ---- Train on ALL observed months (no future data exists) ----
    x = list(range(len(keys)))
    model = fit_line(x, amounts)

    # The predicted month is the calendar month after *now*. Its index may sit
    # beyond the last observed month (extrapolation across a data gap), which
    # is exactly what a linear trend is for.
    target_index = months_between(keys[0], next_key)
    raw_prediction = float(model.predict([[float(target_index)]])[0])

    # A line can point below zero on a strongly decreasing trend: spending
    # cannot be negative, so clamp at 0.
    predicted_amount = round(max(raw_prediction, 0.0), 0)

    current_key = keys[-1]
    current_amount = round(series[current_key], 2)

    expected_change = round(predicted_amount - current_amount, 0)
    if current_amount > 0:
        change_percentage = round(
            (expected_change / current_amount) * 100, 2
        )
    else:
        # No spending in the latest month: a percentage would divide by zero.
        change_percentage = 0.0

    # ---- Held-out error (last month predicted from earlier months) ----
    mae, _, _ = evaluate_holdout(keys, amounts)
    if mae is None:
        mae_percent = None
    elif series[keys[-1]] > 0:
        mae_percent = round((mae / series[keys[-1]]) * 100, 2)
    else:
        mae_percent = None

    slope = round(float(model.coef_[0]), 2) if len(keys) > 1 else 0.0

    return {
        "status": "success",
        "next_month": month_label(next_key),
        "next_month_key": next_key,
        "current_month": current_amount,
        "current_month_label": month_label(current_key),
        "current_month_key": current_key,
        "predicted_amount": predicted_amount,
        "expected_change": expected_change,
        "change_percentage": change_percentage,
        "history_months": len(keys),
        "months_available": len(keys),
        "model": MODEL_NAME,
        "mae": mae,
        "mae_percent": mae_percent,
        "monthly_trend": slope,
        "trend_direction": (
            "increasing" if slope > 0 else "decreasing" if slope < 0 else "flat"
        ),
        "monthly_history": history_payload,
        "skipped_rows": skipped or {},
        "disclaimer": DISCLAIMER,
    }


def predict_next_month_spending(user_id, db_path=DATABASE_PATH, today=None):
    """Predict how much THIS user will spend next month.

    Reads only the given user's rows from backend/expenses.db (never another
    user's, never an external dataset), builds their monthly series, trains a
    LinearRegression on it and returns a structured payload.

    Returns status "success" with the prediction when the user has at least
    MIN_MONTHS_HISTORY months, otherwise status "insufficient_data" with
    months_available and a human-readable message.
    """
    rows, skipped = load_user_expense_rows(user_id, db_path=db_path)
    series, _ = build_monthly_series(rows)

    return predict_from_series(series, today=today, skipped=skipped)


# ---------------- STEP 5: EXTERNAL DATASET (dev/testing only) ----------------

def _find_column(columns, candidates):
    """First column from candidates matching one of the CSV's headers."""
    lowered = {str(name).strip().lower(): name for name in columns}
    for candidate in candidates:
        if candidate in lowered:
            return lowered[candidate]
    return None


def preprocess_dataset(csv_path, output_dir=None, write_files=True):
    """Transaction-level CSV -> per-user monthly totals (month,amount).

    PHASE 8 support: the file under backend/ml/dataset/ is
    development/benchmark data. Nothing here touches expenses.db — the
    production prediction still reads the logged-in user's own expenses.

    Expected columns (case-insensitive, best match wins):
        date   : date | transaction_date | txn_date
        amount : amount | price | total | value
        user   : user_id | user | customer_id   (optional)

    Returns:
        {user_id: OrderedDict({"2025-01": 12000.0, ...}), "_rows_read": n}
    """
    try:
        import pandas as pd
    except ImportError as exc:  # pragma: no cover - environment guard
        raise RuntimeError(
            "pandas is required for dataset preprocessing. "
            "Install it with: pip install pandas"
        ) from exc

    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"Dataset not found: {csv_path}")

    frame = pd.read_csv(csv_path)

    date_col = _find_column(frame.columns, ["date", "transaction_date", "txn_date"])
    amount_col = _find_column(
        frame.columns, ["amount", "price", "total", "value"]
    )
    user_col = _find_column(
        frame.columns, ["user_id", "user", "customer_id"]
    )

    if date_col is None or amount_col is None:
        raise ValueError(
            "Dataset must contain a date column (date/transaction_date) and "
            "an amount column (amount/price/total)."
        )

    if user_col is None:
        # Single-user file: everyone is bucketed under one pseudo user.
        frame = frame.copy()
        frame["user_id"] = "all"
        user_col = "user_id"

    # format="mixed" tolerates datasets that store "2025-01-05" in some rows
    # and "05/01/2025" in others; unparseable rows become NaT and are dropped.
    try:
        parsed_dates = pd.to_datetime(
            frame[date_col], errors="coerce", format="mixed"
        )
    except (TypeError, ValueError):
        parsed_dates = pd.to_datetime(frame[date_col], errors="coerce")

    amounts = pd.to_numeric(frame[amount_col], errors="coerce")

    working = frame[[user_col]].copy()
    working["month"] = parsed_dates.dt.strftime("%Y-%m")
    working["amount"] = amounts

    valid = working[
        working["month"].notna()
        & working["amount"].notna()
        & (working["amount"] >= 0)
        & (working["amount"] <= MAX_REASONABLE_AMOUNT)
    ]

    # Aggregate per user FIRST, then per month, so one user's spending never
    # blends into another user's history.
    grouped = (
        valid.groupby([user_col, "month"])["amount"].sum().reset_index()
    )

    histories = {}
    for user, chunk in grouped.groupby(user_col):
        monthly = OrderedDict(
            sorted(zip(chunk["month"], chunk["amount"]), key=lambda pair: pair[0])
        )
        histories[str(user)] = OrderedDict(
            (key, round(float(value), 2)) for key, value in monthly.items()
        )

    histories["_rows_read"] = int(len(frame))
    histories["_rows_used"] = int(len(valid))

    if write_files:
        target_dir = output_dir or os.path.join(DATASET_DIR, "processed")
        os.makedirs(target_dir, exist_ok=True)

        for user, monthly in histories.items():
            if str(user).startswith("_"):
                continue
            path = os.path.join(target_dir, f"user_{user}_monthly.csv")
            with open(path, "w", encoding="utf-8", newline="") as handle:
                writer = csv.writer(handle)
                writer.writerow(["month", "amount"])
                for key, value in monthly.items():
                    writer.writerow([key, value])

    return histories


def benchmark_dataset(csv_path=None, output_dir=None):
    """Run the same pipeline over an external dataset and report per-user MAE.

    Development aid only: it shows how the model behaves on data that is not
    in the app database. No row is written to expenses.db.
    """
    path = csv_path or os.path.join(DATASET_DIR, "benchmark_transactions.csv")
    histories = preprocess_dataset(path, output_dir=output_dir)

    report = []
    for user, monthly in histories.items():
        if str(user).startswith("_"):
            continue

        result = predict_from_series(monthly)
        report.append(
            {
                "user": user,
                "months": len(monthly),
                "status": result["status"],
                "predicted_amount": result.get("predicted_amount"),
                "mae": result.get("mae"),
                "trend": result.get("trend_direction"),
            }
        )

    return {
        "dataset": path,
        "rows_read": histories.get("_rows_read", 0),
        "rows_used": histories.get("_rows_used", 0),
        "users": report,
    }


# ---------------- COMMAND LINE ----------------

def _main(argv=None):
    parser = argparse.ArgumentParser(
        description="Next Month Spending Prediction (per-user LinearRegression)."
    )
    parser.add_argument("--user", type=int, help="user id to predict for")
    parser.add_argument("--json", action="store_true", help="print raw JSON")
    parser.add_argument(
        "--db", default=DATABASE_PATH, help="path to expenses.db"
    )
    parser.add_argument(
        "--benchmark",
        action="store_true",
        help="score the external backend/ml/dataset CSV instead of a live user",
    )
    parser.add_argument(
        "--preprocess",
        action="store_true",
        help="only convert the external CSV into month,amount files",
    )
    args = parser.parse_args(argv)

    if args.benchmark:
        result = benchmark_dataset()
        print(json.dumps(result, indent=2))
        return 0

    if args.preprocess:
        result = preprocess_dataset(
            os.path.join(DATASET_DIR, "benchmark_transactions.csv")
        )
        printable = {
            key: value for key, value in result.items() if not key.startswith("_")
        }
        print(json.dumps(printable, indent=2))
        return 0

    if args.user is None:
        parser.error("--user is required unless --benchmark/--preprocess is used")

    result = predict_next_month_spending(args.user, db_path=args.db)

    if args.json:
        print(json.dumps(result, indent=2))
        return 0

    print("=" * 60)
    print(f"NEXT MONTH SPENDING PREDICTION — user {args.user}")
    print("=" * 60)

    if result["status"] != "success":
        print(f"status           : {result['status']}")
        print(f"message          : {result['message']}")
        print(f"months available : {result['months_available']}"
              f" / need {result['required_months']}")
        return 0

    print(f"next month       : {result['next_month']}")
    print(f"latest month     : {result['current_month_label']}"
          f" = {result['current_month']:,.0f}")
    print(f"predicted        : {result['predicted_amount']:,.0f}")
    print(f"expected change  : {result['expected_change']:+,.0f}"
          f" ({result['change_percentage']:+.2f}%)")
    print(f"history months   : {result['history_months']}")
    print(f"model            : {result['model']}")
    print(f"MAE (hold-out)   : {result['mae']}")
    print(f"trend            : {result['trend_direction']}"
          f" ({result['monthly_trend']:+,.2f}/month)")
    print(f"disclaimer       : {result['disclaimer']}")
    print("-" * 60)
    for item in result["monthly_history"]:
        print(f"  {item['month']:<18} {item['amount']:>12,.2f}")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(_main())
