from urllib.parse import urlencode, urlunparse

import httpx
import pytest

from app.lib import url_expander


def build_url(hostname: str, path: str, params: dict[str, str] | None = None) -> str:
    return urlunparse(("https", hostname, path, "", urlencode(params or {}), ""))


@pytest.fixture(autouse=True)
def clear_expansion_cache():
    url_expander._expansion_cache.clear()


def test_detects_any_facebook_share_link_kind():
    url = build_url("www.facebook.com", "/share/future_kind/opaque_id")

    assert url_expander._should_expand_url(url) is True


@pytest.mark.asyncio
async def test_expand_url_uses_canonical_before_ytdlp(monkeypatch):
    url = build_url("vt.tiktok.com", "/opaque_share_id")
    canonical_url = build_url("www.tiktok.com", "/@profile/video/0000000000000000000")
    resolved_url = build_url("www.tiktok.com", "/@profile/video/resolved")

    async def fake_fetch(expand_url: str, timeout: float):
        assert expand_url == url
        return expand_url, canonical_url

    called = False

    async def fake_ytdlp(expand_url: str, timeout: float):
        nonlocal called
        called = True
        return resolved_url

    monkeypatch.setattr(url_expander, "_fetch_html_canonical", fake_fetch)
    monkeypatch.setattr(url_expander, "_expand_with_yt_dlp", fake_ytdlp)

    result = await url_expander.expand_url(url)

    assert result.expanded == canonical_url
    assert result.was_expanded is True
    assert called is False


@pytest.mark.asyncio
@pytest.mark.parametrize("share_kind", ["v", "r"])
async def test_expand_url_uses_ytdlp_when_facebook_share_canonical_missing(
    monkeypatch, share_kind: str
):
    url = build_url("www.facebook.com", f"/share/{share_kind}/opaque_id")
    resolved_path = "/profile/posts/000000000000000"
    if share_kind == "r":
        resolved_path = "/reel/000000000000000"
    resolved_url = build_url("www.facebook.com", resolved_path)

    async def fake_fetch(expand_url: str, timeout: float):
        assert expand_url == url
        return expand_url, None

    async def fake_ytdlp(expand_url: str, timeout: float):
        assert expand_url == url
        return resolved_url

    monkeypatch.setattr(url_expander, "_fetch_html_canonical", fake_fetch)
    monkeypatch.setattr(url_expander, "_expand_with_yt_dlp", fake_ytdlp)

    result = await url_expander.expand_url(url)

    assert result.expanded == resolved_url
    assert result.was_expanded is True


@pytest.mark.asyncio
async def test_expand_url_expands_web_facebook_reel_share_link(monkeypatch):
    url = build_url("web.facebook.com", "/share/r/opaque_id")
    resolved_url = build_url("www.facebook.com", "/reel/000000000000000")

    async def fake_fetch(expand_url: str, timeout: float):
        assert expand_url == url
        return expand_url, None

    async def fake_ytdlp(expand_url: str, timeout: float):
        assert expand_url == url
        return resolved_url

    monkeypatch.setattr(url_expander, "_fetch_html_canonical", fake_fetch)
    monkeypatch.setattr(url_expander, "_expand_with_yt_dlp", fake_ytdlp)

    result = await url_expander.expand_url(url)

    assert result.expanded == resolved_url
    assert result.was_expanded is True


@pytest.mark.asyncio
async def test_expand_url_returns_original_when_facebook_reel_share_is_unavailable(monkeypatch):
    url = build_url("www.facebook.com", "/share/r/opaque_id")

    async def fake_fetch(expand_url: str, timeout: float):
        assert expand_url == url
        return expand_url, None

    async def fake_ytdlp(expand_url: str, timeout: float):
        assert expand_url == url
        return None

    monkeypatch.setattr(url_expander, "_fetch_html_canonical", fake_fetch)
    monkeypatch.setattr(url_expander, "_expand_with_yt_dlp", fake_ytdlp)

    result = await url_expander.expand_url(url)

    assert result.expanded == url
    assert result.was_expanded is False


