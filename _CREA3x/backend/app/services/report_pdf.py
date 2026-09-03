"""Professional, branded dispute-resolution PDF report.

Highlights:
  * a proper cover page (logo, title, dispute reference, confidentiality note),
  * an executive summary,
  * a pre-filled NARRATIVE history of the dispute (privacy-safe),
  * a DIVERGENT-VALUATIONS section that surfaces how differently the parties
    value each asset, plus the equalizing compensation,
  * the proposed allocation (allocation only - NO individual preferences),
  * a fairness summary and charts (drawn with reportlab.graphics, no extra deps),
  * signature blocks and a consortium-partners footer page.

Used for both the "proposal" report (during the preferences phase) and the
"final" report (after acceptance); `kind` adjusts the wording.
"""

from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
    KeepTogether,
    PageBreak,
    HRFlowable,
)
from reportlab.graphics.shapes import Drawing
from reportlab.graphics.charts.piecharts import Pie
from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.charts.legends import Legend

# --- Brand palette (light, soft proposal look) --------------------------
BRAND = colors.HexColor("#5b8def")       # lighter blue
BRAND_DARK = colors.HexColor("#3f6fd6")  # softer header blue (was navy)
INK = colors.HexColor("#26334d")         # softer than near-black
MUTED = colors.HexColor("#7a89a3")
LIGHT = colors.HexColor("#f3f7ff")       # very light row tint
SOFT = colors.HexColor("#f9fbff")
BORDER = colors.HexColor("#e2e9f5")
GOOD = colors.HexColor("#34a853")
WARN = colors.HexColor("#e57373")        # lighter red for the omitted header
GOLD = colors.HexColor("#cda434")

ASSETS = Path(__file__).resolve().parent.parent / "assets"
LOGO = ASSETS / "crea3-logo.png"
PARTNERS = ASSETS / "partners.png"

SERIES = [
    colors.HexColor("#5b8def"), colors.HexColor("#f3a653"), colors.HexColor("#52b788"),
    colors.HexColor("#a78bfa"), colors.HexColor("#e57373"), colors.HexColor("#4dd0e1"),
]


def _styles():
    ss = getSampleStyleSheet()
    return {
        "cover_title": ParagraphStyle("ct", parent=ss["Title"], fontName="Helvetica-Bold",
                                      fontSize=30, textColor=INK, leading=34, alignment=TA_LEFT, spaceAfter=4),
        "cover_sub": ParagraphStyle("cs", parent=ss["Normal"], fontName="Helvetica",
                                    fontSize=13, textColor=MUTED, leading=18),
        "title": ParagraphStyle("title", parent=ss["Title"], fontName="Helvetica-Bold",
                                fontSize=18, textColor=INK, spaceAfter=2, leading=22, alignment=TA_LEFT),
        "h2": ParagraphStyle("h2", parent=ss["Heading2"], fontName="Helvetica-Bold",
                             fontSize=13, textColor=BRAND_DARK, spaceBefore=14, spaceAfter=6),
        "h3": ParagraphStyle("h3", parent=ss["Heading3"], fontName="Helvetica-Bold",
                             fontSize=10.5, textColor=INK, spaceBefore=8, spaceAfter=3),
        "body": ParagraphStyle("body", parent=ss["Normal"], fontName="Helvetica",
                               fontSize=10, textColor=INK, leading=15, alignment=TA_JUSTIFY),
        "small": ParagraphStyle("small", parent=ss["Normal"], fontName="Helvetica",
                                fontSize=8.5, textColor=MUTED, leading=12),
        "cell": ParagraphStyle("cell", parent=ss["Normal"], fontName="Helvetica",
                               fontSize=9.5, textColor=INK, leading=13),
        "cellb": ParagraphStyle("cellb", parent=ss["Normal"], fontName="Helvetica-Bold",
                                fontSize=9.5, textColor=INK, leading=13),
        "cellh": ParagraphStyle("cellh", parent=ss["Normal"], fontName="Helvetica-Bold",
                                fontSize=9.5, textColor=colors.white, leading=13),
        "hist_date": ParagraphStyle("hd", parent=ss["Normal"], fontName="Helvetica-Bold",
                                    fontSize=8.5, textColor=BRAND_DARK, leading=12),
        "hist_text": ParagraphStyle("ht", parent=ss["Normal"], fontName="Helvetica",
                                    fontSize=9.5, textColor=INK, leading=13),
        "callout": ParagraphStyle("co", parent=ss["Normal"], fontName="Helvetica",
                                  fontSize=10, textColor=INK, leading=15, alignment=TA_JUSTIFY),
    }


def _money(v: float) -> str:
    try:
        return f"\u20ac{float(v):,.0f}"
    except Exception:
        return str(v)


def _pct(v: float) -> str:
    try:
        return f"{float(v) * 100:.1f}%"
    except Exception:
        return "\u2014"


# ----------------------------- Charts -----------------------------------

def _donut_allocation(allocations: list[dict[str, Any]]) -> Drawing:
    """Donut chart of the disputed items by estimated value."""
    d = Drawing(460, 240)
    items = [(str(al.get("good_name") or "\u2014"), float(al.get("estimated_value") or 0.0))
             for al in allocations if float(al.get("estimated_value") or 0.0) > 0]
    if not items:
        return d
    total = sum(v for _, v in items) or 1.0
    pie = Pie()
    pie.x, pie.y, pie.width, pie.height = 30, 30, 170, 170
    pie.data = [v for _, v in items]
    pie.labels = [f"{round(v/total*100)}%" for _, v in items]
    pie.slices.strokeWidth = 1.0
    pie.slices.strokeColor = colors.white
    pie.slices.fontName, pie.slices.fontSize = "Helvetica", 7
    # Make it a DONUT by drilling a hole (innerRadiusFraction is supported on
    # reportlab Pie via setting it; if unavailable we fall back to a plain pie).
    try:
        pie.innerRadiusFraction = 0.55
    except Exception:
        pass
    for i in range(len(items)):
        pie.slices[i].fillColor = SERIES[i % len(SERIES)]
    d.add(pie)
    lg = Legend()
    lg.x, lg.y = 220, 190
    lg.dx = lg.dy = 7
    lg.fontName, lg.fontSize = "Helvetica", 8
    lg.boxAnchor = "nw"
    lg.columnMaximum = 10
    lg.colorNamePairs = [
        (SERIES[i % len(SERIES)], f"{nm[:22]}  \u20ac{v:,.0f}")
        for i, (nm, v) in enumerate(items)
    ]
    d.add(lg)
    return d


