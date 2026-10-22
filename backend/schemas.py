"""Request and response models (Pydantic v2).

Every payload the API accepts is validated here, before it reaches the
database. The rules are deliberately strict: a title must not be blank, an
amount must be positive and a month must use the YYYY-MM format.
"""

from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator


# ---------------- AUTH ----------------


class SignupCreate(BaseModel):
    """The body of POST /register."""

    name: str = Field(min_length=2, max_length=80)
    gmail: str = Field(min_length=5, max_length=120)
    password: str = Field(min_length=6, max_length=72)

    def normalized_gmail(self) -> str:
        """Lower-case and trim the address.

        SQLite compares text case-sensitively, so storing the raw address
        allowed the same mailbox to be registered twice (Jis@x.com vs
        jis@x.com).
        """
        return self.gmail.strip().lower()


class LoginCreate(BaseModel):
    """The body of POST /login."""

    gmail: str = Field(min_length=5, max_length=120)
    password: str = Field(min_length=1, max_length=72)

    def normalized_gmail(self) -> str:
        return self.gmail.strip().lower()


# ---------------- EXPENSES ----------------


class ExpenseCreate(BaseModel):
    """The body of POST /expenses."""

    title: str = Field(min_length=1, max_length=120)
    amount: float = Field(gt=0, le=100000000)
    category: str = Field(min_length=1, max_length=40)
    date: date

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Title cannot be blank")
        return cleaned


class ExpenseUpdate(ExpenseCreate):
    """Same payload as create; PUT replaces the whole record."""


# ---------------- BUDGETS ----------------


class BudgetCreate(BaseModel):
    """The body of POST /budget and PUT /budget."""

    amount: float = Field(gt=0, le=100000000)
    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")

    @field_validator("month")
    @classmethod
    def check_month(cls, value: str) -> str:
        try:
            datetime.strptime(value, "%Y-%m")
        except ValueError:
            raise ValueError("Month must use the YYYY-MM format")
        return value


class BudgetAmount(BaseModel):
    """The body of PUT /budget/{month}."""

    amount: float = Field(gt=0, le=100000000)


# ---------------- ML ----------------


class CategoryPredictRequest(BaseModel):
    """The body of POST /predict-category.

    Only the title is needed. The category and the confidence come back from
    the model, so the client never has to send (or guess) one.
    """

    title: str = Field(min_length=1, max_length=120)

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Title cannot be blank")
        return cleaned
