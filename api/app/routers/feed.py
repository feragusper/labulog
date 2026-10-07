"""Profile-driven discovery: job-market news and job postings from free sources.

News: Google News RSS search (no key). The query pairs the user's role with
labour-market terms (hiring, layoffs, salaries…) so results are about the job
market for that role, not technical articles.

Jobs: public, key-less job board APIs (Jobicy, Himalayas, Remote OK — all
remote-focused; each asks for credit + a link back to the original posting,
which the UI shows), plus Adzuna when ADZUNA_APP_ID/ADZUNA_APP_KEY are set
(free key; adds on-site jobs by country). Remotive is deliberately left out:
its API terms forbid re-publishing its jobs on other sites.
"""
import html
import re
import time
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Callable, Dict, List, Optional, Tuple

import requests
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlmodel import Session, select

from ..config import settings
from ..db import get_session
from ..deps import get_current_user
from ..models import Application, JobPosting, Profile, User

router = APIRouter(prefix="/api/feed", tags=["feed"])

UA = {"User-Agent": "Mozilla/5.0 (compatible; Labulog/1.0; +https://github.com/feragusper/labulog)"}
TIMEOUT = 10
CACHE_TTL = 15 * 60
_cache: Dict[Tuple, Tuple[float, object]] = {}


def _cached(key: Tuple, fn: Callable[[], object]):
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < CACHE_TTL:
        return hit[1]
    val = fn()
    _cache[key] = (time.time(), val)
    if len(_cache) > 500:  # crude bound; entries are tiny
        for k in sorted(_cache, key=lambda k: _cache[k][0])[:100]:
            _cache.pop(k, None)
    return val


# ---- role derivation ----
_SENIORITY = r"\b(senior|sr\.?|junior|jr\.?|ssr\.?|semi[- ]?senior|mid(-level)?|lead|principal|staff|head of|chief|trainee|intern)\b"
_GENERIC = {
    "engineer", "developer", "programmer", "software", "dev", "engineering", "development",
    "desarrollador", "desarrolladora", "ingeniero", "ingeniera", "programador", "programadora",
    "de", "of", "the", "and", "y", "&", "/", "-",
}


def _clean_role(s: str) -> str:
    s = re.sub(r"\(.*?\)", " ", s or "")
    s = re.split(r"\s[|@·•,–-]\s|\sat\s|\sen\s", s)[0]  # "Android Eng @ ACME | Kotlin" → first part
    s = re.sub(_SENIORITY, " ", s, flags=re.I)
    return re.sub(r"\s+", " ", s).strip(" .,;:-|")


def _core_terms(role: str) -> List[str]:
    """Distinctive words of the role ('Android Engineer' → ['android'])."""
    tokens = [w for w in re.split(r"[^\w+#.]+|\.(?!\w)", role.lower()) if re.search(r"\w", w or "")]
    words = [w for w in tokens if w not in _GENERIC]
    return words or tokens


class Suggest(BaseModel):
    role: str
    terms: List[str]
    location: str
    skills: List[str]


def _suggest(session: Session, user: User) -> Suggest:
    prof = session.exec(select(Profile).where(Profile.user_id == user.id)).first()
    data = (prof.data if prof else None) or {}
    basics = data.get("basics") or {}
    exps = data.get("experience") or []
    role = _clean_role(basics.get("headline", ""))
    if not role and exps:
        role = _clean_role(exps[0].get("title", ""))
    if not role:
        role = "Software Engineer"
    return Suggest(
        role=role,
        terms=_core_terms(role),
        location=basics.get("location", ""),
        skills=[s.get("name", "") for s in (data.get("skills") or [])][:10],
    )


@router.get("/suggest", response_model=Suggest)
def suggest(session: Session = Depends(get_session), current: User = Depends(get_current_user)):
    return _suggest(session, current)


# ---- news ----
class NewsItem(BaseModel):
    title: str
    url: str
    source: str = ""
    published_at: Optional[datetime] = None
    scope: str = "role"  # role | related (broader field, e.g. mobile for Android) | market (tech jobs overall)


class NewsResult(BaseModel):
    query: str
    items: List[NewsItem]


_MARKET_TERMS = {
    "en": '(hiring OR layoffs OR "job market" OR jobs OR salary OR salaries OR recruiting OR "in demand" OR shortage)',
    "es": '(empleo OR contratación OR despidos OR "mercado laboral" OR salario OR sueldos OR vacantes OR "más demandados" OR "más buscados")',
}
_ROLE_WORD = {"en": ["developer", "developers", "engineer", "engineers"],
              "es": ["desarrollador", "desarrolladores", "programador", "programadores"]}