@pytest.mark.asyncio
async def test_expand_url_ignores_facebook_noscript_refresh_before_ytdlp(monkeypatch):
    url = build_url("www.facebook.com", "/share/r/opaque_id")
    noscript_url = build_url("www.facebook.com", "/share/r/opaque_id", {"_fb_noscript": "1"})
    resolved_url = build_url("www.facebook.com", "/reel/000000000000000")

    async def fake_fetch(expand_url: str, timeout: float):
        assert expand_url == url
        return expand_url, noscript_url

    async def fake_ytdlp(expand_url: str, timeout: float):
        assert expand_url == url
        return resolved_url

    monkeypatch.setattr(url_expander, "_fetch_html_canonical", fake_fetch)
    monkeypatch.setattr(url_expander, "_expand_with_yt_dlp", fake_ytdlp)

    result = await url_expander.expand_url(url)

    assert result.expanded == resolved_url
    assert result.was_expanded is True


def test_ignores_same_host_facebook_login_interstitial():
    original_url = build_url("www.facebook.com", "/share/g/opaque_id")
    login_url = build_url("www.facebook.com", "/login/", {"_fb_noscript": "1"})

    assert url_expander._select_expanded_url(original_url, login_url, None) == original_url


def test_extracts_group_url_from_facebook_login_redirect():
    group_url = build_url("www.facebook.com", "/groups/123456", {"ref": "share"})
    login_url = build_url(
        "www.facebook.com",
        "/login/",
        {"next": group_url, "_fb_noscript": "1"},
    )

    assert url_expander._extract_facebook_login_target(login_url) == group_url


@pytest.mark.asyncio
async def test_expand_url_normalizes_facebook_video_permalink_to_reel(monkeypatch):
    url = build_url("www.facebook.com", "/share/v/opaque_id")
    ytdlp_url = build_url("www.facebook.com", "/profile/videos/title/1606984633720394")
    expected_url = build_url("www.facebook.com", "/reel/1606984633720394")

    async def fake_fetch(expand_url: str, timeout: float):
        assert expand_url == url
        return expand_url, None

    async def fake_ytdlp(expand_url: str, timeout: float):
        assert expand_url == url
        return ytdlp_url

    monkeypatch.setattr(url_expander, "_fetch_html_canonical", fake_fetch)
    monkeypatch.setattr(url_expander, "_expand_with_yt_dlp", fake_ytdlp)

    result = await url_expander.expand_url(url)

    assert result.expanded == expected_url
    assert result.was_expanded is True


@pytest.mark.asyncio
async def test_expand_url_does_not_normalize_facebook_post_permalink_to_reel(monkeypatch):
    url = build_url("www.facebook.com", "/share/v/opaque_id")
    post_url = build_url("www.facebook.com", "/profile/posts/1606984633720394")

    async def fake_fetch(expand_url: str, timeout: float):
        assert expand_url == url
        return expand_url, None

    async def fake_ytdlp(expand_url: str, timeout: float):
        assert expand_url == url
        return post_url

    monkeypatch.setattr(url_expander, "_fetch_html_canonical", fake_fetch)
    monkeypatch.setattr(url_expander, "_expand_with_yt_dlp", fake_ytdlp)

    result = await url_expander.expand_url(url)

    assert result.expanded == post_url
    assert result.was_expanded is True


@pytest.mark.asyncio
async def test_expand_url_expands_facebook_post_share_link(monkeypatch):
    url = build_url("www.facebook.com", "/share/p/opaque_id")
    canonical_url = build_url("www.facebook.com", "/groups/185556969319698/posts/1670637930811587")

    async def fake_fetch(expand_url: str, timeout: float):
        assert expand_url == url
        return expand_url, canonical_url

    async def fake_ytdlp(expand_url: str, timeout: float):
        raise AssertionError("canonical Facebook post share links should not need yt-dlp")

    monkeypatch.setattr(url_expander, "_fetch_html_canonical", fake_fetch)
    monkeypatch.setattr(url_expander, "_expand_with_yt_dlp", fake_ytdlp)

    result = await url_expander.expand_url(url)

    assert result.expanded == canonical_url
    assert result.was_expanded is True


@pytest.mark.asyncio
async def test_expand_url_expands_generic_facebook_share_link(monkeypatch):
    url = build_url("www.facebook.com", "/share/opaque_id")
    canonical_url = build_url("www.facebook.com", "/marketplace/item/1849184109379479")

    async def fake_fetch(expand_url: str, timeout: float):
        assert expand_url == url
        return expand_url, canonical_url

    async def fake_ytdlp(expand_url: str, timeout: float):
        raise AssertionError("canonical generic Facebook share links should not need yt-dlp")

    monkeypatch.setattr(url_expander, "_fetch_html_canonical", fake_fetch)
    monkeypatch.setattr(url_expander, "_expand_with_yt_dlp", fake_ytdlp)

    result = await url_expander.expand_url(url)

    assert result.expanded == canonical_url
    assert result.was_expanded is True


