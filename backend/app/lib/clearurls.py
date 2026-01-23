from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import unquote, unquote_plus, urlparse, urlunparse

import httpx

from .http_client import get_http_client

logger = logging.getLogger(__name__)

REMOTE_RULESET_URL = "https://rules2.clearurls.xyz/data.minify.json"
RULESET_CACHE_TTL_SECONDS = 3600
MAX_REDIRECT_DEPTH = 3

TRACKER_PARAM_PATTERNS = [
    re.compile(r"^utm_", re.IGNORECASE),
    re.compile(r"^fbclid$", re.IGNORECASE),
    re.compile(r"^gclid$", re.IGNORECASE),
    re.compile(r"^yclid$", re.IGNORECASE),
    re.compile(r"^mc_", re.IGNORECASE),
    re.compile(r"^ig[a-z0-9_]*$", re.IGNORECASE),
    re.compile(r"^__coig_restricted$", re.IGNORECASE),
    re.compile(r"^g_st$", re.IGNORECASE),
    re.compile(r"^spm$", re.IGNORECASE),
    re.compile(r"^is_from_webapp$", re.IGNORECASE),
]

TIKTOK_TRACKER_PARAM_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in [
        r"^_d$",
        r"^_r$",
        r"^_svg$",
        r"^checksum$",
        r"^comment_author_id$",
        r"^preview_pb$",
        r"^sec_user_id$",
        r"^share_",
        r"^sharer_language$",
        r"^social_share_type$",
        r"^source$",
        r"^timestamp$",
        r"^tt_from$",
        r"^u_code$",
        r"^ug_btm$",
        r"^user_id$",
    ]
]

FACEBOOK_TRACKER_PARAM_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in [
        r"^fs$",
        r"^rdid$",
        r"^share_url$",
    ]
]

# The ClearURLs dataset's LinkedIn provider only covers refId/trk/
# trackingId/li[a-z]{2}; these are the commonly-seen trackers it misses
# (share posts, job listings, feed referrals). refId/trk/trackingId are
# repeated here so the offline bundled dataset (which has no LinkedIn
# provider) still cleans them.
LINKEDIN_TRACKER_PARAM_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in [
        r"^rcm$",
        r"^alternateChannel$",
        r"^eBP$",
        r"^gid$",
        r"^midToken$",
        r"^refId$",
        r"^sfdr$",
        r"^shareId$",
        r"^trackingId$",
        r"^trk$",
        r"^trkInfo$",
    ]
]
SPOTIFY_TRACKER_PARAM_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in [
        r"^si$",
        r"^pi$",
        r"^sci$",
        r"^context$",
        r"^nd$",
        r"^destination$",
        r"^go$",
    ]
]
GOOGLE_TRACKER_PARAM_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in [
        r"^g_ep$",
        r"^lucs$",
        r"^skid$",
        r"^shh$",
        r"^entry$",
        r"^authuser$",
        r"^coh$",
        r"^uact$",
        r"^ved$",
    ]
]
BOOKING_TRACKER_PARAM_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in [
        r"^label$",
        r"^sid$",
        r"^aid$",
        r"^ucfs$",
        r"^arphpl$",
        r"^auth_success$",
        r"^keep_landing$",
        r"^sb_price_type$",
        r"^from$",
        r"^from_source$",
        r"^dist$",
        r"^hapos$",
        r"^sr_order$",
        r"^tab$",
        r"^activeTab$",
        r"^all_sr_blocks$",
        r"^highlighted_blocks$",
        r"^chal$",
        r"^req_adults$",
        r"^req_children$",
        r"^no_rooms$",
        r"^group_adults$",
        r"^group_children$",
        r"^checkin$",
        r"^checkout$",
    ]
]

AIRBNB_TRACKER_PARAM_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in [
        r"^location$",
        r"^search_mode$",
        r"^adults$",
        r"^children$",
        r"^infants$",
        r"^pets$",
        r"^category_tag$",
        r"^check_in$",
        r"^check_out$",
        r"^photo_id$",
        r"^source_impression_id$",
        r"^previous_page_section_name$",
        r"^federated_search_id$",
        r"^search_id$",
        r"^section_id$",
        r"^search_type$",
        r"^pdp_referrer_page_id$",
        r"^shared_id$",
        r"^virality_entry_point$",
        r"^locale$",
        r"^c$",
    ]
]




