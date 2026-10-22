"""Database engines, sessions and table setup.

Two SQLite files are used:

    expenses.db   expenses + budgets  (the data of the app)
    signup.db     users                (accounts and password hashes)

They are kept apart because they have different lifetimes: the user table
survives when the expense data is wiped, and the two files can be backed up
or restored independently.

Every engine is created with `check_same_thread=False` because FastAPI runs
sync endpoints in a thread pool, so the same connection can be touched from
more than one thread. The SQLite pragmas below make that safe in practice.
"""

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from . import config
from .models import AuthBase, ExpensesBase


# ---------------- ENGINES ----------------

expenses_engine = create_engine(
    config.EXPENSES_DATABASE_URL,
    connect_args={"check_same_thread": False},
    future=True,
)

signup_engine = create_engine(
    config.SIGNUP_DATABASE_URL,
    connect_args={"check_same_thread": False},
    future=True,
)


def _apply_pragmas(engine):
    """Apply the SQLite pragmas every new connection of `engine` needs.

    foreign_keys  enforces the relations the schema declares.
    journal_mode  WAL lets a reader (the ML prediction) work while the API
                  is writing, instead of the two blocking each other.
    busy_timeout  waits instead of failing instantly when another connection
                  holds the write lock.
    """
    @event.listens_for(engine, "connect")
    def _on_connect(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()

    return engine


_apply_pragmas(expenses_engine)
_apply_pragmas(signup_engine)


# ---------------- SESSION FACTORIES ----------------

ExpensesSessionLocal = sessionmaker(
    bind=expenses_engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
)

SignupSessionLocal = sessionmaker(
    bind=signup_engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
)


# ---------------- TABLE SETUP ----------------


def init_db() -> None:
    """Create any table that does not exist yet.

    Safe to call on every start: existing data is never touched.
    """
    ExpensesBase.metadata.create_all(bind=expenses_engine)
    AuthBase.metadata.create_all(bind=signup_engine)


# ---------------- FASTAPI DEPENDENCIES ----------------


def get_db():
    """Yield a session for the expenses/budgets database."""
    db = ExpensesSessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_auth_db():
    """Yield a session for the users database."""
    db = SignupSessionLocal()
    try:
        yield db
    finally:
        db.close()
