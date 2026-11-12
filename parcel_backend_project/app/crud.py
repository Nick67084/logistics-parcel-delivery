import math
from typing import Optional
from datetime import datetime, timedelta
import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.security import hash_password


# ---------- Users ----------

def create_user(db: Session, user_in: schemas.UserCreate) -> models.User:
    existing = db.query(models.User).filter(models.User.email == user_in.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = models.User(
        name=user_in.name,
        email=user_in.email,
        password_hash=hash_password(user_in.password),
        phone=user_in.phone,
        role=user_in.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # If registering as a courier, auto-create their courier profile.
    if user.role == models.UserRole.courier:
        courier = models.Courier(
            user_id=user.id,
            status=models.CourierStatus.offline
        )
        db.add(courier)
        db.commit()

    return user


def get_user_by_email(db: Session, email: str) -> Optional[models.User]:
    return db.query(models.User).filter(models.User.email == email).first()


def update_profile_address(
    db: Session,
    user: models.User,
    payload: schemas.ProfileAddressUpdate
) -> models.User:
    user.saved_address = payload.saved_address
    user.saved_address_lat = payload.saved_address_lat
    user.saved_address_lng = payload.saved_address_lng

    db.commit()
    db.refresh(user)

    return user


# ---------- Hubs ----------

def create_hub(db: Session, hub_in: schemas.HubCreate) -> models.Hub:
    hub = models.Hub(**hub_in.model_dump())

    db.add(hub)
    db.commit()
    db.refresh(hub)

    return hub


def list_hubs(db: Session):
    return db.query(models.Hub).all()


# ---------- Couriers ----------

def _haversine_km(
    lat1,
    lng1,
    lat2,
    lng2
) -> float:
    """Great-circle distance between two points, in kilometers."""

    R = 6371.0

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)

    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)

    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1)
        * math.cos(phi2)
        * math.sin(dlambda / 2) ** 2
    )

    return 2 * R * math.asin(math.sqrt(a))


def find_nearest_available_courier(
    db: Session,
    lat: float,
    lng: float
) -> Optional[models.Courier]:
    """Find and lock the nearest available courier.

    Locking available courier rows prevents simultaneous bookings from
    selecting the same courier before that courier is marked busy.
    """
    candidates = (
        db.query(models.Courier)
        .filter(
            models.Courier.status == models.CourierStatus.available,
            models.Courier.current_lat.isnot(None),
            models.Courier.current_lng.isnot(None),
        )
        .with_for_update()
        .all()
    )

    if not candidates:
        return None

    return min(
        candidates,
        key=lambda c: _haversine_km(
            lat,
            lng,
            c.current_lat,
            c.current_lng
        )
    )


def update_courier_location(
    db: Session,
    courier: models.Courier,
    lat: float,
    lng: float
) -> models.Courier:

    courier.current_lat = lat
    courier.current_lng = lng

    db.commit()
    db.refresh(courier)

    return courier


def update_courier_status(
    db: Session,
    courier: models.Courier,
    new_status: models.CourierStatus
) -> models.Courier:

    courier.status = new_status

    db.commit()
    db.refresh(courier)

    return courier


# ---------- Parcels ----------

def calculate_estimated_fee(
    parcel_in: schemas.ParcelCreate
) -> float:
    """
    Calculate a simple delivery estimate.

    Base price:
        Standard = 50
        Express  = 80

    Additional charges:
        Distance
        Weight
        Fragile handling
        Large package
    """

    distance_km = _haversine_km(
        parcel_in.pickup_lat,
        parcel_in.pickup_lng,
        parcel_in.dropoff_lat,
        parcel_in.dropoff_lng,
    )

    # Base service fee
    if parcel_in.service_level.lower() == "express":
        fee = 80.0
    else:
        fee = 50.0

    # Distance charge
    if distance_km > 3:
        fee += (distance_km - 3) * 8

    # Weight charge
    if parcel_in.weight_kg > 1:
        fee += (parcel_in.weight_kg - 1) * 10

    # Fragile handling
    if parcel_in.fragile:
        fee += 20

    # Large package handling
    if (
        parcel_in.length_cm
        and parcel_in.width_cm
        and parcel_in.height_cm
    ):
        volume = (
            parcel_in.length_cm
            * parcel_in.width_cm
            * parcel_in.height_cm
        )

        if volume > 50000:
            fee += 30

    return round(fee, 2)


