from fastapi import APIRouter, Depends, HTTPException

from sqlalchemy.orm import Session

from app import crud, models, schemas
from app.database import get_db
from app.dependencies import require_roles
from app.ws_manager import ws_manager

router = APIRouter(prefix="/couriers", tags=["couriers"])


def _get_courier_profile(db: Session, user: models.User) -> models.Courier:
    courier = (
        db.query(models.Courier)
        .filter(models.Courier.user_id == user.id)
        .first()
    )

    if not courier:
        raise HTTPException(
            status_code=404,
            detail="Courier profile not found",
        )

    return courier


@router.get("/me", response_model=schemas.CourierOut)
def get_my_courier_profile(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        require_roles(models.UserRole.courier)
    ),
):
    return _get_courier_profile(db, current_user)


@router.get("/jobs", response_model=list[schemas.ParcelOut])
def get_available_jobs(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        require_roles(models.UserRole.courier)
    ),
):
    courier = _get_courier_profile(db, current_user)

    if courier.status != models.CourierStatus.available:
        return []

    jobs = (
        db.query(models.Parcel)
        .filter(
            models.Parcel.current_status == models.ParcelStatus.created,
            models.Parcel.assigned_courier_id.is_(None),
            models.Parcel.booking_status == models.BookingStatus.confirmed,
        )
        .all()
    )

    for parcel in jobs:
        crud.expire_payment_if_needed(db, parcel)

    return [
        parcel
        for parcel in jobs
        if parcel.booking_status == models.BookingStatus.confirmed
    ]


@router.post("/jobs/{parcel_id}/accept", response_model=schemas.ParcelOut)
async def accept_delivery_job(
    parcel_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        require_roles(models.UserRole.courier)
    ),
):
    courier = _get_courier_profile(db, current_user)

    # The authoritative availability and active-job checks happen inside
    # assign_parcel_to_courier(), where the courier row is locked.
    parcel = crud.assign_parcel_to_courier(
        db,
        parcel_id,
        courier,
        current_user,
    )

    # Notify customers watching this parcel.
    await ws_manager.broadcast(
        parcel.id,
        {
            "event": "status_update",
            "parcel_id": parcel.id,
            "status": parcel.current_status.value,
        },
    )

    return parcel


@router.post("/me/location", response_model=schemas.CourierOut)
async def update_my_location(
    payload: schemas.CourierLocationUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        require_roles(models.UserRole.courier)
    ),
):
    courier = _get_courier_profile(db, current_user)

    courier = crud.update_courier_location(
        db,
        courier,
        payload.latitude,
        payload.longitude,
    )

    # Broadcast the new location to anyone watching
    # the courier's active parcels.
    active_parcels = [
        p
        for p in courier.parcels
        if p.current_status not in (
            models.ParcelStatus.delivered,
            models.ParcelStatus.failed,
            models.ParcelStatus.cancelled,
        )
    ]

    for parcel in active_parcels:
        await ws_manager.broadcast(
            parcel.id,
            {
                "event": "courier_location",
                "parcel_id": parcel.id,
                "latitude": payload.latitude,
                "longitude": payload.longitude,
            },
        )

    return courier


@router.post("/me/status", response_model=schemas.CourierOut)
def update_my_status(
    payload: schemas.CourierStatusUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        require_roles(models.UserRole.courier)
    ),
):
    courier = _get_courier_profile(db, current_user)

    return crud.update_courier_status(
        db,
        courier,
        payload.status,
    )