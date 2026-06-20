import csv
import io
import re
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlmodel import Session, select

from ..crud import get_or_create_company
from ..db import get_session
from ..deps import get_current_user
from ..models import AppStatus, Application, JobPosting, StatusEvent, User, utcnow

router = APIRouter(prefix="/api/import", tags=["import"])

# CSV stage column -> the status that reaching it implies.
STAGE_COLUMNS = [
    ("Apply", AppStatus.applied),
    ("First Contact", AppStatus.screening),
    ("Screening", AppStatus.screening),
    ("Manager I", AppStatus.interview),
    ("Technical I", AppStatus.interview),
    ("Technical II", AppStatus.interview),
    ("Manager II", AppStatus.interview),
    ("Proposal", AppStatus.offer),
]

SKIP_TOKENS = {"", "-", "waiting", "?", "`", "n/a"}


class ImportResult(BaseModel):
    imported: int
    skipped: int
    errors: List[str]


def _parse_date(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    v = value.strip()
    if v.lower() in SKIP_TOKENS:
        return None
    for fmt in ("%m/%d/%Y", "%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(v, fmt)
        except ValueError:
            continue
    return None


def _parse_money(value: Optional[str]):
    """'€50,000.00' -> (50000, 'EUR'). Returns (amount|None, currency|None)."""
    if not value or value.strip() in SKIP_TOKENS:
        return None, None
    currency = "EUR" if "€" in value else "USD" if "$" in value else None
    digits = re.sub(r"[^\d]", "", value.split(".")[0])  # drop decimals + symbols
    return (int(digits) if digits else None), currency


def _infer_final_status(result_text: str, reached: AppStatus) -> AppStatus:
    """Result free-text overrides the furthest stage reached when it signals an outcome."""
    t = (result_text or "").lower()
    if "pagaron" in t or "pagó" in t:
        return AppStatus.offer
    if "rechaz" in t or "no go" in t or "no van a seguir" in t or "no aceptaron" in t or "descartó" in t:
        return AppStatus.rejected
    if "on hold" in t or "paralizada" in t or "cambié" in t or "pasaron a" in t:
        return AppStatus.withdrawn
    if "baja" in t or "nunca hubo respuesta" in t or "ni pelota" in t or "ni responden" in t or "ni bola" in t:
        # If we got past applied, it's a real ghost; otherwise also ghosted.
        return AppStatus.ghosted
    return reached


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "row"


@router.post("/csv", response_model=ImportResult)
async def import_csv(
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    current: User = Depends(get_current_user),
):
    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    required = {"Company", "Apply"}
    if not reader.fieldnames or not required.issubset(set(reader.fieldnames)):
        raise HTTPException(
            status_code=400,
            detail="CSV needs at least 'Company' and 'Apply' columns (job-scouting format).",
        )

    imported = 0
    skipped = 0
    errors: List[str] = []

    for idx, row in enumerate(reader, start=2):  # row 1 is the header
        company = (row.get("Company") or "").strip()
        if not company:
            skipped += 1
            continue

        client = (row.get("Company 2") or "").strip()
        result_text = (row.get("Result") or "").strip()
        title = f"{company} · {client}" if client and client != company else company

        # Synthetic, unique, stable URL (re-import upserts the same posting).
        url = f"imported://job-scouting/{idx}-{_slug(company)}"

        try:
            applied_dt = _parse_date(row.get("Apply"))
            salary, currency = _parse_money(row.get("Money"))

            # Build the timeline from whatever stage dates exist.
            events: List[tuple] = []
            reached = AppStatus.applied
            for col, status in STAGE_COLUMNS:
                dt = _parse_date(row.get(col))
                if dt:
                    events.append((dt, status))
                    reached = status
            if not events:
                events.append((applied_dt or utcnow(), AppStatus.applied))

            final_status = _infer_final_status(result_text, reached)

            posting = session.exec(select(JobPosting).where(JobPosting.url == url)).first()
            if not posting:
                comp = get_or_create_company(session, company)
                posting = JobPosting(
                    company_id=comp.id, title=title, url=url, source="import",
                    salary_min=salary, salary_max=salary, currency=currency,
                )
                session.add(posting)
                session.commit()
                session.refresh(posting)

            exists = session.exec(
                select(Application).where(
                    Application.posting_id == posting.id,
                    Application.user_id == current.id,
                )
            ).first()
            if exists:
                skipped += 1
                continue

            app = Application(
                user_id=current.id, posting_id=posting.id, status=final_status,
                applied_at=applied_dt or utcnow(), channel="import",
                notes=result_text or None,
            )
            session.add(app)
            session.commit()
            session.refresh(app)

            # Timeline events (sorted), plus a terminal event if the outcome
            # differs from the furthest stage reached.
            events.sort(key=lambda e: e[0])
            for dt, status in events:
                session.add(StatusEvent(application_id=app.id, status=status, at=dt))
            if final_status != reached:
                session.add(StatusEvent(application_id=app.id, status=final_status,
                                        at=events[-1][0], note="inferido del resultado"))
            session.commit()
            imported += 1
        except Exception as e:  # keep going; report the bad row
            session.rollback()
            errors.append(f"fila {idx} ({company}): {e}")

    return ImportResult(imported=imported, skipped=skipped, errors=errors)
