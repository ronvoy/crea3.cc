"""Database helpers (compatibility module).

Some parts of the codebase import `app.core.db.get_session`.
The project currently keeps the SQLModel engine/session helpers in `app.db`,
so this module re-exports them to avoid import errors.
"""

from ..db import engine, get_session, init_db  # noqa: F401