def create_parcel(
    db: Session,
    parcel_in: schemas.ParcelCreate,
    sender: models.User
) -> models.Parcel:
    """Book a parcel and automatically assign the nearest available courier.

    If no available courier has a current GPS location, the parcel remains
    in ``created`` status and can be accepted later from the courier jobs
    endpoint.
    """
    parcel_data = parcel_in.model_dump()
    parcel_data["estimated_fee"] = calculate_estimated_fee(parcel_in)
    parcel_data["booking_status"] = models.BookingStatus.pending_payment

    parcel = models.Parcel(
        sender_id=sender.id,
        **parcel_data
    )

    db.add(parcel)
    db.commit()
    db.refresh(parcel)

    _log_status(
        db,
        parcel,
        models.ParcelStatus.created,
        changed_by_user_id=sender.id,
        note="Booking created and waiting for payment method",
    )

    # Do not assign a courier until the booking is confirmed.
    # Online payment confirms the booking after payment succeeds;
    # COD confirms it immediately and is paid when the courier collects cash.
    return parcel


def get_parcel(
    db: Session,
    parcel_id: int
) -> models.Parcel:

    parcel = (
        db.query(models.Parcel)
        .filter(models.Parcel.id == parcel_id)
        .first()
    )

    if not parcel:
        raise HTTPException(
            status_code=404,
            detail="Parcel not found"
        )

    return parcel


def get_parcel_by_tracking_number(
    db: Session,
    tracking_number: str
) -> models.Parcel:

    parcel = (
        db.query(models.Parcel)
        .filter(
            models.Parcel.tracking_number == tracking_number
        )
        .first()
    )

    if not parcel:
        raise HTTPException(
            status_code=404,
            detail="Parcel not found"
        )

    return parcel


def list_parcels_for_user(
    db: Session,
    user: models.User
):
    if user.role == models.UserRole.admin:
        return db.query(models.Parcel).all()

    if user.role == models.UserRole.courier:
        return (
            db.query(models.Parcel)
            .join(models.Courier)
            .filter(models.Courier.user_id == user.id)
            .all()
        )

    if user.role == models.UserRole.hub_staff:
        return (
            db.query(models.Parcel)
            .filter(
                models.Parcel.current_status.in_(
                    [
                        models.ParcelStatus.picked_up,
                        models.ParcelStatus.at_hub,
                        models.ParcelStatus.in_transit,
                    ]
                )
            )
            .all()
        )

    # Customer: show parcels they sent
    return (
        db.query(models.Parcel)
        .filter(models.Parcel.sender_id == user.id)
        .all()
    )


def _log_status(
    db: Session,
    parcel: models.Parcel,
    status_value: models.ParcelStatus,
    changed_by_user_id: Optional[int] = None,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    note: Optional[str] = None,
) -> models.ParcelStatusHistory:

    entry = models.ParcelStatusHistory(
        parcel_id=parcel.id,
        status=status_value,
        changed_by_user_id=changed_by_user_id,
        location_lat=lat,
        location_lng=lng,
        note=note,
    )

    db.add(entry)
    db.commit()

    return entry


def update_parcel_status(
    db: Session,
    parcel: models.Parcel,
    new_status: models.ParcelStatus,
    changed_by: models.User,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    note: Optional[str] = None,
) -> models.Parcel:

    current = parcel.current_status

    allowed = models.ALLOWED_TRANSITIONS.get(
        current,
        set()
    )

    if new_status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot move parcel from "
                f"'{current.value}' to "
                f"'{new_status.value}'"
            ),
        )

    # COD must be collected by the assigned courier before the parcel can
    # be marked delivered. Online payments are already paid before pickup.
    if new_status == models.ParcelStatus.delivered:
        payment = parcel.payment
        if (
            payment
            and payment.payment_method == models.PaymentMethod.cash_on_delivery
            and payment.payment_status != models.PaymentStatus.paid
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cash on delivery must be collected before marking the parcel delivered",
            )

    parcel.current_status = new_status

    db.commit()
    db.refresh(parcel)

    _log_status(
        db,
        parcel,
        new_status,
        changed_by_user_id=changed_by.id,
        lat=lat,
        lng=lng,
        note=note,
    )

    # Free up the courier once a parcel reaches a terminal state.
    if (
        new_status in (
            models.ParcelStatus.delivered,
            models.ParcelStatus.failed,
            models.ParcelStatus.cancelled,
        )
        and parcel.assigned_courier_id
    ):

        courier = (
            db.query(models.Courier)
            .filter(
                models.Courier.id
                == parcel.assigned_courier_id
            )
            .first()
        )

        if courier:
            courier.status = models.CourierStatus.available
            db.commit()

    return parcel


