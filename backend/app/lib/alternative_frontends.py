from __future__ import annotations

import asyncio
import ipaddress
import json
import logging
import random
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import ParseResult, urlparse, urlunparse

import httpx

from .custom_frontends import resolve_custom_frontend
from .http_client import get_http_client

logger = logging.getLogger(__name__)

REMOTE_DATASET_URL = (
    "https://raw.githubusercontent.com/libredirect/instances/refs/heads/main/data.json"
)
DATASET_CACHE_TTL_SECONDS = 3600
VALIDATION_TIMEOUT_SECONDS = 3.0
MAX_VALIDATION_ATTEMPTS = 2

SERVICE_HOSTNAMES: dict[str, list[str]] = {
    "invidious": ["youtube.com", "youtu.be", "youtube-nocookie.com"],
    "piped": ["youtube.com", "youtu.be", "youtube-nocookie.com"],
    "pipedMaterial": ["youtube.com", "youtu.be"],
    "hyperpipe": ["youtube.com", "youtu.be"],
    "cloudtube": ["youtube.com", "youtu.be"],
    "materialious": ["youtube.com", "youtu.be"],
    "nitter": ["twitter.com", "x.com", "mobile.twitter.com"],
    "redlib": ["reddit.com", "redd.it"],
    "scribe": ["medium.com"],
    "libMedium": ["medium.com"],
    "breezeWiki": ["wikipedia.org", "wikimedia.org", "wikiwand.com"],
    "wikiless": ["wikipedia.org", "wikimedia.org", "wikiwand.com"],
    "libremdb": ["imdb.com"],
    "quetre": ["quora.com"],
    "rimgo": ["imgur.com", "imgur.io"],
    "whoogle": ["google.com", "duckduckgo.com", "bing.com", "yahoo.com"],
    "searx": ["google.com", "duckduckgo.com", "bing.com", "yahoo.com"],
    "searxng": ["google.com", "duckduckgo.com", "bing.com", "yahoo.com"],
    "simplyTranslate": ["translate.google.com"],
    "lingva": ["translate.google.com"],
    "libreTranslate": ["translate.google.com"],
    "mozhi": ["deepl.com", "translate.google.com"],
    "anonymousOverflow": [
        "stackoverflow.com",
        "stackexchange.com",
        "superuser.com",
        "askubuntu.com",
    ],
    "safetwitch": ["twitch.tv"],
    "priviblur": ["tumblr.com"],
    "suds": ["discord.com"],
    "dumb": ["genius.com"],
    "biblioReads": ["goodreads.com"],
    "gothub": ["github.com"],
}

URL_EXTRACTOR = re.compile(r"https?://[^\s\"'<>]+", re.IGNORECASE)


@dataclass
class AlternativeFrontendMatch:
    service: str
    frontend_url: str
    is_custom_override: bool = False


@dataclass
class CacheEntry:
    data: dict[str, Any]
    timestamp: float


_cached_dataset: CacheEntry | None = None
_fetch_lock = asyncio.Lock()

_BLOCKED_HOSTS = {"localhost"}


def _load_bundled_dataset() -> dict[str, Any] | None:
    for path in (
        Path(__file__).resolve().parents[2] / "data.json",
        Path(__file__).resolve().parents[3] / "data.json",
    ):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else None
        except (OSError, json.JSONDecodeError):
            continue
    return None


def _normalize_hostname(hostname: str) -> str:
    return hostname.lower().removeprefix("www.")


def _extract_urls_from_string(value: str) -> list[str]:
    trimmed = value.strip()
    if not trimmed:
        return []

    matches = URL_EXTRACTOR.findall(trimmed)
    if matches:
        return [re.sub(r'[)"\',.;]+$', "", m) for m in matches]

    if trimmed.startswith(("http://", "https://")):
        return [re.sub(r'[)"\',.;]+$', "", trimmed)]

    return []


def _collect_urls(entry: Any) -> set[str]:
    urls: set[str] = set()
    stack: list[Any] = [entry]

    while stack:
        current = stack.pop()
        if current is None:
            continue
        if isinstance(current, str):
            urls.update(_extract_urls_from_string(current))
        elif isinstance(current, list):
            stack.extend(current)
        elif isinstance(current, dict):
            stack.extend(current.values())

    return urls


def _extract_hostnames(entry: Any) -> list[str]:
    hostnames: set[str] = set()
    for url in _collect_urls(entry):
        try:
            parsed = urlparse(url)
            hostname = _normalize_hostname(parsed.netloc)
            if hostname:
                hostnames.add(hostname)
        except Exception:
            pass
    return list(hostnames)


def _extract_frontends(entry: Any) -> list[str]:
    ordered: list[str] = []
    seen: set[str] = set()

    def add(value: str) -> None:
        if not value or value in seen:
            return
        seen.add(value)
        ordered.append(value)

    if isinstance(entry, dict):
        for key in ["clearnet", "tor", "i2p", "loki"]:
            value = entry.get(key)
            if isinstance(value, list):
                for item in value:
                    if isinstance(item, str):
                        for url in _extract_urls_from_string(item):
                            add(url)
            elif isinstance(value, str):
                for url in _extract_urls_from_string(value):
                    add(url)

    for url in _collect_urls(entry):
        add(url)

    return ordered


