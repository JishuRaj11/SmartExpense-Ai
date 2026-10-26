"""Expense title -> expense category predictor.

Pipeline (the whole point of this file, in plain words):

    expense title (text)
          |
          v
    TF-IDF vectorizer      turns each title into a list of numbers,
          |                because models can only do maths, not read
          v
    Logistic Regression    learns which numbers pattern means which
          |                category
          v
    predicted category     e.g. "Dominos Pizza" -> "Food"

Run it directly to (re)train the model (from the project root):

    python -m backend.ml.category_prediction

Training data comes from three places, in this order:

    1. backend/ml/datasetof expense.csv   the main labelled dataset (1000 rows)
    2. backend/expenses.db                the live rows written by the app
                                          (read-only)
    3. SEED_DATA below                    bootstraps categories the CSV does not
                                          cover (Education, Other)

Rows are de-duplicated by title, so the same expense never trains twice.
The trained objects are saved to:

    backend/ml/models/category_model.pkl
    backend/ml/models/category_vectorizer.pkl
"""

import csv
import os
import sqlite3
from collections import Counter

import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import train_test_split


# ---------------- PATHS ----------------
# Everything is resolved from this file's location, so the script works no
# matter which folder you run it from.

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_PATH = os.path.join(BASE_DIR, "..", "expenses.db")
DATASET_PATH = os.path.join(BASE_DIR, "datasetof expense.csv")
MODELS_DIR = os.path.join(BASE_DIR, "models")
VECTORIZER_PATH = os.path.join(MODELS_DIR, "category_vectorizer.pkl")
MODEL_PATH = os.path.join(MODELS_DIR, "category_model.pkl")


# ---------------- CONFIGURATION ----------------

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

# The CSV (and older database rows) label some categories differently from the
# names the app stores. Every alias is folded onto its canonical CATEGORIES
# value before training, otherwise the model could learn a label the API is
# never allowed to return. Keys must be lowercase.
CATEGORY_ALIASES = {
    "medical": "Health",
    "healthcare": "Health",
    "medicine": "Health",
    "transport": "Travel",
    "transportation": "Travel",
    "entertainment": "Entertainment",
    "utility": "Bills",
    "utilities": "Bills",
    "food & dining": "Food",
    "dining": "Food",
    "groceries": "Food",
    "education": "Education",
    "misc": "Other",
    "miscellaneous": "Other",
}

# Single source of truth for the low-confidence fallback. When the model's
# best guess is weaker than this, predict_category() returns "Other" instead.
# 0.3 is tuned for this trained model: real predictions land around 0.35-0.9,
# while phrases the model has never seen stay below ~0.2. Override without
# editing code:
#   set CATEGORY_CONFIDENCE_THRESHOLD=0.6  (Windows: setx or PowerShell $env:)
CONFIDENCE_THRESHOLD = float(os.getenv("CATEGORY_CONFIDENCE_THRESHOLD", "0.3"))

# Refuse to train below these numbers — see the "enough data?" check in
# train_model(). MIN_ROWS_PER_CATEGORY must be >= 2 because a train/test
# split cannot put a category in both sides if it only has one example.
MIN_TOTAL_ROWS = 20
MIN_ROWS_PER_CATEGORY = 2

# Below this many training rows the printed accuracy becomes unreliable
# (it is measured on a handful of titles), so a warning is shown.
SMALL_DATASET_WARNING_ROWS = 50


# ---------------- SEED DATA ----------------
# The CSV covers Food, Travel, Shopping, Bills, Entertainment and Health, but
# has no Education or Other examples. These titles bootstrap those two
# categories (and add a little variety to the rest) until real user expenses
# grow the dataset. They are only added when their title is new, so nothing is
# ever double-counted.

