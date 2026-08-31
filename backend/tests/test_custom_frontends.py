from urllib.parse import urlencode, urlunparse

from app.lib.custom_frontends import (
    CustomFrontendResult,
    resolve_custom_frontend,
)


def build_url(hostname: str, path: str, params: dict[str, str] | None = None) -> str:
    return urlunparse(("https", hostname, path, "", urlencode(params or {}), ""))


def assert_result(url: str, expected_url: str, service: str) -> None:
    assert resolve_custom_frontend(url) == CustomFrontendResult(
        url=expected_url,
        service=service,
    )


# --- Instagram ---


def test_instagram_reel():
    assert_result(
        build_url("www.instagram.com", "/reel/CxYpW3Aqabc"),
        "https://imginn.com/p/CxYpW3Aqabc/",
        "Instagram",
    )


def test_instagram_reels_plural_path():
    assert_result(
        build_url("www.instagram.com", "/reels/CxYpW3Aqabc"),
        "https://imginn.com/p/CxYpW3Aqabc/",
        "Instagram",
    )


def test_instagram_user_scoped_reel():
    assert_result(
        build_url("www.instagram.com", "/someuser/reels/CxYpW3Aqabc"),
        "https://imginn.com/p/CxYpW3Aqabc/",
        "Instagram",
    )


def test_instagram_user_scoped_post():
    assert_result(
        build_url("www.instagram.com", "/some.user/reel/CxYpW3Aqabc"),
        "https://imginn.com/p/CxYpW3Aqabc/",
        "Instagram",
    )


def test_instagram_post():
    assert_result(
        build_url("www.instagram.com", "/p/CxYpW3Aqabc/"),
        "https://imginn.com/p/CxYpW3Aqabc/",
        "Instagram",
    )


def test_instagram_profile():
    assert_result(
        build_url("www.instagram.com", "/someuser"),
        "https://imginn.com/someuser/",
        "Instagram",
    )


def test_instagram_reserved_profile_names_do_not_match():
    assert resolve_custom_frontend(build_url("www.instagram.com", "/explore")) is None
    assert resolve_custom_frontend(build_url("www.instagram.com", "/reels")) is None


# --- YouTube ---


def test_youtube_watch_preserves_video_playlist_and_timestamp():
    url = build_url(
        "www.youtube.com",
        "/watch",
        {"v": "video_id_for_test", "list": "PL123", "t": "42s", "utm_source": "x"},
    )
    assert_result(
        url,
        "https://invidious.tiekoetter.com/watch?v=video_id_for_test&list=PL123&t=42s",
        "YouTube",
    )


def test_youtube_shorts():
    assert_result(
        build_url("www.youtube.com", "/shorts/video_id_for_test"),
        "https://invidious.tiekoetter.com/watch?v=video_id_for_test",
        "YouTube",
    )


def test_youtube_short_url():
    assert_result(
        build_url("youtu.be", "/video_id_for_test"),
        "https://invidious.tiekoetter.com/watch?v=video_id_for_test",
        "YouTube",
    )


def test_youtube_nocookie_hostname():
    assert_result(
        build_url("www.youtube-nocookie.com", "/watch", {"v": "video_id_for_test"}),
        "https://invidious.tiekoetter.com/watch?v=video_id_for_test",
        "YouTube",
    )


def test_youtube_playlist_without_video_does_not_match():
    assert (
        resolve_custom_frontend(build_url("www.youtube.com", "/playlist", {"list": "PL123"}))
        is None
    )


# --- Twitter / X ---


def test_twitter_preserves_path():
    assert_result(
        build_url("twitter.com", "/someuser/status/1234567890"),
        "https://x.n0g.xyz/someuser/status/1234567890",
        "Twitter",
    )


def test_x_preserves_path():
    assert_result(
        build_url("x.com", "/someuser/status/1234567890"),
        "https://x.n0g.xyz/someuser/status/1234567890",
        "Twitter",
    )


def test_mobile_twitter_preserves_path():
    assert_result(
        build_url("mobile.twitter.com", "/someuser/status/1234567890"),
        "https://x.n0g.xyz/someuser/status/1234567890",
        "Twitter",
    )

# --- Reddit ---


def test_reddit_preserves_path():
    assert_result(
        build_url("www.reddit.com", "/r/privacy/comments/123456/test"),
        "https://redlib.catsarch.com/r/privacy/comments/123456/test",
        "Reddit",
    )


def test_old_reddit_preserves_path():
    assert_result(
        build_url("old.reddit.com", "/r/privacy/comments/123456/test"),
        "https://redlib.catsarch.com/r/privacy/comments/123456/test",
        "Reddit",
    )


def test_redd_it_short_links_preserve_path():
    assert_result(
        build_url("redd.it", "/opaque_id"),
        "https://redlib.catsarch.com/opaque_id",
        "Reddit",
    )


# --- Non-matching / edge cases ---


def test_unknown_host_returns_none():
    assert resolve_custom_frontend(build_url("example.com", "/path")) is None


def test_case_insensitive_hostname():
    assert_result(
        build_url("WWW.INSTAGRAM.COM", "/p/CxYpW3Aqabc"),
        "https://imginn.com/p/CxYpW3Aqabc/",
        "Instagram",
    )


def test_subdomain_of_matching_host():
    assert_result(
        build_url("m.instagram.com", "/p/CxYpW3Aqabc"),
        "https://imginn.com/p/CxYpW3Aqabc/",
        "Instagram",
    )


def test_garbage_input_returns_none():
    assert resolve_custom_frontend("not a url") is None
    assert resolve_custom_frontend("") is None