async def fetch_alternative_dataset(force_refresh: bool = False) -> dict[str, Any]:
    global _cached_dataset

    now = time.time()
    if (
        not force_refresh
        and _cached_dataset
        and (now - _cached_dataset.timestamp < DATASET_CACHE_TTL_SECONDS)
    ):
        return _cached_dataset.data

    async with _fetch_lock:
        now = time.time()
        if (
            not force_refresh
            and _cached_dataset
            and (now - _cached_dataset.timestamp < DATASET_CACHE_TTL_SECONDS)
        ):
            return _cached_dataset.data

        client = get_http_client()
        try:
            response = await client.get(
                REMOTE_DATASET_URL,
                headers={"Accept": "application/json", "Cache-Control": "no-cache"},
                timeout=8.0,
            )
            response.raise_for_status()
            data = response.json()
        except (httpx.HTTPError, ValueError) as e:
            if _cached_dataset:
                logger.warning(f"Failed to fetch fresh dataset, using cached version: {e}")
                return _cached_dataset.data
            data = _load_bundled_dataset()
            if data is None:
                raise RuntimeError(f"Unable to fetch libredirect dataset: {e}") from e

    _cached_dataset = CacheEntry(data=data, timestamp=now)
    return data


def _is_valid_external_url(url_string: str) -> bool:
    try:
        parsed = urlparse(url_string)
        if parsed.scheme not in ("http", "https"):
            return False

        hostname = (parsed.hostname or "").lower()
        if not hostname:
            return False
        if hostname in _BLOCKED_HOSTS:
            return False

        try:
            address = ipaddress.ip_address(hostname)
            if not address.is_global:
                return False
        except ValueError:
            pass

        return True
    except Exception:
        return False


async def _validate_instance(url: str, timeout: float = VALIDATION_TIMEOUT_SECONDS) -> bool:
    if not _is_valid_external_url(url):
        return False

    try:
        client = get_http_client()
        response = await client.head(url, timeout=timeout)
        return response.is_success or (300 <= response.status_code < 400)
    except Exception:
        return False


def _build_frontend_url(base_url: str, target: ParseResult) -> str:
    try:
        parsed_base = urlparse(base_url)
        new_parsed = parsed_base._replace(
            path=target.path,
            query=target.query,
            fragment=target.fragment,
        )
        return urlunparse(new_parsed)
    except Exception:
        return base_url


def _select_candidates(hostname: str, dataset: dict[str, Any]) -> list[str]:
    mapped = []
    for service, domains in SERVICE_HOSTNAMES.items():
        if service not in dataset:
            continue
        for candidate in domains:
            normalized_candidate = _normalize_hostname(candidate)
            if hostname == normalized_candidate or hostname.endswith(f".{normalized_candidate}"):
                mapped.append(service)
                break

    dataset_matches = []
    for service, entry in dataset.items():
        sources = _extract_hostnames(entry)
        for candidate in sources:
            if hostname == candidate or hostname.endswith(f".{candidate}"):
                dataset_matches.append(service)
                break

    return list(dict.fromkeys(mapped + dataset_matches + list(dataset.keys())))


async def resolve_validated_alternative_frontend(
    target_url: str,
    dataset: dict[str, Any] | None = None,
    max_attempts: int = MAX_VALIDATION_ATTEMPTS,
    timeout: float = VALIDATION_TIMEOUT_SECONDS,
) -> AlternativeFrontendMatch | None:
    try:
        target = urlparse(target_url)
        hostname = _normalize_hostname(target.netloc)
        if hostname == "tiktok.com" or hostname.endswith(".tiktok.com"):
            return None
    except Exception:
        return None
    custom_frontend = resolve_custom_frontend(target_url)
    if custom_frontend:
        return AlternativeFrontendMatch(
            service=custom_frontend.service,
            frontend_url=custom_frontend.url,
            is_custom_override=True,
        )

    if dataset is None:
        dataset = await fetch_alternative_dataset()

    hostname = _normalize_hostname(target.netloc)
    services = _select_candidates(hostname, dataset)

    for service in services:
        entry = dataset.get(service)
        if not entry:
            continue

        sources = _extract_hostnames(entry)
        mapped_sources = [_normalize_hostname(h) for h in SERVICE_HOSTNAMES.get(service, [])]

        matches_source = any(hostname == c or hostname.endswith(f".{c}") for c in sources)
        matches_mapped = any(hostname == c or hostname.endswith(f".{c}") for c in mapped_sources)

        if not matches_source and not matches_mapped:
            continue

        frontends = _extract_frontends(entry)
        if not frontends:
            continue

        clearnet = [
            url
            for url in frontends
            if not re.search(r"\.onion($|/)", url)
            and not re.search(r"\.i2p($|/)", url)
            and not re.search(r"\.loki($|/)", url)
        ]
        pool = clearnet if clearnet else frontends
        tried_instances: set[str] = set()
        attempted_count = 0
        while attempted_count < max_attempts and len(tried_instances) < len(pool):
            available = [url for url in pool if url not in tried_instances]
            if not available:
                break

            base_frontend_url = random.choice(available)
            tried_instances.add(base_frontend_url)
            attempted_count += 1

            frontend_url = _build_frontend_url(base_frontend_url, target)
            base_valid = await _validate_instance(base_frontend_url, timeout)
            if not base_valid:
                continue

            full_valid = (
                True
                if frontend_url == base_frontend_url
                else await _validate_instance(frontend_url, timeout)
            )
            if full_valid:
                return AlternativeFrontendMatch(
                    service=service,
                    frontend_url=frontend_url,
                )

    return None