SEED_DATA = [
    # Food
    ("Dominos Pizza", "Food"),
    ("McDonalds burger", "Food"),
    ("Groceries from supermarket", "Food"),
    ("Coffee at cafe", "Food"),
    ("Chicken biryani", "Food"),
    ("Ice cream cone", "Food"),
    ("Fruits and vegetables", "Food"),
    ("Restaurant dinner", "Food"),
    # Travel
    ("Uber ride to college", "Travel"),
    ("Ola cab to airport", "Travel"),
    ("Flight tickets to Delhi", "Travel"),
    ("Metro card recharge", "Travel"),
    ("Bus ticket", "Travel"),
    ("Train ticket to hometown", "Travel"),
    ("Petrol for bike", "Travel"),
    ("Auto rickshaw ride", "Travel"),
    # Shopping
    ("Amazon shoes", "Shopping"),
    ("Nike tshirt", "Shopping"),
    ("Jeans from Zara", "Shopping"),
    ("Headphones from Flipkart", "Shopping"),
    ("New laptop bag", "Shopping"),
    ("Birthday gift for mom", "Shopping"),
    ("Sneakers from Myntra", "Shopping"),
    ("Wallet from store", "Shopping"),
    # Bills
    ("Electricity bill", "Bills"),
    ("Water bill", "Bills"),
    ("Wifi internet recharge", "Bills"),
    ("Mobile phone recharge", "Bills"),
    ("Gas cylinder bill", "Bills"),
    ("Internet broadband bill", "Bills"),
    ("Phone bill payment", "Bills"),
    ("Electricity bill for March", "Bills"),
    # Entertainment
    ("Netflix subscription", "Entertainment"),
    ("Spotify premium", "Entertainment"),
    ("Movie tickets", "Entertainment"),
    ("Prime video subscription", "Entertainment"),
    ("Concert tickets", "Entertainment"),
    ("YouTube premium", "Entertainment"),
    ("PC game on Steam", "Entertainment"),
    ("Bowling night out", "Entertainment"),
    # Education
    ("Python course", "Education"),
    ("Udemy data science course", "Education"),
    ("College semester fees", "Education"),
    ("Programming textbook", "Education"),
    ("Tuition classes", "Education"),
    ("Coursera certificate course", "Education"),
    ("Stationery for college", "Education"),
    ("Online ML course", "Education"),
    # Health
    ("Medicine from pharmacy", "Health"),
    ("Doctor consultation visit", "Health"),
    ("Dentist appointment", "Health"),
    ("Gym membership fee", "Health"),
    ("Vitamin tablets", "Health"),
    ("Blood test at lab", "Health"),
    ("Physiotherapy session", "Health"),
    ("Health checkup", "Health"),
    # Other
    ("Donation to charity", "Other"),
    ("Laundry service", "Other"),
    ("Courier delivery charges", "Other"),
    ("Haircut at salon", "Other"),
    ("Pet grooming", "Other"),
    ("Household miscellaneous", "Other"),
    ("Parking fees", "Other"),
    ("Tip to delivery boy", "Other"),
]


class ModelNotTrainedError(Exception):
    """Raised when predict_category() is called before the model exists.

    The FastAPI endpoint catches this and answers with HTTP 503 plus a
    human-readable message instead of crashing.
    """


# ---------------- STEP 1: LOAD TRAINING DATA ----------------

def normalize_category(value) -> str:
    """Map a stored/CSV category onto one of CATEGORIES.

    Matching is case-insensitive and alias-aware, so the CSV's "Medical"
    becomes the app's "Health". Returns "Unknown" when nothing matches, so the
    caller can skip the row instead of training on a label the model is never
    allowed to predict.
    """
    text = str(value or "").strip().lower()
    if not text:
        return "Unknown"

    for name in CATEGORIES:
        if name.lower() == text:
            return name

    alias = CATEGORY_ALIASES.get(text)
    if alias:
        return alias

    return "Unknown"


def clean_title(value) -> str:
    """Tidy a raw title before it becomes a training feature.

    Trailing numeric ids in the CSV (e.g. "Gas bill payment 3277") are dropped
    so the model learns words such as "gas bill payment" instead of memorising
    meaningless digits.
    """
    text = str(value or "").strip()
    # Strip trailing id-like numbers, with or without a separator.
    while True:
        stripped = text.rstrip()
        # "Gas bill 3277" -> "Gas bill"
        trimmed = stripped.rsplit(" ", 1)[0] if " " in stripped else stripped
        if trimmed != stripped and trimmed and stripped.rsplit(" ", 1)[1].isdigit():
            text = trimmed
            continue
        break
    return " ".join(text.split())


