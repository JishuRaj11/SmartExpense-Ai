"""Import the external spending CSV into expenses.db so predictions work.

What this does, in plain words:

    backend/ml/dataset of spending.csv   (277 rows, Nov 2021 - Mar 2022)
          |
          |  keep Expense rows only, drop Income rows
          |  shift every date forward so history lands on recent months
          v
    one expense row per transaction      title=Category, category=Category,
                                        date=YYYY-MM-DD, amount, user_id
          |
          v
    INSERT into backend/expenses.db     for EVERY registered user

Why shift the dates
-------------------
The CSV ends in March 2022. Imported as-is, the monthly series the
prediction engine builds would span 2021-11 .. 2026-10 with ~53 zero-filled
gap months in the middle, and a LinearRegression fitted over that is
meaningless. Shifting the whole window forward by a fixed number of months
keeps every transaction's relative position, day-of-month and the shape of
the trend, but makes "next month" a real upcoming month. The default shift
maps the dataset's last month (2022-03) onto the current month, so the
series ends now and the prediction is for next month.

Income rows are skipped: the expenses table (and the spending prediction)
tracks money going OUT. Importing salary/allowance rows would inflate the
monthly totals into "income + spending" and the forecast would be wrong.

Why every user gets the same rows
---------------------------------
The prediction is strictly per-user (predict_next_month_spending reads only
WHERE user_id = ?). With no per-user CSV available, seeding every registered
user with the same practice history means any login can exercise the
feature. Each row still carries its own user_id, so one user's prediction
never reads another user's rows.

Idempotency
-----------
Re-running the script is safe. Before inserting, it counts how many of the
rows it is about to insert already exist for that user (same date, amount,
category). When everything is already present the user is skipped. --force
removes that user's previously imported rows first and imports again.

Run directly (from the project root):

    python -m backend.ml.import_dataset                 # import for all users
    python -m backend.ml.import_dataset --user 4        # import for user 4
    python -m backend.ml.import_dataset --force         # re-import cleanly
    python -m backend.ml.import_dataset --dry-run       # show what would happen
"""

import argparse
import os
import sqlite3
import sys
from datetime import date

import pandas as pd


# ---------------- PATHS ----------------

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
DATASET_PATH = os.path.join(BASE_DIR, "dataset of spending.csv")
EXPENSES_DB = os.path.join(PROJECT_ROOT, "expenses.db")
SIGNUP_DB = os.path.join(PROJECT_ROOT, "signup.db")


# ---------------- CONFIGURATION ----------------

# Only money going out becomes an expense row.
EXPENSE_LABEL = "Expense"

# The dataset's last month is 2022-03. TARGET_END_MONTH is the "YYYY-MM"
# the last dataset month is moved to; every other month keeps its distance
# from it. Leave it None to auto-map onto the current month.
TARGET_END_MONTH = None  # e.g. "2026-10" to pin it explicitly


# ---------------- DATE SHIFTING ----------------

def month_index(key):
    """'2026-10' -> absolute month number (year * 12 + month)."""
    return int(key[:4]) * 12 + int(key[5:7]) - 1


def from_month_index(index):
    """Absolute month number -> 'YYYY-MM'."""
    return f"{index // 12:04d}-{index % 12 + 1:02d}"


def shift_date(stamped, months):
    """Move a date forward/backward by whole months, clamping the day.

    January 31 shifted by one month has no equivalent day in February, so
    the result clamps to the 28th/29th/30th/31st of the target month
    instead of rolling into March.
    """
    target = month_index(stamped.strftime("%Y-%m")) + months
    target_key = from_month_index(target)

    year, month = int(target_key[:4]), int(target_key[5:7])
    if month == 12:
        next_first = date(year + 1, 1, 1)
    else:
        next_first = date(year, month + 1, 1)
    last_day = (next_first - date(year, month, 1)).days

    return date(year, month, min(stamped.day, last_day))