@pytest.mark.asyncio
async def test_expand_url_expands_vm_tiktok_links(monkeypatch):
    url = build_url("vm.tiktok.com", "/opaque_share_id")
    expanded_url = build_url("www.tiktok.com", "/@profile/video/0000000000000000000")

    async def fake_fetch(expand_url: str, timeout: float):
        assert expand_url == url
        return expanded_url, None

    monkeypatch.setattr(url_expander, "_fetch_html_canonical", fake_fetch)

    result = await url_expander.expand_url(url)

    assert result.expanded == expanded_url
    assert result.was_expanded is True


@pytest.mark.asyncio
async def test_expand_url_expands_linkedin_short_links(monkeypatch):
    url = build_url("lnkd.in", "/p/opaque_token")
    expanded_url = build_url("www.linkedin.com", "/posts/author_slug-7492896342265065472-D-Qg")

    async def fake_resolve(expand_url: str, timeout: float):
        assert expand_url == url
        return expanded_url

    called = False

    async def fake_fetch(expand_url: str, timeout: float):
        nonlocal called
        called = True
        return expand_url, None

    monkeypatch.setattr(url_expander, "_resolve_linkedin_short_link", fake_resolve)
    monkeypatch.setattr(url_expander, "_fetch_html_canonical", fake_fetch)

    result = await url_expander.expand_url(url)

    assert result.expanded == expanded_url
    assert result.was_expanded is True
    assert called is False


async def test_expand_url_falls_back_to_canonical_when_linkedin_resolver_fails(monkeypatch):
    url = build_url("lnkd.in", "/p/opaque_token")
    resolved_url = build_url("www.linkedin.com", "/posts/author_slug-123")

    async def fake_resolve(expand_url: str, timeout: float):
        return None

    async def fake_fetch(expand_url: str, timeout: float):
        assert expand_url == url
        return resolved_url, resolved_url

    monkeypatch.setattr(url_expander, "_resolve_linkedin_short_link", fake_resolve)
    monkeypatch.setattr(url_expander, "_fetch_html_canonical", fake_fetch)

    result = await url_expander.expand_url(url)

    assert result.expanded == resolved_url
    assert result.was_expanded is True


async def test_expand_url_ignores_linkedin_signup_wall(monkeypatch):
    url = build_url("lnkd.in", "/p/opaque_token")
    signup_url = build_url("www.linkedin.com", "/signup/cold-join")
    homepage = build_url("www.linkedin.com", "/")

    async def fake_resolve(expand_url: str, timeout: float):
        return None

    async def fake_fetch(expand_url: str, timeout: float):
        return signup_url, homepage

    monkeypatch.setattr(url_expander, "_resolve_linkedin_short_link", fake_resolve)
    monkeypatch.setattr(url_expander, "_fetch_html_canonical", fake_fetch)

    result = await url_expander.expand_url(url)

    assert result.expanded == url
    assert result.was_expanded is False


async def test_expand_url_skips_regular_linkedin_urls(monkeypatch):
    url = build_url("www.linkedin.com", "/posts/author_slug-123")
    called = False

    async def fake_fetch(expand_url: str, timeout: float):
        nonlocal called
        called = True
        return expand_url, None

    monkeypatch.setattr(url_expander, "_fetch_html_canonical", fake_fetch)

    result = await url_expander.expand_url(url)

    assert result.was_expanded is False
    assert called is False


async def test_expand_url_skips_non_expandable_urls(monkeypatch):
    url = build_url("www.youtube.com", "/shorts/video_id_for_test")

    async def fake_fetch(expand_url: str, timeout: float):
        raise AssertionError("non-expandable URLs should not be fetched")

    monkeypatch.setattr(url_expander, "_fetch_html_canonical", fake_fetch)

    result = await url_expander.expand_url(url)

    assert result.expanded == url
    assert result.was_expanded is False


@pytest.mark.asyncio
async def test_expand_url_skips_regular_tiktok_urls(monkeypatch):
    url = build_url("www.tiktok.com", "/@profile/video/0000000000000000000")

    async def fake_fetch(expand_url: str, timeout: float):
        raise AssertionError("regular TikTok URLs should not be fetched")

    monkeypatch.setattr(url_expander, "_fetch_html_canonical", fake_fetch)

    result = await url_expander.expand_url(url)

    assert result.expanded == url
    assert result.was_expanded is False


