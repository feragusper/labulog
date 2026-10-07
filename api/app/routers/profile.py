import csv
import io
import re
import zipfile
from typing import Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlmodel import Session, select

from ..db import get_session
from ..deps import get_current_user
from ..models import Profile, User, utcnow
from ..schemas import ProfileData, ProfileImportResult, ProfileRead

router = APIRouter(prefix="/api/profile", tags=["profile"])

MAX_UPLOAD = 50 * 1024 * 1024


def _get_or_create(session: Session, user: User) -> Profile:
    prof = session.exec(select(Profile).where(Profile.user_id == user.id)).first()
    if prof is None:
        prof = Profile(user_id=user.id, data=ProfileData(basics={"email": user.email}).model_dump())
        session.add(prof)
        session.commit()
        session.refresh(prof)
    return prof


def _read(prof: Profile) -> ProfileRead:
    return ProfileRead(**ProfileData(**(prof.data or {})).model_dump(), updated_at=prof.updated_at)


@router.get("", response_model=ProfileRead)
def get_profile(session: Session = Depends(get_session), current: User = Depends(get_current_user)):
    return _read(_get_or_create(session, current))


@router.put("", response_model=ProfileRead)
def put_profile(
    data: ProfileData,
    session: Session = Depends(get_session),
    current: User = Depends(get_current_user),
):
    prof = _get_or_create(session, current)
    prof.data = data.model_dump()
    prof.updated_at = utcnow()
    session.add(prof)
    session.commit()
    session.refresh(prof)
    return _read(prof)


# ---- LinkedIn import ----
# LinkedIn's public API only exposes name/email/photo (OpenID Connect); full
# profile access is partner-only. Instead we ingest the member's own data export
# (Settings → Data privacy → Get a copy of your data), a ZIP of CSVs. Individual
# CSVs from that ZIP are accepted too.

_MONTHS = {m: i + 1 for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}
_MONTHS.update({"ene": 1, "abr": 4, "ago": 8, "set": 9, "dic": 12})


def _norm_date(raw: Optional[str]) -> str:
    """'Mar 2020' → '2020-03', '2020' → '2020', '03/2020' → '2020-03'; else raw."""
    s = (raw or "").strip()
    if not s:
        return ""
    m = re.match(r"^([A-Za-zé]{3})[a-zé]*\.?\s+(\d{4})$", s)
    if m and m.group(1).lower() in _MONTHS:
        return f"{m.group(2)}-{_MONTHS[m.group(1).lower()]:02d}"
    m = re.match(r"^(\d{1,2})[/-](\d{4})$", s)
    if m:
        return f"{m.group(2)}-{int(m.group(1)):02d}"
    m = re.match(r"^(\d{4})-(\d{2})(-\d{2})?", s)
    if m:
        return f"{m.group(1)}-{m.group(2)}"
    m = re.match(r"^([A-Za-z]{3})[a-z]*\.?\s+\d{1,2},\s*(\d{4})$", s)  # "Jan 5, 2021"
    if m and m.group(1).lower() in _MONTHS:
        return f"{m.group(2)}-{_MONTHS[m.group(1).lower()]:02d}"
    return s


def _rows(text: str, must_have: str) -> List[Dict[str, str]]:
    """Parse a LinkedIn CSV. Some exports prepend 'Notes:' lines before the header,
    so skip ahead to the first line that contains the expected column."""
    lines = text.splitlines()
    start = next((i for i, ln in enumerate(lines) if must_have in ln), None)
    if start is None:
        return []
    reader = csv.DictReader(io.StringIO("\n".join(lines[start:])))
    return [{(k or "").strip(): (v or "").strip() for k, v in row.items()} for row in reader]


# filename (lowercased, no dir, no .csv) -> (section key, column that must be in header)
_FILES = {
    "profile": ("profile", "First Name"),
    "positions": ("positions", "Company Name"),
    "education": ("education", "School Name"),
    "skills": ("skills", "Name"),
    "languages": ("languages", "Name"),
    "certifications": ("certifications", "Name"),
    "projects": ("projects", "Title"),
    "email addresses": ("emails", "Email Address"),
    "phonenumbers": ("phones", "Number"),
    "phone numbers": ("phones", "Number"),
}