def _pie(value_share: dict[str, float], names: dict[int, str]) -> Drawing:
    d = Drawing(250, 200)
    items = sorted([(int(a), s) for a, s in value_share.items() if s and s > 0], key=lambda x: x[0])
    if not items:
        return d
    pie = Pie()
    pie.x, pie.y, pie.width, pie.height = 55, 45, 140, 140
    pie.data = [round(s * 100, 1) for _, s in items]
    pie.labels = [f"{round(s*100)}%" for _, s in items]
    pie.slices.strokeWidth = 0.5
    pie.slices.strokeColor = colors.white
    for i in range(len(items)):
        pie.slices[i].fillColor = SERIES[i % len(SERIES)]
    d.add(pie)
    lg = Legend()
    lg.x, lg.y = 15, 8
    lg.dx = lg.dy = 7
    lg.fontName, lg.fontSize = "Helvetica", 7
    lg.boxAnchor = "nw"
    lg.columnMaximum = 2
    lg.deltax = 90
    lg.colorNamePairs = [(SERIES[i % len(SERIES)], names.get(a, f"Party {a}")[:16]) for i, (a, _s) in enumerate(items)]
    d.add(lg)
    return d


def _donut_agents(allocations: list[dict[str, Any]]) -> Drawing:
    """Donut chart of how the total asset value divides across the parties.

    Mirrors the frontend 'Value received by each party' pie: each divisible split
    is apportioned by its fraction; indivisible items go wholly to the assignee.
    """
    d = Drawing(460, 240)
    per_agent: dict[str, float] = {}
    for al in allocations:
        val = float(al.get("estimated_value") or 0.0)
        if val <= 0:
            continue
        frby = al.get("fraction_by_name")
        if al.get("divisible") and frby:
            for nm, frac in frby.items():
                share = val * float(frac or 0)
                if share > 0:
                    per_agent[str(nm)] = per_agent.get(str(nm), 0.0) + share
        else:
            nm = str(al.get("assigned_agent_name") or "Unassigned")
            per_agent[nm] = per_agent.get(nm, 0.0) + val
    items = [(nm, v) for nm, v in per_agent.items() if v > 0]
    if not items:
        return d
    total = sum(v for _, v in items) or 1.0
    pie = Pie()
    pie.x, pie.y, pie.width, pie.height = 30, 30, 170, 170
    pie.data = [v for _, v in items]
    pie.labels = [f"{round(v/total*100)}%" for _, v in items]
    pie.slices.strokeWidth = 1.0
    pie.slices.strokeColor = colors.white
    pie.slices.fontName, pie.slices.fontSize = "Helvetica", 7
    try:
        pie.innerRadiusFraction = 0.55
    except Exception:
        pass
    for i in range(len(items)):
        pie.slices[i].fillColor = SERIES[i % len(SERIES)]
    d.add(pie)
    lg = Legend()
    lg.x, lg.y = 220, 190
    lg.dx = lg.dy = 7
    lg.fontName, lg.fontSize = "Helvetica", 8
    lg.boxAnchor = "nw"
    lg.columnMaximum = 10
    lg.colorNamePairs = [
        (SERIES[i % len(SERIES)], f"{nm[:22]}  €{v:,.0f}")
        for i, (nm, v) in enumerate(items)
    ]
    d.add(lg)
    return d


def _bar_valuations(per_good_vals: list[dict[str, Any]], names: dict[int, str], agent_ids: list[int]) -> Drawing:
    """Grouped bars: each good's valuation by each party (the divergence)."""
    d = Drawing(500, 210)
    goods = [g for g in per_good_vals][:6]
    if not goods or not agent_ids:
        return d
    series_data = []
    for aid in agent_ids:
        series_data.append([float(g["party_valuations"].get(str(aid), 0.0)) for g in goods])
    bc = VerticalBarChart()
    bc.x, bc.y, bc.width, bc.height = 40, 45, 360, 140
    bc.data = series_data
    bc.barWidth = 5
    bc.groupSpacing = 12
    bc.barSpacing = 1
    maxv = max((max(s) for s in series_data if s), default=1) or 1
    bc.valueAxis.valueMin = 0
    bc.valueAxis.valueMax = maxv * 1.15
    bc.valueAxis.labels.fontName = "Helvetica"
    bc.valueAxis.labels.fontSize = 7
    bc.categoryAxis.labels.fontName = "Helvetica"
    bc.categoryAxis.labels.fontSize = 7
    bc.categoryAxis.labels.angle = 15
    bc.categoryAxis.labels.dy = -6
    bc.categoryAxis.categoryNames = [str(g["good_name"])[:14] for g in goods]
    for i, _aid in enumerate(agent_ids):
        bc.bars[i].fillColor = SERIES[i % len(SERIES)]
    d.add(bc)
    lg = Legend()
    lg.x, lg.y = 405, 150
    lg.dx = lg.dy = 8
    lg.fontName, lg.fontSize = "Helvetica", 7.5
    lg.boxAnchor = "nw"
    lg.colorNamePairs = [(SERIES[i % len(SERIES)], names.get(a, f"Party {a}")[:16]) for i, a in enumerate(agent_ids)]
    d.add(lg)
    return d


