"""Parse the PDF LinkedIn generates from a profile (Profile → More → Save to PDF).

The layout is fixed and machine-generated, so we lean on it rather than on text
heuristics: a narrow left sidebar (Contact, Top Skills, Languages,
Certifications, …) and a main column whose font sizes encode the structure:

    26     name
    15.75  section heading (Summary / Experience / Education …)
    13     sidebar heading
    12     headline + location (before 1st heading), summary text, company, school
    11.5   role title
    10.5   date range, location, description, degree line
    9      "Page N of M" footer

A company with several roles prints the company (12) followed by its total
duration (10.5, no date range) and then each role (11.5).
"""
import io
import re
from typing import Dict, List, Optional, Tuple

from .schemas import ProfileData

# Vertical gap (pt) between consecutive lines of one paragraph is ~15–18; a
# blank line between paragraphs makes it ~36.
PARA_GAP = 26
WRAP_GAP = 16  # sidebar items: wrapped continuation lines sit closer than items

_MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6, "july": 7,
    "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6, "julio": 7,
    "agosto": 8, "septiembre": 9, "setiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
}
_PRESENT = {"present", "presente", "actualidad", "actual", "hoy", "today"}

_MAIN_SECTIONS = {
    "summary": "summary", "extracto": "summary", "resumen": "summary", "about": "summary", "acerca de": "summary",
    "experience": "experience", "experiencia": "experience",
    "education": "education", "educación": "education", "educacion": "education", "formación": "education",
}
_SIDE_SECTIONS = {
    "contact": "contact", "contactar": "contact", "contacto": "contact",
    "top skills": "skills", "aptitudes principales": "skills", "skills": "skills", "aptitudes": "skills",
    "languages": "languages", "idiomas": "languages",
    "certifications": "certifications", "certificaciones": "certifications",
    "licenses & certifications": "certifications", "licencias y certificaciones": "certifications",
}


class Line:
    __slots__ = ("text", "size", "gap")

    def __init__(self, text: str, size: float, gap: float):
        self.text = text
        self.size = size
        self.gap = gap  # vertical distance from the previous line in the same column

    def __repr__(self):
        return f"Line({self.size}, {self.gap:.0f}, {self.text[:30]!r})"


def _size(s: float) -> float:
    return round(s * 2) / 2  # 15.75 → 16.0, 11.5 stays, 10.5 stays


def _extract_lines(raw: bytes) -> Tuple[List[Line], List[Line]]:
    import pdfplumber  # local import: only needed for this endpoint

    side: List[Line] = []
    main: List[Line] = []
    with pdfplumber.open(io.BytesIO(raw)) as pdf:
        last_top = {"side": None, "main": None}
        for page in pdf.pages:
            # Sidebar text ends ~205pt, main column starts at ~224pt (Letter, 612pt wide).
            split_x = page.width * 0.35
            words = page.extract_words(extra_attrs=["size"], keep_blank_chars=True, use_text_flow=True)
            rows: Dict[Tuple[str, int], list] = {}
            for w in words:
                col = "side" if w["x0"] < split_x else "main"
                rows.setdefault((col, round(w["top"])), []).append(w)
            for (col, top), ws in sorted(rows.items(), key=lambda kv: kv[0][1]):
                text = " ".join(w["text"] for w in sorted(ws, key=lambda w: w["x0"])).strip()
                size = _size(max(w["size"] for w in ws))
                if not text or size < 10:  # blank spacer glyphs, "Page N of M"
                    continue
                prev = last_top[col]
                # Crossing a page: treat as a plain continuation line.
                gap = 18.0 if prev is None or top < prev else float(top - prev)
                last_top[col] = top
                (side if col == "side" else main).append(Line(text, size, gap))
            last_top = {"side": -1, "main": -1}  # next page: force "continuation" gap
    return side, main


