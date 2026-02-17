from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, HttpUrl

from ..lib.url_service import get_alternative_frontend
from ._shared import validate_url

router = APIRouter()


class AltRequest(BaseModel):
    url: HttpUrl


class AltResponse(BaseModel):
    original: str
    expanded: str | None = None
    cleaned: str
    service: str | None = None
    alternative: str | None = None
    isCustomFrontend: bool


@router.get("/alt", response_model=AltResponse)
async def alt_frontend_get(
    url: str = Query(..., description="URL to find alternative frontend for"),
):
    validated_url = validate_url(url)
    try:
        result = await get_alternative_frontend(validated_url)
        return AltResponse(
            original=result.original,
            expanded=result.expanded,
            cleaned=result.cleaned,
            service=result.service,
            alternative=result.alternative,
            isCustomFrontend=result.is_custom_frontend,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail="Alternative frontend lookup failed") from e


@router.post("/alt", response_model=AltResponse)
async def alt_frontend_post(request: AltRequest):
    validated_url = validate_url(str(request.url))
    try:
        result = await get_alternative_frontend(validated_url)
        return AltResponse(
            original=result.original,
            expanded=result.expanded,
            cleaned=result.cleaned,
            service=result.service,
            alternative=result.alternative,
            isCustomFrontend=result.is_custom_frontend,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail="Alternative frontend lookup failed") from e
