
import logging
from datetime import datetime

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app import crud, models
from app.config import settings
from app.database import get_db


router = APIRouter(prefix="/stripe", tags=["stripe"])
logger = logging.getLogger(__name__)


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Receive and verify Stripe Checkout webhook events.

    Stripe signature verification is used instead of JWT
    authentication because Stripe sends these requests.
    """

    # STEP 1: Check webhook configuration
    if not settings.stripe_webhook_secret:
        raise HTTPException(
            status_code=503,
            detail="Stripe webhook is not configured",
        )

    # STEP 2: Read the original request body
    payload = await request.body()
    signature = request.headers.get("stripe-signature")

    if not signature:
        raise HTTPException(
            status_code=400,
            detail="Missing Stripe signature",
        )

    # STEP 3: Verify Stripe webhook signature
    try:
        event = stripe.Webhook.construct_event(
            payload,
            signature,
            settings.stripe_webhook_secret,
        )
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid webhook payload",
        )
    except stripe.SignatureVerificationError:
        raise HTTPException(
            status_code=400,
            detail="Invalid Stripe signature",
        )

    event_type = event["type"]

    supported_events = {
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
        "checkout.session.async_payment_failed",
        "checkout.session.expired",
    }

    if event_type not in supported_events:
        return {
            "received": True,
            "ignored": True,
        }

    # STEP 4: Convert Stripe Session to a Python dictionary
    # This fixes the AttributeError caused by session.get().
    session = event["data"]["object"]

    if hasattr(session, "to_dict"):
        session = session.to_dict()

    session_id = session.get("id")

    if not session_id:
        raise HTTPException(
            status_code=400,
            detail="Missing Checkout Session ID",
        )

    # STEP 5: Find the matching payment in PostgreSQL
    payment = (
        db.query(models.Payment)
        .filter(
            models.Payment.stripe_checkout_session_id
            == session_id
        )
        .with_for_update()
        .first()
    )

    if payment is None:
        logger.warning(
            "Unknown Stripe Checkout Session: %s",
            session_id,
        )
        raise HTTPException(
            status_code=503,
            detail="Checkout Session not registered yet",
        )

    # STEP 6: Find the parcel linked to this payment
    parcel = (
        db.query(models.Parcel)
        .filter(
            models.Parcel.id == payment.parcel_id
        )
        .with_for_update()
        .first()
    )

    if parcel is None:
        raise HTTPException(
            status_code=500,
            detail="Payment parcel not found",
        )

    # STEP 7: Verify the payment references
    metadata = session.get("metadata") or {}

    if (
        metadata.get("payment_id") != str(payment.id)
        or metadata.get("parcel_id") != str(parcel.id)
        or session.get("client_reference_id") != str(payment.id)
    ):
        logger.error(
            "Stripe metadata mismatch for payment %s",
            payment.id,
        )
        raise HTTPException(
            status_code=400,
            detail="Checkout payment reference mismatch",
        )

    # STEP 8: Verify the payment method
    if payment.payment_method not in (
        models.PaymentMethod.card,
        models.PaymentMethod.promptpay,
    ):
        raise HTTPException(
            status_code=400,
            detail="Payment is not an online payment",
        )

    # STEP 9: Verify amount and currency
    if (
        session.get("mode") != "payment"
        or (session.get("currency") or "").lower() != "thb"
        or session.get("amount_total") != payment.amount_minor
        or (payment.currency or "").upper() != "THB"
    ):
        logger.error(
            "Stripe amount or currency mismatch for payment %s",
            payment.id,
        )
        raise HTTPException(
            status_code=400,
            detail="Stripe payment details do not match",
        )

    payment_intent_id = session.get("payment_intent")

    if (
        payment.stripe_payment_intent_id
        and payment_intent_id
        and payment.stripe_payment_intent_id != payment_intent_id
    ):
        raise HTTPException(
            status_code=400,
            detail="Stripe PaymentIntent mismatch",
        )

    # STEP 10: Process successful payments
    success_events = {
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
    }

    if event_type in success_events:

        # Checkout completion does not always mean paid.
        if session.get("payment_status") != "paid":
            db.rollback()
            return {
                "received": True,
                "status": "awaiting_payment",
            }

        if not payment_intent_id:
            raise HTTPException(
                status_code=400,
                detail="Missing Stripe PaymentIntent",
            )

        if payment.payment_status != models.PaymentStatus.paid:
            payment.payment_status = models.PaymentStatus.paid
            payment.paid_at = datetime.utcnow()
            payment.stripe_payment_intent_id = payment_intent_id
            payment.transaction_reference = payment_intent_id
            db.commit()
        else:
            db.commit()

        # Expired bookings require manual reconciliation.
        if parcel.booking_status == models.BookingStatus.expired:
            logger.warning(
                "Paid expired parcel %s requires review",
                parcel.id,
            )
            return {
                "received": True,
                "status": "paid_requires_review",
            }

        # Confirm the booking only after payment succeeds.
        if parcel.booking_status == models.BookingStatus.pending_payment:
            crud._confirm_booking_and_assign_courier(
                db,
                parcel,
                "Booking confirmed by verified Stripe payment",
            )

        return {
            "received": True,
            "status": "paid",
        }

    # STEP 11: Process failed asynchronous payments
    if event_type == "checkout.session.async_payment_failed":

        if payment.payment_status != models.PaymentStatus.paid:
            payment.payment_status = models.PaymentStatus.failed
            db.commit()
        else:
            db.rollback()

        return {
            "received": True,
            "status": "failed",
        }

    # STEP 12: Process expired Checkout sessions
    if event_type == "checkout.session.expired":

        if payment.payment_status == models.PaymentStatus.pending:
            payment.payment_status = models.PaymentStatus.expired
            parcel.booking_status = models.BookingStatus.expired
            db.commit()
        else:
            db.rollback()

        return {
            "received": True,
            "status": "expired",
        }

    db.rollback()

    return {
        "received": True,
    }
