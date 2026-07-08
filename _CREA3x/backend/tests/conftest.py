"""Pytest configuration shared by all tests.

This runs BEFORE any test module is imported, which matters because the app's
database engine is created from DATABASE_URL at import time. We point it at a
cross-platform temp file so tests never depend on a POSIX /tmp path (that path
resolves to C:\\tmp on Windows and breaks SQLite with "unable to open database
file").
"""
import os
import pathlib
import tempfile

_DB_PATH = pathlib.Path(tempfile.gettempdir()) / "crea_test.db"

# Only set a default if the caller hasn't chosen their own test database.
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_DB_PATH.as_posix()}")
