from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr

from .models import AppStatus, Priority


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
    url: Optional[str] = None
    title: str
    company_name: str
    location: Optional[str] = None
    country: Optional[str] = None
    remote: Optional[str] = None
    seniority: Optional[str] = None
    industry: Optional[str] = None
    commitment: Optional[str] = None
    salary_period: Optional[str] = None
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None
    currency: Optional[str] = None
    source: Optional[str] = None
    description: Optional[str] = None
    posted_at: Optional[datetime] = None


class PostingRead(BaseModel):
    id: int
    url: Optional[str]
    title: str
    company_id: Optional[int]
    company_name: Optional[str] = None
    location: Optional[str]
    country: Optional[str] = None
    remote: Optional[str]
    seniority: Optional[str]
    industry: Optional[str] = None
    commitment: Optional[str] = None
    salary_period: Optional[str] = None
    salary_min: Optional[int]
    salary_max: Optional[int]
    currency: Optional[str]
    source: Optional[str]
    posted_at: Optional[datetime]
    first_seen_at: datetime
    is_ghost: bool


class ScrapeRequest(BaseModel):
    url: str


class ScrapeResult(BaseModel):
    """Best-effort fields parsed from a posting URL; any may be None."""
    title: Optional[str] = None
    company_name: Optional[str] = None
    location: Optional[str] = None
    country: Optional[str] = None
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None
    currency: Optional[str] = None
    source: Optional[str] = None
    description: Optional[str] = None


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
    priority: Optional[Priority] = None
    follow_up_date: Optional[datetime] = None
    channel: Optional[str] = None
    resume_version: Optional[str] = None
    referral: Optional[str] = None
    notes: Optional[str] = None
    applied_at: Optional[datetime] = None
    contacts: List["ContactCreate"] = []
    # When True, create even if an application for this posting already exists
    # (used to force-add a row that the importer had skipped as a duplicate).
    force: bool = False


class ApplicationUpdate(BaseModel):
    status: Optional[AppStatus] = None
    priority: Optional[Priority] = None
    follow_up_date: Optional[datetime] = None
    channel: Optional[str] = None
    resume_version: Optional[str] = None
    referral: Optional[str] = None
    notes: Optional[str] = None
    applied_at: Optional[datetime] = None


class PostingUpdate(BaseModel):
    title: Optional[str] = None
    company_name: Optional[str] = None
    location: Optional[str] = None
    country: Optional[str] = None
    remote: Optional[str] = None
    seniority: Optional[str] = None
    industry: Optional[str] = None
    commitment: Optional[str] = None
    salary_period: Optional[str] = None
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None
    currency: Optional[str] = None
    source: Optional[str] = None
    description: Optional[str] = None
    posted_at: Optional[datetime] = None


class ContactCreate(BaseModel):
    name: str
    role: Optional[str] = None
    stage: Optional[AppStatus] = None
    note: Optional[str] = None


class ContactUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    stage: Optional[AppStatus] = None
    note: Optional[str] = None


class ContactRead(BaseModel):
    id: int
    name: str
    role: Optional[str]
    stage: Optional[AppStatus]
    note: Optional[str]


class StatusEventCreate(BaseModel):
    status: AppStatus
    at: Optional[datetime] = None
    note: Optional[str] = None
    set_current: bool = False  # also set the application's current status


class StatusEventUpdate(BaseModel):
    status: Optional[AppStatus] = None
    at: Optional[datetime] = None
    note: Optional[str] = None


class StatusEventRead(BaseModel):
    id: int
    status: AppStatus
    at: datetime
    note: Optional[str]


class ApplicationRead(BaseModel):
    id: int
    status: AppStatus
    priority: Optional[Priority]
    follow_up_date: Optional[datetime]
    applied_at: Optional[datetime]
    channel: Optional[str]
    resume_version: Optional[str]
    referral: Optional[str]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime
    posting: PostingRead
    events: List[StatusEventRead] = []
    contacts: List[ContactRead] = []


# ---- stats ----
class FunnelStats(BaseModel):
    total: int
    by_status: dict
    response_rate: float  # got past 'applied' / total
    interview_rate: float
    offer_rate: float
    ghost_count: int


# Resolve forward reference (ContactCreate defined after ApplicationCreate).
ApplicationCreate.model_rebuild()
