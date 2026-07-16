from __future__ import annotations

from dataclasses import dataclass

import httpx

from .config import settings


class KeycloakError(RuntimeError):
    """Base exception for Keycloak integration errors."""


class KeycloakAuthError(KeycloakError):
    """Raised when Keycloak authentication/admin operations fail."""
    pass


class KeycloakConnectionError(KeycloakError):
    """Raised when Keycloak cannot be reached (network/connection problems)."""
    pass


class KeycloakUnexpectedResponse(KeycloakError):
    """Raised when Keycloak returns an unexpected HTTP status or payload."""
    pass


@dataclass
class TokenPair:
    access_token: str
    refresh_token: str | None = None
    expires_in: int | None = None


class KeycloakAdmin:
    """Thin wrapper around the Keycloak Admin API.

    Uses client credentials (service account) to manage users.
    """

    def __init__(self) -> None:
        if not settings.keycloak_admin_client_id or not settings.keycloak_admin_client_secret:
            raise RuntimeError(
                "KEYCLOAK_ADMIN_CLIENT_ID/KEYCLOAK_ADMIN_CLIENT_SECRET are required for admin operations"
            )

        self._token_url = (
            f"{settings.keycloak_api_base}/realms/{settings.keycloak_realm}/protocol/openid-connect/token"
        )
        self._admin_base = f"{settings.keycloak_api_base}/admin/realms/{settings.keycloak_realm}"

    @classmethod
    def from_settings(cls, _settings: object | None = None) -> "KeycloakAdmin":
        """Create an instance from settings.

        This is a small compatibility shim: some parts of the codebase
        (and older zips) call `KeycloakAdmin.from_settings(settings)`.
        The wrapper already reads configuration from `app.core.config.settings`,
        so we can safely ignore the passed argument.
        """
        return cls()

    def _client(self) -> httpx.Client:
        return httpx.Client(timeout=15.0)

    def _get_admin_access_token(self) -> str:
        try:
            with self._client() as client:
                r = client.post(
                    self._token_url,
                    data={
                        "grant_type": "client_credentials",
                        "client_id": settings.keycloak_admin_client_id,
                        "client_secret": settings.keycloak_admin_client_secret,
                    },
                )
        except httpx.ConnectError:
            raise KeycloakConnectionError(
                f"Cannot connect to Keycloak token endpoint at {self._token_url}. Is Keycloak running and reachable?"
            )
        except httpx.RequestError:
            raise KeycloakConnectionError(
                f"Request to Keycloak token endpoint failed ({self._token_url})."
            )

        if r.status_code >= 400:
            raise KeycloakAuthError(f"Failed to obtain admin token: {r.status_code} {r.text}")

        data = r.json()
        token = data.get("access_token")
        if not token:
            raise KeycloakUnexpectedResponse(
                "Keycloak token endpoint did not return an access_token."
            )
        return token

    def _headers(self) -> dict[str, str]:
        token = self._get_admin_access_token()
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # ---------------------------------------------------------------------
    # Existing methods (kept for compatibility)
    # ---------------------------------------------------------------------

    def create_user(
        self,
        *,
        email: str,
        username: str,
        password: str,
        enabled: bool = True,
        email_verified: bool = False,
        first_name: str | None = None,
        last_name: str | None = None,
    ) -> str:
        # Keycloak 24's user-profile requires firstName/lastName; without them the
        # direct-grant login fails with "Account is not fully set up" (which the UI
        # mislabels as unverified). Derive sensible defaults when not provided.
        local = (email.split("@", 1)[0] if email else username) or "user"
        payload = {
            "username": username,
            "email": email,
            "firstName": first_name or local,
            "lastName": last_name or "User",
            "enabled": enabled,
            "emailVerified": email_verified,
            "credentials": [
                {
                    "type": "password",
                    "value": password,
                    "temporary": False,
                }
            ],
        }

        with self._client() as client:
            r = client.post(
                f"{self._admin_base}/users",
                headers=self._headers(),
                json=payload,
            )

        if r.status_code == 409:
            raise KeycloakAuthError("A user with this email/username already exists")
        if r.status_code >= 400:
            raise KeycloakAuthError(f"Failed to create user: {r.status_code} {r.text}")

        location = r.headers.get("Location", "")
        if not location:
            raise KeycloakAuthError("Keycloak did not return user Location header")
        return location.rstrip("/").split("/")[-1]

    def enable_and_verify_email(self, user_id: str) -> None:
        # Partial update is accepted by Keycloak.
        payload = {"enabled": True, "emailVerified": True}
        with self._client() as client:
            r = client.put(
                f"{self._admin_base}/users/{user_id}",
                headers=self._headers(),
                json=payload,
            )
        if r.status_code >= 400:
            raise KeycloakAuthError(f"Failed to update user: {r.status_code} {r.text}")

    def get_user(self, user_id: str) -> dict:
        """Fetch the full user representation (includes attributes)."""
        with self._client() as client:
            r = client.get(f"{self._admin_base}/users/{user_id}", headers=self._headers())
        if r.status_code >= 400:
            raise KeycloakAuthError(f"Failed to read user: {r.status_code} {r.text}")
        return r.json() or {}

    def set_user_attributes(self, user_id: str, attributes: dict[str, list[str]]) -> None:
        """Set (replace) the user's custom attributes map. Used to hold the
        6-digit email-verification code alongside Keycloak's own link flow."""
        with self._client() as client:
            r = client.put(
                f"{self._admin_base}/users/{user_id}",
                headers=self._headers(),
                json={"attributes": attributes},
            )
        if r.status_code >= 400:
            raise KeycloakAuthError(f"Failed to set user attributes: {r.status_code} {r.text}")

    def send_verify_email(
        self,
        user_id: str,
        *,
        client_id: str | None = None,
        redirect_uri: str | None = None,
    ) -> None:
        """Trigger Keycloak to send a verification email to the user.

        Notes:
        - Requires SMTP configured in the realm (this project uses Mailpit in docker-compose).
        - Keycloak returns 204 on success.
        """
        params: dict[str, str] = {}
        if client_id:
            params["client_id"] = client_id
        if redirect_uri:
            params["redirect_uri"] = redirect_uri

        with self._client() as client:
            r = client.put(
                f"{self._admin_base}/users/{user_id}/send-verify-email",
                headers=self._headers(),
                params=params or None,
            )
        if r.status_code >= 400:
            raise KeycloakAuthError(
                f"Failed to send verification email: {r.status_code} {r.text}"
            )

    def update_password(self, user_id: str, new_password: str) -> None:
        payload = {"type": "password", "value": new_password, "temporary": False}
        with self._client() as client:
            r = client.put(
                f"{self._admin_base}/users/{user_id}/reset-password",
                headers=self._headers(),
                json=payload,
            )
        if r.status_code >= 400:
            raise KeycloakAuthError(f"Failed to reset password: {r.status_code} {r.text}")

    def delete_user(self, user_id: str) -> None:
        with self._client() as client:
            r = client.delete(
                f"{self._admin_base}/users/{user_id}",
                headers=self._headers(),
            )
        if r.status_code >= 400:
            raise KeycloakAuthError(f"Failed to delete user: {r.status_code} {r.text}")

    def find_user_by_email(self, email: str) -> dict | None:
        with self._client() as client:
            r = client.get(
                f"{self._admin_base}/users",
                headers=self._headers(),
                params={"email": email, "exact": "true"},
            )
        if r.status_code >= 400:
            raise KeycloakAuthError(f"Failed to find user: {r.status_code} {r.text}")
        users = r.json() or []
        return users[0] if users else None

    def is_user_enabled(self, user_id: str) -> bool:
        with self._client() as client:
            r = client.get(
                f"{self._admin_base}/users/{user_id}",
                headers=self._headers(),
            )
        if r.status_code >= 400:
            raise KeycloakAuthError(f"Failed to read user: {r.status_code} {r.text}")
        return bool(r.json().get("enabled"))

    # ---------------------------------------------------------------------
    # New methods: role assignment + invite email via execute-actions-email
    # ---------------------------------------------------------------------

    def create_user_without_password(self, *, email: str, username: str, enabled: bool = True) -> str:
        """Create a Keycloak user without setting a password.

        Password will be set by Keycloak required-action (UPDATE_PASSWORD).
        """
        payload = {
            "username": username,
            "email": email,
            "enabled": enabled,
            "emailVerified": False,
        }

        with self._client() as client:
            r = client.post(
                f"{self._admin_base}/users",
                headers=self._headers(),
                json=payload,
            )

        if r.status_code == 409:
            raise KeycloakAuthError("A user with this email/username already exists")
        if r.status_code >= 400:
            raise KeycloakAuthError(f"Failed to create user: {r.status_code} {r.text}")

        location = r.headers.get("Location", "")
        if not location:
            raise KeycloakAuthError("Keycloak did not return user Location header")
        return location.rstrip("/").split("/")[-1]

    def _get_realm_role_representation(self, role_name: str) -> dict:
        with self._client() as client:
            r = client.get(
                f"{self._admin_base}/roles/{role_name}",
                headers=self._headers(),
            )
        if r.status_code == 404:
            raise KeycloakAuthError(f"Realm role not found: {role_name}")
        if r.status_code >= 400:
            raise KeycloakAuthError(f"Failed to read realm role: {r.status_code} {r.text}")
        role = r.json()
        if not isinstance(role, dict) or "name" not in role:
            raise KeycloakUnexpectedResponse("Invalid realm role representation from Keycloak.")
        return role

    def assign_realm_role(self, user_id: str, role_name: str) -> None:
        """Assign a realm role (e.g. agent/mediator) to a user."""
        role = self._get_realm_role_representation(role_name)
        with self._client() as client:
            r = client.post(
                f"{self._admin_base}/users/{user_id}/role-mappings/realm",
                headers=self._headers(),
                json=[role],
            )
        if r.status_code >= 400:
            raise KeycloakAuthError(f"Failed to assign realm role: {r.status_code} {r.text}")

    def execute_actions_email(
        self,
        user_id: str,
        *,
        actions: list[str],
        client_id: str | None = None,
        redirect_uri: str | None = None,
    ) -> None:
        """Send an email containing required actions (UPDATE_PASSWORD, VERIFY_EMAIL, etc.).

        Keycloak endpoint: PUT /users/{id}/execute-actions-email
        """
        params: dict[str, str] = {}
        if client_id:
            params["client_id"] = client_id
        if redirect_uri:
            params["redirect_uri"] = redirect_uri

        with self._client() as client:
            r = client.put(
                f"{self._admin_base}/users/{user_id}/execute-actions-email",
                headers=self._headers(),
                params=params or None,
                json=actions,
            )
        if r.status_code >= 400:
            raise KeycloakAuthError(f"Failed to send execute-actions-email: {r.status_code} {r.text}")

    def ensure_user_with_role_and_invite(
        self,
        *,
        email: str,
        role_name: str,
        username: str | None = None,
        client_id: str | None = None,
        redirect_uri: str | None = None,
        actions: list[str] | None = None,
    ) -> str:
        """Ensure user exists, has realm role, then send invite email (required actions)."""
        u = self.find_user_by_email(email)
        if u and isinstance(u, dict):
            user_id = u.get("id")
            if not user_id:
                raise KeycloakUnexpectedResponse("Keycloak user payload missing id")
        else:
            user_id = self.create_user_without_password(
                email=email,
                username=username or email,
                enabled=True,
            )

        # role assignment
        self.assign_realm_role(user_id, role_name)

        # invite email
        self.execute_actions_email(
            user_id,
            actions=actions or ["UPDATE_PASSWORD", "VERIFY_EMAIL"],
            client_id=client_id,
            redirect_uri=redirect_uri,
        )
        return user_id

    # ---------------------------------------------------------------------
    # Additional helpers (used by account management endpoints)
    # ---------------------------------------------------------------------

    def password_grant(self, username: str, password: str, *, client_id: str | None = None) -> TokenPair:
        """Obtain a token using Resource Owner Password Credentials.

        This is used only to *validate* a user's current password for the
        `/api/users/me/password` endpoint. It requires Direct Access Grants
        enabled on the selected client in Keycloak.
        """
        cid = client_id or settings.keycloak_client_id
        with self._client() as client:
            r = client.post(
                self._token_url,
                data={
                    "grant_type": "password",
                    "client_id": cid,
                    "username": username,
                    "password": password,
                },
            )
        if r.status_code >= 400:
            raise KeycloakAuthError("Invalid credentials")
        data = r.json()
        return TokenPair(
            access_token=data.get("access_token", ""),
            refresh_token=data.get("refresh_token"),
            expires_in=data.get("expires_in"),
        )

    def set_user_password(self, user_id: str, new_password: str) -> None:
        """Alias used by older parts of the codebase."""
        self.update_password(user_id, new_password)

    def update_user_email(self, user_id: str, email: str) -> None:
        payload = {"email": email, "emailVerified": False}
        with self._client() as client:
            r = client.put(
                f"{self._admin_base}/users/{user_id}",
                headers=self._headers(),
                json=payload,
            )
        if r.status_code >= 400:
            raise KeycloakAuthError(f"Failed to update email: {r.status_code} {r.text}")

    def get_user_id_by_email(self, email: str) -> str | None:
        u = self.find_user_by_email(email)
        return u.get("id") if u else None


