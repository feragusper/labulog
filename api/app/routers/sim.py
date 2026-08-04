from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from ..db import get_session
from ..deps import get_current_user
from ..models import (
    Application, JobPosting, SimRun, SimRunStatus, SimTemplate, User, utcnow,
)
from ..schemas import (
    SimGenerateRequest,
    SimGenerateResult,
    SimMeta,
    SimRunCreate,
    SimRunRead,
    SimRunUpdate,
    SimTemplateCreate,
    SimTemplateRead,
    SimTopicMeta,
)
from .. import sim_bank

router = APIRouter(prefix="/api/sim", tags=["sim"])


def _stage_title(stage: str, lang: str) -> str:
    es = {"screening": "Screening", "management": "Entrevista de management",
          "technical": "Entrevista técnica", "mixed": "Simulacro mixto"}
    en = {"screening": "Screening", "management": "Management interview",
          "technical": "Technical interview", "mixed": "Mixed mock"}
    return (es if lang == "es" else en).get(stage, stage)


@router.get("/meta", response_model=SimMeta)
def meta(lang: str = "es", current: User = Depends(get_current_user)):
    lang = "es" if lang == "es" else "en"
    return SimMeta(
        stages=["screening", "management", "technical", "mixed"],
        topics=[SimTopicMeta(key=t["key"], label=t.get(lang) or t["en"]) for t in sim_bank.TOPICS],
        regions=[SimTopicMeta(key=r["key"], label=r.get(lang) or r["en"]) for r in sim_bank.REGIONS],
    )


@router.post("/generate", response_model=SimGenerateResult)
def generate(
    data: SimGenerateRequest,
    session: Session = Depends(get_session),
    current: User = Depends(get_current_user),
):
    lang = "es" if data.lang == "es" else "en"
    topics = list(data.topics)
    senior = False

    # If tied to an application, infer topics/seniority from its posting.
    if data.application_id:
        app = session.get(Application, data.application_id)
        if app and app.user_id == current.id:
            posting = session.get(JobPosting, app.posting_id)
            if posting:
                senior = sim_bank.is_senior(posting.title, posting.seniority)
                if not topics and data.stage in ("technical", "mixed"):
                    topics = sim_bank.infer_topics(posting.title, posting.seniority, posting.industry)

    sections = sim_bank.generate_sections(data.stage.value, topics, lang, senior, data.region)
    return SimGenerateResult(
        title=_stage_title(data.stage.value, lang),
        stage=data.stage,
        sections=sections,
    )


# ---- templates (reusable) ----
@router.get("/templates", response_model=List[SimTemplateRead])
def list_templates(
    session: Session = Depends(get_session),
    current: User = Depends(get_current_user),
):
    rows = session.exec(
        select(SimTemplate).where(SimTemplate.user_id == current.id).order_by(SimTemplate.created_at.desc())
    ).all()
    return rows


@router.post("/templates", response_model=SimTemplateRead, status_code=201)
def create_template(
    data: SimTemplateCreate,
    session: Session = Depends(get_session),
    current: User = Depends(get_current_user),
):
    tpl = SimTemplate(
        user_id=current.id,
        title=data.title.strip() or _stage_title(data.stage.value, "es"),
        stage=data.stage,
        sections=[s.model_dump() for s in data.sections],
    )
    session.add(tpl)
    session.commit()
    session.refresh(tpl)
    return tpl


@router.delete("/templates/{tpl_id}", status_code=204)
def delete_template(
    tpl_id: int,
    session: Session = Depends(get_session),
    current: User = Depends(get_current_user),
):
    tpl = session.get(SimTemplate, tpl_id)
    if not tpl or tpl.user_id != current.id:
        raise HTTPException(status_code=404, detail="Template not found")
    session.delete(tpl)
    session.commit()


# ---- runs (attached to an application) ----
def _owned_run(session: Session, run_id: int, user: User) -> SimRun:
    run = session.get(SimRun, run_id)
    if not run or run.user_id != user.id:
        raise HTTPException(status_code=404, detail="Simulation not found")
    return run


@router.get("/runs", response_model=List[SimRunRead])
def list_runs(
    application_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
    current: User = Depends(get_current_user),
):
    stmt = select(SimRun).where(SimRun.user_id == current.id)
    if application_id is not None:
        stmt = stmt.where(SimRun.application_id == application_id)
    rows = session.exec(stmt.order_by(SimRun.created_at.desc())).all()
    return rows


@router.post("/runs", response_model=SimRunRead, status_code=201)
def create_run(
    data: SimRunCreate,
    session: Session = Depends(get_session),
    current: User = Depends(get_current_user),
):
    app = session.get(Application, data.application_id)
    if not app or app.user_id != current.id:
        raise HTTPException(status_code=404, detail="Application not found")
    if not data.sections:
        raise HTTPException(status_code=400, detail="A simulation needs at least one section")

    run = SimRun(
        user_id=current.id,
        application_id=data.application_id,
        title=data.title.strip() or _stage_title(data.stage.value, "es"),
        stage=data.stage,
        status=SimRunStatus.draft,
        sections=[s.model_dump() for s in data.sections],
        results={},
    )
    session.add(run)
    session.commit()
    session.refresh(run)
    return run


@router.get("/runs/{run_id}", response_model=SimRunRead)
def get_run(
    run_id: int,
    session: Session = Depends(get_session),
    current: User = Depends(get_current_user),
):
    return _owned_run(session, run_id, current)


@router.patch("/runs/{run_id}", response_model=SimRunRead)
def update_run(
    run_id: int,
    data: SimRunUpdate,
    session: Session = Depends(get_session),
    current: User = Depends(get_current_user),
):
    run = _owned_run(session, run_id, current)
    fields = data.model_dump(exclude_unset=True)
    for key, value in fields.items():
        setattr(run, key, value)
    # Stamp timestamps from status transitions when the client didn't send them.
    if data.status == SimRunStatus.in_progress and run.started_at is None:
        run.started_at = utcnow()
    if data.status == SimRunStatus.done and run.completed_at is None:
        run.completed_at = utcnow()
    session.add(run)
    session.commit()
    session.refresh(run)
    return run


@router.delete("/runs/{run_id}", status_code=204)
def delete_run(
    run_id: int,
    session: Session = Depends(get_session),
    current: User = Depends(get_current_user),
):
    run = _owned_run(session, run_id, current)
    session.delete(run)
    session.commit()