# ---------------- DATASET READING ----------------

def load_dataset(csv_path=DATASET_PATH):
    """Read the CSV and return expense transactions ready for import.

    Returns a list of dicts: {date, title, category, amount}. Income rows,
    zero/negative amounts and unparseable rows are dropped (counted in the
    "_dropped" summary dict).
    """
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"Dataset not found: {csv_path}")

    frame = pd.read_csv(csv_path)

    try:
        parsed = pd.to_datetime(frame["Date"], format="%m/%d/%Y %H:%M", errors="coerce")
    except (TypeError, ValueError):
        parsed = pd.to_datetime(frame["Date"], errors="coerce", format="mixed")

    amounts = pd.to_numeric(frame["Amount"], errors="coerce")
    kinds = frame["Income/Expense"].astype(str).str.strip().str.lower()
    categories = frame["Category"].astype(str).str.strip()

    dropped = {"not_expense": 0, "bad_date": 0, "bad_amount": 0}
    transactions = []

    for stamped, amount, kind, category in zip(parsed, amounts, kinds, categories):
        if kind != EXPENSE_LABEL.lower():
            dropped["not_expense"] += 1
            continue
        if pd.isna(stamped):
            dropped["bad_date"] += 1
            continue
        if pd.isna(amount) or amount <= 0:
            dropped["bad_amount"] += 1
            continue

        transactions.append(
            {
                "date": stamped.date(),
                "title": category if category and category != "nan" else "Expense",
                "category": category if category and category != "nan" else "Other",
                "amount": round(float(amount), 2),
            }
        )

    return transactions, dropped


def compute_shift(transactions, target_end_month=TARGET_END_MONTH):
    """Months to add so the dataset's last month lands on target_end_month.

    Defaults to the current calendar month, which makes the freshly imported
    history end "this month" and the prediction cover next month.
    """
    if not transactions:
        return 0

    last_key = max(item["date"].strftime("%Y-%m") for item in transactions)
    target = target_end_month or date.today().strftime("%Y-%m")
    return month_index(target) - month_index(last_key)


# ---------------- DATABASE HELPERS ----------------

def registered_user_ids(signup_db=SIGNUP_DB):
    """User ids from signup.db (the table is named `signup`)."""
    if not os.path.exists(signup_db):
        return []

    connection = sqlite3.connect(signup_db)
    try:
        cursor = connection.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = {row[0] for row in cursor.fetchall()}
        if "signup" not in tables:
            return []
        cursor.execute("SELECT id FROM signup ORDER BY id")
        return [row[0] for row in cursor.fetchall()]
    finally:
        connection.close()


def existing_rows_for(connection, user_id, rows):
    """How many of `rows` are already stored for this user.

    Matched on (date, amount, category) — the natural key of an imported
    transaction. Used for the idempotency check so a second run inserts
    nothing new.
    """
    cursor = connection.cursor()
    found = 0
    for item in rows:
        cursor.execute(
            "SELECT 1 FROM expenses WHERE user_id = ? AND date = ? "
            "AND ABS(amount - ?) < 0.005 AND category = ? LIMIT 1",
            (user_id, item["date"].isoformat(), item["amount"], item["category"]),
        )
        if cursor.fetchone():
            found += 1
    return found


def purge_user_imports(connection, user_id, rows):
    """Delete previously imported rows for this user (used by --force)."""
    cursor = connection.cursor()
    removed = 0
    for item in rows:
        cursor.execute(
            "DELETE FROM expenses WHERE user_id = ? AND date = ? "
            "AND ABS(amount - ?) < 0.005 AND category = ?",
            (user_id, item["date"].isoformat(), item["amount"], item["category"]),
        )
        removed += cursor.rowcount
    return removed


# ---------------- IMPORT ----------------

