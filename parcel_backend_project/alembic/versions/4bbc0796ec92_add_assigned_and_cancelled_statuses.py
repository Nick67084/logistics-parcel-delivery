"""add assigned and cancelled statuses

Revision ID: 4bbc0796ec92
Revises: 0dedbe8c86e8
Create Date: (keep the date Alembic wrote here)

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "4bbc0796ec92"
down_revision: Union[str, Sequence[str], None] = "0dedbe8c86e8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # New enum values must be committed before they can be used,
    # so they run in an autocommit block.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE parcelstatus ADD VALUE IF NOT EXISTS 'assigned'")
        op.execute("ALTER TYPE parcelstatus ADD VALUE IF NOT EXISTS 'cancelled'")

    # Parcels a courier already accepted under the old workflow
    # (still 'created' but with a courier) become 'assigned'.
    op.execute(
        "UPDATE parcels SET current_status = 'assigned' "
        "WHERE current_status = 'created' AND assigned_courier_id IS NOT NULL"
    )


def downgrade() -> None:
    # PostgreSQL cannot drop enum values; nothing to undo safely.
    pass