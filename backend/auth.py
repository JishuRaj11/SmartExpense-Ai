from fastapi import APIRouter, FastAPI, HTTPException, Depends
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.orm import declarative_base, sessionmaker, Session

from password import hash_password, verify_password, is_bcrypt_hash
from jwt_auth import create_access_token


# ---------------- DATABASE SETUP ----------------

DATABASE_URL = "sqlite:///./signup.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False
)

Base = declarative_base()


# ---------------- DATABASE MODEL ----------------

class SignupModel(Base):
    __tablename__ = "signup"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    gmail = Column(String, nullable=False, unique=True)
    password = Column(String, nullable=False)


# Create the table
Base.metadata.create_all(bind=engine)


# ---------------- PYDANTIC SCHEMAS ----------------

class SignupCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    gmail: str = Field(min_length=5, max_length=120)
    password: str = Field(min_length=6, max_length=72)

    def normalized_gmail(self) -> str:
        """Lower-case and trim the address.

        SQLite compares text case-sensitively, so storing the raw address allowed
        the same mailbox to be registered twice (Jis@x.com vs jis@x.com).
        """
        return self.gmail.strip().lower()


class LoginCreate(BaseModel):
    gmail: str = Field(min_length=5, max_length=120)
    password: str = Field(min_length=1, max_length=72)

    def normalized_gmail(self) -> str:
        return self.gmail.strip().lower()


# ---------------- ROUTER ----------------

# Declared as a router so main.py can mount /register and /login on the same
# app and port. `app` below is kept for running this module on its own.
# No prefix: the paths stay exactly /register and /login.
router = APIRouter(tags=["Authentication"])


# Database dependency
def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()


# ---------------- REGISTER API ----------------

@router.post("/register")
def user_register(
    data: SignupCreate,
    db: Session = Depends(get_db)
):
    gmail = data.normalized_gmail()

    # A value that is not a bcrypt hash is a legacy plaintext row. Allowing a
    # new account would then make the duplicate check depend on that row, so it
    # is treated as already taken.
    existing_user = (
        db.query(SignupModel)
        .filter(SignupModel.gmail == gmail)
        .first()
    )

    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Gmail already exists"
        )

    new_user = SignupModel(
        name=data.name.strip(),
        gmail=gmail,
        password=hash_password(data.password)
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {
        "Message": "User registered successfully",
        "User": {
            "id": new_user.id,
            "name": new_user.name,
            "gmail": new_user.gmail
        }
    }


# ---------------- LOGIN API ----------------

@router.post("/login")
def user_login(
    data: LoginCreate,
    db: Session = Depends(get_db)
):
    gmail = data.normalized_gmail()

    # Find the user by Gmail
    existing_user = (
        db.query(SignupModel)
        .filter(SignupModel.gmail == gmail)
        .first()
    )

    # User does not exist
    if not existing_user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    # Row was created before passwords were hashed, so it can never be matched.
    if not is_bcrypt_hash(existing_user.password):
        raise HTTPException(
            status_code=401,
            detail="Account password was stored in an unsupported format. "
                   "Please contact support or register again."
        )

    # Check the password
    if not verify_password(
        data.password,
        existing_user.password
    ):
        raise HTTPException(
            status_code=401,
            detail="Incorrect password"
        )

    # Create JWT
    token = create_access_token(existing_user.id)

    return {
        "Message": "User login successful",
        "access_token": token,
        "User": {
            "id": existing_user.id,
            "name": existing_user.name,
            "gmail": existing_user.gmail
        }
    }


# ---------------- STANDALONE APP ----------------
# Kept so `uvicorn auth:app` still works while developing this module alone.

app = FastAPI(title="SmartExpenses Auth API")
app.include_router(router)