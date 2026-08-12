from urllib.parse import urlencode, urlunparse

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

def build_url(hostname: str, path: str = "/", params: dict[str, str] | None = None) -> str:
    return urlunparse(("https", hostname, path, "", urlencode(params or {}), ""))

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

def test_stats_returns_links_cleaned_count():
    response = client.get("/api/stats")
    assert response.status_code == 200
    assert isinstance(response.json()["linksCleaned"], int)

def test_clean_url_increments_links_cleaned_count():
    before = client.get("/api/stats").json()["linksCleaned"]
    url = build_url("example.test", params={"utm_source": "counter"})

    response = client.get(f"/api/clean?url={url}")

    assert response.status_code == 200
    assert client.get("/api/stats").json()["linksCleaned"] == before + 1


def test_alt_endpoint_does_not_increment_links_cleaned_count():
    before = client.get("/api/stats").json()["linksCleaned"]

    response = client.post("/api/alt", json={"url": build_url("example.test")})

    assert response.status_code == 200
    assert client.get("/api/stats").json()["linksCleaned"] == before

def test_clean_url_simple():
    url = build_url("example.test", params={"utm_source": "test"})
    response = client.get(f"/api/clean?url={url}")
    assert response.status_code == 200
    data = response.json()
    assert data["original"] == url
    assert data["cleaned"] == build_url("example.test")

def test_clean_url_post():
    url = build_url("example.test", params={"fbclid": "123"})
    response = client.post("/api/clean", json={"url": url})
    assert response.status_code == 200
    data = response.json()
    assert data["cleaned"] == build_url("example.test")

def test_clean_url_get_rejects_invalid_url():
    response = client.get("/api/clean?url=not-a-url")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid URL format"

def test_alt_frontend_get_rejects_invalid_url():
    response = client.get("/api/alt?url=not-a-url")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid URL format"

def test_clean_url_get_rejects_non_http_scheme():
    response = client.get("/api/clean?url=ftp://example.test/file")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid URL format"

def test_clean_url_get_rejects_url_with_spaces():
    response = client.get("/api/clean?url=https://exa mple.test/")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid URL format"

def test_alt_frontend_youtube():
    url = build_url("www.youtube.com", "/watch", {"v": "video_id_for_test"})
    response = client.get(f"/api/alt?url={url}")
    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "YouTube"
    assert "invidious" in data["alternative"]

