from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./parcel_delivery.db"

    # No default on purpose: the app refuses to start without a real key.
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 480

    environment: str = "development"
    # Comma-separated list of allowed frontend origins.
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @field_validator("secret_key")
    @classmethod
    def secret_must_be_strong(cls, v: str) -> str:
        if len(v) < 32 or v.startswith("replace-this") or v.startswith("change-this"):
            raise ValueError("SECRET_KEY must be a random string of at least 32 characters")
        return v

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()