FACEBOOK_STORY_TRACKER_PATH = re.compile(r"^(/stories/[^/]+)/tracker/?$", re.IGNORECASE)


@dataclass
class ClearUrlsProvider:
    url_pattern: str | None = None
    url_pattern_flags: str = "i"
    rules: list[str] = field(default_factory=list)
    exceptions: list[str] = field(default_factory=list)
    raw_rules: list[str] = field(default_factory=list)
    redirections: list[str] = field(default_factory=list)
    complete_provider_list: list[str] = field(default_factory=list)


@dataclass
class CompiledProvider:
    original: ClearUrlsProvider
    compiled_pattern: re.Pattern[str] | None = None
    compiled_rules: list[re.Pattern[str]] = field(default_factory=list)
    compiled_exceptions: list[re.Pattern[str]] = field(default_factory=list)
    compiled_complete_provider_list: list[re.Pattern[str]] = field(default_factory=list)


@dataclass
class ClearUrlsRuleSet:
    version: str | None = None
    providers: dict[str, ClearUrlsProvider] = field(default_factory=dict)


@dataclass
class CacheEntry:
    data: ClearUrlsRuleSet
    timestamp: float


_cached_rules: CacheEntry | None = None
_compiled_cache: dict[int, CompiledProvider] = {}
_failed_patterns: set[str] = set()
_fetch_lock = asyncio.Lock()


def _load_bundled_rules() -> dict[str, Any] | None:
    for path in (
        Path(__file__).resolve().parents[2] / "clearurls-rules.json",
        Path(__file__).resolve().parents[3] / "clearurls-rules.json",
    ):
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
    return None


def _compile_pattern(pattern: str, flags: str = "i") -> re.Pattern[str] | None:
    try:
        re_flags = re.IGNORECASE if "i" in flags.lower() else 0
        return re.compile(pattern, re_flags)
    except re.error as e:
        if pattern not in _failed_patterns:
            _failed_patterns.add(pattern)
            logger.warning(f"Failed to compile regex pattern: {pattern}, error: {e}")
        return None


def _compile_provider(provider: ClearUrlsProvider) -> CompiledProvider:
    provider_id = id(provider)
    if provider_id in _compiled_cache:
        return _compiled_cache[provider_id]

    compiled_pattern = None
    if provider.url_pattern:
        compiled_pattern = _compile_pattern(provider.url_pattern, provider.url_pattern_flags)

    compiled_rules = [p for r in provider.rules if (p := _compile_pattern(r)) is not None]
    compiled_exceptions = [p for e in provider.exceptions if (p := _compile_pattern(e)) is not None]
    compiled_complete_provider_list = [
        p for r in provider.complete_provider_list if (p := _compile_pattern(r)) is not None
    ]

    compiled = CompiledProvider(
        original=provider,
        compiled_pattern=compiled_pattern,
        compiled_rules=compiled_rules,
        compiled_exceptions=compiled_exceptions,
        compiled_complete_provider_list=compiled_complete_provider_list,
    )
    _compiled_cache[provider_id] = compiled
    return compiled


def _parse_provider(data: dict[str, Any]) -> ClearUrlsProvider:
    complete_provider = data.get("completeProvider")
    complete_provider_list = []
    if isinstance(complete_provider, list):
        complete_provider_list = complete_provider

    return ClearUrlsProvider(
        url_pattern=data.get("urlPattern"),
        url_pattern_flags=data.get("urlPatternFlags", "i"),
        rules=data.get("rules", []),
        exceptions=data.get("exceptions", []),
        raw_rules=data.get("rawRules", []),
        redirections=data.get("redirections", []),
        complete_provider_list=complete_provider_list,
    )


