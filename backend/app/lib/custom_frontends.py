from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import ParseResult, parse_qs, urlencode, urlparse, urlunparse


@dataclass
class CustomFrontendResult:
    url: str
    service: str


def _normalize_hostname(hostname: str) -> str:
    return hostname.lower().removeprefix("www.")


def _create_path_preserving_url(base_url: str, original: ParseResult) -> str:
    parsed_base = urlparse(base_url)
    new_parsed = parsed_base._replace(
        path=original.path,
        query=original.query,
        fragment=original.fragment,
    )
    return urlunparse(new_parsed)


def _handle_instagram(parsed: ParseResult) -> str | None:
    path = parsed.path

    reel_match = re.match(r"^/reels?/([A-Za-z0-9_-]+)", path)
    if reel_match:
        return f"https://imginn.com/p/{reel_match.group(1)}/"

    post_match = re.match(r"^/p/([A-Za-z0-9_-]+)", path)
    if post_match:
        return f"https://imginn.com/p/{post_match.group(1)}/"

    user_reel_match = re.match(r"^/[A-Za-z0-9._]+/reels?/([A-Za-z0-9_-]+)", path)
    if user_reel_match:
        return f"https://imginn.com/p/{user_reel_match.group(1)}/"

    user_post_match = re.match(r"^/[A-Za-z0-9._]+/p/([A-Za-z0-9_-]+)", path)
    if user_post_match:
        return f"https://imginn.com/p/{user_post_match.group(1)}/"

    profile_match = re.match(r"^/([A-Za-z0-9._]+)/?$", path)
    if profile_match:
        username = profile_match.group(1)
        reserved = {"p", "reels", "reel", "explore", "direct", "accounts", "stories"}
        if username not in reserved:
            return f"https://imginn.com/{username}/"

    return None


def _handle_youtube(parsed: ParseResult) -> str | None:
    base_url = "https://invidious.tiekoetter.com"
    params = parse_qs(parsed.query)

    video_id_list = params.get("v")
    if video_id_list:
        video_id = video_id_list[0]
        new_params = {"v": video_id}

        playlist_id_list = params.get("list")
        if playlist_id_list:
            new_params["list"] = playlist_id_list[0]

        timestamp_list = params.get("t")
        if timestamp_list:
            new_params["t"] = timestamp_list[0]

        return f"{base_url}/watch?{urlencode(new_params)}"

    shorts_match = re.match(r"^/shorts/([A-Za-z0-9_-]+)", parsed.path)
    if shorts_match:
        return f"{base_url}/watch?v={shorts_match.group(1)}"

    hostname = _normalize_hostname(parsed.netloc)
    if hostname == "youtu.be":
        short_video_id = parsed.path.lstrip("/")
        if short_video_id:
            return f"{base_url}/watch?v={short_video_id}"

    return None


CUSTOM_FRONTEND_CONFIGS: dict[str, dict] = {
    "instagram": {
        "base_url": "https://imginn.com",
        "handler": _handle_instagram,
        "service_name": "Instagram",
        "hostnames": ["instagram.com", "www.instagram.com"],
    },
    "youtube": {
        "base_url": "https://invidious.tiekoetter.com",
        "handler": _handle_youtube,
        "service_name": "YouTube",
        "hostnames": ["youtube.com", "www.youtube.com", "youtu.be", "youtube-nocookie.com"],
    },
    "twitter": {
        "base_url": "https://nitter.catsarch.com",
        "handler": None,
        "service_name": "Twitter",
        "hostnames": ["twitter.com", "x.com", "mobile.twitter.com"],
    },
    "reddit": {
        "base_url": "https://redlib.catsarch.com",
        "handler": None,
        "service_name": "Reddit",
        "hostnames": [
            "reddit.com",
            "www.reddit.com",
            "old.reddit.com",
            "new.reddit.com",
            "redd.it",
        ],
    },
}


def resolve_custom_frontend(url_string: str) -> CustomFrontendResult | None:
    try:
        parsed = urlparse(url_string)
    except Exception:
        return None

    hostname = _normalize_hostname(parsed.netloc)

    for config in CUSTOM_FRONTEND_CONFIGS.values():
        matches = any(
            hostname == _normalize_hostname(candidate)
            or hostname.endswith(f".{_normalize_hostname(candidate)}")
            for candidate in config["hostnames"]
        )

        if not matches:
            continue

        handler = config.get("handler")
        if handler:
            alternative_url = handler(parsed)
            if alternative_url:
                return CustomFrontendResult(url=alternative_url, service=config["service_name"])
        else:
            alternative_url = _create_path_preserving_url(config["base_url"], parsed)
            return CustomFrontendResult(url=alternative_url, service=config["service_name"])

    return None