class KeycloakAuth:
    """Wrapper around Keycloak token endpoint for resource-owner/password auth."""

    def __init__(self) -> None:
        self._token_url = (
            f"{settings.keycloak_api_base}/realms/{settings.keycloak_realm}/protocol/openid-connect/token"
        )
        self._client_id = settings.keycloak_client_id
        self._client_secret = settings.keycloak_client_secret

    @classmethod
    def from_settings(cls, _settings: object | None = None) -> "KeycloakAuth":
        """Compatibility helper for older code paths."""
        return cls()

    def _client(self) -> httpx.Client:
        return httpx.Client(timeout=15.0)

    def password_grant(self, *, username: str, password: str) -> TokenPair:
        data = {
            "grant_type": "password",
            "client_id": self._client_id,
            "username": username,
            "password": password,
            "scope": "openid profile email",
        }
        if self._client_secret:
            data["client_secret"] = self._client_secret
        try:
            with self._client() as client:
                r = client.post(self._token_url, data=data)
        except httpx.ConnectError:
            raise KeycloakConnectionError(
                f"Cannot connect to Keycloak token endpoint at {self._token_url}. Is Keycloak running and reachable?"
            )
        except httpx.RequestError:
            raise KeycloakConnectionError(
                f"Request to Keycloak token endpoint failed ({self._token_url})."
            )

        if r.status_code >= 400:
            # Keycloak commonly returns 400 invalid_grant for wrong credentials/disabled user.
            raise KeycloakAuthError(r.text)
        j = r.json()
        return TokenPair(
            access_token=j.get("access_token"),
            refresh_token=j.get("refresh_token"),
            expires_in=j.get("expires_in"),
        )

    def refresh(self, *, refresh_token: str) -> TokenPair:
        data = {
            "grant_type": "refresh_token",
            "client_id": self._client_id,
            "refresh_token": refresh_token,
        }
        if self._client_secret:
            data["client_secret"] = self._client_secret
        try:
            with self._client() as client:
                r = client.post(self._token_url, data=data)
        except httpx.ConnectError:
            raise KeycloakConnectionError(
                f"Cannot connect to Keycloak token endpoint at {self._token_url}. Is Keycloak running and reachable?"
            )
        except httpx.RequestError:
            raise KeycloakConnectionError(
                f"Request to Keycloak token endpoint failed ({self._token_url})."
            )

        if r.status_code >= 400:
            raise KeycloakAuthError(r.text)
        j = r.json()
        return TokenPair(
            access_token=j.get("access_token"),
            refresh_token=j.get("refresh_token"),
            expires_in=j.get("expires_in"),
        )
