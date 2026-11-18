
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import crud, models, schemas
from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.services.stripe_service import (
    StripeCheckoutError,
    create_checkout_session,
)


router = APIRouter(prefix="/payments", tags=["payments"])


# --------------------------------------------------
# HELPER: PAYMENT AMOUNT IN SATANG
# --------------------------------------------------

def payment_amount_minor(payment: models.Payment) -> int:
    """Return payment amount in Thai satang."""

    if payment.amount_minor is not None:
        return int(payment.amount_minor)

    return int(
        (Decimal(str(payment.amount)) * 100).quantize(
            Decimal("1"),
            rounding=ROUND_HALF_UP,
        )
    )


# --------------------------------------------------
# HELPER: THAILAND DATE RANGE IN UTC
# --------------------------------------------------

def thailand_date_range(selected_date: date):
    """
    Convert a Thailand calendar date into a UTC range.

    Existing payment timestamps are stored as naive UTC.
    """

    bangkok = ZoneInfo("Asia/Bangkok")

    start_local = datetime.combine(
        selected_date,
        datetime.min.time(),
        tzinfo=bangkok,
    )

    end_local = start_local + timedelta(days=1)

    start_utc = start_local.astimezone(
        timezone.utc
    ).replace(tzinfo=None)

    end_utc = end_local.astimezone(
        timezone.utc
    ).replace(tzinfo=None)

    return start_utc, end_utc


# --------------------------------------------------
# 1. TODAY'S CASH COLLECTION (COURIER)
# --------------------------------------------------

@router.get(
    "/courier/today-collection",
    response_model=schemas.CourierTodayCollectionOut,
)
def get_courier_today_collection(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        require_roles(models.UserRole.courier)
    ),
):
    bangkok = ZoneInfo("Asia/Bangkok")
    today = datetime.now(bangkok).date()

    start_utc, end_utc = thailand_date_range(today)

    payments = (
        db.query(models.Payment)
        .filter(
            models.Payment.collected_by_user_id
            == current_user.id,
            models.Payment.payment_method
            == models.PaymentMethod.cash_on_delivery,
            models.Payment.payment_status
            == models.PaymentStatus.paid,
            models.Payment.paid_at >= start_utc,
            models.Payment.paid_at < end_utc,
        )
        .all()
    )

    total_minor = sum(
        payment_amount_minor(payment)
        for payment in payments
    )

    return {
        "date": today,
        "timezone": "Asia/Bangkok",
        "total_amount_minor": total_minor,
        "total_amount": total_minor / 100,
        "currency": "THB",
        "collection_count": len(payments),
    }


# --------------------------------------------------
# 2. ADMIN PAYMENT MANAGEMENT REPORT
# --------------------------------------------------

