from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.config import settings
from app.database import engine, Base
from app.services.breach_checker import check_and_update_breaches

from app.routers import auth, vault

Base.metadata.create_all(bind=engine)

scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.add_job(
        check_and_update_breaches,
        "interval",
        hours=24,
        id="breach_recheck",
        next_run_time=datetime.now()
    )
    scheduler.start()
    yield
    scheduler.shutdown()


app = FastAPI(
    title="VaultKey API",
    description="Zero-Knowledge Password Manager with Breach Intelligence",
    version="1.0.0",
    lifespan=lifespan
)


@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(_request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "status": "error",
            "message": "Invalid request payload",
            "details": exc.errors(),
        },
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(_request, exc: HTTPException):
    detail = exc.detail
    if isinstance(detail, dict):
        payload = {"detail": detail}
        if detail.get("message"):
            payload["message"] = detail["message"]
        payload["status"] = "error"
        return JSONResponse(status_code=exc.status_code, content=payload)

    return JSONResponse(status_code=exc.status_code, content={"detail": str(detail)})


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "message": "VaultKey API is running",
        "environment": settings.ENVIRONMENT
    }


app.include_router(auth.router, prefix="/api", tags=["authentication"])
app.include_router(vault.router, prefix="/api/vault", tags=["vault"])


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.PORT,
        reload=settings.ENVIRONMENT == "development"
    )