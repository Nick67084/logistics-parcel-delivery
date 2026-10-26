from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app import crud, models, schemas
from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.limiter import limiter
from app.ws_manager import ws_manager


router = APIRouter(
    prefix="/parcels",
    tags=["parcels"]
)


# ---------- Customer Booking ----------

@router.post(
    "/",
    response_model=schemas.ParcelOut,
    status_code=201
)
async def book_parcel(
    parcel_in: schemas.ParcelCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Create a new parcel booking.

    The logged-in customer becomes the sender.
    """

    parcel = crud.create_parcel(
        db,
        parcel_in,
        current_user
    )

    # Notify tracking clients if automatic assignment happened.
    if parcel.current_status == models.ParcelStatus.assigned:
        await ws_manager.broadcast(
            parcel.id,
            {
                "event": "status_update",
                "parcel_id": parcel.id,
                "status": parcel.current_status.value,
            },
        )

    return parcel


# ---------- My Parcels ----------

@router.get(
    "/",
    response_model=List[schemas.ParcelOut]
)
def list_my_parcels(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Return parcels available to the current user.
    """

    return crud.list_parcels_for_user(
        db,
        current_user
    )


# ---------- Public Tracking ----------

@router.get(
    "/track/{tracking_number}",
    response_model=schemas.PublicTrackingOut
)
@limiter.limit("30/minute")
def track_parcel(
    request: Request,
    tracking_number: str,
    db: Session = Depends(get_db)
):
    """
    Public tracking lookup by tracking number. No login required.
    Returns only non-sensitive information.
    """

    parcel = crud.get_parcel_by_tracking_number(
        db,
        tracking_number.strip().upper()
    )

    return schemas.PublicTrackingOut(
        tracking_number=parcel.tracking_number,
        current_status=parcel.current_status,
        service_level=parcel.service_level,
        receiver_name_masked=crud.mask_name(parcel.receiver_name),
        created_at=parcel.created_at,
        updated_at=parcel.updated_at,
        status_history=[
            schemas.PublicTrackingEvent(status=h.status, timestamp=h.timestamp)
            for h in parcel.status_history
        ],
    )


# ---------- Parcel Details ----------

@router.get(
    "/{parcel_id}",
    response_model=schemas.ParcelDetailOut
)
def get_parcel(
    parcel_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Get parcel details.

    Customers can only view their own parcels.
    Staff members can view parcels needed for operations.
    """

    parcel = crud.get_parcel(
        db,
        parcel_id
    )

    # Customers can only access parcels they created.
    if current_user.role == models.UserRole.customer:
        if parcel.sender_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="You do not have permission to view this parcel"
            )

    # Couriers can only access parcels assigned to them.
    elif current_user.role == models.UserRole.courier:
        courier = current_user.courier_profile

        if not courier or parcel.assigned_courier_id != courier.id:
            raise HTTPException(
                status_code=403,
                detail="You do not have permission to view this parcel"
            )

    return parcel


# ---------- Parcel Status ----------

@router.patch(
    "/{parcel_id}/status",
    response_model=schemas.ParcelOut
)
async def change_parcel_status(
    parcel_id: int,
    payload: schemas.ParcelStatusUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        require_roles(
            models.UserRole.courier,
            models.UserRole.hub_staff,
            models.UserRole.admin
        )
    ),
):
    """
    Update parcel status.

    Only courier, hub staff, and admin users
    can update parcel status.
    """

    parcel = crud.get_parcel(
        db,
        parcel_id
    )

    # A courier may only update parcels assigned to them.
    if current_user.role == models.UserRole.courier:
        courier = current_user.courier_profile

        if not courier or parcel.assigned_courier_id != courier.id:
            raise HTTPException(
                status_code=403,
                detail="This parcel is not assigned to you"
            )

    # Assignment only happens when a courier accepts a job.
    if payload.status == models.ParcelStatus.assigned:
        raise HTTPException(
            status_code=400,
            detail="Parcels are assigned when a courier accepts the job"
        )

    # Customers cancel through /cancel; here only admins may cancel.
    if (
        payload.status == models.ParcelStatus.cancelled
        and current_user.role != models.UserRole.admin
    ):
        raise HTTPException(
            status_code=403,
            detail="Only the customer or an admin can cancel a parcel"
        )

    parcel = crud.update_parcel_status(
        db,
        parcel,
        payload.status,
        current_user,
        lat=payload.latitude,
        lng=payload.longitude,
        note=payload.note,
    )

    # Notify connected tracking clients in real time.
    await ws_manager.broadcast(
        parcel.id,
        {
            "event": "status_update",
            "parcel_id": parcel.id,
            "status": parcel.current_status.value,
            "latitude": payload.latitude,
            "longitude": payload.longitude,
        }
    )

    return parcel


# ---------- Hub Transfer ----------

@router.post(
    "/hub-transfer",
    response_model=schemas.ParcelOut
)
async def hub_transfer(
    payload: schemas.HubTransferCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        require_roles(
            models.UserRole.hub_staff,
            models.UserRole.admin
        )
    ),
):
    """
    Transfer a parcel to another hub.
    """

    parcel = crud.get_parcel(
        db,
        payload.parcel_id
    )

    crud.transfer_parcel_to_hub(
        db,
        parcel,
        payload.to_hub_id,
        changed_by_user_id=current_user.id,
    )

    # Notify connected tracking clients in real time.
    await ws_manager.broadcast(
        parcel.id,
        {
            "event": "hub_transfer",
            "parcel_id": parcel.id,
            "status": parcel.current_status.value,
            "current_hub_id": parcel.current_hub_id,
            "to_hub_id": payload.to_hub_id,
        }
    )

    return parcel


# ---------- Cancel / Reschedule ----------

def _require_owner_or_admin(parcel: models.Parcel, user: models.User) -> None:
    if user.role != models.UserRole.admin and parcel.sender_id != user.id:
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to change this parcel"
        )


@router.post(
    "/{parcel_id}/cancel",
    response_model=schemas.ParcelOut
)
async def cancel_parcel(
    parcel_id: int,
    payload: schemas.ParcelCancelRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Cancel a parcel. Allowed only before pickup (status 'created' or 'assigned');
    the state machine returns 409 for any later status.
    """

    parcel = crud.get_parcel(db, parcel_id)
    _require_owner_or_admin(parcel, current_user)

    parcel = crud.update_parcel_status(
        db,
        parcel,
        models.ParcelStatus.cancelled,
        current_user,
        note=payload.reason or "Cancelled by customer",
    )

    await ws_manager.broadcast(
        parcel.id,
        {
            "event": "status_update",
            "parcel_id": parcel.id,
            "status": parcel.current_status.value,
        }
    )

    return parcel


@router.patch(
    "/{parcel_id}/reschedule",
    response_model=schemas.ParcelOut
)
def reschedule_parcel(
    parcel_id: int,
    payload: schemas.ParcelRescheduleRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Change the pickup date/time window. Allowed only before pickup.
    """

    parcel = crud.get_parcel(db, parcel_id)
    _require_owner_or_admin(parcel, current_user)

    if parcel.current_status not in (
        models.ParcelStatus.created,
        models.ParcelStatus.assigned,
    ):
        raise HTTPException(
            status_code=409,
            detail="Pickup can only be rescheduled before the parcel is picked up"
        )

    parcel.pickup_date = payload.pickup_date
    parcel.pickup_window = payload.pickup_window

    db.commit()
    db.refresh(parcel)

    return parcel