def transfer_parcel_to_hub(
    db: Session,
    parcel: models.Parcel,
    to_hub_id: int,
    changed_by_user_id: Optional[int] = None,
) -> models.HubTransfer:
    """Transfer a parcel to a valid destination hub safely.

    Validation rules:
    - destination hub must exist
    - destination hub must differ from the current hub
    - parcel must be in a hub-transferable status
    - transfer record, current hub, and history entry are committed together
    """

    destination_hub = (
        db.query(models.Hub)
        .filter(models.Hub.id == to_hub_id)
        .first()
    )

    if not destination_hub:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Destination hub not found",
        )

    if parcel.current_hub_id == to_hub_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Parcel is already at this hub",
        )

    transferable_statuses = {
        models.ParcelStatus.picked_up,
        models.ParcelStatus.at_hub,
        models.ParcelStatus.in_transit,
    }

    if parcel.current_status not in transferable_statuses:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Parcel cannot be transferred from status "
                f"'{parcel.current_status.value}'"
            ),
        )

    transfer = models.HubTransfer(
        parcel_id=parcel.id,
        from_hub_id=parcel.current_hub_id,
        to_hub_id=destination_hub.id,
    )

    parcel.current_hub_id = destination_hub.id

    history = models.ParcelStatusHistory(
        parcel_id=parcel.id,
        status=parcel.current_status,
        changed_by_user_id=changed_by_user_id,
        note=f"Parcel transferred to hub: {destination_hub.name}",
    )

    db.add(transfer)
    db.add(history)

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    db.refresh(transfer)
    db.refresh(parcel)

    return transfer


# ---------- Payments ----------

def _payment_deadline(parcel: models.Parcel) -> datetime:
    return parcel.created_at + timedelta(hours=1)


def _make_transaction_reference(prefix: str = "SD") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12].upper()}"


def expire_payment_if_needed(db: Session, parcel: models.Parcel) -> Optional[models.Payment]:
    payment = parcel.payment

    if not payment:
        return None

    if (
        payment.payment_method in (
            models.PaymentMethod.promptpay,
            models.PaymentMethod.card,
        )
        and payment.payment_status == models.PaymentStatus.pending
        and payment.expires_at is not None
        and datetime.utcnow() >= payment.expires_at
    ):
        payment.payment_status = models.PaymentStatus.expired
        parcel.booking_status = models.BookingStatus.expired
        payment.expires_at = payment.expires_at
        db.commit()
        db.refresh(payment)
        db.refresh(parcel)

    return payment


def _confirm_booking_and_assign_courier(
    db: Session,
    parcel: models.Parcel,
    note: str,
) -> models.Parcel:
    if parcel.booking_status == models.BookingStatus.expired:
        raise HTTPException(status_code=409, detail="This booking has expired")

    parcel.booking_status = models.BookingStatus.confirmed
    db.commit()
    db.refresh(parcel)

    if parcel.current_status == models.ParcelStatus.created and parcel.assigned_courier_id is None:
        courier = find_nearest_available_courier(
            db,
            parcel.pickup_lat,
            parcel.pickup_lng,
        )

        if courier is not None:
            parcel = assign_parcel_to_courier(
                db,
                parcel.id,
                courier,
                user=None,
                note=note,
            )

    return parcel


