
"""Add payment amount in satang and currency.

Revision ID: 91a6c0d4e2b7
Revises: 8f2c1a6d4b90
"""

from decimal import Decimal, ROUND_HALF_UP

from alembic import op
import sqlalchemy as sa


# Revision identifiers
revision = "91a6c0d4e2b7"
down_revision = "8f2c1a6d4b90"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    payments = sa.table(
        "payments",
        sa.column("id", sa.Integer),
        sa.column("amount", sa.Float),
        sa.column("amount_minor", sa.Integer),
    )

    # Read existing payment records
    rows = bind.execute(
        sa.select(
            payments.c.id,
            payments.c.amount,
        )
    ).all()

    # Validate existing amounts before changing the table
    converted = []

    for row in rows:
        value = Decimal(str(row.amount))

        if not value.is_finite() or value < 0:
            raise ValueError(
                f"Invalid payment amount for payment {row.id}"
            )

        amount_minor = int(
            (value * 100).quantize(
                Decimal("1"),
                rounding=ROUND_HALF_UP,
            )
        )

        converted.append(
            (row.id, amount_minor)
        )

    # Add exact payment amount
    op.add_column(
        "payments",
        sa.Column(
            "amount_minor",
            sa.Integer(),
            nullable=True,
        ),
    )

    # Add payment currency
    op.add_column(
        "payments",
        sa.Column(
            "currency",
            sa.String(length=3),
            nullable=False,
            server_default="THB",
        ),
    )

    # Populate the new field for existing payments
    for payment_id, amount_minor in converted:
        bind.execute(
            payments.update()
            .where(payments.c.id == payment_id)
            .values(amount_minor=amount_minor)
        )


def downgrade() -> None:
    # Remove only the columns added by this migration
    with op.batch_alter_table("payments") as batch_op:
        batch_op.drop_column("currency")
        batch_op.drop_column("amount_minor")
