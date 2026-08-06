from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PORT: int = 5001
    ENVIRONMENT: str = "development"
    DATABASE_URL: str
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 10080  # 7 days
    CORS_ORIGINS: str = "http://localhost:3000"

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