def _parse_ruleset(data: dict[str, Any]) -> ClearUrlsRuleSet:
    providers_data = data.get("providers", {})
    providers = {name: _parse_provider(pdata) for name, pdata in providers_data.items()}
    return ClearUrlsRuleSet(version=data.get("version"), providers=providers)


async def fetch_clearurls_rules(force_refresh: bool = False) -> ClearUrlsRuleSet:
    global _cached_rules, _compiled_cache

    now = time.time()
    if (
        not force_refresh
        and _cached_rules
        and (now - _cached_rules.timestamp < RULESET_CACHE_TTL_SECONDS)
    ):
        return _cached_rules.data

    async with _fetch_lock:
        now = time.time()
        if (
            not force_refresh
            and _cached_rules
            and (now - _cached_rules.timestamp < RULESET_CACHE_TTL_SECONDS)
        ):
            return _cached_rules.data

        client = get_http_client()
        try:
            response = await client.get(
                REMOTE_RULESET_URL,
                headers={"Accept": "application/json", "Cache-Control": "no-cache"},
                timeout=8.0,
            )
            response.raise_for_status()
            data = response.json()
        except (httpx.HTTPError, ValueError) as e:
            if _cached_rules:
                logger.warning(f"Failed to fetch fresh rules, using cached version: {e}")
                return _cached_rules.data
            data = _load_bundled_rules()
            if data is None:
                raise RuntimeError(f"Unable to fetch ClearURLs rules: {e}") from e

    if not data or "providers" not in data:
        if _cached_rules:
            logger.warning("Received malformed data, using cached version")
            return _cached_rules.data
        raise RuntimeError("Received malformed ClearURLs dataset")

    ruleset = _parse_ruleset(data)
    _cached_rules = CacheEntry(data=ruleset, timestamp=now)
    _compiled_cache.clear()
    return ruleset


def _matches_provider(url: str, provider: CompiledProvider) -> bool:
    if provider.compiled_pattern and provider.compiled_pattern.search(url):
        return True

    for pattern in provider.compiled_complete_provider_list:
        if pattern.search(url):
            return True

    return False


def _matches_any(patterns: list[re.Pattern[str]], candidate: str) -> bool:
    return any(p.search(candidate) for p in patterns)


def _query_parts(raw_query: str) -> list[tuple[str, str, str]]:
    parts = []
    for raw_part in raw_query.split("&") if raw_query else []:
        raw_key, separator, raw_value = raw_part.partition("=")
        parts.append(
            (
                raw_part,
                unquote_plus(raw_key),
                unquote_plus(raw_value) if separator else "",
            )
        )
    return parts


def _apply_provider(
    url: str,
    provider: CompiledProvider,
    depth: int = 0,
    visited: set[str] | None = None,
) -> str:
    if visited is None:
        visited = set()

    if url in visited or depth >= MAX_REDIRECT_DEPTH:
        return url

    visited.add(url)

    parsed = urlparse(url)
    query_parts = _query_parts(parsed.query)
    values_by_key: dict[str, list[str]] = {}
    for _, key, value in query_parts:
        values_by_key.setdefault(key, []).append(value)

    keys_to_delete: set[str] = set()

    for key, values in values_by_key.items():
        value = ",".join(values)
        candidate_key = key
        candidate_pair = f"{key}={value}"

        blocked = _matches_any(provider.compiled_rules, candidate_key)
        # Rules are key-based patterns — no rule in the ClearURLs dataset
        # contains "=". Testing them against `key=value` pairs makes loose
        # patterns like `(?:%3F)?[a-z]?mc` false-positive on VALUES, e.g. a
        # YouTube video ID containing "mc" would lose its `v` parameter.
        exempt = (
            _matches_any(provider.compiled_exceptions, candidate_key)
            or _matches_any(provider.compiled_exceptions, candidate_pair)
            or _matches_any(provider.compiled_exceptions, url)
        )

        if blocked and not exempt:
            keys_to_delete.add(key)

    if provider.original.redirections:
        for redirect_key in provider.original.redirections:
            redirect_values = values_by_key.get(redirect_key)
            if not redirect_values:
                continue
            if redirect_key in keys_to_delete:
                continue
            if depth >= MAX_REDIRECT_DEPTH:
                break
            decoded_candidate = unquote(redirect_values[0])
            try:
                urlparse(decoded_candidate)
                if decoded_candidate.startswith(("http://", "https://")):
                    return _apply_provider(decoded_candidate, provider, depth + 1, visited)
            except Exception:
                continue

    new_query = "&".join(
        raw_part for raw_part, key, _ in query_parts if key not in keys_to_delete
    )
    new_parsed = parsed._replace(query=new_query)
    return urlunparse(new_parsed)


