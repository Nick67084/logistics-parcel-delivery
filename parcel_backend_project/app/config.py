
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore"
    )

    # Existing database configuration
    database_url: str = "sqlite:///./parcel_delivery.db"

    # Existing authentication configuration
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 480

    # Existing environment configuration
    environment: str = "development"

    # Existing CORS configuration
    cors_origins: str = (
        "http://localhost:5173,"
        "http://127.0.0.1:5173"
    )

    # =====================================
    # NEW: STRIPE PAYMENT CONFIGURATION
    # =====================================

    stripe_secret_key: str = ""

    stripe_publishable_key: str = ""

    stripe_webhook_secret: str = ""

    stripe_currency: str = "thb"

    frontend_url: str = "http://localhost:5173"

    # Existing secret key validation
    @field_validator("secret_key")
    @classmethod
    def secret_must_be_strong(cls, v: str) -> str:
        if (
            len(v) < 32
            or v.startswith("replace-this")
            or v.startswith("change-this")
        ):
            raise ValueError(
                "SECRET_KEY must be a random string "
                "of at least 32 characters"
            )

        return v

    # Existing CORS property
    @property
    def cors_origin_list(self) -> list[str]:
        return [
            o.strip()
            for o in self.cors_origins.split(",")
            if o.strip()
        ]


settings = Settings()
