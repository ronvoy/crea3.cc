from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlmodel import Session, select
from hashlib import sha256
from pathlib import Path
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from ..db import get_session
from ..models import Dispute, DisputeAgent, Good, Strategy, AllocationProposal, Report, AuditEvent, User
from .deps import get_current_user, can_access_dispute

router = APIRouter(prefix="/api/disputes/{dispute_id}/report", tags=["report"])

REPORT_DIR = Path("generated_reports")
REPORT_DIR.mkdir(exist_ok=True)

@router.post("")
def generate_report(dispute_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    dispute = can_access_dispute(dispute_id, user, session)
    if dispute.status not in ("accepted", "finalized"):
        raise HTTPException(status_code=400, detail="Dispute must be accepted before report generation")
    # pick latest proposal
    proposal = session.exec(select(AllocationProposal).where(AllocationProposal.dispute_id==dispute_id).order_by(AllocationProposal.id.desc())).first()
    if not proposal:
        raise HTTPException(status_code=404, detail="No proposal found")
    agents = session.exec(select(DisputeAgent).where(DisputeAgent.dispute_id==dispute_id)).all()
    goods = session.exec(select(Good).where(Good.dispute_id==dispute_id)).all()
    strategies = session.exec(select(Strategy).where(Strategy.dispute_id==dispute_id)).all()

    pdf_path = REPORT_DIR / f"dispute_{dispute_id}_report.pdf"
    c = canvas.Canvas(str(pdf_path), pagesize=letter)
    w, h = letter
    y = h - 72
    c.setFont("Helvetica-Bold", 16)
    c.drawString(72, y, f"CREA3 Dispute Resolution Report")
    y -= 28
    c.setFont("Helvetica", 11)
    c.drawString(72, y, f"Dispute ID: {dispute.id}   Title: {dispute.title}   Method: {dispute.method}")
    y -= 18
    c.drawString(72, y, f"Status: {dispute.status}   Generated: {__import__('datetime').datetime.utcnow().isoformat()}Z")
    y -= 28
    c.setFont("Helvetica-Bold", 12)
    c.drawString(72, y, "Agents")
    y -= 16
    c.setFont("Helvetica", 10)
    for a in agents:
        c.drawString(72, y, f"- {a.name} <{a.email}> share={a.entitlement_share}")
        y -= 14
        if y < 72:
            c.showPage(); y = h - 72
    y -= 10
    c.setFont("Helvetica-Bold", 12)
    c.drawString(72, y, "Goods")
    y -= 16
    c.setFont("Helvetica", 10)
    for g in goods:
        c.drawString(72, y, f"- {g.name} value={g.estimated_value} indivisible={g.indivisible}")
        y -= 14
        if y < 72:
            c.showPage(); y = h - 72

    y -= 10
    c.setFont("Helvetica-Bold", 12)
    c.drawString(72, y, "Strategies")
    y -= 16
    c.setFont("Helvetica", 10)
    for s in strategies:
        c.drawString(72, y, f"- Agent {s.agent_id}: {s.text[:120]}")
        y -= 14
        if y < 72:
            c.showPage(); y = h - 72

    y -= 10
    c.setFont("Helvetica-Bold", 12)
    c.drawString(72, y, "Allocation Proposal (latest)")
    y -= 16
    c.setFont("Helvetica", 10)
    for alloc in proposal.outputs.get("allocations", []):
        c.drawString(72, y, f"- Good {alloc.get('good_id')} -> Agent {alloc.get('assigned_agent_id')} (score={alloc.get('score')})")
        y -= 14
        if y < 72:
            c.showPage(); y = h - 72

    y -= 10
    c.setFont("Helvetica-Bold", 12)
    c.drawString(72, y, "Metrics")
    y -= 16
    c.setFont("Helvetica", 10)
    for k, v in (proposal.metrics or {}).items():
        c.drawString(72, y, f"- {k}: {v}")
        y -= 14
        if y < 72:
            c.showPage(); y = h - 72

    c.showPage()
    c.save()

    report_bytes = pdf_path.read_bytes()
    report_hash = sha256(report_bytes).hexdigest()

    existing = session.exec(select(Report).where(Report.dispute_id==dispute_id)).first()
    if existing:
        existing.pdf_path = str(pdf_path)
        existing.report_hash = report_hash
        session.add(existing)
    else:
        session.add(Report(dispute_id=dispute_id, pdf_path=str(pdf_path), report_hash=report_hash))

    dispute.status = "finalized"
    session.add(dispute)
    session.add(AuditEvent(dispute_id=dispute_id, actor_user_id=user.id, event_type="ReportGenerated", payload={"report_hash": report_hash}))
    session.commit()

    return {"ok": True, "pdf_path": str(pdf_path), "report_hash": report_hash}

@router.get("")
def download_report(dispute_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    can_access_dispute(dispute_id, user, session)
    report = session.exec(select(Report).where(Report.dispute_id==dispute_id)).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    path = Path(report.pdf_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Report file missing")
    return FileResponse(str(path), media_type="application/pdf", filename=path.name)
