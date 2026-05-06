from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..lib.stats import get_links_cleaned_count

router = APIRouter()


class StatsResponse(BaseModel):
    linksCleaned: int


@router.get("/stats", response_model=StatsResponse)
async def get_stats():
    try:
        return StatsResponse(linksCleaned=await get_links_cleaned_count())
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to load stats") from e