def _decode(raw: bytes) -> str:
    for enc in ("utf-8-sig", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def _collect(filename: str, raw: bytes) -> Dict[str, List[Dict[str, str]]]:
    files: List[Tuple[str, bytes]] = []
    if filename.lower().endswith(".zip"):
        try:
            zf = zipfile.ZipFile(io.BytesIO(raw))
        except zipfile.BadZipFile:
            raise HTTPException(status_code=400, detail="Invalid ZIP file")
        for name in zf.namelist():
            if name.lower().endswith(".csv"):
                files.append((name, zf.read(name)))
    else:
        files.append((filename, raw))

    out: Dict[str, List[Dict[str, str]]] = {}
    for name, data in files:
        key = name.rsplit("/", 1)[-1].lower()
        key = key[:-4] if key.endswith(".csv") else key
        if key not in _FILES:
            continue
        section, must_have = _FILES[key]
        out[section] = _rows(_decode(data), must_have)
    return out


def _parse_linkedin(found: Dict[str, List[Dict[str, str]]]) -> ProfileData:
    d = ProfileData()
    lists: Dict[str, List[dict]] = {k: [] for k in _LIST_KEYS}
    for r in found.get("profile", [])[:1]:
        d.basics.full_name = " ".join(x for x in (r.get("First Name"), r.get("Last Name")) if x)
        d.basics.headline = r.get("Headline", "")
        d.basics.summary = r.get("Summary", "")
        d.basics.location = r.get("Geo Location", "") or r.get("Address", "")
        sites = r.get("Websites", "")
        # Websites look like "[PORTFOLIO:https://…,OTHER:https://…]".
        urls = re.findall(r"https?://[^\s,\]]+", sites)
        for u in urls:
            if "github.com" in u and not d.basics.github:
                d.basics.github = u
            elif not d.basics.website:
                d.basics.website = u
    emails = found.get("emails", [])
    primary = next((e for e in emails if e.get("Primary", "").lower() == "yes"), emails[0] if emails else None)
    if primary:
        d.basics.email = primary.get("Email Address", "")
    phones = found.get("phones", [])
    if phones:
        d.basics.phone = phones[0].get("Number", "")

    for r in found.get("positions", []):
        if not (r.get("Company Name") or r.get("Title")):
            continue
        end = _norm_date(r.get("Finished On"))
        lists["experience"].append({
            "company": r.get("Company Name", ""), "title": r.get("Title", ""),
            "location": r.get("Location", ""), "start": _norm_date(r.get("Started On")),
            "end": end, "current": not end, "description": r.get("Description", ""),
        })
    for r in found.get("education", []):
        if not r.get("School Name"):
            continue
        desc = "\n".join(x for x in (r.get("Notes"), r.get("Activities")) if x)
        lists["education"].append({
            "school": r.get("School Name", ""), "degree": r.get("Degree Name", ""),
            "start": _norm_date(r.get("Start Date")), "end": _norm_date(r.get("End Date")),
            "description": desc,
        })
    for r in found.get("skills", []):
        if r.get("Name"):
            lists["skills"].append({"name": r["Name"]})
    for r in found.get("languages", []):
        if r.get("Name"):
            lists["languages"].append({"name": r["Name"], "proficiency": r.get("Proficiency", "")})
    for r in found.get("certifications", []):
        if r.get("Name"):
            lists["certifications"].append({
                "name": r["Name"], "issuer": r.get("Authority", ""),
                "date": _norm_date(r.get("Started On")), "url": r.get("Url", ""),
            })
    for r in found.get("projects", []):
        if r.get("Title"):
            lists["projects"].append({
                "name": r["Title"], "description": r.get("Description", ""), "url": r.get("Url", ""),
                "start": _norm_date(r.get("Started On")), "end": _norm_date(r.get("Finished On")),
            })
    return ProfileData(basics=d.basics, **lists)


_LIST_KEYS = {
    "experience": lambda x: (x["company"].lower(), x["title"].lower(), x["start"]),
    "education": lambda x: (x["school"].lower(), x["degree"].lower()),
    "skills": lambda x: x["name"].lower(),
    "languages": lambda x: x["name"].lower(),
    "certifications": lambda x: x["name"].lower(),
    "projects": lambda x: x["name"].lower(),
}


def _merge(current: ProfileData, incoming: ProfileData) -> Tuple[ProfileData, Dict[str, int]]:
    """Fill empty basics; append list items that aren't already there."""
    cur = current.model_dump()
    inc = incoming.model_dump()
    for k, v in inc["basics"].items():
        if v and not cur["basics"].get(k):
            cur["basics"][k] = v
    counts: Dict[str, int] = {}
    for section, keyfn in _LIST_KEYS.items():
        seen = {keyfn(x) for x in cur[section]}
        added = 0
        for item in inc[section]:
            if keyfn(item) not in seen:
                cur[section].append(item)
                seen.add(keyfn(item))
                added += 1
        counts[section] = added
    return ProfileData(**cur), counts


@router.post("/import/linkedin", response_model=ProfileImportResult)
async def import_linkedin(
    file: UploadFile = File(...),
    mode: str = Query("merge", pattern="^(merge|replace)$"),
    session: Session = Depends(get_session),
    current: User = Depends(get_current_user),
):
    raw = await file.read()
    if len(raw) > MAX_UPLOAD:
        raise HTTPException(status_code=413, detail="File too large")
    found = _collect(file.filename or "upload.csv", raw)
    if not found:
        raise HTTPException(
            status_code=400,
            detail="No LinkedIn data found. Upload the export ZIP or files like Positions.csv, Skills.csv, Profile.csv.",
        )
    incoming = _parse_linkedin(found)

    prof = _get_or_create(session, current)
    if mode == "replace":
        base = ProfileData()
        base.basics.email = current.email
    else:
        base = ProfileData(**(prof.data or {}))
    merged, counts = _merge(base, incoming)

    prof.data = merged.model_dump()
    prof.updated_at = utcnow()
    session.add(prof)
    session.commit()
    session.refresh(prof)
    return ProfileImportResult(profile=_read(prof), found=sorted(found.keys()), counts=counts)
