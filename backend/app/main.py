from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .lib.http_client import close_http_client, get_http_client
from .routes.alt import router as alt_router
from .routes.clean import router as clean_router
from .routes.stats import router as stats_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.http_client = get_http_client()
    yield
    await close_http_client()


app = FastAPI(
    title="Safelink API",
    description="URL cleaning and alternative frontend resolution service",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(clean_router, prefix="/api", tags=["clean"])
app.include_router(alt_router, prefix="/api", tags=["alt"])

app.include_router(stats_router, prefix="/api", tags=["stats"])


@app.get("/health")
async def health_check():
    return {"status": "ok"}