def _news_query(role: str, lang: str) -> str:
    terms = _core_terms(role)
    core = " ".join(terms)
    # Match the role phrased a few common ways, e.g. "android developer(s)", "android engineer(s)".
    variants = {f'"{core} {w}"' for w in _ROLE_WORD[lang]}
    if lang == "es":
        variants |= {f'"{w} {core}"' for w in ("desarrollador", "desarrolladores", "programador")}
        variants |= {f'"{core} developer"'}
    return f'({" OR ".join(sorted(variants))}) {_MARKET_TERMS[lang]} when:90d'


def _fetch_news(q: str, lang: str) -> List[NewsItem]:
    params = {"q": q, "hl": "es-419" if lang == "es" else "en-US",
              "gl": "AR" if lang == "es" else "US", "ceid": "AR:es-419" if lang == "es" else "US:en"}
    r = requests.get("https://news.google.com/rss/search", params=params, headers=UA, timeout=TIMEOUT)
    r.raise_for_status()
    root = ET.fromstring(r.content)
    items: List[NewsItem] = []
    for it in root.iter("item"):
        title = it.findtext("title") or ""
        src = it.findtext("source") or ""
        # Google appends " - Source" to the title; drop it since we show the source.
        if src and title.endswith(f" - {src}"):
            title = title[: -len(src) - 3]
        pub = None
        try:
            pub = parsedate_to_datetime(it.findtext("pubDate") or "")
        except (TypeError, ValueError):
            pass
        items.append(NewsItem(title=html.unescape(title), url=it.findtext("link") or "", source=src, published_at=pub))
    return items


# Google matches loosely (e.g. "modo desarrollador de Android" for an es query),
# so keep only headlines that are actually about work/the job market.
_MARKET_WORDS = re.compile(
    r"\bhir(e|es|ing)\b|\bjobs?\b|layoff|laid off|salar|\bpay(ing)?\b|recruit|career|"
    r"job market|labou?r market|talent|workforce|interview|employ|skills gap|shortage|"
    r"openings|wages?|compensation|in[- ]demand|most wanted|"
    r"empleo|contrat(a|an|ar|ación|aciones)\b|despid|salari|sueldo|vacante|mercado laboral|"
    r"trabajo|carrera profesional|reclut|talento|ofertas? de (empleo|trabajo)|m[aá]s buscad|"
    r"m[aá]s demandad|escasez",
    re.I,
)
MAX_NEWS_AGE_DAYS = 120


# Role-specific job-market news is sparse, so also pull the broader field the
# role belongs to. Keyed by a core term of the role.
_FIELDS = {
    "mobile": ["android", "ios", "flutter", "kotlin", "swift", "mobile", "react native", "xamarin", "kmp"],
    "frontend": ["frontend", "front-end", "react", "angular", "vue", "web", "javascript", "typescript"],
    "backend": ["backend", "back-end", "java", "python", "go", "golang", "node", "c#", ".net", "php", "ruby", "rust"],
    "data": ["data", "machine", "ml", "ai", "analytics", "scientist"],
    "devops": ["devops", "sre", "cloud", "platform", "infrastructure", "kubernetes"],
}
_FIELD_QUERY = {
    "en": {
        "mobile": '(android OR ios OR "mobile developer" OR "mobile developers" OR "app developers")',
        "frontend": '("frontend developer" OR "web developers" OR "front-end" OR javascript)',
        "backend": '("backend developer" OR "backend engineers" OR "software developers")',
        "data": '("data scientists" OR "AI engineers" OR "data engineers" OR "machine learning engineers")',
        "devops": '(devops OR "cloud engineers" OR SRE OR "platform engineers")',
        "_": '("software engineers" OR "software developers" OR programmers)',
    },
    "es": {
        "mobile": '(android OR ios OR "desarrolladores móviles" OR "desarrollador mobile" OR "desarrolladores de apps" OR "aplicaciones móviles")',
        "frontend": '("desarrolladores web" OR frontend OR javascript)',
        "backend": '("desarrolladores backend" OR backend OR "desarrolladores de software")',
        "data": '("científicos de datos" OR "ingenieros de datos" OR "inteligencia artificial")',
        "devops": '(devops OR cloud OR "ingenieros de plataforma")',
        "_": '(programadores OR "desarrolladores de software" OR desarrolladores)',
    },
}
_FIELD_MARKET = {
    "en": "(hiring OR layoffs OR jobs OR salary OR salaries)",
    "es": "(empleo OR despidos OR contratación OR salarios OR sueldos)",
}
# Broad tech labour-market news, as a last tier.
_TECH_MARKET_QUERY = {
    "en": '("tech layoffs" OR "tech hiring" OR "software engineer jobs" OR "tech job market" OR "developer jobs")',
    "es": '("sector tecnológico" OR tecnológicas OR programadores OR "empleo IT" OR "perfiles tecnológicos") '
          '(empleo OR despidos OR contratación OR "mercado laboral" OR salarios)',
}
_SCOPE_CAP = {"role": 30, "related": 15, "market": 15}
# Title must also name the field (related) or tech at all (market); Google's
# loose matching otherwise lets in "Steve Jobs" retrospectives or retail hiring.
_TECH_WORDS = re.compile(
    r"\btech|\bIT\b|software|develop|desarroll|programad|programmer|tecnol[oó]g|engineer|ingenier|"
    r"\bAI\b|\bIA\b|startup|silicon|coding|\bdevs?\b",
    re.I,
)
_NOISE = re.compile(r"steve jobs", re.I)


