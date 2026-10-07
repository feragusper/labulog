from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr

from .models import AppStatus, Priority, SimRunStatus, SimStage


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


class AttachmentRead(BaseModel):
    id: int
    filename: str
    content_type: Optional[str]
    size: int
    created_at: datetime


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
    attachments: List[AttachmentRead] = []


# ---- stats ----
class FunnelStats(BaseModel):
    total: int
    by_status: dict
    response_rate: float  # got past 'applied' / total
    interview_rate: float
    offer_rate: float
    ghost_count: int


# ---- interview simulations ----
class SimQuestion(BaseModel):
    q: str
    a: Optional[str] = None


class SimSection(BaseModel):
    """One composable, timed block of a simulation."""
    title: str
    kind: str = "theory"  # theory | live_coding | open
    topic: Optional[str] = None
    duration_seconds: int = 600
    prompt: Optional[str] = None                 # live_coding / open
    questions: List[SimQuestion] = []            # theory / open


class SimTopicMeta(BaseModel):
    key: str
    label: str


class SimMeta(BaseModel):
    stages: List[str]
    topics: List[SimTopicMeta]
    regions: List[SimTopicMeta] = []


class SimGenerateRequest(BaseModel):
    stage: SimStage = SimStage.technical
    topics: List[str] = []
    region: str = "global"  # global | ar | eu — flavors the non-technical rounds
    application_id: Optional[int] = None  # infer topics/seniority from its posting
    lang: str = "es"


class SimGenerateResult(BaseModel):
    title: str
    stage: SimStage
    sections: List[SimSection]


class SimTemplateCreate(BaseModel):
    title: str
    stage: SimStage = SimStage.technical
    sections: List[SimSection] = []


class SimTemplateRead(BaseModel):
    id: int
    title: str
    stage: SimStage
    sections: List[SimSection]
    created_at: datetime


class SimRunCreate(BaseModel):
    application_id: int
    title: str
    stage: SimStage = SimStage.technical
    sections: List[SimSection] = []


class SimRunUpdate(BaseModel):
    title: Optional[str] = None
    status: Optional[SimRunStatus] = None
    results: Optional[dict] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class SimRunRead(BaseModel):
    id: int
    application_id: int
    title: str
    stage: SimStage
    status: SimRunStatus
    sections: List[SimSection]
    results: dict = {}
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    created_at: datetime


# Resolve forward reference (ContactCreate defined after ApplicationCreate).
ApplicationCreate.model_rebuild()


# ---- profile / CV ----
class ProfileBasics(BaseModel):
    full_name: str = ""
    headline: str = ""
    email: str = ""
    phone: str = ""
    location: str = ""
    website: str = ""
    linkedin: str = ""
    github: str = ""
    summary: str = ""


class ProfileExperience(BaseModel):
    company: str = ""
    title: str = ""
    location: str = ""
    start: str = ""  # "YYYY-MM" or "YYYY" (free text tolerated)
    end: str = ""    # empty + current=True → "present"
    current: bool = False
    description: str = ""
    highlights: List[str] = []


class ProfileEducation(BaseModel):
    school: str = ""
    degree: str = ""
    field: str = ""
    start: str = ""
    end: str = ""
    description: str = ""


class ProfileSkill(BaseModel):
    name: str
    level: str = ""     # free text: beginner/intermediate/advanced/expert, "5y", …
    category: str = ""  # e.g. Languages, Frameworks, Tools


class ProfileLanguage(BaseModel):
    name: str
    proficiency: str = ""


class ProfileCertification(BaseModel):
    name: str
    issuer: str = ""
    date: str = ""
    url: str = ""


class ProfileProject(BaseModel):
    name: str
    description: str = ""
    url: str = ""
    start: str = ""
    end: str = ""


class ProfileData(BaseModel):
    basics: ProfileBasics = ProfileBasics()
    experience: List[ProfileExperience] = []
    education: List[ProfileEducation] = []
    skills: List[ProfileSkill] = []
    languages: List[ProfileLanguage] = []
    certifications: List[ProfileCertification] = []
    projects: List[ProfileProject] = []


class ProfileRead(ProfileData):
    updated_at: Optional[datetime] = None


class ProfileImportResult(BaseModel):
    profile: ProfileRead
    found: List[str]  # which LinkedIn files were recognised
    counts: dict      # section -> items added
