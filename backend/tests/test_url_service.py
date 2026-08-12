from urllib.parse import urlencode, urlunparse

import pytest

from app.lib import alternative_frontends, url_service
from app.lib.alternative_frontends import AlternativeFrontendMatch
from app.lib.url_service import CleanUrlResult


def build_url(hostname: str, path: str, params: dict[str, str] | None = None) -> str:
    return urlunparse(("https", hostname, path, "", urlencode(params or {}), ""))


@pytest.mark.asyncio
async def test_alt_frontend_skips_dataset_for_custom_match(monkeypatch):
    video_id = "video_id_for_test"
    url = build_url("www.youtube.com", "/watch", {"v": video_id})

    async def fake_clean_url(clean_url: str):
        assert clean_url == url
        return CleanUrlResult(original=url, expanded=None, cleaned=url, was_expanded=False)

    async def fake_resolve(target_url: str):
        assert target_url == url
        return AlternativeFrontendMatch(
            service="YouTube",
            frontend_url=build_url("invidious.tiekoetter.com", "/watch", {"v": video_id}),
            is_custom_override=True,
        )

    monkeypatch.setattr(url_service, "get_cleaned_url", fake_clean_url)
    monkeypatch.setattr(url_service, "resolve_validated_alternative_frontend", fake_resolve)

    result = await url_service.get_alternative_frontend(url)

    assert result.service == "YouTube"
    assert result.alternative == build_url("invidious.tiekoetter.com", "/watch", {"v": video_id})
    assert result.is_custom_frontend is True


@pytest.mark.asyncio
async def test_alt_frontend_resolves_against_expanded_url(monkeypatch):
    original_url = build_url("vt.tiktok.com", "/opaque_share_id")
    expanded_url = build_url("www.tiktok.com", "/@profile/video/0000000000000000000")
    alternative_url = build_url("privacy.example.test", "/@profile/video/0000000000000000000")

    async def fake_clean_url(clean_url: str):
        assert clean_url == original_url
        return CleanUrlResult(
            original=original_url,
            expanded=expanded_url,
            cleaned=expanded_url,
            was_expanded=True,
        )

    async def fake_resolve_alternative_frontend(target_url: str):
        assert target_url == expanded_url
        return AlternativeFrontendMatch(
            service="test",
            frontend_url=alternative_url,
        )

    monkeypatch.setattr(url_service, "get_cleaned_url", fake_clean_url)
    monkeypatch.setattr(
        url_service,
        "resolve_validated_alternative_frontend",
        fake_resolve_alternative_frontend,
    )

    result = await url_service.get_alternative_frontend(original_url)

    assert result.cleaned == expanded_url
    assert result.alternative == alternative_url


@pytest.mark.asyncio
async def test_alternative_frontend_returns_curated_custom_without_network_validation(monkeypatch):
    url = build_url("www.youtube.com", "/watch", {"v": "video_id_for_test"})

    async def unexpected_validation(candidate: str, timeout: float):
        raise AssertionError(f"curated alternative should not be validated: {candidate}")

    monkeypatch.setattr(alternative_frontends, "_validate_instance", unexpected_validation)

    result = await alternative_frontends.resolve_validated_alternative_frontend(url, {})

    assert result == AlternativeFrontendMatch(
        service="YouTube",
        frontend_url=build_url("invidious.tiekoetter.com", "/watch", {"v": "video_id_for_test"}),
        is_custom_override=True,
    )


@pytest.mark.asyncio
async def test_reddit_uses_curated_redlib_instance():
    url = build_url("www.reddit.com", "/r/privacy/comments/example")

    result = await alternative_frontends.resolve_validated_alternative_frontend(url, {})

    assert result == AlternativeFrontendMatch(
        service="Reddit",
        frontend_url=build_url("redlib.catsarch.com", "/r/privacy/comments/example"),
        is_custom_override=True,
    )


@pytest.mark.asyncio
async def test_tiktok_returns_no_alternative_frontend():
    url = "https://www.tiktok.com/@scout2015/video/6718335390845095173"
    result = await alternative_frontends.resolve_validated_alternative_frontend(url)
    assert result is None
