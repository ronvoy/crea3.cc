from __future__ import annotations

from typing import List

from pydantic import AliasChoices, Field, model_validator
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

    # DOMAIN SELECT: the public origin users actually reach, e.g.
    #   APP_PUBLIC_URL=https://crea3.serveousercontent.com
    # Builds every link we hand out (password reset, Keycloak's verification
    # link, invitation/registration links) and is added to CORS. When empty the
    # links fall back to the incoming request's Origin/Host (local dev).
    app_public_url: str = Field(
        default="",
        validation_alias=AliasChoices("APP_PUBLIC_URL", "app_public_url"),
    )

    # When set to a built frontend `dist` directory, the backend also serves the
    # SPA so the app + API share one origin (single-port, like _CREA3).
    frontend_dist_dir: str = Field(
        default="",
        validation_alias=AliasChoices("FRONTEND_DIST_DIR", "frontend_dist_dir"),
    )

    # ----------------------------
    # Admin panel (/admin -> /admin/dashboard) — a standalone login that does NOT
    # depend on Keycloak. Credentials live ONLY here (server-side); they are never
    # sent to the browser. Sign-in returns a short-lived signed JWT.
    # ----------------------------
    admin_email: str = Field(default="", validation_alias=AliasChoices("ADMIN_EMAIL", "admin_email"))
    admin_password: str = Field(default="", validation_alias=AliasChoices("ADMIN_PASSWORD", "admin_password"))
    # Secret used to sign admin-panel tokens. MUST be set to a long random value;
    # when empty the panel refuses to issue tokens rather than using a guessable
    # default (a forgeable admin token is worse than a disabled panel).
    admin_jwt_secret: str = Field(
        default="",
        validation_alias=AliasChoices("ADMIN_JWT_SECRET", "admin_jwt_secret"),
    )
    admin_session_minutes: int = Field(
        default=120,
        validation_alias=AliasChoices("ADMIN_SESSION_MINUTES", "admin_session_minutes"),
    )

    # ----------------------------
    # Self-contained auth (no Keycloak). The app issues its own HS256 JWTs.
    # ----------------------------
    # Signs user session tokens. MUST be a long random value in production.
    jwt_secret: str = Field(
        default="dev-jwt-secret-change-me",
        validation_alias=AliasChoices("JWT_SECRET", "jwt_secret"),
    )
    # Session timeout: how long an access token is valid (minutes).
    access_token_expire_minutes: int = Field(
        default=60 * 24,  # 24h
        validation_alias=AliasChoices(
            "JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "ACCESS_TOKEN_EXPIRE_MINUTES", "access_token_expire_minutes"
        ),
    )
    refresh_token_expire_days: int = Field(
        default=7,
        validation_alias=AliasChoices(
            "JWT_REFRESH_TOKEN_EXPIRE_DAYS", "REFRESH_TOKEN_EXPIRE_DAYS", "refresh_token_expire_days"
        ),
    )
    # "dev" surfaces one-time codes in API responses to ease local testing.
    deployment_environment: str = Field(
        default="prod",
        validation_alias=AliasChoices("DEPLOYMENT_ENVIRONMENT", "ENVIRONMENT", "deployment_environment"),
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
    # Base URL of the PRIMARY LLM endpoint (Ollama-native `/api/chat`). This is
    # the address of your Ollama server OR any custom Ollama-compatible endpoint;
    # set it once in .env. Every assistant request goes here first and only falls
    # back to OpenRouter (Mistral) when this endpoint is empty/unreachable/errors.
    # `PRIMARY_LLM_URL` is the preferred name; `OLLAMA_BASE_URL` is kept as an alias.
    ollama_base_url: str = Field(
        default="http://localhost:11434",
        validation_alias=AliasChoices("PRIMARY_LLM_URL", "OLLAMA_BASE_URL", "ollama_base_url"),
    )
    # The model to use on the primary endpoint. Change this single value to swap
    # models, e.g. OLLAMA_MODEL=llama3.2:3b / qwen2.5:3b / phi3:mini / gemma2:2b.
    # `PRIMARY_LLM_MODEL` is accepted as an alias.
    ollama_model: str = Field(
        default="llama3.2:3b",
        validation_alias=AliasChoices("PRIMARY_LLM_MODEL", "OLLAMA_MODEL", "ollama_model"),
    )
    ollama_timeout_seconds: float = Field(
        default=60.0,
        validation_alias=AliasChoices("OLLAMA_TIMEOUT_SECONDS", "ollama_timeout_seconds"),
    )
    # Max tokens an answer may generate. Bounds generation time so a long reply
    # can't overrun a tunnel/proxy response window (which shows up as a 502).
    # Applies to both the primary (Ollama) and the OpenRouter fallback.
    assistant_max_tokens: int = Field(
        default=1500,
        validation_alias=AliasChoices("ASSISTANT_MAX_TOKENS", "assistant_max_tokens"),
    )

    # ----------------------------
    # OpenRouter — hosted FALLBACK for the workflow assistant.
    # Ollama above is always tried first; these are used only when the Ollama
    # endpoint is unreachable. Leave OPENROUTER_API_KEY empty to disable the
    # fallback entirely (behaviour is then unchanged).
    # ----------------------------
    openrouter_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("OPENROUTER_API_KEY", "openrouter_api_key"),
    )
    openrouter_base_url: str = Field(
        default="https://openrouter.ai/api/v1",
        validation_alias=AliasChoices("OPENROUTER_BASE_URL", "openrouter_base_url"),
    )
    # Free models end in ":free" (https://openrouter.ai/models). Prefer one with
    # CONSISTENT latency: behind a tunnel a slow reply is cut off by the proxy
    # and the widget only shows "offline".
    openrouter_model: str = Field(
        default="mistralai/ministral-8b-2512",
        validation_alias=AliasChoices("OPENROUTER_MODEL", "openrouter_model"),
    )
    # Toggle the local Ollama primary. Set USE_OLLAMA=false while no local model is
    # running so requests skip Ollama and go straight to the OpenRouter fallback;
    # set it back to true (the default) once the local endpoint is available again.
    use_ollama: bool = Field(
        default=True,
        validation_alias=AliasChoices("USE_OLLAMA", "use_ollama"),
    )
    # Tunnel-cap mode. When true, the assistant widget uses the background-job +
    # polling delivery (every request sub-second) so a reverse-proxy/tunnel that
    # caps request DURATION can't cut a long answer. Set false (e.g. behind a
    # Cloudflare tunnel with no short cap) to use the smoother SSE streaming.
    tunnel_cap: bool = Field(
        default=True,
        validation_alias=AliasChoices("TUNNEL_CAP", "tunnel_cap"),
    )
    # Keep BELOW the tunnel/proxy timeout so a slow model fails fast with a clear
    # message instead of hanging until the proxy kills the connection.
    openrouter_timeout_seconds: float = Field(
        default=25.0,
        validation_alias=AliasChoices("OPENROUTER_TIMEOUT_SECONDS", "openrouter_timeout_seconds"),
    )
    # Optional attribution headers (OpenRouter rankings); safe to leave empty.
    openrouter_site_url: str = Field(
        default="",
        validation_alias=AliasChoices("OPENROUTER_SITE_URL", "openrouter_site_url"),
    )
    openrouter_app_name: str = Field(
        default="CREA3",
        validation_alias=AliasChoices("OPENROUTER_APP_NAME", "openrouter_app_name"),
    )
    # Knowledge-Base embeddings model, requested THROUGH OpenRouter using the same
    # OPENROUTER_API_KEY (OpenAI-compatible POST /embeddings). If OpenRouter does
    # not serve embeddings for this key/model, retrieval falls back to BM25.
    # You can also point EMBEDDINGS_BASE_URL / EMBEDDINGS_API_KEY at any other
    # OpenAI-compatible embeddings provider; both default to the OpenRouter values.
    embeddings_model: str = Field(
        default="openai/text-embedding-3-small",
        validation_alias=AliasChoices("OPENROUTER_EMBED_MODEL", "EMBEDDINGS_MODEL", "embeddings_model"),
    )
    embeddings_base_url: str = Field(
        default="",
        validation_alias=AliasChoices("EMBEDDINGS_BASE_URL", "embeddings_base_url"),
    )
    embeddings_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("EMBEDDINGS_API_KEY", "embeddings_api_key"),
    )

    # Legal AI Assistant fallback model. The Legal tab tries Ollama first (like the
    # Workflow assistant) and, when Ollama is unreachable, falls back to OpenRouter
    # PINNED to Mistral (instead of the Workflow assistant's rotating free list).
    legal_openrouter_model: str = Field(
        default="mistralai/ministral-8b-2512",
        validation_alias=AliasChoices("LEGAL_OPENROUTER_MODEL", "legal_openrouter_model"),
    )

    # ----------------------------
    # Google Gemini — used for Knowledge-Base embeddings (RAG) and, later, voice
    # transcription (STT) and speech synthesis (TTS). Leave GEMINI_API_KEY empty
    # to disable: KB retrieval then falls back to BM25 and voice stays off.
    # ----------------------------
    gemini_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("GEMINI_API_KEY", "gemini_api_key"),
    )
    gemini_base_url: str = Field(
        default="https://generativelanguage.googleapis.com/v1beta",
        validation_alias=AliasChoices("GEMINI_BASE_URL", "gemini_base_url"),
    )
    gemini_stt_model: str = Field(
        default="gemini-2.5-flash",
        validation_alias=AliasChoices("GEMINI_STT_MODEL", "gemini_stt_model"),
    )
    gemini_tts_model: str = Field(
        default="gemini-2.5-flash-preview-tts",
        validation_alias=AliasChoices("GEMINI_TTS_MODEL", "gemini_tts_model"),
    )
    gemini_tts_voice: str = Field(
        default="Kore",
        validation_alias=AliasChoices("GEMINI_TTS_VOICE", "gemini_tts_voice"),
    )
    gemini_timeout_seconds: float = Field(
        default=45.0,
        validation_alias=AliasChoices("GEMINI_TIMEOUT_SECONDS", "gemini_timeout_seconds"),
    )

    # ----------------------------
    # Speech-to-text (voice input). OpenRouter has NO audio API, so STT uses
    # either a configurable OpenAI-compatible /audio/transcriptions endpoint
    # (Groq free Whisper, OpenAI, or self-hosted) OR Gemini (GEMINI_API_KEY).
    # When neither is set, the browser's Web Speech API is used client-side.
    # ----------------------------
    stt_base_url: str = Field(
        default="",
        validation_alias=AliasChoices("STT_BASE_URL", "stt_base_url"),
    )
    stt_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("STT_API_KEY", "stt_api_key"),
    )
    stt_model: str = Field(
        default="whisper-1",
        validation_alias=AliasChoices("STT_MODEL", "stt_model"),
    )

    # ----------------------------
    # Text-to-speech (spoken answers). Configurable OpenAI-compatible
    # /audio/speech endpoint — works with a self-hosted Kokoro (Kokoro-FastAPI),
    # OpenAI, or others. When unset, the browser's speechSynthesis is used.
    # ----------------------------
    tts_base_url: str = Field(
        default="",
        validation_alias=AliasChoices("TTS_BASE_URL", "tts_base_url"),
    )
    tts_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("TTS_API_KEY", "tts_api_key"),
    )
    tts_model: str = Field(
        default="kokoro",
        validation_alias=AliasChoices("TTS_MODEL", "tts_model"),
    )
    tts_voice: str = Field(
        default="af_bella",
        validation_alias=AliasChoices("TTS_VOICE", "tts_voice"),
    )
    tts_format: str = Field(
        default="mp3",
        validation_alias=AliasChoices("TTS_FORMAT", "tts_format"),
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

    # Support mailbox: in-app "Contact support" is delivered TO support_email,
    # sent FROM support_from (using the SMTP credentials above).
    support_email: str = Field(default="support@crea3.cc", validation_alias=AliasChoices("SUPPORT_EMAIL", "support_email"))
    support_from: str = Field(default="info@crea3.cc", validation_alias=AliasChoices("SUPPORT_FROM", "support_from"))
    support_from_name: str = Field(default="CREA3 Support", validation_alias=AliasChoices("SUPPORT_FROM_NAME", "support_from_name"))
    # IMAP credentials for the support@ mailbox (admin Mail tab 2nd account).
    support_imap_host: str = Field(default="", validation_alias=AliasChoices("SUPPORT_IMAP_HOST", "support_imap_host"))
    support_imap_user: str = Field(default="", validation_alias=AliasChoices("SUPPORT_IMAP_USER", "SUPPORT_SMTP_USER", "support_imap_user"))
    support_imap_pass: str = Field(default="", validation_alias=AliasChoices("SUPPORT_IMAP_PASS", "SUPPORT_SMTP_PASS", "support_imap_pass"))

    # Support BOTH SMTP_TLS and SMTP_STARTTLS (your .env uses SMTP_STARTTLS)
    smtp_tls: bool = Field(default=False, validation_alias=AliasChoices("SMTP_TLS", "SMTP_STARTTLS", "smtp_tls"))
    smtp_ssl: bool = Field(default=False, validation_alias=AliasChoices("SMTP_SSL", "smtp_ssl"))

    # Deployer sidecar (admin panel → System → CI/CD); set by run_be.sh.
    deployer_url: str = Field(default="", validation_alias=AliasChoices("DEPLOYER_URL", "deployer_url"))
    deployer_token: str = Field(default="", validation_alias=AliasChoices("DEPLOYER_TOKEN", "deployer_token"))

    # UI customisation master switch (default when the admin has not set it in
    # the panel): 1 = visitors may edit fonts/colours/animations in the side
    # dock; 0 = only language / light-dark / presets published by the admin.
    ui_customization: bool = Field(default=True, validation_alias=AliasChoices("UI_CUSTOMIZATION", "VITE_UI_CUSTOMIZATION", "ui_customization"))

    # Price guardrails: JSON list of [upper_bound_exclusive, tolerance] pairs
    # (see core/guardrails.py). Empty = built-in default slabs.
    price_guardrail_slabs: str = Field(default="", validation_alias=AliasChoices("PRICE_GUARDRAIL_SLABS", "price_guardrail_slabs"))

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

    @model_validator(mode="after")
    def _derive_public_links(self) -> "Settings":
        """Point the emailed invite/register links at APP_PUBLIC_URL.

        Only fills links the environment did not set explicitly, so an override
        still wins. Without APP_PUBLIC_URL the defaults are kept unchanged.
        """
        base = (self.app_public_url or "").strip().rstrip("/")
        if base:
            if "public_invite_link" not in self.model_fields_set:
                self.public_invite_link = f"{base}/app"
            if "public_register_link" not in self.model_fields_set:
                self.public_register_link = f"{base}/register"
        return self

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
        origins = [o.strip() for o in self.cors_origins.split(",") if o.strip()]
        # The selected public domain is always allowed, so switching
        # APP_PUBLIC_URL never requires editing CORS_ORIGINS too.
        base = (self.app_public_url or "").strip().rstrip("/")
        if base and "*" not in origins and base not in origins:
            origins.append(base)
        return origins


settings = Settings()