# ----------------------------- Header / footer --------------------------

def _later_pages(canvas, doc):
    canvas.saveState()
    w, h = A4
    canvas.setFillColor(BRAND_DARK)
    canvas.rect(0, h - 5 * mm, w, 5 * mm, stroke=0, fill=1)
    try:
        if LOGO.exists():
            canvas.drawImage(ImageReader(str(LOGO)), 15 * mm, h - 24 * mm, width=13 * mm, height=13 * mm,
                             preserveAspectRatio=True, mask="auto")
    except Exception:
        pass
    canvas.setFont("Helvetica-Bold", 8)
    canvas.setFillColor(MUTED)
    canvas.drawRightString(w - 15 * mm, h - 15 * mm, "CREA3 \u2014 Dispute Resolution Report")
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(15 * mm, 14 * mm, w - 15 * mm, 14 * mm)
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(15 * mm, 9 * mm, "Confidential \u2014 for the parties and mediators of this dispute only.")
    canvas.drawRightString(w - 15 * mm, 9 * mm, f"Page {doc.page}")
    canvas.restoreState()


def _cover_page(canvas, doc, *, dispute, kind, gen_str):
    canvas.saveState()
    w, h = A4
    # Full-width brand band at top
    canvas.setFillColor(BRAND_DARK)
    canvas.rect(0, h - 70 * mm, w, 70 * mm, stroke=0, fill=1)
    canvas.setFillColor(BRAND)
    canvas.rect(0, h - 72 * mm, w, 2 * mm, stroke=0, fill=1)
    # Logo
    try:
        if LOGO.exists():
            canvas.drawImage(ImageReader(str(LOGO)), 18 * mm, h - 55 * mm, width=34 * mm, height=34 * mm,
                             preserveAspectRatio=True, mask="auto")
    except Exception:
        pass
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 13)
    canvas.drawString(58 * mm, h - 32 * mm, "CREA3")
    canvas.setFont("Helvetica", 9.5)
    canvas.drawString(58 * mm, h - 38 * mm, "Conflict Resolution with Equitative Algorithms")

    # Title block
    canvas.setFillColor(INK)
    canvas.setFont("Helvetica-Bold", 30)
    title = "Dispute Resolution Proposal" if kind == "proposal" else "Final Dispute Resolution Report"
    # wrap manually if needed
    canvas.drawString(18 * mm, h - 100 * mm, "Dispute Resolution")
    canvas.drawString(18 * mm, h - 113 * mm, "Proposal" if kind == "proposal" else "Final Report")

    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 13)
    canvas.drawString(18 * mm, h - 126 * mm, f"Dispute #{getattr(dispute,'id','')} \u2014 {getattr(dispute,'title','')}")

    # Meta box
    canvas.setStrokeColor(BORDER)
    canvas.setFillColor(SOFT)
    canvas.roundRect(18 * mm, h - 168 * mm, w - 36 * mm, 32 * mm, 4, stroke=1, fill=1)
    canvas.setFillColor(MUTED); canvas.setFont("Helvetica", 9)
    canvas.drawString(24 * mm, h - 146 * mm, "Status")
    canvas.drawString(24 * mm, h - 156 * mm, "Method")
    canvas.drawString(95 * mm, h - 146 * mm, "Generated")
    canvas.drawString(95 * mm, h - 156 * mm, "Confidentiality")
    canvas.setFillColor(INK); canvas.setFont("Helvetica-Bold", 9.5)
    canvas.drawString(48 * mm, h - 146 * mm, str(getattr(dispute, "status", "")))
    canvas.drawString(48 * mm, h - 156 * mm, str(getattr(dispute, "method", "")))
    canvas.drawString(125 * mm, h - 146 * mm, gen_str)
    canvas.drawString(125 * mm, h - 156 * mm, "Restricted")

    # Confidentiality strip
    canvas.setFillColor(LIGHT)
    canvas.roundRect(18 * mm, 22 * mm, w - 36 * mm, 16 * mm, 3, stroke=0, fill=1)
    canvas.setFillColor(BRAND_DARK); canvas.setFont("Helvetica-Bold", 9)
    canvas.drawString(24 * mm, 31 * mm, "Confidential document")
    canvas.setFillColor(MUTED); canvas.setFont("Helvetica", 8)
    canvas.drawString(24 * mm, 26 * mm,
                      "Distributed only to the parties and mediators of this dispute. Individual preferences are not disclosed.")
    canvas.restoreState()


# ----------------------------- Main -------------------------------------

