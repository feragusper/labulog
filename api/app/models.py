from datetime import datetime
from enum import Enum
from typing import Optional

from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.utcnow()


class AppStatus(str, Enum):
    saved = "saved"
    applied = "applied"
    screening = "screening"
    interview = "interview"
    offer = "offer"
    rejected = "rejected"
    ghosted = "ghosted"
    withdrawn = "withdrawn"


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    hashed_password: str
    created_at: datetime = Field(default_factory=utcnow)


class Company(SQLModel, table=True):
    """Global. Shared across users for market intel."""
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    website: Optional[str] = None
    linkedin_url: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)


class JobPosting(SQLModel, table=True):
    """Global. url is unique → the key for 'did I already apply?' and ghost detection."""
    id: Optional[int] = Field(default=None, primary_key=True)
    company_id: Optional[int] = Field(default=None, foreign_key="company.id", index=True)
    title: str
    location: Optional[str] = None
    remote: Optional[str] = None  # onsite | hybrid | remote
    seniority: Optional[str] = None
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None
    currency: Optional[str] = None
    url: str = Field(index=True, unique=True)
    source: Optional[str] = None  # linkedin | indeed | manual | ...
    description: Optional[str] = None
    posted_at: Optional[datetime] = None
    first_seen_at: datetime = Field(default_factory=utcnow)
    last_seen_at: datetime = Field(default_factory=utcnow)
    is_ghost: bool = Field(default=False)


class Application(SQLModel, table=True):
    """Private per user."""
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    posting_id: int = Field(foreign_key="jobposting.id", index=True)
    status: AppStatus = Field(default=AppStatus.applied)
    applied_at: Optional[datetime] = Field(default_factory=utcnow)
    channel: Optional[str] = None  # linkedin-easy-apply | email | referral | portal
    resume_version: Optional[str] = None
    referral: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class StatusEvent(SQLModel, table=True):
    """Timeline of an application's status changes."""
    id: Optional[int] = Field(default=None, primary_key=True)
    application_id: int = Field(foreign_key="application.id", index=True)
    status: AppStatus
    at: datetime = Field(default_factory=utcnow)
    note: Optional[str] = None
