from sqlmodel import Session, select

from .models import Company, JobPosting, utcnow
from .schemas import PostingCreate


def get_or_create_company(session: Session, name: str) -> Company:
    name = name.strip()
    company = session.exec(select(Company).where(Company.name == name)).first()
    if company:
        return company
    company = Company(name=name)
    session.add(company)
    session.commit()
    session.refresh(company)
    return company


def upsert_posting(session: Session, data: PostingCreate) -> JobPosting:
    """Find posting by unique url, or create it. Updates last_seen_at on hit."""
    posting = session.exec(select(JobPosting).where(JobPosting.url == data.url)).first()
    company = get_or_create_company(session, data.company_name)

    if posting:
        posting.last_seen_at = utcnow()
        # Backfill fields that were empty before.
        for field in ("location", "remote", "seniority", "salary_min",
                      "salary_max", "currency", "source", "description", "posted_at"):
            new_val = getattr(data, field)
            if new_val is not None and getattr(posting, field) is None:
                setattr(posting, field, new_val)
        session.add(posting)
        session.commit()
        session.refresh(posting)
        return posting

    posting = JobPosting(
        company_id=company.id,
        title=data.title,
        url=data.url,
        location=data.location,
        remote=data.remote,
        seniority=data.seniority,
        salary_min=data.salary_min,
        salary_max=data.salary_max,
        currency=data.currency,
        source=data.source,
        description=data.description,
        posted_at=data.posted_at,
    )
    session.add(posting)
    session.commit()
    session.refresh(posting)
    return posting
