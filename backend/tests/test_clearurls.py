from urllib.parse import urlencode, urlunparse

from app.lib.clearurls import ClearUrlsProvider, ClearUrlsRuleSet, clean_url_with_rules


def build_url(hostname: str, path: str, params: dict[str, str] | None = None) -> str:
    return urlunparse(("https", hostname, path, "", urlencode(params or {}), ""))

def test_clean_url_removes_tiktok_share_trackers_after_provider_rules():
    ruleset = ClearUrlsRuleSet(
        providers={
            "tiktok.com": ClearUrlsProvider(
                url_pattern=r"^https?:\/\/(?:[a-z0-9-]+\.)*?tiktok\.com",
                rules=["share_app_name"],
            )
        }
    )
    clean_path = "/@profile/video/0000000000000000000"
    url = build_url(
        "www.tiktok.com",
        clean_path,
        {
            "_d": "signed_blob",
            "_r": "1",
            "_svg": "2",
            "checksum": "abc123",
            "comment_author_id": "111",
            "is_from_webapp": "1",
            "preview_pb": "0",
            "sec_user_id": "opaque_user",
            "share_app_id": "1233",
            "share_comment_id": "222",
            "share_item_id": "333",
            "share_link_id": "opaque_link",
            "share_region": "ES",
            "sharer_language": "es",
            "social_share_type": "19",
            "source": "h5_m",
            "timestamp": "1778492359",
            "tt_from": "copy",
            "u_code": "opaque_code",
            "ug_btm": "b2878,b0",
            "user_id": "444",
            "utm_source": "copy",
        },
    )

    result = clean_url_with_rules(url, ruleset)

    assert result == build_url("www.tiktok.com", clean_path)

def test_clean_url_removes_youtube_short_share_tracker():
    ruleset = ClearUrlsRuleSet(
        providers={
            "youtube": ClearUrlsProvider(
                url_pattern=r"^https?:\/\/(?:[a-z0-9-]+\.)*?(youtube\.com|youtu\.be)",
                rules=["si"],
            )
        }
    )
    clean_path = "/shorts/video_id_for_test"
    url = build_url("youtube.com", clean_path, {"si": "share_id_for_test"})

    result = clean_url_with_rules(url, ruleset)

    assert result == build_url("youtube.com", clean_path)

def test_clean_url_removes_facebook_reel_share_trackers():
    ruleset = ClearUrlsRuleSet()
    clean_path = "/reel/2835009093498691/"
    url = build_url(
        "www.facebook.com",
        clean_path,
        {
            "fs": "e",
            "rdid": "iawv2fS8iU6pSLIc",
            "share_url": "https://www.facebook.com/share/v/example/",
        },
    )

    result = clean_url_with_rules(url, ruleset)

    assert result == build_url("www.facebook.com", clean_path)

def test_clean_url_removes_facebook_story_tracker_path():
    url = "https://www.facebook.com/stories/122094343928325747/tracker/?view_single=1"

    result = clean_url_with_rules(url, ClearUrlsRuleSet())

    assert result == "https://www.facebook.com/stories/122094343928325747/"

def test_clean_url_preserves_untouched_query_encoding_and_order():
    ruleset = ClearUrlsRuleSet()
    url = "https://example.test/path?a=1&b=hello%20world&a=3&signature=a%2Fb%2Bc"

    assert clean_url_with_rules(url, ruleset) == url

def test_clean_url_removes_trackers_without_reencoding_remaining_query():
    ruleset = ClearUrlsRuleSet()
    url = "https://example.test/path?a=1&utm_source=test&b=hello%20world&a=3"

    assert clean_url_with_rules(url, ruleset) == (
        "https://example.test/path?a=1&b=hello%20world&a=3"
    )

def test_clean_url_keeps_youtube_video_id_containing_tracker_like_substring():
    ruleset = ClearUrlsRuleSet(
        providers={
            "globalRules": ClearUrlsProvider(url_pattern=".*", rules=["(?:%3F)?[a-z]?mc"]),
            "youtube": ClearUrlsProvider(
                url_pattern=r"^https?:\/\/(?:[a-z0-9-]+\.)*?(youtube\.com|youtu\.be)",
                rules=["pp"],
            ),
        }
    )
    url = build_url("www.youtube.com", "/watch", {"v": "mc9WVVAUQGE", "pp": "ugUEEgJlbg=="})

    result = clean_url_with_rules(url, ruleset)

    assert result == build_url("www.youtube.com", "/watch", {"v": "mc9WVVAUQGE"})