def import_dataset(csv_path=DATASET_PATH, expenses_db=EXPENSES_DB,
                   signup_db=SIGNUP_DB, user_ids=None, force=False,
                   dry_run=False):
    """Import shifted expense rows for each user. Returns a summary dict."""
    transactions, dropped = load_dataset(csv_path)
    shift = compute_shift(transactions)

    for item in transactions:
        item["date"] = shift_date(item["date"], shift)

    targets = user_ids if user_ids is not None else registered_user_ids(signup_db)

    first_key = min(item["date"].strftime("%Y-%m") for item in transactions)
    last_key = max(item["date"].strftime("%Y-%m") for item in transactions)

    summary = {
        "dataset": csv_path,
        "expense_rows": len(transactions),
        "dropped": dropped,
        "shift_months": shift,
        "history_window": f"{first_key} .. {last_key}",
        "users": [],
    }

    if dry_run:
        for uid in targets:
            summary["users"].append(
                {"user_id": uid, "inserted": 0, "already_present": len(transactions),
                 "action": "dry-run"}
            )
        return summary

    connection = sqlite3.connect(expenses_db)
    try:
        for uid in targets:
            if force:
                removed = purge_user_imports(connection, uid, transactions)
            else:
                removed = 0

            present = existing_rows_for(connection, uid, transactions)
            if not force and present == len(transactions):
                summary["users"].append(
                    {"user_id": uid, "inserted": 0, "already_present": present,
                     "action": "skipped"}
                )
                continue

            insertable = transactions if force else [
                item for item in transactions
                if not _row_exists(connection, uid, item)
            ]

            connection.executemany(
                "INSERT INTO expenses (title, amount, category, date, user_id) "
                "VALUES (?, ?, ?, ?, ?)",
                [
                    (item["title"], item["amount"], item["category"],
                     item["date"].isoformat(), uid)
                    for item in insertable
                ],
            )
            connection.commit()
            summary["users"].append(
                {"user_id": uid, "inserted": len(insertable),
                 "already_present": present, "purged": removed,
                 "action": "imported"}
            )
    finally:
        connection.close()

    return summary


def _row_exists(connection, user_id, item):
    cursor = connection.cursor()
    cursor.execute(
        "SELECT 1 FROM expenses WHERE user_id = ? AND date = ? "
        "AND ABS(amount - ?) < 0.005 AND category = ? LIMIT 1",
        (user_id, item["date"].isoformat(), item["amount"], item["category"]),
    )
    return cursor.fetchone() is not None


# ---------------- COMMAND LINE ----------------

def _main(argv=None):
    parser = argparse.ArgumentParser(
        description="Import backend/ml/dataset of spending.csv into expenses.db."
    )
    parser.add_argument("--user", type=int, action="append", dest="users",
                        help="user id to import for (repeatable; default: all)")
    parser.add_argument("--csv", default=DATASET_PATH, help="path to the dataset CSV")
    parser.add_argument("--db", default=EXPENSES_DB, help="path to expenses.db")
    parser.add_argument("--force", action="store_true",
                        help="delete this user's previously imported rows first")
    parser.add_argument("--dry-run", action="store_true",
                        help="report what would be imported without writing")
    args = parser.parse_args(argv)

    summary = import_dataset(
        csv_path=args.csv,
        expenses_db=args.db,
        user_ids=args.users,
        force=args.force,
        dry_run=args.dry_run,
    )

    print("=" * 60)
    print("SPENDING DATASET IMPORT")
    print("=" * 60)
    print(f"dataset          : {summary['dataset']}")
    print(f"expense rows     : {summary['expense_rows']}")
    print(f"dropped          : {summary['dropped']}")
    print(f"date shift       : +{summary['shift_months']} months")
    print(f"history window   : {summary['history_window']}")
    print("-" * 60)
    for entry in summary["users"]:
        print(
            f"user {entry['user_id']:>3} : {entry['action']:<9} "
            f"inserted={entry['inserted']} "
            f"already_present={entry.get('already_present', 0)}"
        )
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(_main())