def _apply_fallback(url: str) -> str:
    parsed = urlparse(url)
    query_parts = _query_parts(parsed.query)
    keys_to_delete: set[str] = set()
    hostname = (parsed.hostname or "").lower()
    is_tiktok = hostname == "tiktok.com" or hostname.endswith(".tiktok.com")
    is_facebook = hostname == "facebook.com" or hostname.endswith(".facebook.com")
    is_linkedin = hostname == "linkedin.com" or hostname.endswith(".linkedin.com")
    is_spotify = hostname == "spotify.com" or hostname.endswith(".spotify.com")
    is_google = hostname == "google.com" or hostname.endswith(".google.com")
    is_booking = hostname == "booking.com" or hostname.endswith(".booking.com")
    is_airbnb = hostname.startswith("airbnb.") or ".airbnb." in hostname
    cleaned_path = parsed.path

    if is_facebook and (story_match := FACEBOOK_STORY_TRACKER_PATH.match(parsed.path)):
        cleaned_path = f"{story_match.group(1)}/"
        keys_to_delete.update(key for _, key, _ in query_parts)

    for _, key, _ in query_parts:
        if any(pattern.search(key) for pattern in TRACKER_PARAM_PATTERNS):
            keys_to_delete.add(key)
        elif is_tiktok and any(pattern.search(key) for pattern in TIKTOK_TRACKER_PARAM_PATTERNS):
            keys_to_delete.add(key)
        elif is_facebook and any(
            pattern.search(key) for pattern in FACEBOOK_TRACKER_PARAM_PATTERNS
        ):
            keys_to_delete.add(key)
        elif is_linkedin and any(
            pattern.search(key) for pattern in LINKEDIN_TRACKER_PARAM_PATTERNS
        ):
            keys_to_delete.add(key)
        elif is_spotify and any(
            pattern.search(key) for pattern in SPOTIFY_TRACKER_PARAM_PATTERNS
        ):
            keys_to_delete.add(key)
        elif is_google and any(
            pattern.search(key) for pattern in GOOGLE_TRACKER_PARAM_PATTERNS
        ):
            keys_to_delete.add(key)
        elif is_booking and any(
            pattern.search(key) for pattern in BOOKING_TRACKER_PARAM_PATTERNS
        ):
            keys_to_delete.add(key)
        elif is_airbnb and any(
            pattern.search(key) for pattern in AIRBNB_TRACKER_PARAM_PATTERNS
        ):
            keys_to_delete.add(key)

    if not keys_to_delete and cleaned_path == parsed.path:
        return url

    new_query = "&".join(
        raw_part for raw_part, key, _ in query_parts if key not in keys_to_delete
    )
    new_parsed = parsed._replace(path=cleaned_path, query=new_query)
    return urlunparse(new_parsed)


def clean_url_with_rules(raw: str, ruleset: ClearUrlsRuleSet) -> str:
    try:
        parsed = urlparse(raw)
        if not parsed.scheme or not parsed.netloc:
            return raw.strip()
    except Exception:
        return raw.strip()

    matching_providers: list[CompiledProvider] = []
    for provider in ruleset.providers.values():
        compiled = _compile_provider(provider)
        if _matches_provider(raw, compiled):
            matching_providers.append(compiled)

    if not matching_providers:
        return _apply_fallback(raw)

    result = raw
    for provider in matching_providers:
        result = _apply_provider(result, provider)

    return _apply_fallback(result)
