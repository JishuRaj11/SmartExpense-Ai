"""Registration and login.

Both endpoints live on a router (instead of a second FastAPI app) so they are
mounted on the same application and port as the rest of the API. A separate
app was never mounted, which made /login and /register unreachable.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .database import get_auth_db
from .jwt_auth import create_access_token
from .models import SignupModel
from .password import hash_password, is_bcrypt_hash, verify_password
from .schemas import LoginCreate, SignupCreate


# Declared as a router so main.py can mount /register and /login on the same
# app and port. No prefix: the paths stay exactly /register and /login.
router = APIRouter(tags=["Authentication"])


# ---------------- REGISTER API ----------------


@router.post("/register")
def user_register(
    data: SignupCreate,
    db: Session = Depends(get_auth_db),
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
            detail="Gmail already exists",
        )

    new_user = SignupModel(
        name=data.name.strip(),
        gmail=gmail,
        password=hash_password(data.password),
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {
        "Message": "User registered successfully",
        "User": {
            "id": new_user.id,
            "name": new_user.name,
            "gmail": new_user.gmail,
        },
    }


# ---------------- LOGIN API ----------------


@router.post("/login")
def user_login(
    data: LoginCreate,
    db: Session = Depends(get_auth_db),
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
            detail="User not found",
        )

    # Row was created before passwords were hashed, so it can never be matched.
    if not is_bcrypt_hash(existing_user.password):
        raise HTTPException(
            status_code=401,
            detail="Account password was stored in an unsupported format. "
                   "Please contact support or register again.",
        )

    # Check the password
    if not verify_password(
        data.password,
        existing_user.password,
    ):
        raise HTTPException(
            status_code=401,
            detail="Incorrect password",
        )

    # Create JWT
    token = create_access_token(existing_user.id)

    return {
        "Message": "User login successful",
        "access_token": token,
        "User": {
            "id": existing_user.id,
            "name": existing_user.name,
            "gmail": existing_user.gmail,
        },
    }
