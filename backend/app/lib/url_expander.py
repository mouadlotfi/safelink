from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from html.parser import HTMLParser
from typing import Any
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlunparse

import httpx

from .http_client import get_http_client

try:
    from yt_dlp import YoutubeDL as _YoutubeDL
except Exception:  # pragma: no cover - fallback when optional dependency missing
    _YoutubeDL = None

YoutubeDL: Any = _YoutubeDL

logger = logging.getLogger(__name__)

EXPANSION_TIMEOUT_SECONDS = 10.0
EXPANSION_CACHE_TTL_SECONDS = 15 * 60

REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
}

PLACEHOLDER_EXPANSION_PATHS = {"/undefined", "/null"}
INTERSTITIAL_HOST_LABELS = {"consent", "captcha", "challenge", "login", "signin", "accounts"}
INTERSTITIAL_PATH_PARTS = {
    "consent",
    "captcha",
    "challenge",
    "login",
    "signin",
    "sign-in",
    "signup",
    "authwall",
}

YTDLP_BASE_OPTIONS: dict[str, Any] = {
    "quiet": True,
    "no_warnings": True,
    "skip_download": True,
    "noplaylist": True,
}

# Domains that should use yt-dlp for URL expansion after basic redirect/canonical checks.
YTDLP_ALLOWED_DOMAINS = {"tiktok.com", "facebook.com", "fb.watch"}


def _should_use_ytdlp(url_string: str) -> bool:
    """Check if the URL's domain is in the yt-dlp allowlist."""
    try:
        parsed = urlparse(url_string)
        hostname = (parsed.hostname or "").lower()
        return any(
            hostname == domain or hostname.endswith(f".{domain}")
            for domain in YTDLP_ALLOWED_DOMAINS
        )
    except Exception:
        return False


_expansion_cache: dict[str, tuple[str, float]] = {}
_cache_lock = asyncio.Lock()


@dataclass
class ExpansionResult:
    original: str
    expanded: str
    was_expanded: bool


def _should_expand_url(url_string: str) -> bool:
    try:
        parsed = urlparse(url_string)
        if not parsed.scheme or not parsed.netloc:
            return False

        return (
            _is_unexpanded_reddit_link(parsed)
            or _is_unexpanded_facebook_link(parsed)
            or _is_unexpanded_tiktok_link(parsed)
            or _is_unexpanded_linkedin_link(parsed)
            or _is_unexpanded_google_maps_link(parsed)
        )
    except Exception:
        return False


def _is_unexpanded_reddit_link(parsed) -> bool:
    hostname = parsed.netloc.lower().removeprefix("www.")
    path_parts = [part for part in parsed.path.split("/") if part]
    if hostname == "redd.it":
        return len(path_parts) == 1
    return (
        hostname == "reddit.com"
        and len(path_parts) == 4
        and path_parts[0] == "r"
        and path_parts[2] == "s"
    )


def _normalize_facebook_host(host: str) -> str:
    normalized = host.lower().removeprefix("www.").removeprefix("m.").removeprefix("web.")
    return "facebook.com" if normalized == "fb.watch" else normalized


def _is_unexpanded_facebook_link(parsed) -> bool:
    hostname = _normalize_facebook_host(parsed.netloc)
    path_parts = [part for part in parsed.path.split("/") if part]
    if parsed.netloc.lower().removeprefix("www.") == "fb.watch":
        return len(path_parts) == 1
    return hostname == "facebook.com" and len(path_parts) >= 2 and path_parts[0] == "share"


def _is_unexpanded_tiktok_link(parsed) -> bool:
    hostname = parsed.netloc.lower().removeprefix("www.")
    path_parts = [part for part in parsed.path.split("/") if part]
    return hostname in {"vt.tiktok.com", "vm.tiktok.com"} and len(path_parts) == 1


def _is_unexpanded_linkedin_link(parsed) -> bool:
    hostname = parsed.netloc.lower().removeprefix("www.")
    return hostname == "lnkd.in" and len(parsed.path.strip("/")) > 0

