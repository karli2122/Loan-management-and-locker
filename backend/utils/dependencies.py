"""Reusable FastAPI dependencies for authentication and authorization.

These let routes accept the admin token from the ``Authorization: Bearer``
header (preferred) while still falling back to the legacy ``admin_token`` query
parameter for older app builds. Prefer these over reading ``admin_token`` from
the query string directly.

Usage::

    from fastapi import Depends
    from utils.dependencies import require_admin, require_permission

    @router.get("/loans")
    async def list_loans(admin_id: str = Depends(require_admin)):
        ...

    @router.post("/clients")
    async def create_client(admin_id: str = Depends(require_permission("clients"))):
        ...
"""
from typing import Optional

from fastapi import Header, Query

from utils.auth import extract_token, get_admin_id_from_token
from utils.permissions import check_permission


async def require_admin(
    authorization: Optional[str] = Header(default=None),
    admin_token: Optional[str] = Query(default=None),
) -> str:
    """Resolve and validate the admin token, returning the admin_id.

    Raises AuthenticationException if the token is missing or invalid.
    """
    token = extract_token(authorization, admin_token)
    return await get_admin_id_from_token(token)


def require_permission(permission: str):
    """Build a dependency that enforces a specific RBAC permission.

    Returns the admin_id when the caller's role grants ``permission``.
    """

    async def _dep(
        authorization: Optional[str] = Header(default=None),
        admin_token: Optional[str] = Query(default=None),
    ) -> str:
        token = extract_token(authorization, admin_token)
        return await check_permission(token, permission)

    return _dep