def build_report_pdf(
    *,
    out_path: str,
    dispute: Any,
    agents: list[Any],
    goods: list[Any],
    proposal: Any,
    history: list[dict[str, str]] | None = None,
    acceptances: list[dict[str, Any]] | None = None,
    kind: str = "proposal",
    lang: str = "en",
) -> str:
    # Section headings / fixed labels translated into the 7 platform languages.
    # The long generated legal paragraphs remain in English (see report note);
    # the document STRUCTURE is localized to the reader's language.
    HEADINGS = {
        "executive_summary": {"en": "Executive summary", "it": "Sintesi", "sl": "Povzetek", "et": "Kokkuvõte", "be": "Résumé", "lt": "Santrauka", "hr": "Sažetak", "nl": "Samenvatting"},
        "parties": {"en": "Parties to the dispute", "it": "Parti della controversia", "sl": "Stranke v sporu", "et": "Vaidluse osapooled", "be": "Parties au litige", "lt": "Ginčo šalys", "hr": "Stranke u sporu", "nl": "Partijen bij het geschil"},
        "positions": {"en": "Stated positions", "it": "Posizioni dichiarate", "sl": "Navedena stališča", "et": "Esitatud seisukohad", "be": "Positions déclarées", "lt": "Pareikštos pozicijos", "hr": "Navedeni stavovi", "nl": "Ingenomen standpunten"},
        "timeline": {"en": "Timeline of the dispute", "it": "Cronologia della controversia", "sl": "Časovnica spora", "et": "Vaidluse ajajoon", "be": "Chronologie du litige", "lt": "Ginčo eiga", "hr": "Vremenski slijed spora", "nl": "Tijdlijn van het geschil"},
        "assets": {"en": "Disputed Assets &amp; Preferences", "it": "Beni contesi e preferenze", "sl": "Sporno premoženje in preference", "et": "Vaidlusalune vara ja eelistused", "be": "Biens en litige et préférences", "lt": "Ginčijamas turtas ir pirmenybės", "hr": "Sporna imovina i preferencije", "nl": "Betwiste goederen &amp; voorkeuren"},
        "valuation_each": {"en": "Valuation of each asset by each party:", "it": "Valutazione di ciascun bene da parte di ciascuna parte:", "sl": "Vrednotenje vsakega premoženja s strani vsake stranke:", "et": "Iga vara hindamine iga osapoole poolt:", "be": "Évaluation de chaque bien par chaque partie :", "lt": "Kiekvieno turto vertinimas kiekvienos šalies:", "hr": "Procjena svake imovine od strane svake stranke:", "nl": "Waardering van elk goed door elke partij:"},
        "proposed_allocation": {"en": "Proposed allocation", "it": "Ripartizione proposta", "sl": "Predlagana razdelitev", "et": "Kavandatud jaotus", "be": "Répartition proposée", "lt": "Siūlomas paskirstymas", "hr": "Predložena raspodjela", "nl": "Voorgestelde verdeling"},
        "at_a_glance": {"en": "Allocation at a glance", "it": "Ripartizione in sintesi", "sl": "Razdelitev na prvi pogled", "et": "Jaotus lühidalt", "be": "Répartition en un coup d'œil", "lt": "Paskirstymas trumpai", "hr": "Raspodjela na prvi pogled", "nl": "Verdeling in één oogopslag"},
        "fairness": {"en": "Fairness summary", "it": "Sintesi di equità", "sl": "Povzetek pravičnosti", "et": "Õigluse kokkuvõte", "be": "Résumé d'équité", "lt": "Teisingumo santrauka", "hr": "Sažetak pravednosti", "nl": "Billijkheidsoverzicht"},
        "summary_mediation": {"en": "Summary and mediation proposal", "it": "Sintesi e proposta di mediazione", "sl": "Povzetek in predlog mediacije", "et": "Kokkuvõte ja vahendusettepanek", "be": "Résumé et proposition de médiation", "lt": "Santrauka ir tarpininkavimo pasiūlymas", "hr": "Sažetak i prijedlog medijacije", "nl": "Samenvatting en bemiddelingsvoorstel"},
        "path": {"en": "Proposed path to resolution", "it": "Percorso proposto per la risoluzione", "sl": "Predlagana pot do rešitve", "et": "Kavandatud lahendustee", "be": "Voie proposée vers la résolution", "lt": "Siūlomas kelias į sprendimą", "hr": "Predloženi put do rješenja", "nl": "Voorgestelde weg naar een oplossing"},
        "legal_notice": {"en": "Legal notice and intended use", "it": "Avviso legale e uso previsto", "sl": "Pravno obvestilo in predvidena uporaba", "et": "Õiguslik teave ja kavandatud kasutus", "be": "Mention légale et utilisation prévue", "lt": "Teisinis pranešimas ir numatomas naudojimas", "hr": "Pravna napomena i namjena", "nl": "Juridische kennisgeving en beoogd gebruik"},
        "partners": {"en": "Consortium partners", "it": "Partner del consorzio", "sl": "Partnerji konzorcija", "et": "Konsortsiumi partnerid", "be": "Partenaires du consortium", "lt": "Konsorciumo partneriai", "hr": "Partneri konzorcija", "nl": "Consortiumpartners"},
        "decisions": {"en": "Party decisions", "it": "Decisioni delle parti", "sl": "Odločitve strank", "et": "Osapoolte otsused", "be": "Décisions des parties", "lt": "Šalių sprendimai", "hr": "Odluke stranaka", "nl": "Beslissingen van de partijen"},
    }
    _lang = lang if lang in ("en", "it", "sl", "et", "be", "nl", "lt", "hr") else "en"
    from .report_i18n import body as _RB
    def B(key: str, **kw) -> str:
        txt = _RB(key, _lang)
        return txt.format(**kw) if kw else txt

    def H(key: str) -> str:
        return HEADINGS.get(key, {}).get(_lang) or HEADINGS.get(key, {}).get("en") or key

    st = _styles()
    gen_str = datetime.now(timezone.utc).strftime("%d %b %Y, %H:%M UTC")

    doc = SimpleDocTemplate(
        out_path, pagesize=A4,
        leftMargin=15 * mm, rightMargin=15 * mm, topMargin=28 * mm, bottomMargin=20 * mm,
        title=f"CREA3 Dispute #{getattr(dispute,'id','')} Report", author="CREA3 Platform",
    )

    names = {a.id: a.name for a in agents}
    entitlement = {a.id: float(a.entitlement_share or 0.0) for a in agents}
    non_med = [a for a in agents if (a.role_in_dispute or "agent").lower() != "mediator"]
    non_med_ids = [a.id for a in non_med]

    outputs = proposal.outputs or {}
    metrics = proposal.metrics or {}
    allocations = outputs.get("allocations", []) or []
    value_share = metrics.get("value_share_by_agent", {}) or {}
    value_by_agent = metrics.get("value_by_agent", {}) or {}
    deviation = metrics.get("deviation_vs_entitlement_share", {}) or {}
    subjective = metrics.get("subjective_value_by_agent", {}) or {}
    perceived_total = metrics.get("perceived_total_by_agent", {}) or {}
    compensation = metrics.get("compensation_by_agent", {}) or {}
    gt_fair = metrics.get("gt_fair_share_by_agent", {}) or {}
    gt_received = metrics.get("gt_received_by_agent", {}) or {}
    gt_surplus = metrics.get("gt_surplus_by_agent", {}) or {}
    gt_final_adv = metrics.get("gt_final_advantage_by_agent", {}) or {}
    comp_note = metrics.get("compensation_note", "") or outputs.get("compensation_note", "")
    gap_total = metrics.get("valuation_gap_total", 0.0)
    omitted_assets = metrics.get("omitted_assets", []) or outputs.get("omitted_assets", []) or []
    disclosure_note = metrics.get("disclosure_note", "") or outputs.get("disclosure_note", "")

    story: list[Any] = []

    # ---------- Cover (rendered via onPage); push content to page 2 ----------
    story.append(Spacer(1, 1))
    story.append(PageBreak())

    # ---------- Executive summary ----------
    story.append(Paragraph(H("executive_summary"), st["title"]))
    story.append(HRFlowable(width="100%", thickness=1.2, color=BRAND, spaceBefore=2, spaceAfter=8))
    total_est = sum(float(g.estimated_value or 0.0) for g in goods)
    party_names = [a.name for a in non_med if a.name]
    if len(party_names) == 2:
        who = f"{party_names[0]} and {party_names[1]}"
    elif party_names:
        who = ", ".join(party_names[:-1]) + f" {B('w_and')} {party_names[-1]}" if len(party_names) > 1 else party_names[0]
    else:
        who = B("w_parties", n=len(non_med))

    # Paragraph 1: what this is and who it concerns.
    p1 = B("p1_proposal" if kind == "proposal" else "p1_final",
           id=getattr(dispute, "id", ""), title=getattr(dispute, "title", ""),
           who=who, n_assets=len(goods))
    story.append(Paragraph(p1, st["body"]))
    story.append(Spacer(1, 5))

    # Paragraph 2: how the method works, in plain language.
    p2 = B("p2")
    story.append(Paragraph(p2, st["body"]))
    story.append(Spacer(1, 5))

    # Paragraph 3: what the reader will find, and confidentiality.
    p3 = B("p3")
    story.append(Paragraph(p3, st["body"]))

    # ---------- Parties ----------
    story.append(Paragraph(H("parties"), st["h2"]))
    ent_detail = {int(d["agent_id"]): d for d in (metrics.get("entitlement_detail") or [])}
    ent_mismatch = bool(metrics.get("entitlement_mismatch"))
    if ent_mismatch:
        p_rows = [[Paragraph(t, st["cellh"]) for t in [B("h_party"), B("h_assigned"), B("h_claimed"), B("h_share_used"), B("h_status")]]]
        for a in non_med:
            d = ent_detail.get(a.id, {})
            claimed = d.get("claimed")
            p_rows.append([
                Paragraph(a.name or "\u2014", st["cell"]),
                Paragraph(_pct(d.get("assigned", a.entitlement_share or 0.0)), st["cell"]),
                Paragraph(_pct(claimed) if claimed is not None else "\u2014", st["cell"]),
                Paragraph(_pct(d.get("normalized_share", 0.0)), st["cellb"]),
                Paragraph((a.invite_status or "\u2014").capitalize(), st["cell"]),
            ])
        pt = Table(p_rows, colWidths=[5.0 * cm, 3.0 * cm, 3.0 * cm, 3.0 * cm, 3.0 * cm], repeatRows=1)
        pt.setStyle(_tbl_style(header=BRAND_DARK))
        story.append(pt)
        story.append(Spacer(1, 4))
        story.append(Paragraph(B("ent_dispute_note"), st["small"])
            if metrics.get("entitlement_shares_in_dispute") else
            Paragraph(B("ent_consistent_note"), st["small"]))
        # Each party's own stated position (free-text justification, <=50 chars).
        positions = [(d.get("name"), (d.get("position") or "").strip())
                     for d in (metrics.get("entitlement_detail") or []) if (d.get("position") or "").strip()]
        if positions:
            story.append(Spacer(1, 6))
            story.append(Paragraph(H("positions"), st["h3"] if "h3" in st else st["small"]))
            for nm, pos in positions:
                story.append(Paragraph(f"<b>{nm}:</b> \u201c{pos}\u201d", st["small"]))
    else:
        p_rows = [[Paragraph(t, st["cellh"]) for t in [B("h_party"), B("h_ent_share"), B("h_status")]]]
        for a in non_med:
            p_rows.append([
                Paragraph(a.name or "\u2014", st["cell"]),
                Paragraph(_pct(a.entitlement_share or 0.0), st["cell"]),
                Paragraph((a.invite_status or "\u2014").capitalize(), st["cell"]),
            ])
        pt = Table(p_rows, colWidths=[8.0 * cm, 4.5 * cm, 4.5 * cm], repeatRows=1)
        pt.setStyle(_tbl_style(header=BRAND_DARK))
        story.append(pt)

    # ---------- Full timeline (placed right after the parties) ----------
    if history:
        story.append(Paragraph(H("timeline"), st["h2"]))
        story.append(Paragraph(B("timeline_note"), st["small"]))
        story.append(Spacer(1, 4))
        h_rows = []
        for h in history:
            h_rows.append([
                Paragraph(h.get("date", ""), st["hist_date"]),
                Paragraph(h.get("text", ""), st["hist_text"]),
            ])
        if h_rows:
            ht = Table(h_rows, colWidths=[3.4 * cm, 13.4 * cm])
            ht.setStyle(TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LINEBELOW", (0, 0), (-1, -2), 0.4, BORDER),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (0, -1), 2),
                ("LINEAFTER", (0, 0), (0, -1), 1.5, BRAND),
                ("LEFTPADDING", (1, 0), (1, -1), 10),
            ]))
            story.append(ht)

    story.append(PageBreak())

    # ---------- Assets & divergent valuations (KEY new section) ----------
    story.append(Paragraph(H("assets"), st["title"]))
    story.append(HRFlowable(width="100%", thickness=1.2, color=BRAND, spaceBefore=2, spaceAfter=8))
    story.append(Paragraph(B("assets_intro"), st["body"]))
    story.append(Spacer(1, 6))

    head = [B("h_asset")]
    for a in non_med:
        head.append(f"{(a.name or '').split(' ')[0]}")
    head.append(B("h_spread"))
    head.append(B("h_reference"))
    v_rows = [[Paragraph(t, st["cellh"]) for t in head]]
    for al in allocations:
        row = [Paragraph(str(al.get("good_name") or "\u2014"), st["cell"])]
        pv = al.get("party_valuations", {})
        vals = {aid: float(pv.get(str(aid), 0.0)) for aid in non_med_ids}
        hi = max(vals.values()) if vals else 0.0
        # do all acknowledging parties agree on the same value?
        present = [v for v in vals.values() if v > 0]
        all_same = len(present) >= 2 and (max(present) - min(present)) < 0.01
        for aid in non_med_ids:
            v = vals.get(aid, 0.0)
            txt = _money(v)
            if all_same:
                row.append(Paragraph(txt, st["cell"]))  # agreed: no highlight needed
            elif v == hi and hi > 0:
                row.append(Paragraph(f'<b><font color="#34a853">{txt}</font></b>', st["cell"]))
            else:
                row.append(Paragraph(txt, st["cell"]))
        gap = float(al.get("valuation_gap", 0.0))
        if al.get("contested_by_omission"):
            row.append(Paragraph('<font color="#e57373">one-sided</font>', st["cell"]))
        elif all_same:
            row.append(Paragraph('<font color="#34a853">agreed</font>', st["cell"]))
        elif al.get("reconciled_to_mean"):
            row.append(Paragraph('<font color="#34a853">\u2713 reconciled</font>', st["cell"]))
        else:
            row.append(Paragraph(f'<font color="#cda434">{_money(gap)}</font>' if gap > 0 else "\u2014", st["cell"]))
        row.append(Paragraph(_money(al.get("estimated_value") or 0.0), st["small"]))
        v_rows.append(row)

    base_w = (17.0 - 3.0 - 2.4) / max(1, (len(non_med_ids) + 1))
    colw = [4.4 * cm] + [base_w * cm] * len(non_med_ids) + [3.0 * cm, 2.4 * cm]
    vt = Table(v_rows, colWidths=colw, repeatRows=1)
    vt.setStyle(_tbl_style(header=BRAND_DARK))
    story.append(vt)
    story.append(Paragraph(B("green_note"), st["small"]))

    # valuation chart
    story.append(Spacer(1, 8))
    story.append(KeepTogether([
        Paragraph(H("valuation_each"), st["small"]),
        Spacer(1, 2),
        _bar_valuations(allocations, names, non_med_ids),
    ]))

    # ---------- Proposed allocation (allocation ONLY) ----------
    story.append(Paragraph(H("proposed_allocation"), st["h2"]))
    story.append(Paragraph(B("alloc_note"), st["small"]))
    story.append(Spacer(1, 4))
    a_rows = [[Paragraph(t, st["cellh"]) for t in [B("h_asset"), B("h_awarded_to"), B("h_awarded_val"), B("h_est_value")]]]
    for al in allocations:
        if al.get("divisible") and al.get("fraction_by_name"):
            # Show the split, e.g. "Mario 52.7% · Lucia 47.3%"
            parts = [f"{nm} {frac*100:.1f}%" for nm, frac in al["fraction_by_name"].items() if frac > 0.0005]
            awarded = " \u00b7 ".join(parts) if parts else "Split"
            awarded_cell = Paragraph(f"<i>split</i> \u2014 {awarded}", st["cellb"])
            val_cell = Paragraph("\u2014", st["cell"])  # split value shown in fairness section
        else:
            awarded_cell = Paragraph(str(al.get("assigned_agent_name") or "Unassigned"), st["cellb"])
            val_cell = Paragraph(_money(al.get("assigned_value") or 0.0), st["cell"])
        a_rows.append([
            Paragraph(str(al.get("good_name") or "\u2014"), st["cell"]),
            awarded_cell,
            val_cell,
            Paragraph(_money(al.get("estimated_value") or 0.0), st["cell"]),
        ])
    at = Table(a_rows, colWidths=[5.4 * cm, 5.2 * cm, 3.6 * cm, 2.6 * cm], repeatRows=1)
    at.setStyle(_tbl_style(header=BRAND))
    story.append(at)

    # ---------- Allocation donut chart (own page) ----------
    story.append(PageBreak())
    story.append(Paragraph(H("at_a_glance"), st["h2"]))
    story.append(Paragraph(B("chart_assets_note"), st["small"]))
    story.append(Spacer(1, 10))
    total_alloc = sum(float(al.get("estimated_value") or 0.0) for al in allocations)
    story.append(_donut_allocation(allocations))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        B("total_note", total=_money(total_alloc),
          n=len([a for a in allocations if float(a.get("estimated_value") or 0) > 0])), st["small"]))

    # Second pie: how the total value divides across the parties (matches the app).
    story.append(Spacer(1, 18))
    story.append(Paragraph(B("value_received_title"), st["h2"]))
    story.append(Paragraph(B("value_received_note"), st["small"]))
    story.append(Spacer(1, 10))
    story.append(_donut_agents(allocations))

    story.append(PageBreak())

    # ---------- Fairness summary (plain language, framed around the gaps) ----------
    story.append(Paragraph(H("fairness"), st["title"]))
    story.append(HRFlowable(width="100%", thickness=1.2, color=BRAND, spaceBefore=2, spaceAfter=8))

    # Plain-language framing: because the parties value the assets differently,
    # the assets each party receives are not worth the same to them. We describe
    # the GAP that emerges and the BALANCING amount that closes it, without ever
    # instructing a party to "compensate".
    has_one_sided = bool(omitted_assets)
    intro = B("fairness_intro")
    story.append(Paragraph(intro, st["body"]))
    story.append(Spacer(1, 6))

    f_rows = [[Paragraph(t, st["cellh"]) for t in
               [B("h_party"), B("h_value_recv"), B("h_fair"), B("h_gap"), B("h_balance")]]]
    for a in non_med:
        aid = str(a.id)
        surplus = float(gt_surplus.get(aid, 0.0))  # received - fair (the gap, signed)
        gap_txt = (f'<font color="#34a853">+{_money(surplus)}</font>' if surplus > 0
                   else (f'<font color="#e57373">{_money(surplus)}</font>' if surplus < 0 else "\u2014"))
        comp = float(compensation.get(aid, 0.0))   # cash: + receives, - pays
        if abs(comp) < 0.005:
            pay_txt = "\u2014"
        elif comp > 0:
            pay_txt = f'<font color="#34a853">receives {_money(comp)}</font>'
        else:
            pay_txt = f'<font color="#e57373">pays {_money(-comp)}</font>'
        f_rows.append([
            Paragraph(a.name or "\u2014", st["cell"]),
            Paragraph(_money(gt_received.get(aid, subjective.get(aid, 0.0))), st["cell"]),
            Paragraph(_money(gt_fair.get(aid, 0.0)), st["cell"]),
            Paragraph(gap_txt, st["cell"]),
            Paragraph(pay_txt, st["cell"]),
        ])
    ft = Table(f_rows, colWidths=[4.0 * cm, 3.3 * cm, 3.0 * cm, 3.0 * cm, 3.7 * cm], repeatRows=1)
    ft.setStyle(_tbl_style(header=BRAND_DARK))
    story.append(ft)
    story.append(Paragraph(B("fairness_legend"), st["small"]))

    # Side-by-side comparison chart: the two parties placed back-to-back, each
    # asset's valuation extending left for one and right for the other, so the
    # differences and any one-sided asset are immediately clear.
    if len(non_med_ids) == 2 and allocations:
        story.append(Spacer(1, 8))
        story.append(KeepTogether([
            Paragraph(
                f"How each party values the assets \u2014 {names.get(non_med_ids[0], 'first party')} (left) vs. "
                f"{names.get(non_med_ids[1], 'second party')} (right):", st["small"]),
            Spacer(1, 4),
            _diverging_two_sided(allocations, names, non_med_ids[0], non_med_ids[1]),
        ]))

    # ---------- Dispute summary & mediation proposal (own page) ----------
    story.append(PageBreak())
    story.append(Paragraph(H("summary_mediation"), st["title"]))
    story.append(HRFlowable(width="100%", thickness=1.2, color=BRAND, spaceBefore=2, spaceAfter=8))

    # Build deterministic, data-driven summary text (no LLM).
    n_assets = len(allocations)
    party_names_sum = [a.name for a in non_med if a.name]
    who_sum = (f"{party_names_sum[0]} {B('w_and')} {party_names_sum[1]}" if len(party_names_sum) == 2
               else (", ".join(party_names_sum) if party_names_sum else B("w_parties", n=len(non_med))))
    # Transfer description
    transfer_amt = 0.0
    payer = payee = None
    comp = metrics.get("compensation_by_agent", {}) or {}
    for aid_s, c in comp.items():
        if c is not None and float(c) < -0.005:
            payer = names.get(int(aid_s)); transfer_amt = -float(c)
        elif c is not None and float(c) > 0.005:
            payee = names.get(int(aid_s))
    divisible_names = [al.get("good_name") for al in allocations if al.get("divisible")]

    summary = B("sum_base", n_assets=n_assets, who=who_sum) + f" ({_money(total_alloc)})"
    if divisible_names:
        nm_list = ", ".join(str(n) for n in divisible_names)
        summary += B("sum_split", nm_list=nm_list)
    if transfer_amt > 0.005 and payer and payee:
        summary += B("sum_transfer", amount=_money(transfer_amt), payer=payer, payee=payee)
    else:
        summary += B("sum_balanced")
    if metrics.get("entitlement_shares_in_dispute"):
        summary += B("sum_ent_dispute")
    elif metrics.get("entitlement_mismatch"):
        summary += B("sum_ent_consistent")
    story.append(Paragraph(summary, st["body"]))
    story.append(Spacer(1, 8))

    # Mediation proposal — concrete, neutral next steps.
    story.append(Paragraph(H("path"), st["h2"]))
    steps = [B("step_review"), B("step_confirm")]
    if metrics.get("entitlement_mismatch"):
        steps.append(B("step_resolve_ent"))
    if divisible_names:
        steps.append(B("step_divisible"))
    steps.append(B("step_mediation"))
    steps.append(B("step_formalize"))
    for i, s_txt in enumerate(steps, 1):
        story.append(Paragraph(f"<b>{i}.</b> {s_txt}", st["body"]))
        story.append(Spacer(1, 3))
    story.append(Spacer(1, 4))
    story.append(Paragraph(B("not_binding"), st["small"]))

    # ---------- Party decisions (accept / reject) ----------
    # Shows the outcome of the parties' decisions on this proposal.
    if acceptances:
        story.append(Spacer(1, 10))
        story.append(Paragraph(H("decisions"), st["h2"]))
        d_rows = [[Paragraph(t, st["cellh"]) for t in [B("h_party"), B("h_decision"), B("h_comment")]]]
        for a in acceptances:
            acc = a.get("accepted")
            decision = B("w_accepted") if acc is True else (B("w_rejected") if acc is False else B("w_pending"))
            d_rows.append([
                Paragraph(a.get("name") or "\u2014", st["cell"]),
                Paragraph(decision, st["cellb"]),
                Paragraph(a.get("comment") or "\u2014", st["cell"]),
            ])
        dt = Table(d_rows, colWidths=[5.0 * cm, 3.5 * cm, 8.5 * cm], repeatRows=1)
        dt.setStyle(_tbl_style(header=BRAND_DARK))
        story.append(dt)
        story.append(Spacer(1, 4))

    # ---------- Legal notice and intended use ----------
    status_line = B("status_proposal") if kind == "proposal" else B("status_final")
    disclaimer_html = B("disclaimer", status_line=status_line)
    notice = Table([[Paragraph(disclaimer_html, st["callout"])]], colWidths=[17.0 * cm])
    notice.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), SOFT),
        ("BOX", (0, 0), (-1, -1), 1, BORDER),
        ("LINEBEFORE", (0, 0), (0, -1), 3, BRAND),
        ("LEFTPADDING", (0, 0), (-1, -1), 14),
        ("RIGHTPADDING", (0, 0), (-1, -1), 14),
        ("TOPPADDING", (0, 0), (-1, -1), 12),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
    ]))
    # ---------- Legal notice + consortium partners (same page) ----------
    story.append(PageBreak())
    story.append(Paragraph(H("legal_notice"), st["h2"]))
    story.append(notice)

    try:
        if PARTNERS.exists():
            story.append(Spacer(1, 14))
            story.append(Paragraph(H("partners"), st["h2"]))
            story.append(Paragraph(B("partners_intro"), st["small"]))
            story.append(Spacer(1, 8))
            story.append(Image(str(PARTNERS), width=13.5 * cm, height=13.5 * cm * (635.0 / 935.0)))
            story.append(Spacer(1, 8))
            story.append(HRFlowable(width="100%", thickness=0.5, color=BORDER, spaceAfter=6))
            story.append(Paragraph(B("eu_note"), st["small"]))
    except Exception:
        pass

    def _first(canvas, d):
        _cover_page(canvas, d, dispute=dispute, kind=kind, gen_str=gen_str)

    doc.build(story, onFirstPage=_first, onLaterPages=_later_pages)

    data = Path(out_path).read_bytes()
    return sha256(data).hexdigest()


