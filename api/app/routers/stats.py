from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from ..db import get_session
from ..deps import get_current_user
from ..models import AppStatus, Application, User
from ..schemas import FunnelStats

router = APIRouter(prefix="/api/stats", tags=["stats"])

# Statuses that count as "the company responded / moved me forward".
RESPONDED = {
    AppStatus.first_contact, AppStatus.screening, AppStatus.technical_interview,
    AppStatus.manager_interview, AppStatus.interview, AppStatus.proposal,
    AppStatus.offer, AppStatus.rejected, AppStatus.cancelled,
}
INTERVIEWED = {
    AppStatus.technical_interview, AppStatus.manager_interview, AppStatus.interview,
    AppStatus.proposal, AppStatus.offer,
}


@router.get("/funnel", response_model=FunnelStats)
def funnel(
    session: Session = Depends(get_session),
    current: User = Depends(get_current_user),
):
    apps = session.exec(
        select(Application).where(Application.user_id == current.id)
    ).all()
    total = len(apps)

    by_status = {s.value: 0 for s in AppStatus}
    for a in apps:
        by_status[a.status.value] += 1

    def rate(matching: set) -> float:
        if total == 0:
            return 0.0
        n = sum(1 for a in apps if a.status in matching)
        return round(n / total, 3)

    return FunnelStats(
        total=total,
        by_status=by_status,
        response_rate=rate(RESPONDED),
        interview_rate=rate(INTERVIEWED),
        offer_rate=rate({AppStatus.offer}),
        ghost_count=by_status[AppStatus.ghosted.value],
    )
