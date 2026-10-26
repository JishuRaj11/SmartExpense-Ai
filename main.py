"""Vercel entrypoint.

Vercel's FastAPI preset looks for a top-level ``app`` in one of the supported
entrypoint files (``main.py``, ``app.py``, ``index.py``, ...). The real
application lives in ``backend.main``; this file re-exports it so the project
can be deployed from the repository root without moving any code.
"""

from backend.main import app

__all__ = ["app"]