@router.get(
    "/admin/report",
    response_model=schemas.AdminPaymentReportOut,
)
def get_admin_payment_report(
    report_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        require_roles(models.UserRole.admin)
    ),
):
    bangkok = ZoneInfo("Asia/Bangkok")

    selected_date = (
        report_date
        if report_date is not None
        else datetime.now(bangkok).date()
    )

    start_utc, end_utc = thailand_date_range(
        selected_date
    )

    # Successful payments on the selected Thailand date.
    paid_payments = (
        db.query(models.Payment)
        .filter(
            models.Payment.payment_status
            == models.PaymentStatus.paid,
            models.Payment.paid_at >= start_utc,
            models.Payment.paid_at < end_utc,
        )
        .order_by(models.Payment.paid_at.desc())
        .all()
    )

    # Current outstanding COD payments, regardless of date.
    unpaid_cod_payments = (
        db.query(models.Payment)
        .filter(
            models.Payment.payment_method
            == models.PaymentMethod.cash_on_delivery,
            models.Payment.payment_status
            == models.PaymentStatus.unpaid,
        )
        .order_by(models.Payment.created_at.desc())
        .all()
    )

    cod_collected_minor = 0
    cod_collection_count = 0

    online_paid_minor = 0
    online_paid_count = 0

    courier_totals = {}

    # Calculate successful payments.
    for payment in paid_payments:
        amount_minor = payment_amount_minor(payment)

        if (
            payment.payment_method
            == models.PaymentMethod.cash_on_delivery
        ):
            # Only count COD cash confirmed by a courier.
            if payment.collected_by_user_id is None:
                continue

            cod_collected_minor += amount_minor
            cod_collection_count += 1

            courier_id = payment.collected_by_user_id

            if courier_id not in courier_totals:
                courier_totals[courier_id] = {
                    "collection_count": 0,
                    "total_amount_minor": 0,
                }

            courier_totals[courier_id][
                "collection_count"
            ] += 1

            courier_totals[courier_id][
                "total_amount_minor"
            ] += amount_minor

        elif payment.payment_method in (
            models.PaymentMethod.card,
            models.PaymentMethod.promptpay,
        ):
            online_paid_minor += amount_minor
            online_paid_count += 1

    # Resolve courier names.
    courier_ids = list(courier_totals.keys())

    courier_users = (
        db.query(models.User)
        .filter(models.User.id.in_(courier_ids))
        .all()
        if courier_ids
        else []
    )

    courier_names = {
        user.id: user.name
        for user in courier_users
    }

    courier_collections = []

    for courier_id, totals in courier_totals.items():
        total_minor = totals["total_amount_minor"]

        courier_collections.append({
            "courier_user_id": courier_id,
            "courier_name": courier_names.get(
                courier_id,
                f"Courier #{courier_id}",
            ),
            "collection_count": totals[
                "collection_count"
            ],
            "total_amount_minor": total_minor,
            "total_amount": total_minor / 100,
        })

    courier_collections.sort(
        key=lambda item: item["total_amount_minor"],
        reverse=True,
    )

    # Include successful payments for the selected date
    # plus all currently unpaid COD payments.
    report_payments = (
        paid_payments + unpaid_cod_payments
    )

    parcel_ids = list({
        payment.parcel_id
        for payment in report_payments
    })

    parcels = (
        db.query(models.Parcel)
        .filter(models.Parcel.id.in_(parcel_ids))
        .all()
        if parcel_ids
        else []
    )

    tracking_numbers = {
        parcel.id: parcel.tracking_number
        for parcel in parcels
    }

    # Resolve the names of users who collected cash.
    collector_ids = list({
        payment.collected_by_user_id
        for payment in report_payments
        if payment.collected_by_user_id is not None
    })

    collectors = (
        db.query(models.User)
        .filter(models.User.id.in_(collector_ids))
        .all()
        if collector_ids
        else []
    )

    collector_names = {
        user.id: user.name
        for user in collectors
    }

    payment_records = []

    for payment in report_payments:
        collector_id = payment.collected_by_user_id

        payment_records.append({
            "payment_id": payment.id,
            "parcel_id": payment.parcel_id,
            "tracking_number": tracking_numbers.get(
                payment.parcel_id,
                f"Parcel #{payment.parcel_id}",
            ),
            "payment_method": payment.payment_method,
            "payment_status": payment.payment_status,
            "amount": payment.amount,
            "currency": payment.currency,
            "collected_by_user_id": collector_id,
            "collected_by_name": (
                collector_names.get(
                    collector_id,
                    f"User #{collector_id}",
                )
                if collector_id is not None
                else None
            ),
            "paid_at": payment.paid_at,
            "created_at": payment.created_at,
        })

    return {
        "summary": {
            "date": selected_date,
            "timezone": "Asia/Bangkok",
            "currency": "THB",
            "cod_collected_minor": cod_collected_minor,
            "cod_collected_amount": (
                cod_collected_minor / 100
            ),
            "cod_collection_count": cod_collection_count,
            "unpaid_cod_count": len(
                unpaid_cod_payments
            ),
            "online_paid_minor": online_paid_minor,
            "online_paid_amount": (
                online_paid_minor / 100
            ),
            "online_paid_count": online_paid_count,
        },
        "courier_collections": courier_collections,
        "payments": payment_records,
    }


# --------------------------------------------------
# 3. VIEW PAYMENT DETAILS
# --------------------------------------------------

@router.get(
    "/{parcel_id}",
    response_model=schemas.PaymentOut,
)
def get_payment(
    parcel_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    parcel = crud.get_parcel(db, parcel_id)

    if current_user.role == models.UserRole.customer:
        if parcel.sender_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail=(
                    "You do not have permission "
                    "to view this payment"
                ),
            )

    if current_user.role == models.UserRole.courier:
        courier = current_user.courier_profile

        if (
            not courier
            or parcel.assigned_courier_id != courier.id
        ):
            raise HTTPException(
                status_code=403,
                detail=(
                    "You do not have permission "
                    "to view this payment"
                ),
            )

    payment = crud.expire_payment_if_needed(db, parcel)

    if not payment:
        raise HTTPException(
            status_code=404,
            detail=(
                "Payment has not been selected "
                "for this parcel"
            ),
        )

    return payment


# --------------------------------------------------
# 4. START PAYMENT
# --------------------------------------------------

