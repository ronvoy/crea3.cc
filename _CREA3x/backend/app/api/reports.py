from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, Response
from sqlmodel import Session, select
from pathlib import Path
import csv
import io

from ..db import get_session
from ..models import Dispute, DisputeAgent, Good, AllocationProposal, Acceptance, Report, AuditEvent, User
from .deps import get_current_user, can_access_dispute
from ..services.report_pdf import build_report_pdf
from ..services.report_xlsx import build_report_xlsx
from ..services.history import build_history

router = APIRouter(prefix="/api/disputes/{dispute_id}/report", tags=["report"])

REPORT_DIR = Path("generated_reports")
REPORT_DIR.mkdir(exist_ok=True)


@router.get("/audit.csv")
def export_audit_log(dispute_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Export the FULL, timestamped audit trail of a dispute as CSV. Accessible to
    any participant (parties, mediators) and the owner/admin. Supports the
    procedural-fairness requirement with a verifiable, exportable record."""
    can_access_dispute(dispute_id, user, session)
    events = session.exec(
        select(AuditEvent).where(AuditEvent.dispute_id == dispute_id).order_by(AuditEvent.created_at.asc())
    ).all()
    # Resolve actor names once.
    uids = {e.actor_user_id for e in events if e.actor_user_id is not None}
    names: dict[int, str] = {}
    if uids:
        for u in session.exec(select(User).where(User.id.in_(list(uids)))).all():
            names[u.id] = u.username or u.email

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["timestamp_utc", "event_type", "actor", "details"])
    for e in events:
        actor = names.get(e.actor_user_id or -1, "system")
        ts = e.created_at.isoformat() if e.created_at else ""
        details = ""
        if e.payload:
            try:
                details = "; ".join(f"{k}={v}" for k, v in e.payload.items())
            except Exception:
                details = str(e.payload)
        w.writerow([ts, e.event_type, actor, details])

    csv_bytes = buf.getvalue().encode("utf-8-sig")  # BOM for Excel compatibility
    return Response(
        content=csv_bytes,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="CREA3_audit_dispute_{dispute_id}.csv"'},
    )


def _latest_proposal(session: Session, dispute_id: int) -> AllocationProposal | None:
    return session.exec(
        select(AllocationProposal)
        .where(AllocationProposal.dispute_id == dispute_id)
        .order_by(AllocationProposal.id.desc())
    ).first()


def _load_acceptances(session: Session, dispute_id: int, proposal_id: int) -> list[dict]:
    """Each non-mediator party's accept/reject decision on this proposal.

    Included in both the PDF and the Excel so the report reflects the outcome.
    """
    agents = session.exec(select(DisputeAgent).where(DisputeAgent.dispute_id == dispute_id)).all()
    parties = [a for a in agents if (a.role_in_dispute or "agent").lower() != "mediator"]
    accs = session.exec(
        select(Acceptance).where(Acceptance.proposal_id == proposal_id)
    ).all()
    acc_by_agent = {a.agent_id: a for a in accs}
    out: list[dict] = []
    for a in parties:
        rec = acc_by_agent.get(a.id)
        out.append({
            "name": a.name,
            "accepted": (bool(rec.accepted) if rec is not None else None),
            "comment": (rec.comment if rec is not None else None),
            "when": (rec.created_at.isoformat() if rec is not None and rec.created_at else None),
        })
    return out


def _render(session: Session, dispute: Dispute, proposal: AllocationProposal, *, kind: str, user: User) -> dict:
    agents = session.exec(select(DisputeAgent).where(DisputeAgent.dispute_id == dispute.id)).all()
    goods = session.exec(select(Good).where(Good.dispute_id == dispute.id)).all()
    acceptances = _load_acceptances(session, dispute.id, proposal.id)

    suffix = "proposal" if kind == "proposal" else "final"
    pdf_path = REPORT_DIR / f"dispute_{dispute.id}_{suffix}.pdf"

    history = build_history(session, dispute.id)

    report_hash = build_report_pdf(
        out_path=str(pdf_path),
        dispute=dispute,
        agents=agents,
        goods=goods,
        proposal=proposal,
        history=history,
        acceptances=acceptances,
        kind=kind,
        lang=(getattr(user, "locale", None) or "en"),
    )

    # Upsert the Report row (one row per dispute; tracks the most recent render).
    existing = session.exec(select(Report).where(Report.dispute_id == dispute.id)).first()
    if existing:
        existing.pdf_path = str(pdf_path)
        existing.report_hash = report_hash
        session.add(existing)
    else:
        session.add(Report(dispute_id=dispute.id, pdf_path=str(pdf_path), report_hash=report_hash))

    session.add(AuditEvent(
        dispute_id=dispute.id,
        actor_user_id=user.id,
        event_type="ProposalReportGenerated" if kind == "proposal" else "ReportGenerated",
        payload={"report_hash": report_hash, "kind": kind},
    ))
    session.commit()
    return {"ok": True, "pdf_path": str(pdf_path), "report_hash": report_hash, "kind": kind}


@router.post("/proposal")
def generate_proposal_report(dispute_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Generate the professional proposal PDF.

    Available as soon as a proposal exists (i.e. during/after the preferences
    phase) so all parties AND mediators can review a polished allocation
    proposal before accepting. Any participant (incl. mediators) may trigger it.
    """
    dispute = can_access_dispute(dispute_id, user, session)
    proposal = _latest_proposal(session, dispute_id)
    if not proposal:
        raise HTTPException(status_code=409, detail="No proposal has been generated yet. Submit preferences first.")
    return _render(session, dispute, proposal, kind="proposal", user=user)


@router.post("")
def generate_final_report(dispute_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Generate the FINAL report (after the dispute is accepted)."""
    dispute = can_access_dispute(dispute_id, user, session)
    if dispute.status not in ("accepted", "finalized"):
        raise HTTPException(status_code=400, detail="Dispute must be accepted before the final report.")
    proposal = _latest_proposal(session, dispute_id)
    if not proposal:
        raise HTTPException(status_code=404, detail="No proposal found")
    result = _render(session, dispute, proposal, kind="final", user=user)
    dispute.status = "finalized"
    session.add(dispute)
    session.commit()
    return result


@router.get("/xlsx")
def download_report_xlsx(dispute_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Build and download the proposal/report as an Excel workbook (.xlsx).

    Self-contained: it (re)builds from the latest proposal on each request so it
    always reflects the current allocation and the parties' accept/reject
    decisions. Accessible to every participant and the owner/admin.
    """
    dispute = can_access_dispute(dispute_id, user, session)
    proposal = _latest_proposal(session, dispute_id)
    if not proposal:
        raise HTTPException(status_code=409, detail="No proposal has been generated yet.")

    kind = "final" if dispute.status in ("accepted", "finalized") else "proposal"
    acceptances = _load_acceptances(session, dispute_id, proposal.id)
    xlsx_path = REPORT_DIR / f"dispute_{dispute_id}_{kind}.xlsx"
    build_report_xlsx(
        out_path=str(xlsx_path),
        dispute=dispute,
        agents=session.exec(select(DisputeAgent).where(DisputeAgent.dispute_id == dispute_id)).all(),
        goods=session.exec(select(Good).where(Good.dispute_id == dispute_id)).all(),
        proposal=proposal,
        acceptances=acceptances,
        kind=kind,
        lang=(getattr(user, "locale", None) or "en"),
    )
    session.add(AuditEvent(dispute_id=dispute_id, actor_user_id=user.id,
                           event_type="ReportExcelDownloaded", payload={"kind": kind}))
    session.commit()
    return FileResponse(
        str(xlsx_path),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=f"CREA3_allocation_dispute_{dispute_id}.xlsx",
    )


@router.get("")
def download_report(dispute_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Download the most recent report PDF. Accessible to every participant
    (parties and mediators) and the owner/admin."""
    can_access_dispute(dispute_id, user, session)
    report = session.exec(select(Report).where(Report.dispute_id == dispute_id)).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    path = Path(report.pdf_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Report file missing")
    return FileResponse(str(path), media_type="application/pdf", filename=path.name)
