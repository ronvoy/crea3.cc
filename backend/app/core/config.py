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
    email_verification_ttl_minutes: int = 1440

    cors_origins: str = "http://localhost:5173"

    chat_upstream_url: str = ""

    # When set to a built frontend `dist` directory, the backend also serves the
    # SPA so the app + API share one origin (ideal for tunnels / single-port prod).
    frontend_dist_dir: str = Field(
        default="",
        validation_alias=AliasChoices("FRONTEND_DIST_DIR", "frontend_dist_dir"),
    )

    # Keycloak (OpenID Connect) settings
    keycloak_url: str = "http://localhost:8080"
    # Public/browser-facing Keycloak URL. Inside Docker the backend reaches
    # Keycloak at the internal hostname (keycloak_url) but tokens are *issued*
    # with the public URL, so both must be accepted as valid issuers.
    keycloak_public_url: str = Field(
        default="",
        validation_alias=AliasChoices("KEYCLOAK_PUBLIC_URL", "keycloak_public_url"),
    )
    keycloak_realm: str = "crea"
    keycloak_client_id: str = "crea-frontend"
    # crea-frontend is a public client, so this is normally empty. Declared so
    # KeycloakAuth can read it without raising AttributeError.
    keycloak_client_secret: str = ""

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
    dbms_user: str = Field(default="ADMIN", validation_alias=AliasChoices("DBMS_USER", "dbms_user"))
    dbms_pass: str = Field(default="CREA3", validation_alias=AliasChoices("DBMS_PASS", "dbms_pass"))

    # ----------------------------
    # Admin access to /rag (Legal Knowledge Base management)
    # ----------------------------
    admin_user: str = Field(default="ADMIN", validation_alias=AliasChoices("ADMIN_USER", "admin_user"))
    admin_pass: str = Field(default="ADMIN", validation_alias=AliasChoices("ADMIN_PASS", "admin_pass"))

    # ----------------------------
    # Admin panel (/administrator) master credentials
    # ----------------------------
    admin_panel_user: str = Field(
        default="ADMIN",
        validation_alias=AliasChoices("ADMIN_PANEL_USER", "ADMIN-PANEL-USER", "admin_panel_user"),
    )
    admin_panel_pass: str = Field(
        default="ADMIN",
        validation_alias=AliasChoices("ADMIN_PANEL_PASS", "ADMIN-PANEL-PASS", "admin_panel_pass"),
    )

    # ----------------------------
    # Deployment environment (dev|prod) + on-the-fly theme/font (read by frontend)
    # ----------------------------
    deployment_environment: str = Field(
        default="dev",
        validation_alias=AliasChoices("DEPLOYMENT_ENVIRONMENT", "DEPLOYMENT-ENVIRONMENT", "deployment_environment"),
    )
    font_type: str = Field(default="Orbitron", validation_alias=AliasChoices("FONT_TYPE", "FONT-TYPE", "font_type"))
    theme_type: str = Field(default="blue", validation_alias=AliasChoices("THEME_TYPE", "THEME-TYPE", "theme_type"))

    # ----------------------------
    # Legal RAG chatbot (OpenRouter generation; see rag-plan.md)
    # ----------------------------
    openrouter_api_key: str = Field(default="", validation_alias=AliasChoices("OPENROUTER_API_KEY", "openrouter_api_key"))
    openrouter_model: str = Field(
        default="google/gemma-4-31b-it:free",
        validation_alias=AliasChoices("OPENROUTER_MODEL", "openrouter_model"),
    )
    openrouter_base_url: str = Field(
        default="https://openrouter.ai/api/v1",
        validation_alias=AliasChoices("OPENROUTER_BASE_URL", "openrouter_base_url"),
    )
    rag_storage_dir: str = Field(default="./rag_store", validation_alias=AliasChoices("RAG_STORAGE_DIR", "rag_storage_dir"))

    # ----------------------------
    # Google OAuth ("Sign in with Google") — next pipeline
    # ----------------------------
    google_oauth_client_id: str = Field(default="", validation_alias=AliasChoices("GOOGLE_OAUTH_CLIENT_ID", "google_oauth_client_id"))
    google_oauth_client_secret: str = Field(default="", validation_alias=AliasChoices("GOOGLE_OAUTH_CLIENT_SECRET", "google_oauth_client_secret"))
    google_oauth_redirect_uri: str = Field(
        default="http://localhost:8000/api/auth/google/callback",
        validation_alias=AliasChoices("GOOGLE_OAUTH_REDIRECT_URI", "google_oauth_redirect_uri"),
    )

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

    def keycloak_allowed_issuers(self) -> List[str]:
        """All issuer strings a valid token may carry (internal + public URL)."""
        urls = [self.keycloak_url]
        if self.keycloak_public_url:
            urls.append(self.keycloak_public_url)
        issuers = {f"{u.rstrip('/')}/realms/{self.keycloak_realm}" for u in urls if u}
        return sorted(issuers)

    @property
    def keycloak_jwks_url(self) -> str:
        return f"{self.keycloak_issuer}/protocol/openid-connect/certs"

    def cors_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
