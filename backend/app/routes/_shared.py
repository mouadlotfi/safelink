from urllib.parse import urlparse

from fastapi import HTTPException

MAX_URL_LENGTH = 8192


def validate_url(url: str) -> str:
    if len(url) > MAX_URL_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"URL exceeds maximum length of {MAX_URL_LENGTH} characters",
        )
    if any(character.isspace() for character in url):
        raise HTTPException(status_code=400, detail="Invalid URL format")

    try:
        parsed = urlparse(url)
        # Accessing .port validates malformed ports and raises ValueError if out of range.
        parsed.port
    except ValueError as e:
        raise HTTPException(status_code=400, detail="Invalid URL format") from e

    if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname:
        raise HTTPException(status_code=400, detail="Invalid URL format")

    return url
