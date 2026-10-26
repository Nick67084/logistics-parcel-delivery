from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.limiter import limiter
from app.routers import auth, users, parcels, couriers, hubs, tracking, geocode

# Database tables are managed by Alembic migrations (see /alembic).
# Run `python -m alembic upgrade head` after pulling schema changes.

app = FastAPI(
    title="SwiftDrop Logistics Platform API",
    description="Backend for the SwiftDrop logistics platform — parcel booking, tracking, and delivery management.",
    version="0.1.0",
)

# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Only the configured frontend origins may call this API (set CORS_ORIGINS in .env).
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,  # the frontend sends a Bearer token header, not cookies
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(hubs.router)
app.include_router(couriers.router)
app.include_router(parcels.router)
app.include_router(tracking.router)
app.include_router(geocode.router)


@app.get("/")
def root():
    return {"message": "SwiftDrop Logistics Platform API is running"}