def _parse_date(s: str) -> Tuple[str, bool]:
    s = s.strip().lower().replace(" de ", " ")
    if s in _PRESENT:
        return "", True
    m = re.match(r"^([a-záéíóú]+)\s+(\d{4})$", s)
    if m and m.group(1) in _MONTHS:
        return f"{m.group(2)}-{_MONTHS[m.group(1)]:02d}", False
    m = re.match(r"^(\d{4})$", s)
    if m:
        return m.group(1), False
    return s, False


_RANGE_RE = re.compile(r"^(.+?)\s+[-–]\s+(.+?)(?:\s*\(.*\))?$")


def _parse_range(text: str) -> Optional[Tuple[str, str, bool]]:
    m = _RANGE_RE.match(text.strip())
    if not m:
        return None
    start, _ = _parse_date(m.group(1))
    end, current = _parse_date(m.group(2))
    if not re.match(r"^\d{4}", start):
        return None
    return start, end, current


def _join_text(lines: List[Line]) -> str:
    """Re-flow wrapped lines: keep paragraph breaks and bullet starts."""
    out: List[str] = []
    for ln in lines:
        t = ln.text
        if not out:
            out.append(t)
        elif ln.gap > PARA_GAP:
            out.append("")
            out.append(t)
        elif re.match(r"^[-•*·▪]\s", t) or out[-1].endswith(":"):
            out.append(t)
        else:
            out[-1] = f"{out[-1]} {t}"
    return "\n".join(out).strip()


def _group_items(lines: List[Line]) -> List[str]:
    """Sidebar list → items, gluing wrapped continuation lines back together."""
    items: List[str] = []
    for i, ln in enumerate(lines):
        if items and i > 0 and ln.gap < WRAP_GAP:
            sep = "" if items[-1].endswith(("/", "-")) else " "
            items[-1] = f"{items[-1]}{sep}{ln.text}"
        else:
            items.append(ln.text)
    return items


def _sections(lines: List[Line], heading_size: float, names: Dict[str, str]) -> Tuple[List[Line], Dict[str, List[Line]]]:
    pre: List[Line] = []
    out: Dict[str, List[Line]] = {}
    cur: Optional[str] = None
    for ln in lines:
        if ln.size == heading_size:
            cur = names.get(ln.text.strip().lower(), "_other")
            out.setdefault(cur, [])
            continue
        if cur is None:
            pre.append(ln)
        else:
            out[cur].append(ln)
    return pre, out


def _parse_experience(lines: List[Line]) -> List[dict]:
    jobs: List[dict] = []
    company = ""
    i = 0
    while i < len(lines):
        ln = lines[i]
        if ln.size == 12:
            company = ln.text
            i += 1
            # Multi-role company: a bare total-duration line follows ("5 years 7 months").
            if i < len(lines) and lines[i].size == 10.5 and _parse_range(lines[i].text) is None \
                    and i + 1 < len(lines) and lines[i + 1].size == 11.5:
                i += 1
            continue
        if ln.size == 11.5:
            job = {"company": company, "title": ln.text, "location": "", "start": "", "end": "",
                   "current": False, "description": ""}
            i += 1
            # Long titles can wrap onto a second 11.5 line.
            while i < len(lines) and lines[i].size == 11.5 and lines[i].gap < WRAP_GAP + 2:
                job["title"] += " " + lines[i].text
                i += 1
            if i < len(lines) and lines[i].size == 10.5:
                rng = _parse_range(lines[i].text)
                if rng:
                    job["start"], job["end"], job["current"] = rng
                    i += 1
                    # Location sits right under the dates, closer than a description line.
                    if i < len(lines) and lines[i].size == 10.5 and lines[i].gap <= WRAP_GAP \
                            and len(lines[i].text) < 80:
                        job["location"] = lines[i].text
                        i += 1
            desc: List[Line] = []
            while i < len(lines) and lines[i].size == 10.5:
                desc.append(lines[i])
                i += 1
            job["description"] = _join_text(desc)
            jobs.append(job)
            continue
        i += 1  # stray line: skip
    return jobs


