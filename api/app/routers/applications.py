import csv
import io
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from ..crud import upsert_posting
from ..db import get_session
from ..deps import get_current_user
from ..models import Application, Company, Contact, JobPosting, StatusEvent, User, utcnow
from ..schemas import (
    ApplicationCreate,
    ApplicationRead,
    ApplicationUpdate,
    ContactCreate,
    ContactRead,
    ContactUpdate,
    PostingRead,
    StatusEventCreate,
    StatusEventRead,
    StatusEventUpdate,
)

router = APIRouter(prefix="/api/applications", tags=["applications"])


def _to_read(session: Session, app: Application) -> ApplicationRead:
    posting = session.get(JobPosting, app.posting_id)
    posting_read = PostingRead.model_validate(posting, from_attributes=True)
    if posting.company_id:
        company = session.get(Company, posting.company_id)
        posting_read.company_name = company.name if company else None
    events = session.exec(
        select(StatusEvent)
        .where(StatusEvent.application_id == app.id)
        .order_by(StatusEvent.at)
    ).all()
    contacts = session.exec(
        select(Contact).where(Contact.application_id == app.id).order_by(Contact.created_at)
    ).all()
    return ApplicationRead(
        id=app.id,
        status=app.status,
        priority=app.priority,
        follow_up_date=app.follow_up_date,
        applied_at=app.applied_at,
        channel=app.channel,
        resume_version=app.resume_version,
        referral=app.referral,
        notes=app.notes,
        created_at=app.created_at,
        updated_at=app.updated_at,
        posting=posting_read,
        events=[StatusEventRead.model_validate(e, from_attributes=True) for e in events],
        contacts=[ContactRead.model_validate(c, from_attributes=True) for c in contacts],
    )


@router.get("", response_model=List[ApplicationRead])
def list_applications(
    session: Session = Depends(get_session),
    current: User = Depends(get_current_user),
):
    apps = session.exec(
        select(Application)
        .where(Application.user_id == current.id)
        .order_by(Application.created_at.desc())
    ).all()
    return [_to_read(session, a) for a in apps]


@router.get("/export.csv")
def export_csv(
    session: Session = Depends(get_session),
    current: User = Depends(get_current_user),
):
    apps = session.exec(
        select(Application)
        .where(Application.user_id == current.id)
        .order_by(Application.created_at.desc())
    ).all()

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["company", "title", "industry", "commitment", "status", "priority",
                "applied_at", "follow_up_date", "salary_min", "salary_max",
                "currency", "salary_period", "source", "url", "notes"])
    for a in apps:
        p = session.get(JobPosting, a.posting_id)
        company = session.get(Company, p.company_id).name if p and p.company_id else ""
        w.writerow([
            company, p.title if p else "", p.industry if p else "",
            p.commitment if p else "", a.status.value,
            a.priority.value if a.priority else "",
            a.applied_at.date().isoformat() if a.applied_at else "",
            a.follow_up_date.date().isoformat() if a.follow_up_date else "",
            p.salary_min if p else "", p.salary_max if p else "",
            p.currency if p else "", p.salary_period if p else "",
            p.source if p else "", p.url if p else "",
            (a.notes or "").replace("\n", " "),
        ])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=labulog-export.csv"},
    )


@router.post("", response_model=ApplicationRead, status_code=201)
def create_application(
    data: ApplicationCreate,
    session: Session = Depends(get_session),
    current: User = Depends(get_current_user),
):
    posting = upsert_posting(session, data.posting)

    existing = session.exec(
        select(Application).where(
            Application.posting_id == posting.id,
            Application.user_id == current.id,
        )
    ).first()
    if existing and not data.force:
        raise HTTPException(
            status_code=409,
            detail=f"Already applied to this posting (status: {existing.status.value})",
        )

    app = Application(
        user_id=current.id,
        posting_id=posting.id,
        status=data.status,
        priority=data.priority,
        follow_up_date=data.follow_up_date,
        applied_at=data.applied_at or utcnow(),
        channel=data.channel,
        resume_version=data.resume_version,
        referral=data.referral,
        notes=data.notes,
    )
    session.add(app)
    session.commit()
    session.refresh(app)

    session.add(StatusEvent(application_id=app.id, status=app.status, at=app.applied_at or utcnow()))
    for c in data.contacts:
        if c.name.strip():
            session.add(Contact(application_id=app.id, name=c.name.strip(),
                                role=c.role, stage=c.stage, note=c.note))
    session.commit()
    return _to_read(session, app)