def _is_unexpanded_google_maps_link(parsed) -> bool:
    hostname = parsed.netloc.lower().removeprefix("www.")
    path_parts = [part for part in parsed.path.split("/") if part]
    if hostname in ("maps.app.goo.gl", "goo.gl", "g.co"):
        return len(path_parts) >= 1
    return False


def _normalize_candidate(candidate: str, base_url: str) -> str | None:
    normalized = candidate.strip()
    if not normalized:
        return None

    resolved = urljoin(base_url, normalized)
    parsed = urlparse(resolved)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return None
    return resolved


def _is_placeholder_expansion(candidate: str) -> bool:
    try:
        parsed = urlparse(candidate)
    except Exception:
        return False
    return parsed.path.rstrip("/") in PLACEHOLDER_EXPANSION_PATHS


def _remove_query_param(url: str, param_name: str) -> str:
    parsed = urlparse(url)
    filtered_query = [
        pair
        for pair in parse_qsl(parsed.query, keep_blank_values=True)
        if pair[0] != param_name
    ]
    return urlunparse(parsed._replace(query=urlencode(filtered_query), fragment=""))


def _is_facebook_noscript_expansion(original_url: str, candidate: str) -> bool:
    try:
        parsed = urlparse(candidate)
    except Exception:
        return False
    if _normalize_facebook_host(parsed.netloc) != "facebook.com":
        return False
    if "_fb_noscript" not in dict(parse_qsl(parsed.query, keep_blank_values=True)):
        return False
    return _remove_query_param(candidate, "_fb_noscript") == urlunparse(
        urlparse(original_url)._replace(fragment="")
    )


def _is_interstitial_expansion(candidate: str) -> bool:
    try:
        parsed = urlparse(candidate)
    except Exception:
        return False

    candidate_host = parsed.hostname or ""

    host_labels = set(candidate_host.lower().split("."))
    path_parts = {part.lower() for part in parsed.path.split("/") if part}
    return bool(
        host_labels.intersection(INTERSTITIAL_HOST_LABELS)
        or path_parts.intersection(INTERSTITIAL_PATH_PARTS)
    )


def _is_bare_origin(candidate: str) -> bool:
    try:
        parsed = urlparse(candidate)
    except Exception:
        return False
    return parsed.path in ("", "/")


async def _resolve_linkedin_short_link(url: str, timeout: float) -> str | None:
    client = get_http_client()
    try:
        response = await client.get(
            url,
            timeout=timeout,
            follow_redirects=False,
            headers=REQUEST_HEADERS,
        )
    except Exception as e:
        logger.warning("[URL Expander] LinkedIn short-link fetch failed: %s", e)
        return None
    location = response.headers.get("location")
    if not location:
        return None
    return _normalize_candidate(location, url)


def _extract_facebook_login_target(candidate: str) -> str | None:
    try:
        parsed = urlparse(candidate)
    except Exception:
        return None
    if (
        _normalize_facebook_host(parsed.netloc) != "facebook.com"
        or parsed.path.rstrip("/") not in {"/login", "/login.php"}
    ):
        return None

    target = dict(parse_qsl(parsed.query, keep_blank_values=True)).get("next")
    normalized = _normalize_candidate(target or "", candidate)
    if normalized and _normalize_facebook_host(urlparse(normalized).netloc) == "facebook.com":
        return normalized
    return None


def _select_expanded_url(original_url: str, final_url: str, canonical_url: str | None) -> str:
    for candidate in (canonical_url, final_url):
        if (
            candidate
            and not _is_placeholder_expansion(candidate)
            and not _is_facebook_noscript_expansion(original_url, candidate)
            and not _is_interstitial_expansion(candidate)
            and not _is_bare_origin(candidate)
        ):
            return candidate
    return original_url