def _parse_education(lines: List[Line]) -> List[dict]:
    out: List[dict] = []
    for ln in lines:
        if ln.size == 12:
            out.append({"school": ln.text, "degree": "", "field": "", "start": "", "end": "", "description": ""})
        elif out and ln.size == 10.5:
            ed = out[-1]
            text = ln.text
            m = re.search(r"\s*·\s*\((.+)\)\s*$", text)
            if m:
                text = text[: m.start()]
                rng = _parse_range(m.group(1))
                if rng:
                    ed["start"], ed["end"], _ = rng
                else:
                    ed["start"], _ = _parse_date(m.group(1))
            if not ed["degree"] and not ed["field"] and text:
                deg, _, field = re.sub(r"\s+", " ", text).partition(", ")
                ed["degree"], ed["field"] = deg.strip(), field.strip()
            elif text:
                ed["description"] = (ed["description"] + " " + text).strip()
    return out


def _group_contact(lines: List[Line]) -> List[str]:
    """Contact lines are packed too tightly for the gap rule. A URL wraps after a
    '/' and ends with its '(Kind)' label; phone/email fit on one line."""
    items: List[str] = []
    buf = ""
    for ln in lines:
        t = ln.text.strip()
        buf = f"{buf}{t}" if buf.endswith(("/", "-")) or not buf else f"{buf} {t}"
        if buf.endswith(")") or "@" in buf or not buf.endswith(("/", "-")):
            items.append(buf)
            buf = ""
    if buf:
        items.append(buf)
    return items


def _parse_contact(items: List[str], basics: dict) -> None:
    for it in items:
        m = re.match(r"^(.*?)\s*\(([^)]+)\)$", it)
        value, kind = (m.group(1).strip(), m.group(2).lower()) if m else (it.strip(), "")
        if "@" in value and " " not in value and not basics.get("email"):
            basics["email"] = value
        elif "linkedin" in kind or "linkedin.com" in value:
            basics["linkedin"] = value if value.startswith("http") else f"https://{value}"
        elif kind in ("mobile", "móvil", "movil", "home", "work", "casa", "trabajo") or re.match(r"^\+?[\d\s().-]{7,}$", value):
            basics.setdefault("phone", value)
        elif "github.com" in value:
            basics["github"] = value if value.startswith("http") else f"https://{value}"
        elif "." in value and " " not in value and not basics.get("website"):
            basics["website"] = value if value.startswith("http") else f"https://{value}"


def parse_linkedin_pdf(raw: bytes) -> ProfileData:
    side, main = _extract_lines(raw)
    if not main:
        raise ValueError("empty pdf")

    basics: dict = {}
    pre, sec = _sections(main, 16.0, _MAIN_SECTIONS)
    name = next((ln for ln in pre if ln.size >= 20), None)
    if name is None:
        raise ValueError("not a LinkedIn profile PDF")
    basics["full_name"] = name.text
    after = [ln for ln in pre if ln.size < 20]
    if len(after) >= 2:
        basics["headline"] = " ".join(ln.text for ln in after[:-1])
        basics["location"] = after[-1].text
    elif after:
        basics["headline"] = after[0].text
    if "summary" in sec:
        basics["summary"] = _join_text(sec["summary"])

    _, side_sec = _sections(side, 13.0, _SIDE_SECTIONS)
    _parse_contact(_group_contact(side_sec.get("contact", [])), basics)
    skills = [{"name": s} for s in _group_items(side_sec.get("skills", []))]
    languages = []
    for it in _group_items(side_sec.get("languages", [])):
        m = re.match(r"^(.*?)\s*\((.+)\)$", it)
        languages.append({"name": m.group(1), "proficiency": m.group(2)} if m else {"name": it})
    certifications = [{"name": c} for c in _group_items(side_sec.get("certifications", []))]

    return ProfileData(
        basics=basics,
        experience=_parse_experience(sec.get("experience", [])),
        education=_parse_education(sec.get("education", [])),
        skills=skills,
        languages=languages,
        certifications=certifications,
    )
