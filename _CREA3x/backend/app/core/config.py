from __future__ import annotations

from typing import List

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # IMPORTANT: read both backend/.env and project-root/.env
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    database_url: str = "sqlite:///./crea3.db"

    cors_origins: str = "http://localhost:5173"

    # ----------------------------
    # Keycloak (OpenID Connect) - the ONLY authentication system.
    # (The old self-signed local JWT + mock-admin token system has been removed.
    #  Admin access is now granted via the Keycloak "admin" realm role.)
    # ----------------------------
    keycloak_url: str = "http://localhost:8080"
    keycloak_realm: str = "crea"
    keycloak_client_id: str = "crea-frontend"

    # URL the BACKEND uses to reach Keycloak for server-to-server calls
    # (JWKS + admin REST). In containers this is the internal service URL
    # (e.g. http://keycloak:8080) while `keycloak_url` stays the PUBLIC issuer
    # URL that browsers use. Falls back to `keycloak_url` when unset.
    keycloak_internal_url: str = Field(
        default="",
        validation_alias=AliasChoices("KEYCLOAK_INTERNAL_URL", "keycloak_internal_url"),
    )

    keycloak_admin_client_id: str = "crea-backend"
    # NOTE: must match the `crea-backend` client secret configured in Keycloak
    # (infra/keycloak/realm-crea.json). Override via env in every environment.
    keycloak_admin_client_secret: str = Field(
        default="",
        validation_alias=AliasChoices("KEYCLOAK_ADMIN_CLIENT_SECRET", "keycloak_admin_client_secret"),
    )
    keycloak_client_secret: str = Field(
        default="",
        validation_alias=AliasChoices("KEYCLOAK_CLIENT_SECRET", "keycloak_client_secret"),
    )

    keycloak_require_verified_email: bool = True

    # When set to a built frontend `dist` directory, the backend also serves the
    # SPA so the app + API share one origin (single-port, like _CREA3).
    frontend_dist_dir: str = Field(
        default="",
        validation_alias=AliasChoices("FRONTEND_DIST_DIR", "frontend_dist_dir"),
    )

    # Email-verification methods offered at registration:
    #   LINK_VERIFY=1 -> send Keycloak's verification link
    #   CODE_VERIFY=1 -> send a 6-digit code (verified via /api/auth/verify-code)
    # If BOTH are 0, no verification is required and the account is auto-verified.
    link_verify: bool = Field(default=True, validation_alias=AliasChoices("LINK_VERIFY", "link_verify"))
    code_verify: bool = Field(default=True, validation_alias=AliasChoices("CODE_VERIFY", "code_verify"))

    # Token lifetime for the email-verification token we mint locally (minutes).
    email_verification_ttl_minutes: int = 60 * 24  # 24h

    # ----------------------------
    # Workflow assistant (locally hosted via Ollama)
    # ----------------------------
    # Base URL of the Ollama server.
    ollama_base_url: str = Field(
        default="http://localhost:11434",
        validation_alias=AliasChoices("OLLAMA_BASE_URL", "ollama_base_url"),
    )
    # The model to use. Change this single value to swap models, e.g.
    #   OLLAMA_MODEL=llama3.2:3b  /  qwen2.5:3b  /  phi3:mini  /  gemma2:2b
    ollama_model: str = Field(
        default="llama3.2:3b",
        validation_alias=AliasChoices("OLLAMA_MODEL", "ollama_model"),
    )
    ollama_timeout_seconds: float = Field(
        default=60.0,
        validation_alias=AliasChoices("OLLAMA_TIMEOUT_SECONDS", "ollama_timeout_seconds"),
    )

    # ----------------------------
    # External "Legal AI Assistant" (RAG service hosted elsewhere).
    # The frontend no longer hardcodes this URL; it is proxied by the backend.
    # ----------------------------
    legal_ai_url: str = Field(
        default="",
        validation_alias=AliasChoices("LEGAL_AI_URL", "legal_ai_url"),
    )
    legal_ai_timeout_seconds: float = Field(
        default=30.0,
        validation_alias=AliasChoices("LEGAL_AI_TIMEOUT_SECONDS", "legal_ai_timeout_seconds"),
    )

    # ----------------------------
    # SMTP (used by backend emails)
    # ----------------------------
    smtp_host: str = Field(default="localhost", validation_alias=AliasChoices("SMTP_HOST", "smtp_host"))
    smtp_port: int = Field(default=1025, validation_alias=AliasChoices("SMTP_PORT", "smtp_port"))
    smtp_user: str = Field(default="", validation_alias=AliasChoices("SMTP_USER", "smtp_user"))
    smtp_pass: str = Field(default="", validation_alias=AliasChoices("SMTP_PASS", "smtp_pass"))
    smtp_from: str = Field(default="no-reply@crea.local", validation_alias=AliasChoices("SMTP_FROM", "smtp_from"))
    smtp_from_name: str = Field(default="CREA3", validation_alias=AliasChoices("SMTP_FROM_NAME", "smtp_from_name"))

    # Support mailbox (where the in-app "Contact support" form is delivered)
    support_email: str = Field(default="", validation_alias=AliasChoices("SUPPORT_EMAIL", "support_email"))

    # Support BOTH SMTP_TLS and SMTP_STARTTLS (your .env uses SMTP_STARTTLS)
    smtp_tls: bool = Field(default=False, validation_alias=AliasChoices("SMTP_TLS", "SMTP_STARTTLS", "smtp_tls"))
    smtp_ssl: bool = Field(default=False, validation_alias=AliasChoices("SMTP_SSL", "smtp_ssl"))

    # ----------------------------
    # Public link for invitations (overridable)
    # ----------------------------
    public_invite_link: str = Field(
        default="http://localhost:5173/app",
        validation_alias=AliasChoices("PUBLIC_INVITE_LINK", "public_invite_link"),
    )
    public_register_link: str = Field(
        default="http://localhost:5173/register",
        validation_alias=AliasChoices("PUBLIC_REGISTER_LINK", "public_register_link"),
    )

    @property
    def keycloak_issuer(self) -> str:
        return f"{self.keycloak_url.rstrip('/')}/realms/{self.keycloak_realm}"

    @property
    def keycloak_api_base(self) -> str:
        """Base URL the backend uses to reach Keycloak (JWKS + admin REST).

        Prefers the internal URL (container network) and falls back to the
        public issuer URL when no internal URL is configured.
        """
        return (self.keycloak_internal_url or self.keycloak_url).rstrip("/")

    @property
    def keycloak_jwks_url(self) -> str:
        return f"{self.keycloak_issuer}/protocol/openid-connect/certs"

    def cors_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