@pytest.mark.asyncio
async def test_expand_url_skips_regular_facebook_urls(monkeypatch):
    url = build_url("www.facebook.com", "/profile/posts/000000000000000")

    async def fake_fetch(expand_url: str, timeout: float):
        raise AssertionError("regular Facebook URLs should not be fetched")

    monkeypatch.setattr(url_expander, "_fetch_html_canonical", fake_fetch)

    result = await url_expander.expand_url(url)

    assert result.expanded == url
    assert result.was_expanded is False


@pytest.mark.asyncio
async def test_expand_url_skips_expanded_reddit_urls(monkeypatch):
    url = build_url("www.reddit.com", "/r/test/comments/000000/test_post")

    async def fake_fetch(expand_url: str, timeout: float):
        raise AssertionError("expanded Reddit URLs should not be fetched")

    monkeypatch.setattr(url_expander, "_fetch_html_canonical", fake_fetch)

    result = await url_expander.expand_url(url)

    assert result.expanded == url
    assert result.was_expanded is False


@pytest.mark.asyncio
async def test_expand_url_expands_unexpanded_reddit_urls(monkeypatch):
    url = build_url("www.reddit.com", "/r/test/s/opaque_share_id")
    expanded_url = build_url("www.reddit.com", "/r/test/comments/000000/test_post")

    async def fake_fetch(expand_url: str, timeout: float):
        assert expand_url == url
        return expanded_url, None

    monkeypatch.setattr(url_expander, "_fetch_html_canonical", fake_fetch)

    result = await url_expander.expand_url(url)

    assert result.expanded == expanded_url
    assert result.was_expanded is True


@pytest.mark.asyncio
async def test_expand_url_ignores_placeholder_canonical(monkeypatch):
    url = build_url("vt.tiktok.com", "/opaque_share_id")

    async def fake_fetch(expand_url: str, timeout: float):
        assert expand_url == url
        return url, build_url("vt.tiktok.com", "/undefined")

    monkeypatch.setattr(url_expander, "_fetch_html_canonical", fake_fetch)

    result = await url_expander.expand_url(url)

    assert result.expanded == url
    assert result.was_expanded is False


@pytest.mark.asyncio
async def test_expand_url_ignores_cross_host_interstitial(monkeypatch):
    url = build_url("vt.tiktok.com", "/opaque_share_id")
    consent_url = build_url(
        "consent.example.test",
        "/continue",
        {"next": "1"},
    )

    async def fake_fetch(expand_url: str, timeout: float):
        assert expand_url == url
        return consent_url, None

    monkeypatch.setattr(url_expander, "_fetch_html_canonical", fake_fetch)

    result = await url_expander.expand_url(url)

    assert result.expanded == url
    assert result.was_expanded is False


@pytest.mark.asyncio
async def test_expand_url_retries_transient_connection_failure(monkeypatch):
    url = build_url("www.reddit.com", "/r/test/s/opaque_share_id")
    expanded_url = build_url("www.reddit.com", "/r/test/comments/000000/test_post")
    attempts = 0

    async def fake_fetch(expand_url: str, timeout: float):
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise httpx.ConnectError("temporary DNS failure", request=httpx.Request("GET", url))
        return expanded_url, None

    monkeypatch.setattr(url_expander, "_fetch_html_canonical", fake_fetch)

    result = await url_expander.expand_url(url)

    assert attempts == 2
    assert result.expanded == expanded_url


@pytest.mark.asyncio
async def test_expand_url_does_not_cache_unsuccessful_result(monkeypatch):
    url = build_url("www.reddit.com", "/r/test/s/opaque_share_id")
    attempts = 0

    async def fake_fetch(expand_url: str, timeout: float):
        nonlocal attempts
        attempts += 1
        return url, None

    monkeypatch.setattr(url_expander, "_fetch_html_canonical", fake_fetch)

    await url_expander.expand_url(url)
    await url_expander.expand_url(url)



@pytest.mark.asyncio
async def test_expand_url_expands_google_maps_short_links(monkeypatch):
    short_url = "https://maps.app.goo.gl/exampleShortCode?g_st=ic"
    destination_url = "https://www.google.com/maps?q=Example+Place&ftid=0x123456"

    async def fake_fetch(url: str, timeout: float):
        assert url == short_url
        return destination_url, None

    monkeypatch.setattr(url_expander, "_fetch_html_canonical", fake_fetch)

    result = await url_expander.expand_url(short_url)
    assert result.was_expanded is True
    assert result.expanded == destination_url
