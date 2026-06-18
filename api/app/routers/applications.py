from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..crud import upsert_posting
from ..db import get_session
from ..deps import get_current_user
from ..models import Application, JobPosting, StatusEvent, User, utcnow
from ..schemas import (
    ApplicationCreate,
    ApplicationRead,
    ApplicationUpdate,
    PostingRead,
    StatusEventRead,
)

router = APIRouter(prefix="/api/applications", tags=["applications"])


def _to_read(session: Session, app: Application) -> ApplicationRead:
    posting = session.get(JobPosting, app.posting_id)
    events = session.exec(
        select(StatusEvent)
        .where(StatusEvent.application_id == app.id)
        .order_by(StatusEvent.at)
    ).all()
    return ApplicationRead(
        id=app.id,
        status=app.status,
        applied_at=app.applied_at,
        channel=app.channel,
        resume_version=app.resume_version,
        referral=app.referral,
        notes=app.notes,
        created_at=app.created_at,
        updated_at=app.updated_at,
        posting=PostingRead.model_validate(posting, from_attributes=True),
        events=[StatusEventRead.model_validate(e, from_attributes=True) for e in events],
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
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Already applied to this posting (status: {existing.status.value})",
        )

    app = Application(
        user_id=current.id,
        posting_id=posting.id,
        status=data.status,
        applied_at=data.applied_at or utcnow(),
        channel=data.channel,
        resume_version=data.resume_version,
        referral=data.referral,
        notes=data.notes,
    )
    session.add(app)
    session.commit()
    session.refresh(app)

    session.add(StatusEvent(application_id=app.id, status=app.status))
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
    status_changed = "status" in fields and fields["status"] != app.status

    for key, value in fields.items():
        setattr(app, key, value)
    app.updated_at = utcnow()
    session.add(app)
    session.commit()
    session.refresh(app)

    if status_changed:
        session.add(StatusEvent(application_id=app.id, status=app.status))
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
    session.delete(app)
    session.commit()