def _diverging_two_sided(allocations, names, left_id, right_id):
    """Back-to-back (tornado) chart comparing two parties' valuations per asset.

    Left party's valuations grow leftward from a central axis; right party's grow
    rightward. Makes the divergence between the two parties immediately visible.
    """
    from reportlab.graphics.shapes import String, Rect, Line, Group

    goods = list(allocations)[:8]
    d = Drawing(500, max(150, 40 + 26 * len(goods)))
    if not goods:
        return d

    cx = 250.0          # center axis x
    half = 150.0        # max bar length each side
    row_h = 22.0
    top = d.height - 24

    # scale based on the largest valuation on either side
    maxv = 1.0
    for g in goods:
        pv = g.get("party_valuations", {})
        maxv = max(maxv, float(pv.get(str(left_id), 0.0)), float(pv.get(str(right_id), 0.0)))
    scale = half / maxv if maxv > 0 else 0.0

    cL = SERIES[0]
    cR = SERIES[1]

    # header labels
    d.add(String(cx - half, d.height - 12, names.get(left_id, "Party A")[:22],
                 fontName="Helvetica-Bold", fontSize=8, fillColor=cL, textAnchor="start"))
    d.add(String(cx + half, d.height - 12, names.get(right_id, "Party B")[:22],
                 fontName="Helvetica-Bold", fontSize=8, fillColor=cR, textAnchor="end"))

    for i, g in enumerate(goods):
        y = top - i * row_h
        pv = g.get("party_valuations", {})
        lv = float(pv.get(str(left_id), 0.0))
        rv = float(pv.get(str(right_id), 0.0))
        lw = lv * scale
        rw = rv * scale
        # left bar (grows left from center)
        d.add(Rect(cx - lw, y - 7, lw, 12, fillColor=cL, strokeColor=None))
        # right bar (grows right from center)
        d.add(Rect(cx, y - 7, rw, 12, fillColor=cR, strokeColor=None))
        # value labels
        if lv > 0:
            d.add(String(cx - lw - 3, y - 3, _money(lv), fontName="Helvetica", fontSize=6.5,
                         fillColor=INK, textAnchor="end"))
        if rv > 0:
            d.add(String(cx + rw + 3, y - 3, _money(rv), fontName="Helvetica", fontSize=6.5,
                         fillColor=INK, textAnchor="start"))
        # asset name centered above the row, on the axis
        nm = str(g.get("good_name") or "")[:24]
        d.add(String(cx, y + 7, nm, fontName="Helvetica", fontSize=6.5, fillColor=MUTED, textAnchor="middle"))
        # flag omitted-by-one-party assets
        if g.get("contested_by_omission"):
            d.add(String(cx, y - 13, "⚠ acknowledged by one party only", fontName="Helvetica-Oblique",
                         fontSize=6, fillColor=WARN, textAnchor="middle"))

    # center axis
    d.add(Line(cx, 6, cx, d.height - 18, strokeColor=BORDER, strokeWidth=1))
    return d


def _tbl_style(*, header) -> TableStyle:
    return TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), header),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, header),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ])
