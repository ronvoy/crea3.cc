from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict,Field


# NOTE:
# This project uses Pydantic v2.
# All response models set `from_attributes=True` so they can be returned
# directly from SQLModel/SQLAlchemy objects.


class _ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# -----------------
# Authentication
# -----------------


class RegisterIn(BaseModel):
    email: str = Field(min_length=1, max_length=254)
    username: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=256)


class RegisterOut(BaseModel):
    # When SMTP is enabled, we still return the token for manual copy/paste
    # (useful in local/dev environments).
    verification_token: str


class VerifyEmailIn(BaseModel):
    token: str = Field(min_length=10)


class LoginIn(BaseModel):
    email: str = Field(min_length=1, max_length=254)
    password: str = Field(min_length=1, max_length=256)


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class RefreshIn(BaseModel):
    refresh_token: str


class ChangePasswordIn(BaseModel):
    old_password: str
    new_password: str = Field(min_length=1, max_length=256)


class UserOut(_ORMModel):
    id: int
    email: str
    username: str
    role: str
    # Keycloak claim
    email_verified: bool = False
    # Backwards-compat field (older frontend zips used this name)
    is_verified: bool | None = None

    def model_post_init(self, __context) -> None:
        if self.is_verified is None:
            self.is_verified = bool(self.email_verified)


# -----------------
# Disputes

# -----------------


class DisputeCreateIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    # keep as string to avoid Pydantic schema issues; validation happens in app logic
    method: str = Field(min_length=1, max_length=40)


class DisputeOut(_ORMModel):
    id: int
    title: str
    method: str
    status: str


# -----------------
# Agents
# -----------------


class AgentAddIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str
    entitlement_share: float = Field(ge=0.0, le=1.0)
    role_in_dispute: Optional[str] = Field(default=None, max_length=120)


class AgentOut(_ORMModel):
    id: int
    name: str
    email: str
    entitlement_share: float
    role_in_dispute: Optional[str] = None


# -----------------
# Goods
# -----------------


class GoodAddIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    estimated_value: float = Field(ge=0.0)
    indivisible: bool = False
    meta: Dict[str, Any] = Field(default_factory=dict)


class GoodOut(_ORMModel):
    id: int
    dispute_id: int
    name: str
    estimated_value: float
    indivisible: bool
    meta: Dict[str, Any] = Field(default_factory=dict)


# -----------------
# Preferences
# -----------------


class PreferenceUpsertIn(BaseModel):
    good_id: int
    bid_amount: Optional[float] = Field(default=None, ge=0.0)
    stars: Optional[int] = Field(default=None, ge=0, le=5)


class PreferenceOut(_ORMModel):
    good_id: int
    bid_amount: Optional[float] = None
    stars: Optional[int] = None


# -----------------
# Proposals
# -----------------


class ProposalOut(_ORMModel):
    id: int
    dispute_id: int
    algorithm_version: str
    outputs: Dict[str, Any] = Field(default_factory=dict)
    metrics: Dict[str, Any] = Field(default_factory=dict)
    explanation: Optional[str] = None
    created_at: datetime


class AcceptIn(BaseModel):
    accepted: bool
    comment: Optional[str] = Field(default=None, max_length=1000)


# -----------------
# Strategy
# -----------------


class StrategyUpsertIn(BaseModel):
    text: str = Field(min_length=1, max_length=20_000)


class StrategyOut(_ORMModel):
    dispute_id: int
    text: str


# -----------------
# Ready
# -----------------


class ReadyIn(BaseModel):
    ready: bool


# -----------------
# Mediation
# -----------------


class MediationSlotCreateIn(BaseModel):
    when: str = Field(min_length=1, max_length=120)


class MediationSlotOut(_ORMModel):
    id: int
    when: str
    agreed_agent_ids: List[int] = Field(default_factory=list)
    confirmed: bool


# -----------------
# Notifications
# -----------------


class NotificationInviteOut(_ORMModel):
    id: int
    dispute_id: int
    email: str
    token: str
    accepted: bool
    created_at: datetime


class InvitationOut(_ORMModel):
    agent_id: int
    dispute_id: int
    dispute_title: str
    invited_as: str
    invite_status: str
    entitlement_share: float
    invited_at: datetime
    invited_by_email: Optional[str] = None
    invited_by_username: Optional[str] = None


class InvitationRespondIn(BaseModel):
    accept: bool
    comment: Optional[str] = Field(default=None, max_length=2000)
