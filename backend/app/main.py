"""Main FastAPI entrypoint for SafeRoute Emergency Evacuation Backend."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncGenerator
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.endpoints import router as api_router, scenario_mgr


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Lifespan event handler initializing ScenarioManager timeline on startup."""
    scenario_mgr.build_timeline()
    yield


app = FastAPI(
    title="SafeRoute Emergency Navigation API",
    description="Disaster-response evacuation simulation and hazard-aware routing API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS Middleware for Hackathon frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API router under /api
app.include_router(api_router, prefix="/api")


@app.get("/")
def root():
    return {
        "message": "SafeRoute Emergency Evacuation API is running",
        "docs_url": "/docs",
        "health_check": "/api/health",
        "timeline_url": "/api/scenarios/monsoon_demo/timeline",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
