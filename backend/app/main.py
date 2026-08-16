from contextlib import asynccontextmanager
from datetime import datetime

import sqlalchemy
from fastapi import FastAPI, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

try:
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
except ModuleNotFoundError:  # pragma: no cover - optional in lightweight dev environments
    AsyncIOScheduler = None

from app.config import settings
from app.database import engine, Base
from app.services.breach_checker import check_and_update_breaches

from app.routers import auth, share, vault


def ensure_schema_compatibility() -> None:
    inspector = sqlalchemy.inspect(engine)

    if not inspector.has_table("users"):
        Base.metadata.create_all(bind=engine)
        return

    with engine.begin() as connection:
        users_columns = {column["name"] for column in inspector.get_columns("users")}
        for column_name, column_sql in {
            "sharing_public_key": "TEXT",
            "sharing_private_key_encrypted": "BLOB",
            "sharing_private_key_iv": "BLOB",
            "sharing_key_algorithm": "VARCHAR",
        }.items():
            if column_name not in users_columns:
                connection.execute(sqlalchemy.text(f"ALTER TABLE users ADD COLUMN {column_name} {column_sql}"))

        if not inspector.has_table("shared_items"):
            Base.metadata.create_all(bind=engine)
            return

        shared_items_columns = {column["name"] for column in inspector.get_columns("shared_items")}
        for column_name, column_sql in {
            "sender_ephemeral_public_key": "TEXT",
            "wrapped_cek": "BLOB",
            "wrapped_cek_iv": "BLOB",
            "payload_iv": "BLOB",
            "aad": "TEXT",
            "algorithm": "VARCHAR",
            "version": "INTEGER NOT NULL DEFAULT 1",
            "permission": "VARCHAR NOT NULL DEFAULT 'read_write'",
            "revoked_at": "DATETIME",
        }.items():
            if column_name not in shared_items_columns:
                connection.execute(sqlalchemy.text(f"ALTER TABLE shared_items ADD COLUMN {column_name} {column_sql}"))

    Base.metadata.create_all(bind=engine)


ensure_schema_compatibility()


@asynccontextmanager
async def lifespan(app: FastAPI):
    if AsyncIOScheduler is None:
        yield
        return

    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        check_and_update_breaches,
        "interval",
        hours=24,
        id="breach_recheck",
        next_run_time=datetime.now()
    )
    scheduler.start()
    try:
        yield
    finally:
        if scheduler.running:
            scheduler.shutdown(wait=False)


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
            "details": jsonable_encoder(exc.errors()),
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


allowed_origins = [origin.strip() for origin in settings.CORS_ORIGINS.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins or ["http://localhost:3000"],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?",
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
app.include_router(share.router, prefix="/api/share", tags=["sharing"])


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.PORT,
        reload=settings.ENVIRONMENT == "development"
    )