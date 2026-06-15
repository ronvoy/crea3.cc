from __future__ import annotations

from typing import List

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # IMPORTANT: read both backend/.env and project-root/.env
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    database_url: str = "sqlite:///./crea3.db"

    # Legacy local JWT settings (kept for backwards compatibility).
    jwt_secret: str = "change-me"
    admin_email: str = "admin@example.com"
    admin_password: str = "admin123"
    admin_token_ttl_minutes: int = 60
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    cors_origins: str = "http://localhost:5173"

    chat_upstream_url: str = ""

    # Keycloak (OpenID Connect) settings
    keycloak_url: str = "http://localhost:8080"
    keycloak_realm: str = "crea"
    keycloak_client_id: str = "crea-frontend"

    keycloak_admin_client_id: str = "crea-backend"
    keycloak_admin_client_secret: str = "change-me"

    keycloak_require_verified_email: bool = True

    # ----------------------------
    # SMTP (used by backend emails)
    # ----------------------------
    smtp_host: str = Field(default="localhost", validation_alias=AliasChoices("SMTP_HOST", "smtp_host"))
    smtp_port: int = Field(default=1025, validation_alias=AliasChoices("SMTP_PORT", "smtp_port"))
    smtp_user: str = Field(default="", validation_alias=AliasChoices("SMTP_USER", "smtp_user"))
    smtp_pass: str = Field(default="", validation_alias=AliasChoices("SMTP_PASS", "smtp_pass"))
    smtp_from: str = Field(default="no-reply@crea.local", validation_alias=AliasChoices("SMTP_FROM", "smtp_from"))
    smtp_from_name: str = Field(default="CREA3", validation_alias=AliasChoices("SMTP_FROM_NAME", "smtp_from_name"))

    # Support BOTH SMTP_TLS and SMTP_STARTTLS (your .env uses SMTP_STARTTLS)
    smtp_tls: bool = Field(default=False, validation_alias=AliasChoices("SMTP_TLS", "SMTP_STARTTLS", "smtp_tls"))
    smtp_ssl: bool = Field(default=False, validation_alias=AliasChoices("SMTP_SSL", "smtp_ssl"))

    # ----------------------------
    # DB browser password (endpoint /dbms)
    # ----------------------------
    dbms_pass: str = Field(default="CREA3", validation_alias=AliasChoices("DBMS_PASS", "dbms_pass"))

    # ----------------------------
    # Public link for invitations (HARDCODED default, but overridable)
    # ----------------------------
    public_invite_link: str = Field(
        default="https://crea3.eu/app",
        validation_alias=AliasChoices("PUBLIC_INVITE_LINK", "public_invite_link"),
    )

    @property
    def keycloak_issuer(self) -> str:
        return f"{self.keycloak_url.rstrip('/')}/realms/{self.keycloak_realm}"

    @property
    def keycloak_jwks_url(self) -> str:
        return f"{self.keycloak_issuer}/protocol/openid-connect/certs"

    def cors_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
