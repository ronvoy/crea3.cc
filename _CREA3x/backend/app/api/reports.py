from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, Response
from sqlmodel import Session, select
from pathlib import Path
from hashlib import sha256
import csv
import io

from ..db import get_session
from ..models import (
    Dispute, DisputeAgent, Good, AllocationProposal, Acceptance, Report,
    AuditEvent, User, DocumentSignature, utcnow,
)
from .deps import get_current_user, can_access_dispute


def _chain_hash(prev: str | None, dispute_id: int, filename: str, file_hash: str, generated_at: str) -> str:
    """Link a signature to the previous one so the ledger is tamper-evident.

    Any change to a stored row (or a deletion) changes this value and every
    chain_hash after it, which the /integrity check detects.
    """
    material = f"{prev or ''}|{dispute_id}|{filename}|{file_hash}|{generated_at}"
    return sha256(material.encode("utf-8")).hexdigest()


def _record_signature(session: Session, *, dispute_id: int, pdf_path: Path, file_hash: str, kind: str, user: User) -> DocumentSignature:
    """Append one immutable integrity signature for a freshly generated file."""
    try:
        file_size = pdf_path.stat().st_size
    except OSError:
        file_size = 0

    prev = session.exec(
        select(DocumentSignature)
        .where(DocumentSignature.dispute_id == dispute_id)
        .order_by(DocumentSignature.id.desc())
    ).first()
    prev_chain = prev.chain_hash if prev else None

    generated_at = utcnow()
    sig = DocumentSignature(
        dispute_id=dispute_id,
        filename=pdf_path.name,
        kind=kind,
        algorithm="sha256",
        file_hash=file_hash,
        file_size=file_size,
        generated_by_id=user.id,
        generated_at=generated_at,
        prev_chain_hash=prev_chain,
        chain_hash=_chain_hash(prev_chain, dispute_id, pdf_path.name, file_hash, generated_at.isoformat()),
    )
    session.add(sig)
    return sig
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

    # Append an immutable integrity signature for THIS generation (never
    # overwritten), so every render of the document is independently verifiable.
    sig = _record_signature(
        session, dispute_id=dispute.id, pdf_path=pdf_path,
        file_hash=report_hash, kind=kind, user=user,
    )

    session.add(AuditEvent(
        dispute_id=dispute.id,
        actor_user_id=user.id,
        event_type="ProposalReportGenerated" if kind == "proposal" else "ReportGenerated",
        payload={"report_hash": report_hash, "kind": kind, "chain_hash": sig.chain_hash},
    ))
    session.commit()
    return {
        "ok": True,
        "pdf_path": str(pdf_path),
        "report_hash": report_hash,
        "algorithm": "sha256",
        "chain_hash": sig.chain_hash,
        "kind": kind,
    }


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


@router.get("/signatures")
def list_signatures(dispute_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """The full, immutable integrity ledger for this dispute's documents.

    One entry per generation, oldest first, with the SHA-256 file hash and the
    tamper-evident chain hash.
    """
    can_access_dispute(dispute_id, user, session)
    sigs = session.exec(
        select(DocumentSignature)
        .where(DocumentSignature.dispute_id == dispute_id)
        .order_by(DocumentSignature.id.asc())
    ).all()
    return [
        {
            "id": s.id,
            "filename": s.filename,
            "kind": s.kind,
            "algorithm": s.algorithm,
            "file_hash": s.file_hash,
            "file_size": s.file_size,
            "generated_by_id": s.generated_by_id,
            "generated_at": s.generated_at.isoformat() if s.generated_at else None,
            "prev_chain_hash": s.prev_chain_hash,
            "chain_hash": s.chain_hash,
        }
        for s in sigs
    ]


@router.get("/integrity")
def verify_integrity(dispute_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Verify the integrity of this dispute's documents.

    Two independent checks:
      1. ledger_intact — recomputes every chain_hash to confirm no signature row
         was altered, inserted or removed.
      2. current_file  — recomputes the SHA-256 of the PDF on disk and reports
         whether it matches its recorded signature (i.e. the file was NOT
         tampered with after generation).
    """
    can_access_dispute(dispute_id, user, session)
    sigs = session.exec(
        select(DocumentSignature)
        .where(DocumentSignature.dispute_id == dispute_id)
        .order_by(DocumentSignature.id.asc())
    ).all()

    # 1) Ledger chain verification.
    ledger_intact = True
    broken_at = None
    prev = None
    for s in sigs:
        expected = _chain_hash(
            prev, s.dispute_id, s.filename, s.file_hash,
            s.generated_at.isoformat() if s.generated_at else "",
        )
        if s.prev_chain_hash != prev or s.chain_hash != expected:
            ledger_intact = False
            broken_at = s.id
            break
        prev = s.chain_hash

    # 2) On-disk file verification against the latest signature per filename.
    files: dict[str, DocumentSignature] = {}
    for s in sigs:
        files[s.filename] = s  # last one wins => most recent generation
    file_reports = []
    for filename, s in files.items():
        p = REPORT_DIR / filename
        status = "missing"
        actual = None
        if p.exists():
            actual = sha256(p.read_bytes()).hexdigest()
            status = "intact" if actual == s.file_hash else "TAMPERED"
        file_reports.append({
            "filename": filename,
            "status": status,
            "expected_hash": s.file_hash,
            "actual_hash": actual,
            "recorded_at": s.generated_at.isoformat() if s.generated_at else None,
        })

    all_ok = ledger_intact and all(f["status"] == "intact" for f in file_reports)
    return {
        "dispute_id": dispute_id,
        "ok": all_ok,
        "signature_count": len(sigs),
        "ledger_intact": ledger_intact,
        "ledger_broken_at_id": broken_at,
        "files": file_reports,
    }
