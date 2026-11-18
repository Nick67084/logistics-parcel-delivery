
import logging
import time
from datetime import datetime, timezone

import stripe

from app.config import settings


logger = logging.getLogger(__name__)


class StripeCheckoutError(Exception):
    """Error raised when Stripe Checkout cannot be created."""
    pass


def create_checkout_session(
    *,
    parcel_id: int,
    payment_id: int,
    amount_minor: int,
    payment_method: str,
    expires_at: datetime,
    idempotency_key: str,
) -> dict:
    """
    Create a Stripe-hosted Checkout Session for SwiftDrop.

    Supported payment methods:
        - card
        - promptpay

    Currency:
        - THB (Thai baht)

    The payment amount is provided by the backend
    from the stored payment record.

    This function does not mark a payment as paid.
    Only a verified Stripe webhook can do that.
    """

    # STEP 1: Check Stripe configuration
    if not settings.stripe_secret_key:
        raise StripeCheckoutError(
            "Stripe secret key is not configured"
        )

    if not settings.frontend_url:
        raise StripeCheckoutError(
            "Frontend URL is not configured"
        )

    # STEP 2: Validate payment information
    if amount_minor is None or amount_minor <= 0:
        raise StripeCheckoutError(
            "Payment amount must be greater than zero"
        )

    if not idempotency_key:
        raise StripeCheckoutError(
            "Stripe idempotency key is required"
        )

    # STEP 3: Select Stripe payment method
    supported_methods = {
        "card": "card",
        "promptpay": "promptpay",
    }

    stripe_method = supported_methods.get(payment_method)

    if stripe_method is None:
        raise StripeCheckoutError(
            "Unsupported Stripe payment method"
        )

    # STEP 4: Validate payment expiration
    if expires_at is None:
        raise StripeCheckoutError(
            "Payment expiration time is missing"
        )

    # Existing SwiftDrop timestamps are treated as UTC.
    # This assumption must match your database configuration.
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(
            tzinfo=timezone.utc
        )

    deadline = int(expires_at.timestamp())
    now = int(time.time())

    # Stripe Checkout requires an expiration time
    # at least 30 minutes and at most 24 hours away.
    if deadline < now + 1800:
        raise StripeCheckoutError(
            "Less than 30 minutes remain before payment expiry. "
            "Create a new booking with a fresh payment window."
        )

    if deadline > now + 86400:
        raise StripeCheckoutError(
            "Payment expiration exceeds Stripe's 24-hour limit"
        )

    # STEP 5: Prepare frontend redirect URLs
    frontend_url = settings.frontend_url.rstrip("/")

    if not frontend_url.startswith(
        (
            "https://",
            "http://localhost:",
            "http://127.0.0.1:",
        )
    ):
        raise StripeCheckoutError(
            "Frontend URL must use HTTPS or localhost"
        )

    success_url = (
        f"{frontend_url}/payments/{parcel_id}"
        "?session_id={CHECKOUT_SESSION_ID}"
    )

    cancel_url = (
        f"{frontend_url}/payments/{parcel_id}"
    )

    # STEP 6: Prepare Stripe metadata
    metadata = {
        "parcel_id": str(parcel_id),
        "payment_id": str(payment_id),
    }

    # STEP 7: Configure Stripe SDK
    stripe.api_key = settings.stripe_secret_key

    # STEP 8: Create Checkout Session
    try:
       session = stripe.checkout.Session.create(
    mode="payment",
    line_items=[
                {
                    "price_data": {
                        "currency": "thb",
                        "unit_amount": amount_minor,
                        "product_data": {
                            "name": (
                                "SwiftDrop Parcel Delivery "
                                f"#{parcel_id}"
                            )
                        },
                    },
                    "quantity": 1,
                }
            ],
            client_reference_id=str(payment_id),
            metadata=metadata,
            payment_intent_data={
                "metadata": metadata,
            },
            success_url=success_url,
            cancel_url=cancel_url,
            expires_at=deadline,
            idempotency_key=idempotency_key,
        )

    except stripe.StripeError as exc:
        logger.exception(
            "Stripe Checkout session creation failed "
            "for parcel_id=%s, payment_id=%s",
            parcel_id,
            payment_id,
        )

        raise StripeCheckoutError(
            "Stripe could not create the Checkout session"
        ) from exc

    # STEP 9: Validate Stripe response
    if not session.id or not session.url:
        logger.error(
            "Stripe returned an incomplete Checkout Session "
            "for parcel_id=%s, payment_id=%s",
            parcel_id,
            payment_id,
        )

        raise StripeCheckoutError(
            "Stripe returned an incomplete Checkout Session"
        )

    # STEP 10: Return Checkout information
    return {
        "session_id": session.id,
        "checkout_url": session.url,
        "payment_id": payment_id,
        "parcel_id": parcel_id,
    }
