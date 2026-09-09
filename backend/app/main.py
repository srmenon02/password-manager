import sqlalchemy
from fastapi import FastAPI, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.database import engine, Base

from app.routers import audit, auth, share, vault


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


app = FastAPI(
    title="cipher API",
    description="Zero-Knowledge Password Manager with Breach Intelligence",
    version="1.0.0",
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
# The loopback regex is a dev convenience only. Left on in production it would pair
# with allow_credentials to accept any port on the user's own machine.
localhost_origin_regex = (
    None
    if settings.ENVIRONMENT == "production"
    else r"https?://(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?"
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins or ["http://localhost:3000"],
    allow_origin_regex=localhost_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "message": "cipher API is running",
        "environment": settings.ENVIRONMENT
    }


app.include_router(auth.router, prefix="/api", tags=["authentication"])
app.include_router(vault.router, prefix="/api/vault", tags=["vault"])
app.include_router(share.router, prefix="/api/share", tags=["sharing"])
app.include_router(audit.router, prefix="/api/audit", tags=["audit"])


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.PORT,
        reload=settings.ENVIRONMENT == "development"
    )