from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import crud, models, schemas
from app.database import get_db
from app.dependencies import get_current_user, require_roles


router = APIRouter(prefix="/payments", tags=["payments"])


@router.get("/{parcel_id}", response_model=schemas.PaymentOut)
def get_payment(
    parcel_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    parcel = crud.get_parcel(db, parcel_id)

    if current_user.role == models.UserRole.customer and parcel.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="You do not have permission to view this payment")

    if current_user.role == models.UserRole.courier:
        courier = current_user.courier_profile
        if not courier or parcel.assigned_courier_id != courier.id:
            raise HTTPException(status_code=403, detail="You do not have permission to view this payment")

    payment = crud.expire_payment_if_needed(db, parcel)
    if not payment:
        raise HTTPException(status_code=404, detail="Payment has not been selected for this parcel")

    return payment


@router.post("/{parcel_id}/start", response_model=schemas.PaymentOut, status_code=201)
def start_payment(
    parcel_id: int,
    payload: schemas.PaymentCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        require_roles(models.UserRole.customer)
    ),
):
    parcel = crud.get_parcel(db, parcel_id)

    payment = crud.start_payment(
        db,
        parcel,
        current_user,
        payload.payment_method,
    )

    return payment


@router.post("/{parcel_id}/complete", response_model=schemas.PaymentOut)
def complete_online_payment(
    parcel_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        require_roles(models.UserRole.customer)
    ),
):
    parcel = crud.get_parcel(db, parcel_id)
    return crud.complete_online_payment(db, parcel, current_user)


@router.post("/{parcel_id}/collect-cash", response_model=schemas.PaymentOut)
def collect_cash_payment(
    parcel_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        require_roles(models.UserRole.courier)
    ),
):
    parcel = crud.get_parcel(db, parcel_id)

    # Cash is collected at the delivery stage, immediately before the
    # courier marks the parcel as delivered.
    if parcel.current_status != models.ParcelStatus.out_for_delivery:
        raise HTTPException(
            status_code=409,
            detail="Cash can be collected when the parcel is out for delivery",
        )

    return crud.collect_cash_payment(db, parcel, current_user)