@router.post(
    "/{parcel_id}/start",
    response_model=schemas.PaymentOut,
    status_code=201,
)
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


# --------------------------------------------------
# 5. CREATE STRIPE CHECKOUT SESSION
# --------------------------------------------------

@router.post("/{parcel_id}/checkout")
def create_stripe_checkout(
    parcel_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        require_roles(models.UserRole.customer)
    ),
):
    parcel = crud.get_parcel(db, parcel_id)

    # Only the parcel owner can start online checkout.
    if parcel.sender_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="You do not own this parcel",
        )

    payment = crud.expire_payment_if_needed(db, parcel)

    if not payment:
        raise HTTPException(
            status_code=404,
            detail="Please select a payment method first",
        )

    # Only Card and PromptPay are supported by Stripe.
    allowed_methods = (
        models.PaymentMethod.card,
        models.PaymentMethod.promptpay,
    )

    if payment.payment_method not in allowed_methods:
        raise HTTPException(
            status_code=400,
            detail=(
                "Stripe Checkout is only available "
                "for card and PromptPay"
            ),
        )

    if payment.payment_status == models.PaymentStatus.paid:
        raise HTTPException(
            status_code=409,
            detail="This parcel has already been paid",
        )

    if payment.payment_status != models.PaymentStatus.pending:
        raise HTTPException(
            status_code=409,
            detail="This payment is no longer pending",
        )

    if parcel.booking_status == models.BookingStatus.expired:
        raise HTTPException(
            status_code=409,
            detail="This parcel booking has expired",
        )

    if payment.expires_at is None:
        raise HTTPException(
            status_code=409,
            detail="Payment expiration time is missing",
        )

    if datetime.utcnow() >= payment.expires_at:
        raise HTTPException(
            status_code=409,
            detail="The payment window has expired",
        )

    if (
        payment.amount_minor is None
        or payment.amount_minor <= 0
    ):
        raise HTTPException(
            status_code=409,
            detail="A valid payment amount is required",
        )

    if payment.currency.upper() != "THB":
        raise HTTPException(
            status_code=409,
            detail="Only THB payments are supported",
        )

    # Prevent multiple Checkout sessions.
    if payment.stripe_checkout_session_id:
        raise HTTPException(
            status_code=409,
            detail=(
                "A Stripe Checkout session already exists "
                "for this payment. Resume or reconcile the "
                "existing session before starting another."
            ),
        )

    # Use the payment amount stored in the database.
    try:
        checkout = create_checkout_session(
            parcel_id=parcel.id,
            payment_id=payment.id,
            amount_minor=payment.amount_minor,
            payment_method=payment.payment_method.value,
            expires_at=payment.expires_at,
            idempotency_key=(
                f"swiftdrop-checkout-{payment.id}-v2"
            ),
        )
    except StripeCheckoutError as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc

    # Store Stripe reference without marking payment paid.
    payment.stripe_checkout_session_id = checkout[
        "session_id"
    ]

    try:
        db.commit()
        db.refresh(payment)
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=(
                "Could not save the Stripe "
                "Checkout reference"
            ),
        )

    return {
        "parcel_id": parcel.id,
        "payment_id": payment.id,
        "session_id": checkout["session_id"],
        "checkout_url": checkout["checkout_url"],
        "payment_status": payment.payment_status.value,
    }


# --------------------------------------------------
# 6. DISABLE DEMO ONLINE PAYMENT CONFIRMATION
# --------------------------------------------------

@router.post("/{parcel_id}/complete")
def complete_online_payment(
    parcel_id: int,
    current_user: models.User = Depends(
        require_roles(models.UserRole.customer)
    ),
):
    raise HTTPException(
        status_code=410,
        detail=(
            "Demo payment confirmation is disabled. "
            "Online payments must be verified through Stripe."
        ),
    )


# --------------------------------------------------
# 7. COLLECT CASH ON DELIVERY
# --------------------------------------------------

@router.post(
    "/{parcel_id}/collect-cash",
    response_model=schemas.PaymentOut,
)
def collect_cash_payment(
    parcel_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        require_roles(models.UserRole.courier)
    ),
):
    parcel = crud.get_parcel(db, parcel_id)

    # Cash is collected before marking a parcel delivered.
    if (
        parcel.current_status
        != models.ParcelStatus.out_for_delivery
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                "Cash can be collected when the parcel "
                "is out for delivery"
            ),
        )

    return crud.collect_cash_payment(
        db,
        parcel,
        current_user,
    )
