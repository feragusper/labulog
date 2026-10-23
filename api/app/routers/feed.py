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
import json
import re
import threading
import time
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Callable, Dict, List, Optional, Tuple

import requests
from fastapi import APIRouter, Depends, HTTPException, Query
from urllib.parse import quote, urlparse
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


def _cached(key: Tuple, fn: Callable[[], object], ttl: int = CACHE_TTL):
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    val = fn()
    _cache[key] = (time.time(), val)
    if len(_cache) > 2000:  # crude bound; entries are tiny
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


# ---- news card metadata (image, snippet, real URL) ----
# Google News links are redirects (news.google.com/rss/articles/<id>). To show a
# thumbnail we decode the id to the publisher URL (same two-step dance Google's
# own page does: fetch signature, then batchexecute) and read the article's
# og:image / og:description. ~3-5 s per article, so the UI requests it lazily
# per card and we cache it for a day; a semaphore keeps us polite on a small box.
BROWSER_UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                            "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
              "Accept-Language": "en-US,en;q=0.8,es;q=0.6"}
META_TTL = 24 * 3600
_meta_slots = threading.Semaphore(6)
_GNEWS_PREFIX = "https://news.google.com/rss/articles/"


class NewsMeta(BaseModel):
    url: str                    # publisher URL (falls back to the Google link)
    image: Optional[str] = None
    description: Optional[str] = None


def _decode_gnews(link: str) -> Optional[str]:
    gid = link[len(_GNEWS_PREFIX):].split("?")[0]
    page = requests.get(f"{_GNEWS_PREFIX}{gid}", headers=BROWSER_UA, timeout=TIMEOUT).text
    sg = re.search(r'data-n-a-sg="([^"]+)"', page)
    ts = re.search(r'data-n-a-ts="([^"]+)"', page)
    if not (sg and ts):
        return None
    inner = (f'["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],'
             f'"X","X",1,[1,1,1],1,1,null,0,0,null,0],"{gid}",{ts.group(1)},"{sg.group(1)}"]')
    r = requests.post(
        "https://news.google.com/_/DotsSplashUi/data/batchexecute",
        headers={**BROWSER_UA, "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"},
        data="f.req=" + quote(json.dumps([[["Fbv4je", inner]]])), timeout=TIMEOUT,
    )
    r.raise_for_status()
    url = json.loads(json.loads(r.text.split("\n\n")[1])[0][2])[1]
    return url if isinstance(url, str) and url.startswith(("http://", "https://")) else None


def _meta_tag(page: str, *names: str) -> Optional[str]:
    for n in names:
        for pat in (rf'<meta[^>]+(?:property|name)=["\']{n}["\'][^>]*content=["\']([^"\']+)',
                    rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]*(?:property|name)=["\']{n}["\']'):
            m = re.search(pat, page, re.I)
            if m:
                return html.unescape(m.group(1)).strip()
    return None


def _article_meta(link: str) -> NewsMeta:
    with _meta_slots:
        url = _decode_gnews(link) or link
        if url == link:
            return NewsMeta(url=link)
        image = desc = None
        try:
            with requests.get(url, headers=BROWSER_UA, timeout=TIMEOUT, stream=True) as r:
                raw = b""
                for chunk in r.iter_content(32768):
                    raw += chunk
                    if b"</head>" in raw.lower() or len(raw) > 400_000:  # og tags live in <head>
                        break
            page = raw.decode(r.encoding or "utf-8", errors="replace")
            image = _meta_tag(page, "og:image", "og:image:url", "twitter:image", "twitter:image:src")
            desc = _meta_tag(page, "og:description", "description", "twitter:description")
            if image and image.startswith("//"):
                image = "https:" + image
            elif image and image.startswith("/"):
                p = urlparse(url)
                image = f"{p.scheme}://{p.netloc}{image}"
            if image and not image.startswith(("http://", "https://")):
                image = None
        except requests.RequestException:
            pass
        return NewsMeta(url=url, image=image, description=desc[:300] if desc else None)


