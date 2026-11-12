"""add payment workflow

Revision ID: 8f2c1a6d4b90
Revises: 4bbc0796ec92
Create Date: 2026-11-03

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "8f2c1a6d4b90"
down_revision: Union[str, Sequence[str], None] = "4bbc0796ec92"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    booking_status_enum = sa.Enum(
        "pending_payment",
        "confirmed",
        "expired",
        name="bookingstatus",
    )
    payment_method_enum = sa.Enum(
        "promptpay",
        "card",
        "cash_on_delivery",
        name="paymentmethod",
    )
    payment_status_enum = sa.Enum(
        "pending",
        "unpaid",
        "paid",
        "expired",
        "failed",
        name="paymentstatus",
    )

    if bind.dialect.name == "postgresql":
        booking_status_enum.create(bind, checkfirst=True)
        payment_method_enum.create(bind, checkfirst=True)
        payment_status_enum.create(bind, checkfirst=True)

    with op.batch_alter_table("parcels", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "booking_status",
                booking_status_enum,
                nullable=True,
            )
        )

    # Existing parcels were already usable in the old system, so they are
    # treated as confirmed bookings after this migration.
    op.execute(
        "UPDATE parcels SET booking_status = 'confirmed' "
        "WHERE booking_status IS NULL"
    )

    with op.batch_alter_table("parcels", schema=None) as batch_op:
        batch_op.alter_column(
            "booking_status",
            nullable=False,
            server_default="pending_payment",
        )

    op.create_table(
        "payments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("parcel_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("payment_method", payment_method_enum, nullable=False),
        sa.Column("payment_status", payment_status_enum, nullable=False),
        sa.Column("transaction_reference", sa.String(length=80), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("paid_at", sa.DateTime(), nullable=True),
        sa.Column("collected_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["collected_by_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["parcel_id"], ["parcels.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("parcel_id"),
        sa.UniqueConstraint("transaction_reference"),
    )

    with op.batch_alter_table("payments", schema=None) as batch_op:
        batch_op.create_index("ix_payments_id", ["id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("payments", schema=None) as batch_op:
        batch_op.drop_index("ix_payments_id")

    op.drop_table("payments")

    with op.batch_alter_table("parcels", schema=None) as batch_op:
        batch_op.drop_column("booking_status")

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        sa.Enum(name="paymentstatus").drop(bind, checkfirst=True)
        sa.Enum(name="paymentmethod").drop(bind, checkfirst=True)
        sa.Enum(name="bookingstatus").drop(bind, checkfirst=True)
