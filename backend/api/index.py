import importlib.util
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent   # the backend/ folder

# Make `ml` importable (it sits next to main.py)
sys.path.insert(0, str(HERE))

# Register this folder as a package called "backend" so `from . import config` works
spec = importlib.util.spec_from_file_location(
    "backend",
    HERE / "__init__.py",
    submodule_search_locations=[str(HERE)],
)
pkg = importlib.util.module_from_spec(spec)
sys.modules["backend"] = pkg
spec.loader.exec_module(pkg)

from backend.main import app  # noqa: E402