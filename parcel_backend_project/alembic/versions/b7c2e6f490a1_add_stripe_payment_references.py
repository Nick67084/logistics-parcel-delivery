
"""Add Stripe payment references.

Revision ID: b7c2e6f490a1
Revises: 91a6c0d4e2b7
"""

from alembic import op
import sqlalchemy as sa


revision = "b7c2e6f490a1"
down_revision = "91a6c0d4e2b7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "payments",
        sa.Column(
            "stripe_checkout_session_id",
            sa.String(length=255),
            nullable=True,
        ),
    )

    op.add_column(
        "payments",
        sa.Column(
            "stripe_payment_intent_id",
            sa.String(length=255),
            nullable=True,
        ),
    )

    op.create_unique_constraint(
        "uq_payments_stripe_checkout_session_id",
        "payments",
        ["stripe_checkout_session_id"],
    )

    op.create_unique_constraint(
        "uq_payments_stripe_payment_intent_id",
        "payments",
        ["stripe_payment_intent_id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_payments_stripe_payment_intent_id",
        "payments",
        type_="unique",
    )

    op.drop_constraint(
        "uq_payments_stripe_checkout_session_id",
        "payments",
        type_="unique",
    )

    op.drop_column(
        "payments",
        "stripe_payment_intent_id",
    )

    op.drop_column(
        "payments",
        "stripe_checkout_session_id",
    )
