import re
from datetime import datetime, date
from typing import Optional, List

from pydantic import BaseModel, EmailStr, ConfigDict, field_validator

from app.models import (
    UserRole,
    CourierStatus,
    ParcelStatus,
    BookingStatus,
    PaymentMethod,
    PaymentStatus,
)


# ---------- Password rules ----------

def check_password_strength(value: str) -> str:
    if len(value) < 8:
        raise ValueError("Password must be at least 8 characters")
    if len(value.encode("utf-8")) > 72:  # bcrypt limit
        raise ValueError("Password must be 72 bytes or fewer")
    if not re.search(r"[A-Za-z]", value) or not re.search(r"\d", value):
        raise ValueError("Password must contain at least one letter and one number")
    return value


# ---------- Auth / Users ----------

class UserCreate(BaseModel):
    """Used internally (seed script, admin-created accounts) — allows setting any role."""
    name: str
    email: EmailStr
    password: str
    phone: Optional[str] = None
    role: UserRole = UserRole.customer

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return check_password_strength(v)


class PublicRegisterRequest(BaseModel):
    """Public registration — only customer accounts can be created."""
    name: str
    email: EmailStr
    password: str
    phone: Optional[str] = None

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return check_password_strength(v)


class StaffCreateRequest(BaseModel):
    """Used by admins to create courier / hub_staff / admin accounts."""
    name: str
    email: EmailStr
    password: str
    phone: Optional[str] = None
    role: UserRole

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return check_password_strength(v)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: EmailStr
    phone: Optional[str] = None
    role: UserRole
    created_at: datetime
    saved_address: Optional[str] = None
    saved_address_lat: Optional[float] = None
    saved_address_lng: Optional[float] = None


class ProfileAddressUpdate(BaseModel):
    saved_address: str
    saved_address_lat: float
    saved_address_lng: float


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


# ---------- Hubs ----------

class HubCreate(BaseModel):
    name: str
    address: Optional[str] = None
    latitude: float
    longitude: float


class HubOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    address: Optional[str] = None
    latitude: float
    longitude: float


# ---------- Couriers ----------

class CourierLocationUpdate(BaseModel):
    latitude: float
    longitude: float


class CourierStatusUpdate(BaseModel):
    status: CourierStatus


class CourierOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    status: CourierStatus
    current_lat: Optional[float] = None
    current_lng: Optional[float] = None
    current_hub_id: Optional[int] = None


# ---------- Parcels ----------

class ParcelCreate(BaseModel):
    # Receiver information
    receiver_name: str
    receiver_phone: str
    receiver_address: str

    # Pickup location
    pickup_address: str
    pickup_lat: float
    pickup_lng: float

    # Drop-off location
    dropoff_address: str
    dropoff_lat: float
    dropoff_lng: float

    # Package information
    package_type: str = "Box"
    weight_kg: float = 1.0
    length_cm: Optional[float] = None
    width_cm: Optional[float] = None
    height_cm: Optional[float] = None
    fragile: bool = False

    # Delivery options
    service_level: str = "standard"
    pickup_date: Optional[date] = None
    pickup_window: Optional[str] = None
    delivery_instructions: Optional[str] = None


class ParcelStatusUpdate(BaseModel):
    status: ParcelStatus
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    note: Optional[str] = None


class ParcelStatusHistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    status: ParcelStatus
    changed_by_user_id: Optional[int] = None
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None
    note: Optional[str] = None
    timestamp: datetime


class ParcelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tracking_number: str
    sender_id: int

    # Receiver
    receiver_name: str
    receiver_phone: str
    receiver_address: str

    # Pickup / Drop-off
    pickup_address: str
    pickup_lat: float
    pickup_lng: float
    dropoff_address: str
    dropoff_lat: float
    dropoff_lng: float

    # Package information
    package_type: str
    weight_kg: float
    length_cm: Optional[float] = None
    width_cm: Optional[float] = None
    height_cm: Optional[float] = None
    fragile: bool

    # Delivery options
    service_level: str
    pickup_date: Optional[date] = None
    pickup_window: Optional[str] = None
    delivery_instructions: Optional[str] = None

    # Pricing
    estimated_fee: Optional[float] = None

    # Booking/payment confirmation
    booking_status: BookingStatus

    # Status / assignment
    current_status: ParcelStatus
    assigned_courier_id: Optional[int] = None
    current_hub_id: Optional[int] = None

    created_at: datetime
    updated_at: datetime


class ParcelDetailOut(ParcelOut):
    status_history: List[ParcelStatusHistoryOut] = []


class HubTransferCreate(BaseModel):
    parcel_id: int
    to_hub_id: int


# ---------- Public tracking (no login) ----------

class PublicTrackingEvent(BaseModel):
    status: ParcelStatus
    timestamp: datetime


class PublicTrackingOut(BaseModel):
    """Only what a stranger with a tracking number is allowed to see.
    No phone, no addresses, no coordinates, no user ids, no staff notes."""
    tracking_number: str
    current_status: ParcelStatus
    service_level: str
    receiver_name_masked: str
    created_at: datetime
    updated_at: datetime
    status_history: List[PublicTrackingEvent] = []


# ---------- Cancel / reschedule ----------

class ParcelCancelRequest(BaseModel):
    reason: Optional[str] = None


class ParcelRescheduleRequest(BaseModel):
    pickup_date: date
    pickup_window: Optional[str] = None

    @field_validator("pickup_date")
    @classmethod
    def pickup_not_in_past(cls, v: date) -> date:
        if v < date.today():
            raise ValueError("Pickup date cannot be in the past")
        return v

# ---------- Payments ----------

class PaymentCreate(BaseModel):
    payment_method: PaymentMethod


class PaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    parcel_id: int
    user_id: int
    amount: float
    amount_minor: Optional[int] = None
    currency: str = "THB"
    payment_method: PaymentMethod
    payment_status: PaymentStatus
    transaction_reference: Optional[str] = None
    expires_at: Optional[datetime] = None
    paid_at: Optional[datetime] = None
    collected_by_user_id: Optional[int] = None
    created_at: datetime


class CourierTodayCollectionOut(BaseModel):
    date: date
    timezone: str
    total_amount_minor: int
    total_amount: float
    currency: str = "THB"
    collection_count: int


# ---------- Admin Payment Management ----------

class AdminPaymentSummaryOut(BaseModel):
    date: date
    timezone: str = "Asia/Bangkok"
    currency: str = "THB"

    cod_collected_minor: int
    cod_collected_amount: float
    cod_collection_count: int

    unpaid_cod_count: int

    online_paid_minor: int
    online_paid_amount: float
    online_paid_count: int


class AdminCourierCollectionOut(BaseModel):
    courier_user_id: int
    courier_name: str
    collection_count: int
    total_amount_minor: int
    total_amount: float


class AdminPaymentRecordOut(BaseModel):
    payment_id: int
    parcel_id: int
    tracking_number: str

    payment_method: PaymentMethod
    payment_status: PaymentStatus

    amount: float
    currency: str = "THB"

    collected_by_user_id: Optional[int] = None
    collected_by_name: Optional[str] = None

    paid_at: Optional[datetime] = None
    created_at: datetime


class AdminPaymentReportOut(BaseModel):
    summary: AdminPaymentSummaryOut
    courier_collections: List[AdminCourierCollectionOut]
    payments: List[AdminPaymentRecordOut]
