from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr

from .models import AppStatus


# ---- auth ----
class UserCreate(BaseModel):
    email: EmailStr
    password: str


class UserRead(BaseModel):
    id: int
    email: EmailStr
    created_at: datetime


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ---- postings ----
class PostingCreate(BaseModel):
    url: str
    title: str
    company_name: str
    location: Optional[str] = None
    remote: Optional[str] = None
    seniority: Optional[str] = None
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None
    currency: Optional[str] = None
    source: Optional[str] = None
    description: Optional[str] = None
    posted_at: Optional[datetime] = None


class PostingRead(BaseModel):
    id: int
    url: str
    title: str
    company_id: Optional[int]
    location: Optional[str]
    remote: Optional[str]
    seniority: Optional[str]
    salary_min: Optional[int]
    salary_max: Optional[int]
    currency: Optional[str]
    source: Optional[str]
    posted_at: Optional[datetime]
    first_seen_at: datetime
    is_ghost: bool


class PostingLookup(BaseModel):
    """Answer to 'did I already apply to this URL?'"""
    posting: Optional[PostingRead]
    already_applied: bool
    application_id: Optional[int] = None
    status: Optional[AppStatus] = None


# ---- applications ----
class ApplicationCreate(BaseModel):
    posting: PostingCreate
    status: AppStatus = AppStatus.applied
    channel: Optional[str] = None
    resume_version: Optional[str] = None
    referral: Optional[str] = None
    notes: Optional[str] = None
    applied_at: Optional[datetime] = None


class ApplicationUpdate(BaseModel):
    status: Optional[AppStatus] = None
    channel: Optional[str] = None
    resume_version: Optional[str] = None
    referral: Optional[str] = None
    notes: Optional[str] = None


class StatusEventRead(BaseModel):
    status: AppStatus
    at: datetime
    note: Optional[str]


class ApplicationRead(BaseModel):
    id: int
    status: AppStatus
    applied_at: Optional[datetime]
    channel: Optional[str]
    resume_version: Optional[str]
    referral: Optional[str]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime
    posting: PostingRead
    events: List[StatusEventRead] = []


# ---- stats ----
class FunnelStats(BaseModel):
    total: int
    by_status: dict
    response_rate: float  # got past 'applied' / total
    interview_rate: float
    offer_rate: float
    ghost_count: int
