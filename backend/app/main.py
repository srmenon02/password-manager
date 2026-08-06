from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import engine, Base

# Import routers
from app.routers import auth, vault

# Create database tables
Base.metadata.create_all(bind=engine)

# Initialize FastAPI app
app = FastAPI(
    title="VaultKey API",
    description="Zero-Knowledge Password Manager with Breach Intelligence",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Health check endpoint
@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "message": "VaultKey API is running",
        "environment": settings.ENVIRONMENT
    }


# Include API routers
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