def test_clean_url_still_removes_mailchimp_tracker_params():
    ruleset = ClearUrlsRuleSet(
        providers={"globalRules": ClearUrlsProvider(url_pattern=".*", rules=["(?:%3F)?[a-z]?mc"])}
    )
    url = build_url("example.test", "/", {"mc_cid": "abc", "mc_eid": "def", "v": "keep"})

    result = clean_url_with_rules(url, ruleset)

    assert result == build_url("example.test", "/", {"v": "keep"})

def test_clean_url_removes_linkedin_post_share_trackers():
    url = build_url(
        "www.linkedin.com",
        "/posts/somebody_update-weabrhiring-share-7488207262784638976-aSeM/",
        {
            "utm_source": "social_share_send",
            "utm_medium": "member_desktop_web",
            "rcm": "ACoAADoVv08B-ptovFp1nrQtsXb-tyTpqWGtJ-o",
        },
    )

    result = clean_url_with_rules(url, ClearUrlsRuleSet())

    assert result == build_url(
        "www.linkedin.com", "/posts/somebody_update-weabrhiring-share-7488207262784638976-aSeM/"
    )

def test_clean_url_removes_linkedin_job_tracking_params():
    url = build_url(
        "www.linkedin.com",
        "/jobs/view/4449374931/",
        {
            "alternateChannel": "search",
            "eBP": "NON_CHARGEABLE_CHANNEL",
            "refId": "ATXdH0aTkYWuODIUvGuQUg==",
            "trackingId": "M2qUC1xwXgZE3lTYyzkQBQ==",
        },
    )

    result = clean_url_with_rules(url, ClearUrlsRuleSet())

    assert result == build_url("www.linkedin.com", "/jobs/view/4449374931/")

def test_clean_url_removes_instagram_share_trackers():
    ruleset = ClearUrlsRuleSet()
    url = "https://www.instagram.com/reel/sample_reel_id/?igsi=sample_share_tracker"
    result = clean_url_with_rules(url, ruleset)
    assert result == "https://www.instagram.com/reel/sample_reel_id/"


def test_clean_url_removes_spotify_tracking_params():
    ruleset = ClearUrlsRuleSet()
    url = "https://open.spotify.com/track/sample_track_id?pi=sample_pi&sci=spotify%3Acard-config%3Asample"
    result = clean_url_with_rules(url, ruleset)
    assert result == "https://open.spotify.com/track/sample_track_id"


def test_clean_url_removes_google_maps_tracking_params():
    ruleset = ClearUrlsRuleSet()
    url = "https://www.google.com/maps?q=Example+Place&ftid=0x123:0x456&entry=gps&shh=sample_hash&lucs=sample_lucs&g_ep=sample_gep&skid=sample_skid&g_st=sample_tracker"
    result = clean_url_with_rules(url, ruleset)
    assert result == "https://www.google.com/maps?q=Example+Place&ftid=0x123:0x456"


def test_clean_url_removes_booking_tracking_params():
    ruleset = ClearUrlsRuleSet()
    url = "https://www.booking.com/hotel/fr/example-hotel.html?label=sample_label&sid=sample_session&aid=123456&ucfs=1&arphpl=1"
    result = clean_url_with_rules(url, ruleset)
    assert result == "https://www.booking.com/hotel/fr/example-hotel.html"


def test_clean_url_removes_airbnb_tracking_params():
    ruleset = ClearUrlsRuleSet()
    url = "https://www.airbnb.com/rooms/12345678?location=Paris&search_mode=regular_search&adults=1&category_tag=sample_tag&check_in=2026-09-04&check_out=2026-09-06&children=0&infants=0&pets=0&photo_id=123456&source_impression_id=sample_impression&previous_page_section_name=1000"
    result = clean_url_with_rules(url, ruleset)
    assert result == "https://www.airbnb.com/rooms/12345678"