@router.get("/news/meta", response_model=NewsMeta)
def news_meta(u: str, current: User = Depends(get_current_user)):
    # Only Google News article links: this is not a general-purpose URL fetcher.
    if not u.startswith(_GNEWS_PREFIX):
        raise HTTPException(status_code=400, detail="Unsupported URL")
    try:
        return _cached(("news-meta", u), lambda: _article_meta(u), ttl=META_TTL)
    except Exception:
        return NewsMeta(url=u)


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
    zones: List[str] = []
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


def _adzuna_zones(q: str, zones: List[str]) -> List[JobItem]:
    """One Adzuna query per zone it supports (it is country-scoped)."""
    supported = [z for z in zones if _adzuna_country(z)[0]]
    if not supported:
        raise ValueError("no zone supported by Adzuna")
    out: List[JobItem] = []
    for z in supported:
        out += _cached(("jobs", "Adzuna", q, z), lambda z=z: _adzuna(q, z))
    return out


# ---- zones: match remote postings' location text against chosen countries ----
_REGION_WORDS = {
    "eu": ["europe", "european", "eu", "emea", "eea"],
    "latam": ["latam", "latin america", "south america", "americas", "lat am"],
    "na": ["north america", "americas"],
    "apac": ["apac", "asia", "asia pacific"],
    "mea": ["emea", "middle east", "mena", "africa"],
}
# code: (names/aliases, regions)
_ZONES: Dict[str, Tuple[List[str], List[str]]] = {
    "AR": (["argentina"], ["latam"]), "BO": (["bolivia"], ["latam"]), "BR": (["brazil", "brasil"], ["latam"]),
    "CL": (["chile"], ["latam"]), "CO": (["colombia"], ["latam"]), "CR": (["costa rica"], ["latam"]),
    "DO": (["dominican republic", "república dominicana"], ["latam"]), "EC": (["ecuador"], ["latam"]),
    "SV": (["el salvador"], ["latam"]), "GT": (["guatemala"], ["latam"]), "HN": (["honduras"], ["latam"]),
    "MX": (["mexico", "méxico"], ["latam", "na"]), "NI": (["nicaragua"], ["latam"]), "PA": (["panama", "panamá"], ["latam"]),
    "PY": (["paraguay"], ["latam"]), "PE": (["peru", "perú"], ["latam"]), "PR": (["puerto rico"], ["latam"]),
    "UY": (["uruguay"], ["latam"]), "VE": (["venezuela"], ["latam"]),
    "US": (["united states", "usa", "us", "u.s.", "estados unidos"], ["na"]), "CA": (["canada", "canadá"], ["na"]),
    "AT": (["austria"], ["eu"]), "BE": (["belgium", "bélgica"], ["eu"]), "BG": (["bulgaria"], ["eu"]),
    "HR": (["croatia"], ["eu"]), "CZ": (["czechia", "czech republic"], ["eu"]), "DK": (["denmark"], ["eu"]),
    "EE": (["estonia"], ["eu"]), "FI": (["finland"], ["eu"]), "FR": (["france", "francia"], ["eu"]),
    "DE": (["germany", "deutschland", "alemania"], ["eu"]), "GR": (["greece"], ["eu"]), "HU": (["hungary"], ["eu"]),
    "IS": (["iceland"], ["eu"]), "IE": (["ireland", "irlanda"], ["eu"]), "IT": (["italy", "italia"], ["eu"]),
    "LV": (["latvia"], ["eu"]), "LT": (["lithuania"], ["eu"]), "LU": (["luxembourg"], ["eu"]), "MT": (["malta"], ["eu"]),
    "NL": (["netherlands", "países bajos", "holland"], ["eu"]), "NO": (["norway"], ["eu"]),
    "PL": (["poland", "polonia"], ["eu"]), "PT": (["portugal"], ["eu"]), "RO": (["romania"], ["eu"]),
    "RS": (["serbia"], ["eu"]), "SK": (["slovakia"], ["eu"]), "SI": (["slovenia"], ["eu"]),
    "ES": (["spain", "españa", "espana"], ["eu"]), "SE": (["sweden"], ["eu"]), "CH": (["switzerland", "suiza"], ["eu"]),
    "GB": (["united kingdom", "uk", "great britain", "england", "reino unido"], ["eu"]), "UA": (["ukraine"], ["eu"]),
    "TR": (["türkiye", "turkey"], ["eu", "mea"]),
    "AU": (["australia"], ["apac"]), "NZ": (["new zealand"], ["apac"]), "CN": (["china"], ["apac"]),
    "HK": (["hong kong"], ["apac"]), "IN": (["india"], ["apac"]), "ID": (["indonesia"], ["apac"]),
    "JP": (["japan"], ["apac"]), "KR": (["south korea", "korea"], ["apac"]), "MY": (["malaysia"], ["apac"]),
    "PH": (["philippines"], ["apac"]), "SG": (["singapore"], ["apac"]), "TW": (["taiwan"], ["apac"]),
    "TH": (["thailand"], ["apac"]), "VN": (["vietnam"], ["apac"]),
    "EG": (["egypt"], ["mea"]), "IL": (["israel"], ["mea"]), "MA": (["morocco"], ["mea"]),
    "ZA": (["south africa"], ["mea"]), "AE": (["united arab emirates", "uae"], ["mea"]),
}
_ZONE_BY_NAME = {n: code for code, (names, _) in _ZONES.items() for n in names}
_WORLDWIDE = {"worldwide", "global", "anywhere", "remote", "remoto", "ww", "everywhere"}
_ANYWHERE_RE = re.compile(r"\b(worldwide|anywhere|global|everywhere)\b", re.I)


