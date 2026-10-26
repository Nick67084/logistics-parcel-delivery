from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from app.security import decode_access_token
from app.ws_manager import ws_manager


router = APIRouter(tags=["tracking"])


def get_user_from_token(
    token: str,
    db: Session,
) -> models.User | None:
    """
    Validate a JWT access token and return the corresponding user.
    """

    payload = decode_access_token(token)

    if payload is None:
        return None

    user_id = payload.get("sub")

    if user_id is None:
        return None

    try:
        user_id = int(user_id)
    except (TypeError, ValueError):
        return None

    return (
        db.query(models.User)
        .filter(models.User.id == user_id)
        .first()
    )


def can_watch_parcel(
    user: models.User,
    parcel: models.Parcel,
) -> bool:
    """
    Decide whether this user is allowed to receive
    real-time updates for this parcel.
    """

    # Customer can watch only parcels they sent.
    if user.role == models.UserRole.customer:
        return parcel.sender_id == user.id

    # Courier can watch only parcels assigned to them.
    if user.role == models.UserRole.courier:
        courier = user.courier_profile

        return (
            courier is not None
            and parcel.assigned_courier_id == courier.id
        )

    # Hub staff need operational visibility.
    if user.role == models.UserRole.hub_staff:
        return True

    # Admin has full visibility.
    if user.role == models.UserRole.admin:
        return True

    return False


@router.websocket("/ws/parcels/{parcel_id}")
async def parcel_tracking_socket(
    websocket: WebSocket,
    parcel_id: int,
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    """
    Authenticated real-time parcel tracking.

    The frontend supplies the JWT as a query parameter:

        /ws/parcels/{parcel_id}?token=JWT

    Access is granted only when the authenticated user
    is allowed to watch that parcel.
    """

    # --------------------------------------------------
    # 1. Find the parcel
    # --------------------------------------------------

    parcel = (
        db.query(models.Parcel)
        .filter(models.Parcel.id == parcel_id)
        .first()
    )

    if parcel is None:
        await websocket.close(code=1008)
        return

    # --------------------------------------------------
    # 2. Validate JWT
    # --------------------------------------------------

    user = get_user_from_token(token, db)

    if user is None:
        await websocket.close(code=1008)
        return

    # --------------------------------------------------
    # 3. Check parcel ownership / permissions
    # --------------------------------------------------

    if not can_watch_parcel(user, parcel):
        await websocket.close(code=1008)
        return

    # --------------------------------------------------
    # 4. Accept authenticated connection
    # --------------------------------------------------

    await ws_manager.connect(parcel_id, websocket)

    try:
        while True:
            # We don't expect meaningful messages from the
            # tracking client. The loop simply keeps the
            # connection alive and detects disconnects.
            await websocket.receive_text()

    except WebSocketDisconnect:
        ws_manager.disconnect(parcel_id, websocket)

    except Exception:
        ws_manager.disconnect(parcel_id, websocket)