class _HeadUrlExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.canonical: str | None = None
        self.og_url: str | None = None
        self.twitter_url: str | None = None
        self.meta_refresh: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr_dict = {k.lower(): (v or "") for k, v in attrs}
        if tag == "link":
            if attr_dict.get("rel", "").lower() == "canonical":
                self.canonical = self.canonical or attr_dict.get("href")
        elif tag == "meta":
            http_equiv = attr_dict.get("http-equiv", "").lower()
            if http_equiv == "refresh" and not self.meta_refresh:
                self.meta_refresh = attr_dict.get("content")
            prop = attr_dict.get("property", "").lower() or attr_dict.get("name", "").lower()
            if prop == "og:url" and not self.og_url:
                self.og_url = attr_dict.get("content")
            elif prop == "twitter:url" and not self.twitter_url:
                self.twitter_url = attr_dict.get("content")


def _extract_meta_refresh_url(content: str | None, base_url: str) -> str | None:
    if not content:
        return None
    parts = content.split(";", 1)
    if len(parts) < 2:
        return None
    url_part = parts[1].strip()
    if url_part.lower().startswith("url="):
        url_part = url_part[4:].strip().strip("'\"")
        return _normalize_candidate(url_part, base_url)
    return None

def _replace_reddit_host(url: str, host: str) -> str | None:
    try:
        parsed = urlparse(url)
    except Exception:
        return None
    if "reddit.com" not in parsed.netloc:
        return None
    return urlunparse(parsed._replace(netloc=host))


def _normalize_reddit_output(url: str) -> str:
    try:
        parsed = urlparse(url)
    except Exception:
        return url
    if parsed.netloc == "old.reddit.com":
        return urlunparse(parsed._replace(netloc="www.reddit.com"))
    return url


def _is_reddit_share_link(url: str) -> bool:
    try:
        parsed = urlparse(url)
        return "reddit.com" in parsed.netloc and "/s/" in parsed.path
    except Exception:
        return False


def _normalize_facebook_output(original_url: str, candidate: str) -> str:
    try:
        original = urlparse(original_url)
        parsed = urlparse(candidate)
    except Exception:
        return candidate

    original_host = _normalize_facebook_host(original.netloc)
    candidate_host = _normalize_facebook_host(parsed.netloc)
    if original_host != "facebook.com" or candidate_host != "facebook.com":
        return candidate

    original_parts = [part for part in original.path.split("/") if part]
    candidate_parts = [part for part in parsed.path.split("/") if part]
    if (
        len(original_parts) != 3
        or original_parts[0] != "share"
        or original_parts[1] not in {"v", "r"}
    ):
        return candidate
    if "videos" not in candidate_parts or not candidate_parts[-1].isdigit():
        return candidate

    return urlunparse(
        (parsed.scheme or "https", "www.facebook.com", f"/reel/{candidate_parts[-1]}", "", "", "")
    )



async def _fetch_html_canonical(url: str, timeout: float) -> tuple[str, str | None]:

    client = get_http_client()
    response = await client.get(
        url,
        timeout=timeout,
        follow_redirects=True,
        headers=REQUEST_HEADERS,
    )
    final_url = str(response.url)
    if _is_unexpanded_facebook_link(urlparse(url)):
        login_target = _extract_facebook_login_target(final_url)
        if login_target:
            return login_target, login_target
    if response.status_code == 403:
        fallback_url = _replace_reddit_host(final_url, "old.reddit.com")
        if fallback_url:
            response = await client.get(
                fallback_url,
                timeout=timeout,
                follow_redirects=True,
                headers=REQUEST_HEADERS,
            )
            final_url = str(response.url)
    content_type = response.headers.get("content-type", "").lower()
    if "text/html" not in content_type and "application/xhtml" not in content_type:
        return _normalize_reddit_output(final_url), None

    html_text = response.text
    extractor = _HeadUrlExtractor()
    extractor.feed(html_text)

    meta_refresh_url = _extract_meta_refresh_url(extractor.meta_refresh, final_url)
    if meta_refresh_url:
        return _normalize_reddit_output(final_url), _normalize_reddit_output(meta_refresh_url)

    candidate = (
        extractor.canonical
        or extractor.og_url
        or extractor.twitter_url
    )

    if not candidate:
        return _normalize_reddit_output(final_url), None

    normalized_candidate = _normalize_candidate(candidate, final_url)
    if normalized_candidate:
        return _normalize_reddit_output(final_url), _normalize_reddit_output(normalized_candidate)
    return _normalize_reddit_output(final_url), None