@router.post("/{app_id}/contacts", response_model=ApplicationRead, status_code=201)
def add_contact(
    app_id: int,
    data: ContactCreate,
    session: Session = Depends(get_session),
    current: User = Depends(get_current_user),
):
    app = _owned_app(session, app_id, current)
    session.add(Contact(application_id=app.id, name=data.name.strip(),
                        role=data.role, stage=data.stage, note=data.note))
    session.commit()
    return _to_read(session, app)


@router.patch("/{app_id}/contacts/{contact_id}", response_model=ApplicationRead)
def update_contact(
    app_id: int,
    contact_id: int,
    data: ContactUpdate,
    session: Session = Depends(get_session),
    current: User = Depends(get_current_user),
):
    app = _owned_app(session, app_id, current)
    contact = session.get(Contact, contact_id)
    if not contact or contact.application_id != app.id:
        raise HTTPException(status_code=404, detail="Contact not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(contact, key, value)
    session.add(contact)
    session.commit()
    return _to_read(session, app)


@router.delete("/{app_id}/contacts/{contact_id}", response_model=ApplicationRead)
def delete_contact(
    app_id: int,
    contact_id: int,
    session: Session = Depends(get_session),
    current: User = Depends(get_current_user),
):
    app = _owned_app(session, app_id, current)
    contact = session.get(Contact, contact_id)
    if not contact or contact.application_id != app.id:
        raise HTTPException(status_code=404, detail="Contact not found")
    session.delete(contact)
    session.commit()
    return _to_read(session, app)


@router.get("/{app_id}", response_model=ApplicationRead)
def get_application(
    app_id: int,
    session: Session = Depends(get_session),
    current: User = Depends(get_current_user),
):
    app = session.get(Application, app_id)
    if not app or app.user_id != current.id:
        raise HTTPException(status_code=404, detail="Application not found")
    return _to_read(session, app)


@router.patch("/{app_id}", response_model=ApplicationRead)
def update_application(
    app_id: int,
    data: ApplicationUpdate,
    session: Session = Depends(get_session),
    current: User = Depends(get_current_user),
):
    app = session.get(Application, app_id)
    if not app or app.user_id != current.id:
        raise HTTPException(status_code=404, detail="Application not found")

    fields = data.model_dump(exclude_unset=True)
    for key, value in fields.items():
        setattr(app, key, value)
    app.updated_at = utcnow()
    session.add(app)
    session.commit()
    session.refresh(app)
    return _to_read(session, app)


# ---- status event ABM (timeline editing) ----
def _owned_app(session: Session, app_id: int, user: User) -> Application:
    app = session.get(Application, app_id)
    if not app or app.user_id != user.id:
        raise HTTPException(status_code=404, detail="Application not found")
    return app


@router.post("/{app_id}/events", response_model=ApplicationRead, status_code=201)
def add_event(
    app_id: int,
    data: StatusEventCreate,
    session: Session = Depends(get_session),
    current: User = Depends(get_current_user),
):
    app = _owned_app(session, app_id, current)
    session.add(StatusEvent(application_id=app.id, status=data.status,
                            at=data.at or utcnow(), note=data.note))
    if data.set_current:
        app.status = data.status
        app.updated_at = utcnow()
        session.add(app)
    session.commit()
    return _to_read(session, app)


@router.patch("/{app_id}/events/{event_id}", response_model=ApplicationRead)
def update_event(
    app_id: int,
    event_id: int,
    data: StatusEventUpdate,
    session: Session = Depends(get_session),
    current: User = Depends(get_current_user),
):
    app = _owned_app(session, app_id, current)
    event = session.get(StatusEvent, event_id)
    if not event or event.application_id != app.id:
        raise HTTPException(status_code=404, detail="Event not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(event, key, value)
    session.add(event)
    session.commit()
    return _to_read(session, app)


@router.delete("/{app_id}/events/{event_id}", response_model=ApplicationRead)
def delete_event(
    app_id: int,
    event_id: int,
    session: Session = Depends(get_session),
    current: User = Depends(get_current_user),
):
    app = _owned_app(session, app_id, current)
    event = session.get(StatusEvent, event_id)
    if not event or event.application_id != app.id:
        raise HTTPException(status_code=404, detail="Event not found")
    session.delete(event)
    session.commit()
    return _to_read(session, app)


@router.delete("/{app_id}", status_code=204)
def delete_application(
    app_id: int,
    session: Session = Depends(get_session),
    current: User = Depends(get_current_user),
):
    app = session.get(Application, app_id)
    if not app or app.user_id != current.id:
        raise HTTPException(status_code=404, detail="Application not found")
    for e in session.exec(
        select(StatusEvent).where(StatusEvent.application_id == app.id)
    ).all():
        session.delete(e)
    for c in session.exec(
        select(Contact).where(Contact.application_id == app.id)
    ).all():
        session.delete(c)
    session.delete(app)
    session.commit()