def _zone_code(zone: str) -> Optional[str]:
    """'Málaga, Spain' → 'ES'; 'Worldwide' → 'WW'; unknown → None."""
    parts = [p.strip().lower() for p in zone.split(",") if p.strip()]
    for p in reversed(parts):
        if p in _WORLDWIDE:
            return "WW"
        if p.upper() in _ZONES:
            return p.upper()
        if p in _ZONE_BY_NAME:
            return _ZONE_BY_NAME[p]
    return None


def _zone_patterns(codes: List[str]) -> re.Pattern:
    words = set()
    for c in codes:
        names, regions = _ZONES[c]
        words.update(names)
        for r in regions:
            words.update(_REGION_WORDS[r])
    alt = "|".join(re.escape(w) for w in sorted(words, key=len, reverse=True))
    return re.compile(rf"(?<!\w)({alt})(?!\w)", re.I)


def _in_zones(job: JobItem, pattern: Optional[re.Pattern]) -> bool:
    if pattern is None or job.source == "Adzuna":  # Adzuna results are already country-scoped
        return True
    loc = job.location.strip()
    if not loc or loc.lower() in _WORLDWIDE or _ANYWHERE_RE.search(loc):
        return True
    return bool(pattern.search(loc))


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
    location: Optional[List[str]] = Query(None),  # repeat for several zones (countries)
    session: Session = Depends(get_session),
    current: User = Depends(get_current_user),
):
    sug = _suggest(session, current)
    role = (q or "").strip() or sug.role
    if location is None:
        zones = [sug.location] if sug.location else []
    else:
        zones = list(dict.fromkeys(z.strip() for z in location if z.strip()))
    terms = _core_terms(role)
    search = " ".join(terms)

    codes = [_zone_code(z) for z in zones]
    # Filter by zone only when every zone resolves to a country (and none is "worldwide").
    known = [c for c in codes if c and c != "WW"]
    pattern = _zone_patterns(known) if known and len(known) == len(codes) else None

    sources = [(name, url, lambda s, n=name, fn=fn: _cached(("jobs", n, s, ""), lambda: fn(s, "")))
               for name, url, fn in _SOURCES]
    if settings.adzuna_app_id and settings.adzuna_app_key and zones:
        sources.append(("Adzuna", "https://www.adzuna.com", lambda s: _adzuna_zones(s, zones)))

    def run(src):
        name, url, fn = src
        try:
            return SourceStatus(name=name, url=url, ok=True), fn(search)
        except Exception as e:  # one broken source must not sink the rest
            return SourceStatus(name=name, url=url, ok=False, error=str(e)[:200]), []

    with ThreadPoolExecutor(max_workers=len(sources)) as pool:
        results = list(pool.map(run, sources))

    items: List[JobItem] = []
    seen = set()
    statuses = []
    for status, found in results:
        kept = [j for j in found if j.url and _relevant(j, terms) and _in_zones(j, pattern)]
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
    return JobsResult(query=role, location=", ".join(zones), zones=zones, sources=statuses, items=items[:150])
