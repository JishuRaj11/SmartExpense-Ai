"""SQLAlchemy table definitions.

The models are split over two declarative bases because they live in two
different SQLite files:

    ExpensesBase -> expenses.db   expenses + budgets
    AuthBase     -> signup.db     users

Keeping the bases apart means creating the tables of one database never
creates the tables of the other.
"""

from sqlalchemy import Column, Float, Integer, String
from sqlalchemy.orm import declarative_base


# ---------------- BASE CLASSES ----------------

ExpensesBase = declarative_base()
AuthBase = declarative_base()


# ---------------- EXPENSES + BUDGETS ----------------


class ExpenseModel(ExpensesBase):
    """One expense recorded by a user."""

    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    category = Column(String, nullable=False)
    # Stored as an ISO "YYYY-MM-DD" string. Kept as text so the existing rows in
    # expenses.db stay valid without a migration.
    date = Column(String, nullable=False)
    user_id = Column(Integer, nullable=False, index=True)


class BudgetModel(ExpensesBase):
    """The budget a user set for one month."""

    __tablename__ = "budgets"

    id = Column(Integer, primary_key=True, index=True)
    amount = Column(Float, nullable=False)
    # "YYYY-MM"
    month = Column(String, nullable=False, index=True)
    user_id = Column(Integer, nullable=False, index=True)


# ---------------- USERS ----------------


class SignupModel(AuthBase):
    """A registered account."""

    __tablename__ = "signup"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    gmail = Column(String, nullable=False, unique=True)
    # bcrypt hash, never a plain-text password.
    password = Column(String, nullable=False)
