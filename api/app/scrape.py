"""Best-effort job-posting metadata extraction from a URL.

Parses schema.org JobPosting JSON-LD first (most ATS: Greenhouse, Lever, Workday,
Indeed, …), then falls back to OpenGraph / <title>. Network fetch is guarded
against SSRF (private/loopback hosts rejected) and capped in size and time.
"""
import ipaddress
import json
import re
import socket
from html import unescape
from typing import Optional
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

from .schemas import ScrapeResult

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
MAX_BYTES = 2_000_000
TIMEOUT = 8

KNOWN_SOURCES = {
    "linkedin": "linkedin", "indeed": "indeed", "greenhouse": "greenhouse",
    "lever": "lever", "workday": "workday", "glassdoor": "glassdoor",
    "getonbrd": "getonboard", "wellfound": "wellfound", "remoteok": "remoteok",
}


def is_safe_url(url: str) -> bool:
    p = urlparse(url)
    if p.scheme not in ("http", "https") or not p.hostname:
        return False
    try:
        for res in socket.getaddrinfo(p.hostname, None):
            ip = ipaddress.ip_address(res[4][0])
            if (ip.is_private or ip.is_loopback or ip.is_link_local
                    or ip.is_reserved or ip.is_multicast):
                return False
    except (socket.gaierror, ValueError):
        return False
    return True


def _source_from(url: str) -> Optional[str]:
    host = (urlparse(url).hostname or "").lower()
    for key, label in KNOWN_SOURCES.items():
        if key in host:
            return label
    parts = host.replace("www.", "").split(".")
    return parts[0] if parts and parts[0] else None


def _clean(text: Optional[str]) -> Optional[str]:
    if not text:
        return None
    text = unescape(re.sub(r"<[^>]+>", " ", text))
    text = re.sub(r"\s+", " ", text).strip()
    return text or None


def _money(v) -> Optional[int]:
    if v is None:
        return None
    try:
        return int(float(str(v).replace(",", "")))
    except (ValueError, TypeError):
        return None


def _iter_jsonld(soup: BeautifulSoup):
    for tag in soup.find_all("script", type="application/ld+json"):
        raw = tag.string or tag.get_text() or ""
        try:
            data = json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            continue
        stack = [data]
        while stack:
            node = stack.pop()
            if isinstance(node, list):
                stack.extend(node)
            elif isinstance(node, dict):
                if "@graph" in node:
                    stack.extend(node["@graph"] if isinstance(node["@graph"], list) else [node["@graph"]])
                yield node


def _from_jsonld(soup: BeautifulSoup, result: ScrapeResult) -> bool:
    for node in _iter_jsonld(soup):
        t = node.get("@type")
        types = t if isinstance(t, list) else [t]
        if "JobPosting" not in types:
            continue
        result.title = result.title or _clean(node.get("title"))
        org = node.get("hiringOrganization")
        if isinstance(org, dict):
            result.company_name = result.company_name or _clean(org.get("name"))
        elif isinstance(org, str):
            result.company_name = result.company_name or _clean(org)
        loc = node.get("jobLocation")
        if isinstance(loc, list):
            loc = loc[0] if loc else None
        if isinstance(loc, dict):
            addr = loc.get("address")
            if isinstance(addr, dict):
                result.location = result.location or _clean(
                    addr.get("addressLocality") or addr.get("addressRegion"))
                country = addr.get("addressCountry")
                if isinstance(country, dict):
                    country = country.get("name")
                result.country = result.country or _clean(country)
        sal = node.get("baseSalary")
        if isinstance(sal, dict):
            result.currency = result.currency or sal.get("currency")
            val = sal.get("value")
            if isinstance(val, dict):
                result.salary_min = result.salary_min or _money(val.get("minValue") or val.get("value"))
                result.salary_max = result.salary_max or _money(val.get("maxValue") or val.get("value"))
            else:
                result.salary_min = result.salary_min or _money(val)
        result.description = result.description or _clean(node.get("description"))
        return True
    return False


def _from_opengraph(soup: BeautifulSoup, result: ScrapeResult) -> None:
    def meta(prop: str) -> Optional[str]:
        tag = soup.find("meta", property=prop) or soup.find("meta", attrs={"name": prop})
        return _clean(tag.get("content")) if tag and tag.get("content") else None

    if not result.title:
        result.title = meta("og:title") or _clean(soup.title.string if soup.title else None)
    if not result.company_name:
        result.company_name = meta("og:site_name")
    if not result.description:
        result.description = meta("og:description")


def scrape_posting(url: str) -> ScrapeResult:
    result = ScrapeResult(source=_source_from(url))
    resp = requests.get(url, headers={"User-Agent": UA, "Accept-Language": "en,es"},
                        timeout=TIMEOUT, stream=True)
    resp.raise_for_status()
    content = resp.raw.read(MAX_BYTES, decode_content=True)
    soup = BeautifulSoup(content, "html.parser")
    _from_jsonld(soup, result)
    _from_opengraph(soup, result)
    # Titles often look like "Senior Backend Engineer - Acme | LinkedIn"; trim noise.
    if result.title:
        result.title = re.split(r"\s[|–—]\s", result.title)[0].strip() or result.title
    return result
