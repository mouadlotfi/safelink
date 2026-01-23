from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, HttpUrl

from ..lib.stats import record_links_cleaned
from ..lib.url_service import get_cleaned_url
from ._shared import validate_url

router = APIRouter()


class CleanRequest(BaseModel):
    url: HttpUrl


class CleanResponse(BaseModel):
    original: str
    expanded: str | None = None
    cleaned: str
    wasExpanded: bool


@router.get("/clean", response_model=CleanResponse)
async def clean_url_get(url: str = Query(..., description="URL to clean")):
    validated_url = validate_url(url)
    try:
        result = await get_cleaned_url(validated_url)
        await record_links_cleaned()
        return CleanResponse(
            original=result.original,
            expanded=result.expanded,
            cleaned=result.cleaned,
            wasExpanded=result.was_expanded,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail="URL processing failed") from e


@router.post("/clean", response_model=CleanResponse)
async def clean_url_post(request: CleanRequest):
    validated_url = validate_url(str(request.url))
    try:
        result = await get_cleaned_url(validated_url)
        await record_links_cleaned()
        return CleanResponse(
            original=result.original,
            expanded=result.expanded,
            cleaned=result.cleaned,
            wasExpanded=result.was_expanded,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail="URL processing failed") from e