async def _expand_with_yt_dlp(url: str, timeout: float) -> str | None:
    ytdlp_cls = YoutubeDL
    if ytdlp_cls is None:
        return None

    def _extract() -> str | None:
        options: dict[str, Any] = {**YTDLP_BASE_OPTIONS, "socket_timeout": timeout}
        with ytdlp_cls(options) as ydl:
            info = ydl.extract_info(url, download=False)
            if not info:
                return None
            return info.get("webpage_url") or info.get("original_url") or info.get("url")

    try:
        return await asyncio.wait_for(asyncio.to_thread(_extract), timeout=timeout)
    except Exception as e:
        logger.warning(
            "[URL Expander] yt-dlp failed for host %s: %s",
            urlparse(url).hostname,
            e,
        )
        return None


async def _get_cached_expansion(url: str) -> str | None:
    async with _cache_lock:
        entry = _expansion_cache.get(url)
        if not entry:
            return None
        expanded, timestamp = entry
        if time.time() - timestamp > EXPANSION_CACHE_TTL_SECONDS:
            _expansion_cache.pop(url, None)
            return None
        return expanded


async def _set_cached_expansion(url: str, expanded: str) -> None:
    async with _cache_lock:
        _expansion_cache[url] = (expanded, time.time())


async def expand_url(
    url_string: str, timeout: float = EXPANSION_TIMEOUT_SECONDS
) -> ExpansionResult:
    try:
        if not _should_expand_url(url_string):
            return ExpansionResult(original=url_string, expanded=url_string, was_expanded=False)

        cached = await _get_cached_expansion(url_string)
        if cached is not None:
            return ExpansionResult(
                original=url_string,
                expanded=cached,
                was_expanded=cached != url_string,
            )

        logger.info("[URL Expander] Attempting to expand host: %s", urlparse(url_string).hostname)
        if _is_unexpanded_linkedin_link(urlparse(url_string)):
            linkedin_target = await _resolve_linkedin_short_link(url_string, timeout)
            if linkedin_target:
                final_url, canonical_url = linkedin_target, None
            else:
                final_url, canonical_url = await _fetch_html_canonical(url_string, timeout)
        else:
            for attempt in range(2):
                try:
                    final_url, canonical_url = await _fetch_html_canonical(url_string, timeout)
                    break
                except httpx.TransportError:
                    if attempt == 1:
                        raise
                    await asyncio.sleep(0.25)
        expanded_url = _select_expanded_url(url_string, final_url, canonical_url)
        expanded_url = _normalize_facebook_output(url_string, expanded_url)
        logger.info(
            "[URL Expander] Expansion completed for host: %s", urlparse(url_string).hostname
        )

        if expanded_url == url_string and _should_use_ytdlp(url_string):
            logger.info(
                "[URL Expander] Attempting yt-dlp expansion for host: %s",
                urlparse(url_string).hostname,
            )
            ytdlp_url = await _expand_with_yt_dlp(url_string, timeout)
            if ytdlp_url:
                logger.info(
                    "[URL Expander] yt-dlp expansion completed for host: %s",
                    urlparse(url_string).hostname,
                )
                expanded_url = _normalize_facebook_output(url_string, ytdlp_url)

        if expanded_url != url_string:
            await _set_cached_expansion(url_string, expanded_url)
        return ExpansionResult(
            original=url_string,
            expanded=expanded_url,
            was_expanded=expanded_url != url_string,
        )
    except Exception as e:
        logger.error(
            "[URL Expander] Failed to expand host %s: %s", urlparse(url_string).hostname, e
        )
        raise