def load_expenses_from_dataset() -> list:
    """Read (title, category) pairs from datasetof expense.csv.

    The file has a header row of `text,label`. Rows with a blank title or an
    unrecognised label are skipped so only clean, learnable examples remain.
    """
    if not os.path.exists(DATASET_PATH):
        print(f"[warn] Dataset not found at {DATASET_PATH}")
        return []

    rows = []
    skipped_blank = 0
    skipped_unknown = 0

    # utf-8-sig tolerates a byte-order mark if the file was saved on Windows.
    with open(DATASET_PATH, "r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for record in reader:
            title = clean_title(record.get("text") or record.get("title"))
            if not title:
                skipped_blank += 1
                continue

            category = normalize_category(record.get("label") or record.get("category"))
            if category == "Unknown":
                skipped_unknown += 1
                print(f"   skipped: title={title!r} has invalid label="
                      f"{record.get('label')!r}")
                continue

            rows.append((title, category))

    print(f"[data] Dataset rows read  : {len(rows) + skipped_blank + skipped_unknown}")
    print(f"        valid dataset rows : {len(rows)}")
    if skipped_blank:
        print(f"        skipped (blank title): {skipped_blank}")
    if skipped_unknown:
        print(f"        skipped (unknown label): {skipped_unknown}")

    return rows


def load_expenses_from_database() -> list:
    """Read (title, category) pairs from the existing SQLite database.

    This is a plain sqlite3 read — main.py's SQLAlchemy engine keeps serving
    the API at the same time, and nothing is ever written back.
    """
    if not os.path.exists(DATABASE_PATH):
        print(f"[warn] Database not found at {DATABASE_PATH}")
        return []

    connection = sqlite3.connect(DATABASE_PATH)
    try:
        cursor = connection.cursor()
        cursor.execute("SELECT title, category FROM expenses")
        rows = cursor.fetchall()
    finally:
        connection.close()

    valid_rows = []
    skipped_blank = 0
    skipped_unknown = 0

    for title, category in rows:
        clean_name = clean_title(title)

        if not clean_name:
            skipped_blank += 1
            continue

        clean_category = normalize_category(category)

        if clean_category == "Unknown":
            # Example: your row ('travel', 'for work'). Training on it would
            # teach the model that the word "travel" means "Other".
            skipped_unknown += 1
            print(f"   skipped: title={clean_name!r} has invalid category={category!r}")
            continue

        valid_rows.append((clean_name, clean_category))

    print(f"[data] Database rows read : {len(rows)}")
    print(f"        valid training rows: {len(valid_rows)}")
    if skipped_blank:
        print(f"        skipped (blank title): {skipped_blank}")
    if skipped_unknown:
        print(f"        skipped (unknown category): {skipped_unknown}")

    return valid_rows


def build_training_rows() -> list:
    """Merge every available source into one training set.

    The CSV is the primary source. Its 1000 rows are only 36 real templates
    repeated with throwaway id numbers, so titles are de-duplicated: keeping
    the ~28 copies of each template adds no new information, and it would leak
    the same title into both the train and test split. clean_title() removes
    the id numbers first, which is what lets those copies collapse. Database
    rows and seeds are then appended only when their title is new, so they add
    coverage (notably Education and Other, which the CSV lacks).
    """
    rows = []
    seen = set()

    def add_unique(candidates) -> int:
        added = 0
        for title, category in candidates:
            key = title.lower()
            if key in seen:
                continue
            seen.add(key)
            rows.append((title, category))
            added += 1
        return added

    added_dataset = add_unique(load_expenses_from_dataset())
    added_db = add_unique(load_expenses_from_database())
    added_seeds = add_unique(SEED_DATA)

    print(f"[data] From dataset: {added_dataset} | "
          f"from database: {added_db} | seeds: {added_seeds}")
    print(f"[data] Total training rows: {len(rows)}")

    return rows


# ---------------- STEP 2: TRAIN ----------------

def train_model() -> bool:
    """Train TF-IDF + Logistic Regression and save both objects.

    Returns True on success, False when there is not enough data.
    """
    print("=" * 60)
    print("TRAINING — expense category prediction")
    print("=" * 60)

    rows = build_training_rows()

    if not rows:
        print("[error] No training data found. Nothing to train.")
        return False

    # X = the input features (the titles)
    # y = the target labels (the categories)
    X = [title for title, _ in rows]
    y = [category for _, category in rows]

    counts = Counter(y)
    print("[data] Rows per category:")
    for name in CATEGORIES:
        if counts.get(name):
            print(f"        {name:<15} {counts[name]}")

    # ---- Enough-data check ----
    too_few = {
        name: count for name, count in counts.items()
        if count < MIN_ROWS_PER_CATEGORY
    }

    if len(counts) < 2 or too_few or len(X) < MIN_TOTAL_ROWS:
        print()
        print("[error] Not enough training data yet.")
        print(f"        - Need at least {MIN_TOTAL_ROWS} total rows "
              f"(have {len(X)}).")
        print(f"        - Every category present needs at least "
              f"{MIN_ROWS_PER_CATEGORY} examples.")
        if too_few:
            for name, count in sorted(too_few.items()):
                print(f"        - {name!r} only has {count} example(s).")
        print("        Add more expenses (or keep the seed data) and re-run:")
        print("        python -m backend.ml.category_prediction")
        return False

    # ---- Train/test split ----
    # 80% of the rows teach the model, 20% are held back as unseen exam
    # questions. stratify=y keeps the category proportions equal on both
    # sides, random_state=42 makes the split reproducible.
    X_train, X_test, y_train, y_test = train_test_split(
        X, y,
        test_size=0.2,
        random_state=42,
        stratify=y,
    )

    print(f"[split] Training rows: {len(X_train)} | Test rows: {len(X_test)}")

    # ---- TF-IDF ----
    # Turns text into numbers. ngram_range=(1, 2) also learns two-word
    # phrases such as "electricity bill", not just single words, and
    # sublinear_tf damps words that repeat a lot.
    vectorizer = TfidfVectorizer(
        lowercase=True,
        ngram_range=(1, 2),
        sublinear_tf=True,
    )

    X_train_tfidf = vectorizer.fit_transform(X_train)
    # transform() (NOT fit_transform) on the test side: the test titles must
    # be converted with the vocabulary the model already learned.
    X_test_tfidf = vectorizer.transform(X_test)

    print(f"[tf-idf] Vocabulary size: {len(vectorizer.vocabulary_)} unique tokens")

    # ---- Logistic Regression ----
    # class_weight="balanced" stops the large CSV categories from drowning out
    # the smaller Education/Other examples that only the seed list provides.
    # C=10 fits a small dataset more tightly than the default C=1, which is
    # what lifts the confidence of a correct match above CONFIDENCE_THRESHOLD.
    model = LogisticRegression(
        max_iter=2000,
        C=10,
        class_weight="balanced",
    )
    model.fit(X_train_tfidf, y_train)

    # ---- Evaluation ----
    predictions = model.predict(X_test_tfidf)
    accuracy = accuracy_score(y_test, predictions)

    print(f"[eval] Accuracy on unseen test rows: {accuracy:.2%}")
    print("[eval] Per-category report:")
    print(classification_report(y_test, predictions, zero_division=0))

    if len(X) < SMALL_DATASET_WARNING_ROWS:
        print(f"[warning] Only {len(X)} training rows. The accuracy above is")
        print("          measured on very few titles, so it can be misleading.")
        print("          Confidence values from this model should be treated")
        print("          as rough guidance, not certainty. Retrain after you")
        print("          add more real expenses.")

    # ---- Save ----
    os.makedirs(MODELS_DIR, exist_ok=True)
    joblib.dump(vectorizer, VECTORIZER_PATH)
    joblib.dump(model, MODEL_PATH)

    print("[saved] Vectorizer ->", os.path.relpath(VECTORIZER_PATH, BASE_DIR))
    print("[saved] Model     ->", os.path.relpath(MODEL_PATH, BASE_DIR))
    print("=" * 60)

    return True


# ---------------- STEP 3: PREDICT ----------------

def model_is_trained() -> bool:
    return os.path.exists(MODEL_PATH) and os.path.exists(VECTORIZER_PATH)


def predict_category(title: str) -> dict:
    """Predict the category of an expense title.

    Returns:
        {"predicted_category": "Food", "confidence": 0.91}

    - confidence is the probability the model assigned to its best guess
      (0.0 to 1.0). It comes from LogisticRegression.predict_proba().
    - when confidence < CONFIDENCE_THRESHOLD the predicted category is
      replaced with "Other", so a weak guess is never presented as a sure one.
      The returned confidence stays the original (low) value on purpose.

    Raises:
        ValueError: empty title.
        ModelNotTrainedError: the .pkl files do not exist yet.
    """
    cleaned = str(title or "").strip()
    if not cleaned:
        raise ValueError("Title cannot be empty")

    if not model_is_trained():
        raise ModelNotTrainedError(
            "Category prediction model is not trained yet. "
            "Run: python -m backend.ml.category_prediction"
        )

    vectorizer = joblib.load(VECTORIZER_PATH)
    model = joblib.load(MODEL_PATH)

    features = vectorizer.transform([cleaned])

    # predict_proba gives one probability per known category, e.g.
    # {"Food": 0.91, "Travel": 0.03, ...}. The highest one wins.
    probabilities = model.predict_proba(features)[0]
    best_index = int(probabilities.argmax())

    confidence = float(probabilities[best_index])
    category = str(model.classes_[best_index])

    if confidence < CONFIDENCE_THRESHOLD:
        category = "Other"

    return {
        "predicted_category": category,
        "confidence": round(confidence, 2),
    }


# ---------------- COMMAND LINE ----------------

if __name__ == "__main__":
    train_model()
