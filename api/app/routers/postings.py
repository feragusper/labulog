from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from ..crud import get_or_create_company, upsert_posting
from ..db import get_session
from ..deps import get_current_user
from ..models import Application, JobPosting, User, utcnow
from ..schemas import (
    PostingCreate, PostingLookup, PostingRead, PostingUpdate, ScrapeRequest, ScrapeResult,
)

router = APIRouter(prefix="/api/postings", tags=["postings"])


@router.post("/scrape", response_model=ScrapeResult)
def scrape(
    data: ScrapeRequest,
    _: User = Depends(get_current_user),
):
    """Best-effort autofill: fetch the URL and parse posting metadata."""
    from ..scrape import is_safe_url, scrape_posting

    if not is_safe_url(data.url):
        raise HTTPException(status_code=400, detail="URL inválida o no permitida")
    try:
        return scrape_posting(data.url)
    except Exception:
        # Many boards block bots or need auth; degrade to manual entry.
        raise HTTPException(status_code=502, detail="No se pudo leer el posting")


@router.post("", response_model=PostingRead, status_code=201)
def create_posting(
    data: PostingCreate,
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
):
    return upsert_posting(session, data)


@router.get("/lookup", response_model=PostingLookup)
def lookup(
    url: str = Query(..., description="Job posting URL to check"),
    session: Session = Depends(get_session),
    current: User = Depends(get_current_user),
):
    """Core anti-ghost feature: given a URL, did *I* already apply, and what's the status?"""
    posting = session.exec(select(JobPosting).where(JobPosting.url == url)).first()
    if not posting:
        return PostingLookup(posting=None, already_applied=False)

    app = session.exec(
        select(Application).where(
            Application.posting_id == posting.id,
            Application.user_id == current.id,
        )
    ).first()
    return PostingLookup(
        posting=PostingRead.model_validate(posting, from_attributes=True),
        already_applied=app is not None,
        application_id=app.id if app else None,
        status=app.status if app else None,
    )


@router.get("/{posting_id}", response_model=PostingRead)
def get_posting(
    posting_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
):
    posting = session.get(JobPosting, posting_id)
    if not posting:
        raise HTTPException(status_code=404, detail="Posting not found")
    return posting


@router.patch("/{posting_id}", response_model=PostingRead)
def update_posting(
    posting_id: int,
    data: PostingUpdate,
    session: Session = Depends(get_session),
    _: User = Depends(get_current_user),
):
    posting = session.get(JobPosting, posting_id)
    if not posting:
        raise HTTPException(status_code=404, detail="Posting not found")

    fields = data.model_dump(exclude_unset=True)
    company_name = fields.pop("company_name", None)
    if company_name:
        posting.company_id = get_or_create_company(session, company_name).id
    for key, value in fields.items():
        setattr(posting, key, value)
    posting.last_seen_at = utcnow()
    session.add(posting)
    session.commit()
    session.refresh(posting)
    return posting