def _title_ok(title: str, scope: str, field: str) -> bool:
    if _NOISE.search(title) or not _MARKET_WORDS.search(title):
        return False
    if scope == "related":
        keys = _FIELDS.get(field, []) + (["app", "apps", "móvil", "móviles"] if field == "mobile" else [])
        return any(re.search(rf"(?<!\w){re.escape(k)}(?!\w)", title, re.I) for k in keys) \
            or bool(_TECH_WORDS.search(title)) and field == "_"
    if scope == "market":
        return bool(_TECH_WORDS.search(title))
    return True


def _field_of(role: str) -> str:
    low = role.lower()
    for field, keys in _FIELDS.items():
        if any(re.search(rf"(?<![\w]){re.escape(k)}(?![\w])", low) for k in keys):
            return field
    return "_"


def _news(role: str, lang: str) -> List[NewsItem]:
    langs = ["es", "en"] if lang == "es" else ["en"]  # es coverage is thin; top up with en
    field = _field_of(role)
    queries = []
    for lg in langs:
        queries.append((lg, "role", _news_query(role, lg)))
        queries.append((lg, "related", f"{_FIELD_QUERY[lg][field]} {_FIELD_MARKET[lg]} when:30d"))
        queries.append((lg, "market", f"{_TECH_MARKET_QUERY[lg]} when:30d"))
    items: List[NewsItem] = []
    seen = set()
    now = datetime.now(timezone.utc)
    for lg, scope, query in queries:
        for it in _cached(("news", query, lg), lambda: _fetch_news(query, lg)):
            if it.title.lower() in seen or not _title_ok(it.title, scope, field):
                continue
            if it.published_at and (now - it.published_at).days > MAX_NEWS_AGE_DAYS:
                continue
            seen.add(it.title.lower())
            items.append(it.model_copy(update={"scope": scope}))
    # Role-specific first, then related, then general market; newest first within each.
    items.sort(key=lambda x: x.published_at or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    out: List[NewsItem] = []
    for scope in ("role", "related", "market"):
        out += [x for x in items if x.scope == scope][: _SCOPE_CAP[scope]]
    return out


@router.get("/news", response_model=NewsResult)
def news(
    q: Optional[str] = None,
    lang: str = "es",
    session: Session = Depends(get_session),
    current: User = Depends(get_current_user),
):
    lang = "es" if lang == "es" else "en"
    role = (q or "").strip() or _suggest(session, current).role
    return NewsResult(query=role, items=_news(role, lang))


# ---- jobs ----
class JobItem(BaseModel):
    source: str
    source_url: str
    title: str
    company: str = ""
    location: str = ""
    remote: bool = True
    url: str
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None
    currency: Optional[str] = None
    salary_period: Optional[str] = None
    published_at: Optional[datetime] = None
    tags: List[str] = []
    excerpt: str = ""
    application_id: Optional[int] = None  # set when you already track this URL


class SourceStatus(BaseModel):
    name: str
    url: str
    ok: bool
    count: int = 0
    error: Optional[str] = None


class JobsResult(BaseModel):
    query: str
    location: str
    sources: List[SourceStatus]
    items: List[JobItem]


def _int(v) -> Optional[int]:
    try:
        n = int(float(v))
        return n if n > 0 else None
    except (TypeError, ValueError):
        return None


def _strip_html(s: str, n: int = 240) -> str:
    t = re.sub(r"<[^>]+>", " ", html.unescape(s or ""))
    t = re.sub(r"\s+", " ", t).strip()
    return t if len(t) <= n else t[:n].rsplit(" ", 1)[0] + "…"


def _listish(v) -> List[str]:
    if isinstance(v, list):
        return [str(x) for x in v]
    if isinstance(v, str) and v:
        return [v]
    return []


def _period(v: Optional[str]) -> Optional[str]:
    v = (v or "").lower()
    if v in ("yearly", "annual", "year"):
        return "yearly"
    if v in ("monthly", "month"):
        return "monthly"
    if v in ("hourly", "hour"):
        return "hourly"
    return None


def _ts(v) -> Optional[datetime]:
    if v in (None, ""):
        return None
    try:
        if isinstance(v, (int, float)) or str(v).isdigit():
            return datetime.fromtimestamp(int(v), tz=timezone.utc)
        return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except (ValueError, OSError):
        return None


def _jobicy(q: str, location: str) -> List[JobItem]:
    r = requests.get("https://jobicy.com/api/v2/remote-jobs", params={"count": 50, "tag": q},
                     headers=UA, timeout=TIMEOUT)
    r.raise_for_status()
    out = []
    for j in r.json().get("jobs", []):
        out.append(JobItem(
            source="Jobicy", source_url="https://jobicy.com", title=html.unescape(j.get("jobTitle", "")),
            company=j.get("companyName", ""), location=j.get("jobGeo", "") or "Remote", url=j.get("url", ""),
            salary_min=_int(j.get("salaryMin")), salary_max=_int(j.get("salaryMax")),
            currency=j.get("salaryCurrency"), salary_period=_period(j.get("salaryPeriod")),
            published_at=_ts(j.get("pubDate")), tags=_listish(j.get("jobType")) + _listish(j.get("jobLevel")),
            excerpt=_strip_html(j.get("jobExcerpt", "")),
        ))
    return out


def _himalayas(q: str, location: str) -> List[JobItem]:
    r = requests.get("https://himalayas.app/jobs/api/search", params={"q": q, "limit": 50},
                     headers=UA, timeout=TIMEOUT)
    r.raise_for_status()
    out = []
    for j in r.json().get("jobs", []):
        locs = _listish(j.get("locationRestrictions"))
        out.append(JobItem(
            source="Himalayas", source_url="https://himalayas.app", title=j.get("title", ""),
            company=j.get("companyName", ""),
            location=", ".join(locs[:3]) + (f" +{len(locs) - 3}" if len(locs) > 3 else "") if locs else "Remote",
            url=j.get("applicationLink") or j.get("guid", ""),
            salary_min=_int(j.get("minSalary")), salary_max=_int(j.get("maxSalary")),
            currency=j.get("currency"), salary_period=_period(j.get("salaryPeriod")),
            published_at=_ts(j.get("pubDate")),
            tags=[x for x in [j.get("employmentType")] if x] + _listish(j.get("seniority")),
            excerpt=_strip_html(j.get("excerpt", "")),
        ))
    return out


def _remoteok(q: str, location: str) -> List[JobItem]:
    tag = re.sub(r"\s+", "-", q.strip().lower())
    r = requests.get("https://remoteok.com/api", params={"tag": tag}, headers=UA, timeout=TIMEOUT)
    r.raise_for_status()
    out = []
    for j in r.json()[1:]:  # first element is the legal notice
        out.append(JobItem(
            source="Remote OK", source_url="https://remoteok.com", title=j.get("position", ""),
            company=(j.get("company") or "").strip(), location=j.get("location") or "Remote",
            url=j.get("url") or j.get("apply_url", ""),
            salary_min=_int(j.get("salary_min")), salary_max=_int(j.get("salary_max")),
            currency="USD" if _int(j.get("salary_min")) else None,
            salary_period="yearly" if _int(j.get("salary_min")) else None,
            published_at=_ts(j.get("date") or j.get("epoch")), tags=_listish(j.get("tags"))[:5],
            excerpt=_strip_html(j.get("description", "")),
        ))
    return out


# Adzuna country codes it supports, keyed by common country names in a profile location.
_ADZUNA_COUNTRIES = {
    "spain": "es", "españa": "es", "united kingdom": "gb", "uk": "gb", "england": "gb",
    "united states": "us", "usa": "us", "germany": "de", "deutschland": "de", "alemania": "de",
    "france": "fr", "francia": "fr", "italy": "it", "italia": "it", "netherlands": "nl",
    "países bajos": "nl", "austria": "at", "australia": "au", "belgium": "be", "bélgica": "be",
    "brazil": "br", "brasil": "br", "canada": "ca", "canadá": "ca", "switzerland": "ch",
    "suiza": "ch", "india": "in", "mexico": "mx", "méxico": "mx", "new zealand": "nz",
    "poland": "pl", "polonia": "pl", "singapore": "sg", "south africa": "za",
}


def _adzuna_country(location: str) -> Tuple[Optional[str], str]:
    """'Málaga, Spain' → ('es', 'Málaga'). Country is the last comma part."""
    parts = [p.strip() for p in location.split(",") if p.strip()]
    for i in range(len(parts) - 1, -1, -1):
        code = _ADZUNA_COUNTRIES.get(parts[i].lower())
        if code:
            return code, ", ".join(parts[:i])
    return None, location


def _adzuna(q: str, location: str) -> List[JobItem]:
    country, where = _adzuna_country(location)
    if not country:
        raise ValueError("country not supported by Adzuna")
    params = {"app_id": settings.adzuna_app_id, "app_key": settings.adzuna_app_key,
              "what": q, "results_per_page": 50, "content-type": "application/json",
              "sort_by": "date"}
    if where:
        params["where"] = where
    r = requests.get(f"https://api.adzuna.com/v1/api/jobs/{country}/search/1", params=params,
                     headers=UA, timeout=TIMEOUT)
    r.raise_for_status()
    out = []
    for j in r.json().get("results", []):
        text = f"{j.get('title', '')} {j.get('description', '')}".lower()
        out.append(JobItem(
            source="Adzuna", source_url="https://www.adzuna.com", title=_strip_html(j.get("title", ""), 200),
            company=(j.get("company") or {}).get("display_name", ""),
            location=(j.get("location") or {}).get("display_name", ""),
            remote="remote" in text or "remoto" in text or "teletrabajo" in text,
            url=j.get("redirect_url", ""),
            salary_min=_int(j.get("salary_min")), salary_max=_int(j.get("salary_max")),
            salary_period="yearly" if _int(j.get("salary_min")) else None,
            published_at=_ts(j.get("created")), tags=[x for x in [j.get("contract_time")] if x],
            excerpt=_strip_html(j.get("description", "")),
        ))
    return out


_SOURCES: List[Tuple[str, str, Callable[[str, str], List[JobItem]]]] = [
    ("Jobicy", "https://jobicy.com", _jobicy),
    ("Himalayas", "https://himalayas.app", _himalayas),
    ("Remote OK", "https://remoteok.com", _remoteok),
]


def _relevant(job: JobItem, terms: List[str]) -> bool:
    # Feeds match loosely (tags, descriptions); keep only titles naming the role.
    title = job.title.lower()
    return all(t in title for t in terms)


@router.get("/jobs", response_model=JobsResult)
def jobs(
    q: Optional[str] = None,
    location: Optional[str] = None,
    session: Session = Depends(get_session),
    current: User = Depends(get_current_user),
):
    sug = _suggest(session, current)
    role = (q or "").strip() or sug.role
    loc = sug.location if location is None else location.strip()
    terms = _core_terms(role)
    search = " ".join(terms)

    sources = list(_SOURCES)
    if settings.adzuna_app_id and settings.adzuna_app_key and loc:
        sources.append(("Adzuna", "https://www.adzuna.com", _adzuna))

    def run(src):
        name, url, fn = src
        try:
            items = _cached(("jobs", name, search, loc if name == "Adzuna" else ""), lambda: fn(search, loc))
            return SourceStatus(name=name, url=url, ok=True), items
        except Exception as e:  # one broken source must not sink the rest
            return SourceStatus(name=name, url=url, ok=False, error=str(e)[:200]), []

    with ThreadPoolExecutor(max_workers=len(sources)) as pool:
        results = list(pool.map(run, sources))

    items: List[JobItem] = []
    seen = set()
    statuses = []
    for status, found in results:
        kept = [j for j in found if j.url and _relevant(j, terms)]
        status.count = len(kept)
        statuses.append(status)
        for j in kept:
            key = (j.title.lower().strip(), j.company.lower().strip())
            if key in seen or j.url in seen:
                continue
            seen.update([key, j.url])
            items.append(j.model_copy())

    # Flag postings you already track.
    urls = [j.url for j in items]
    if urls:
        rows = session.exec(
            select(JobPosting.url, Application.id)
            .join(Application, Application.posting_id == JobPosting.id)
            .where(Application.user_id == current.id, JobPosting.url.in_(urls))
        ).all()
        tracked = {u: aid for u, aid in rows}
        for j in items:
            j.application_id = tracked.get(j.url)

    items.sort(key=lambda j: j.published_at or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    return JobsResult(query=role, location=loc, sources=statuses, items=items[:150])
