from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./crea3.db"

    # Legacy local JWT settings (kept for backwards compatibility).
    jwt_secret: str = "change-me"
    # NOTE: `email-validator` rejects `.local` special-use domains by default,
    # which would make the admin login body fail validation (422).
    admin_email: str = "admin@example.com"
    admin_password: str = "admin123"
    admin_token_ttl_minutes: int = 60
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    cors_origins: str = "http://localhost:5173"

    # Optional: external chat service endpoint (POST {question})
    chat_upstream_url: str = ""

    # Keycloak (OpenID Connect) settings
    keycloak_url: str = "http://localhost:8080"
    keycloak_realm: str = "crea"
    # Public client used for end-user login (Direct Access Grants enabled)
    keycloak_client_id: str = "crea-frontend"

    # Confidential client with Service Account enabled, used by the backend to:
    # - create users
    # - enable users after email verification
    keycloak_admin_client_id: str = "crea-backend"
    keycloak_admin_client_secret: str = "change-me"

    # If true, reject API calls when token has email_verified=false
    keycloak_require_verified_email: bool = True

    # SMTP settings (used to send verification emails during registration)
    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_user: str = ""
    smtp_pass: str = ""
    smtp_from: str = "no-reply@crea.local"
    smtp_tls: bool = False
    smtp_ssl: bool = False

    @property
    def keycloak_issuer(self) -> str:
        return f"{self.keycloak_url.rstrip('/')}/realms/{self.keycloak_realm}"

    @property
    def keycloak_jwks_url(self) -> str:
        return f"{self.keycloak_issuer}/protocol/openid-connect/certs"

    def cors_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