def start_payment(
    db: Session,
    parcel: models.Parcel,
    user: models.User,
    method: models.PaymentMethod,
) -> models.Payment:
    if parcel.sender_id != user.id:
        raise HTTPException(status_code=403, detail="You do not own this parcel")

    if parcel.booking_status == models.BookingStatus.expired:
        raise HTTPException(status_code=409, detail="This booking has expired")

    existing = parcel.payment
    if existing:
        expire_payment_if_needed(db, parcel)
        existing = parcel.payment

        if existing.payment_status == models.PaymentStatus.paid:
            return existing

        if existing.payment_status == models.PaymentStatus.unpaid:
            if method == models.PaymentMethod.cash_on_delivery:
                return existing
            raise HTTPException(
                status_code=409,
                detail="This booking is already configured for cash on delivery",
            )

        if existing.payment_status == models.PaymentStatus.pending:
            if existing.payment_method != method:
                raise HTTPException(
                    status_code=409,
                    detail=f"Payment method is already set to {existing.payment_method.value}",
                )
            return existing

        if existing.payment_status == models.PaymentStatus.expired:
            raise HTTPException(status_code=409, detail="Online payment time has expired")

    if method == models.PaymentMethod.cash_on_delivery:
        payment = models.Payment(
            parcel_id=parcel.id,
            user_id=user.id,
            amount=parcel.estimated_fee or 0.0,
            payment_method=method,
            payment_status=models.PaymentStatus.unpaid,
            expires_at=None,
        )
        db.add(payment)
        db.commit()
        db.refresh(payment)

        _confirm_booking_and_assign_courier(
            db,
            parcel,
            "Booking confirmed with cash on delivery",
        )
        return payment

    expires_at = _payment_deadline(parcel)
    if datetime.utcnow() >= expires_at:
        parcel.booking_status = models.BookingStatus.expired
        db.commit()
        raise HTTPException(status_code=409, detail="The 1-hour online payment window has expired")

    payment = models.Payment(
        parcel_id=parcel.id,
        user_id=user.id,
        amount=parcel.estimated_fee or 0.0,
        payment_method=method,
        payment_status=models.PaymentStatus.pending,
        expires_at=expires_at,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return payment


def complete_online_payment(
    db: Session,
    parcel: models.Parcel,
    user: models.User,
) -> models.Payment:
    if parcel.sender_id != user.id:
        raise HTTPException(status_code=403, detail="You do not own this parcel")

    payment = parcel.payment
    if not payment:
        raise HTTPException(status_code=404, detail="Payment has not been started")

    expire_payment_if_needed(db, parcel)
    payment = parcel.payment

    if payment.payment_method not in (models.PaymentMethod.promptpay, models.PaymentMethod.card):
        raise HTTPException(status_code=400, detail="This payment is not an online payment")

    if payment.payment_status == models.PaymentStatus.expired:
        raise HTTPException(status_code=409, detail="The 1-hour online payment window has expired")

    if payment.payment_status == models.PaymentStatus.paid:
        return payment

    if payment.payment_status != models.PaymentStatus.pending:
        raise HTTPException(status_code=409, detail="Payment cannot be completed")

    payment.payment_status = models.PaymentStatus.paid
    payment.paid_at = datetime.utcnow()
    payment.expires_at = None
    payment.transaction_reference = _make_transaction_reference(
        "QR" if payment.payment_method == models.PaymentMethod.promptpay else "CARD"
    )
    db.commit()
    db.refresh(payment)

    _confirm_booking_and_assign_courier(
        db,
        parcel,
        "Online payment completed; booking confirmed",
    )

    return payment


def collect_cash_payment(
    db: Session,
    parcel: models.Parcel,
    courier_user: models.User,
) -> models.Payment:
    if courier_user.role != models.UserRole.courier:
        raise HTTPException(status_code=403, detail="Only a courier can collect COD payment")

    courier = courier_user.courier_profile
    if not courier or parcel.assigned_courier_id != courier.id:
        raise HTTPException(status_code=403, detail="This parcel is not assigned to you")

    payment = parcel.payment
    if not payment or payment.payment_method != models.PaymentMethod.cash_on_delivery:
        raise HTTPException(status_code=400, detail="This parcel is not a cash-on-delivery shipment")

    if payment.payment_status == models.PaymentStatus.paid:
        return payment

    if payment.payment_status != models.PaymentStatus.unpaid:
        raise HTTPException(status_code=409, detail="COD payment is not awaiting cash collection")

    payment.payment_status = models.PaymentStatus.paid
    payment.paid_at = datetime.utcnow()
    payment.collected_by_user_id = courier_user.id
    payment.transaction_reference = _make_transaction_reference("COD")

    db.commit()
    db.refresh(payment)
    return payment


# ---------- Public tracking helpers ----------

def mask_name(name: str) -> str:
    """'Somchai Jaidee' -> 'S***** J*****'. Keeps the first letter of each word."""
    masked = []
    for part in name.split():
        if len(part) <= 1:
            masked.append(part)
        else:
            masked.append(part[0] + "*" * min(len(part) - 1, 5))
    return " ".join(masked)


# ---------- Courier job assignment ----------

def assign_parcel_to_courier(
    db: Session,
    parcel_id: int,
    courier: models.Courier,
    user: Optional[models.User] = None,
    note: str = "Courier accepted the job",
) -> models.Parcel:
    """Atomically assign a parcel to a courier.

    The courier row is locked before checking availability, so one courier
    cannot accept two jobs concurrently. The parcel update is also atomic,
    so two couriers cannot claim the same parcel concurrently.
    """
    locked_courier = (
        db.query(models.Courier)
        .filter(models.Courier.id == courier.id)
        .with_for_update()
        .first()
    )

    if not locked_courier:
        raise HTTPException(
            status_code=404,
            detail="Courier profile not found",
        )

    if locked_courier.status != models.CourierStatus.available:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Courier is not available to accept a new job",
        )

    updated = (
        db.query(models.Parcel)
        .filter(
            models.Parcel.id == parcel_id,
            models.Parcel.current_status == models.ParcelStatus.created,
            models.Parcel.assigned_courier_id.is_(None),
        )
        .update(
            {
                models.Parcel.assigned_courier_id: locked_courier.id,
                models.Parcel.current_status: models.ParcelStatus.assigned,
            },
            synchronize_session=False,
        )
    )

    if updated == 0:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This delivery job is no longer available",
        )

    locked_courier.status = models.CourierStatus.on_delivery
    db.commit()

    parcel = get_parcel(db, parcel_id)

    _log_status(
        db,
        parcel,
        models.ParcelStatus.assigned,
        changed_by_user_id=user.id if user else None,
        note=note,
    )

    return parcel
