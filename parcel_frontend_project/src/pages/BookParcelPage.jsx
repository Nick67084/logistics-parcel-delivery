import { useState } from "react";
import { useNavigate } from "react-router-dom";

import LocationPicker from "../components/LocationPicker";
import Layout from "../components/Layout";
import AddressField from "../components/AddressField";
import { api } from "../api/client";

const STEPS = [
  {
    number: 1,
    title: "Route",
    subtitle: "Pickup & destination",
  },
  {
    number: 2,
    title: "Receiver",
    subtitle: "Contact details",
  },
  {
    number: 3,
    title: "Package",
    subtitle: "Size & weight",
  },
  {
    number: 4,
    title: "Delivery",
    subtitle: "Service & schedule",
  },
  {
    number: 5,
    title: "Review",
    subtitle: "Confirm shipment",
  },
];

export default function BookParcelPage() {
  const [step, setStep] = useState(1);

  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [receiverAddress, setReceiverAddress] = useState("");

  const [locationPicker, setLocationPicker] = useState({
    open: false,
    type: null,
  });

  const [pickup, setPickup] = useState({
    address: "",
    lat: null,
    lng: null,
  });

  const [dropoff, setDropoff] = useState({
    address: "",
    lat: null,
    lng: null,
  });

  const [packageType, setPackageType] = useState("Box");
  const [weightKg, setWeightKg] = useState("1");
  const [lengthCm, setLengthCm] = useState("");
  const [widthCm, setWidthCm] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [fragile, setFragile] = useState(false);

  const [serviceLevel, setServiceLevel] = useState("standard");
  const [pickupDate, setPickupDate] = useState("");
  const [pickupWindow, setPickupWindow] = useState("09:00-12:00");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);
  const [busy, setBusy] = useState(false);

  const navigate = useNavigate();

  const today = new Date().toISOString().split("T")[0];

  const clearError = () => {
    if (error) {
      setError("");
    }
  };

  const openLocationPicker = (type) => {
    clearError();

    setLocationPicker({
      open: true,
      type,
    });
  };

  const closeLocationPicker = () => {
    setLocationPicker({
      open: false,
      type: null,
    });
  };

  const handleLocationConfirm = (location) => {
    if (locationPicker.type === "pickup") {
      setPickup({
        address: location.address,
        lat: location.lat,
        lng: location.lng,
      });
    }

    if (locationPicker.type === "dropoff") {
      setDropoff({
        address: location.address,
        lat: location.lat,
        lng: location.lng,
      });
    }

    closeLocationPicker();
    clearError();
  };

  const validateStep = () => {
    clearError();

    if (step === 1) {
      if (
        !pickup.address ||
        pickup.lat == null ||
        pickup.lng == null
      ) {
        setError(
          "Please select and confirm your pickup location on the map."
        );
        return false;
      }

      if (
        !dropoff.address ||
        dropoff.lat == null ||
        dropoff.lng == null
      ) {
        setError(
          "Please select and confirm your drop-off location on the map."
        );
        return false;
      }
    }

    if (step === 2) {
      if (!receiverName.trim()) {
        setError("Please enter the receiver's name.");
        return false;
      }

      if (!receiverPhone.trim()) {
        setError("Please enter the receiver's phone number.");
        return false;
      }

      if (!receiverAddress.trim()) {
        setError("Please enter the receiver's delivery address.");
        return false;
      }
    }

    if (step === 3) {
      if (!weightKg || Number(weightKg) <= 0) {
        setError("Please enter a valid package weight.");
        return false;
      }
    }

    if (step === 4) {
      if (!pickupDate) {
        setError("Please select a pickup date.");
        return false;
      }
    }

    return true;
  };

  const nextStep = () => {
    if (validateStep()) {
      setStep((current) => Math.min(current + 1, 5));
    }
  };

  const previousStep = () => {
    setError("");
    setStep((current) => Math.max(current - 1, 1));
  };

  const goToStep = (targetStep) => {
    if (targetStep >= step) {
      return;
    }

    setError("");
    setStep(targetStep);
  };

  const resetForm = () => {
    setReceiverName("");
    setReceiverPhone("");
    setReceiverAddress("");

    setPickup({
      address: "",
      lat: null,
      lng: null,
    });

    setDropoff({
      address: "",
      lat: null,
      lng: null,
    });

    setPackageType("Box");
    setWeightKg("1");
    setLengthCm("");
    setWidthCm("");
    setHeightCm("");
    setFragile(false);

    setServiceLevel("standard");
    setPickupDate("");
    setPickupWindow("09:00-12:00");
    setDeliveryInstructions("");

    setLocationPicker({
      open: false,
      type: null,
    });

    setStep(1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateStep()) {
      return;
    }

    setError("");
    setSuccess(null);
    setBusy(true);

    try {
      const parcel = await api.bookParcel({
        receiver_name: receiverName.trim(),
        receiver_phone: receiverPhone.trim(),
        receiver_address: receiverAddress.trim(),

        pickup_address: pickup.address,
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,

        dropoff_address: dropoff.address,
        dropoff_lat: dropoff.lat,
        dropoff_lng: dropoff.lng,

        package_type: packageType,
        weight_kg: Number(weightKg),

        length_cm: lengthCm ? Number(lengthCm) : null,
        width_cm: widthCm ? Number(widthCm) : null,
        height_cm: heightCm ? Number(heightCm) : null,

        fragile,
        service_level: serviceLevel,
        pickup_date: pickupDate,
        pickup_window: pickupWindow,
        delivery_instructions:
          deliveryInstructions.trim() || null,
      });

      setSuccess(parcel);
      resetForm();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout>
      <div className="booking-page">
        {/* =================================================
            PAGE HEADER
            ================================================= */}

        <section className="booking-header">
          <div>
            <div className="booking-eyebrow">
              SHIPMENT CREATION
            </div>

            <h1 className="page-title">
              Book a Parcel
            </h1>

            <p className="page-subtitle">
              Create a delivery in a few simple steps.
            </p>
          </div>

          <div className="booking-security">
            <span className="booking-security-icon">
              ✓
            </span>

            Secure booking
          </div>
        </section>

        {/* =================================================
            ERROR
            ================================================= */}

        {error && (
          <div className="error-banner booking-error">
            <span>!</span>
            {error}
          </div>
        )}

        {/* =================================================
            SUCCESS
            ================================================= */}

        {success && (
          <section className="booking-success">
            <div className="booking-success-icon">
              ✓
            </div>

            <div className="booking-success-content">
              <div className="booking-success-eyebrow">
                BOOKING COMPLETE
              </div>

              <h2>
                Parcel booked successfully
              </h2>

              <p>
                Your shipment has been created and is now ready
                for courier assignment.
              </p>

              <div className="booking-success-details">
                <div>
                  <span>Tracking number</span>

                  <strong className="mono">
                    {success.tracking_number}
                  </strong>
                </div>

                {success.estimated_fee != null && (
                  <div>
                    <span>Estimated delivery fee</span>

                    <strong>
                      {Number(success.estimated_fee).toFixed(2)} THB
                    </strong>
                  </div>
                )}
              </div>

              {success.assigned_courier_id && (
                <div className="booking-assigned">
                  Courier #{success.assigned_courier_id} has been assigned.
                </div>
              )}

              <div className="booking-success-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => navigate("/parcels")}
                >
                  View My Parcels
                  <span>→</span>
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setSuccess(null)}
                >
                  Book Another Parcel
                </button>
              </div>
            </div>
          </section>
        )}

        {/* =================================================
            PROGRESS
            ================================================= */}

        <section className="booking-progress">
          {STEPS.map((item, index) => {
            const active = item.number === step;
            const completed = item.number < step;

            return (
              <div
                key={item.number}
                className={
                  "booking-step" +
                  (active ? " active" : "") +
                  (completed ? " completed" : "")
                }
              >
                <button
                  type="button"
                  className="booking-step-button"
                  onClick={() => goToStep(item.number)}
                  disabled={!completed}
                >
                  <span className="booking-step-number">
                    {completed ? "✓" : item.number}
                  </span>

                  <span className="booking-step-info">
                    <strong>
                      {item.title}
                    </strong>

                    <small>
                      {item.subtitle}
                    </small>
                  </span>
                </button>

                {index < STEPS.length - 1 && (
                  <span className="booking-step-line" />
                )}
              </div>
            );
          })}
        </section>

        {/* =================================================
            BOOKING FORM
            ================================================= */}

        <form onSubmit={handleSubmit}>
          {/* =================================================
              STEP 1 — ROUTE
              ================================================= */}

          {step === 1 && (
            <section className="booking-card">
              <div className="booking-card-header">
                <div className="booking-card-number">
                  01
                </div>

                <div>
                  <h2>
                    Delivery route
                  </h2>

                  <p>
                    Where should we collect and deliver your parcel?
                  </p>
                </div>
              </div>

              {/* PICKUP */}

              <div className="booking-route-form">
                <div className="booking-location-marker pickup">
                  <span>●</span>
                </div>

                <div className="booking-location-field">
                  <AddressField
                    label="Pickup address"
                    value={pickup}
                    onChange={setPickup}
                    hideLocationButton
                  />

                  <button
                    type="button"
                    className={
                      "booking-map-location-button" +
                      (pickup.lat != null
                        ? " confirmed"
                        : "")
                    }
                    onClick={() => openLocationPicker("pickup")}
                  >
                    <span className="booking-map-location-icon">
                      📍
                    </span>

                    {pickup.lat != null
                      ? "Change location"
                      : "Select location on map"}
                  </button>
                </div>
              </div>

              <div className="booking-route-connector">
                <span />
              </div>

              {/* DROP-OFF */}

              <div className="booking-route-form">
                <div className="booking-location-marker dropoff">
                  <span>●</span>
                </div>

                <div className="booking-location-field">
                  <AddressField
                    label="Drop-off address"
                    value={dropoff}
                    onChange={setDropoff}
                    hideLocationButton
                  />

                  <button
                    type="button"
                    className={
                      "booking-map-location-button" +
                      (dropoff.lat != null
                        ? " confirmed"
                        : "")
                    }
                    onClick={() => openLocationPicker("dropoff")}
                  >
                    <span className="booking-map-location-icon">
                      📍
                    </span>

                    {dropoff.lat != null
                      ? "Change location"
                      : "Select location on map"}
                  </button>
                </div>
              </div>

              <div className="booking-info-box">
                <span className="booking-info-icon">
                  i
                </span>

                <div>
                  <strong>
                    Location accuracy
                  </strong>

                  <p>
                    Select an address suggestion or confirm the
                    exact location on the map. You can move the
                    pin before confirming.
                  </p>
                </div>
              </div>

              <div className="booking-actions right">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={nextStep}
                >
                  Continue
                  <span>→</span>
                </button>
              </div>
            </section>
          )}

          {/* =================================================
              STEP 2 — RECEIVER
              ================================================= */}

          {step === 2 && (
            <section className="booking-card">
              <div className="booking-card-header">
                <div className="booking-card-number">
                  02
                </div>

                <div>
                  <h2>
                    Receiver details
                  </h2>

                  <p>
                    Tell us who will receive this parcel.
                  </p>
                </div>
              </div>

              <div className="booking-form-grid">
                <div className="field">
                  <label>
                    Receiver name
                  </label>

                  <input
                    value={receiverName}
                    onChange={(e) =>
                      setReceiverName(e.target.value)
                    }
                    placeholder="e.g. John Doe"
                    required
                  />
                </div>

                <div className="field">
                  <label>
                    Receiver phone
                  </label>

                  <input
                    type="tel"
                    value={receiverPhone}
                    onChange={(e) =>
                      setReceiverPhone(e.target.value)
                    }
                    placeholder="e.g. 0812345678"
                    required
                  />
                </div>
              </div>

              <div className="field">
                <label>
                  Receiver's delivery address
                </label>

                <input
                  value={receiverAddress}
                  onChange={(e) =>
                    setReceiverAddress(e.target.value)
                  }
                  placeholder="Apartment, building, street..."
                  required
                />
              </div>

              <div className="booking-info-box">
                <span className="booking-info-icon">
                  i
                </span>

                <div>
                  <strong>
                    Delivery contact
                  </strong>

                  <p>
                    The courier may use this information to contact
                    the receiver during delivery.
                  </p>
                </div>
              </div>

              <div className="booking-actions between">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={previousStep}
                >
                  ← Back
                </button>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={nextStep}
                >
                  Continue
                  <span>→</span>
                </button>
              </div>
            </section>
          )}

          {/* =================================================
              STEP 3 — PACKAGE
              ================================================= */}

          {step === 3 && (
            <section className="booking-card">
              <div className="booking-card-header">
                <div className="booking-card-number">
                  03
                </div>

                <div>
                  <h2>
                    Package information
                  </h2>

                  <p>
                    Tell us what the courier will be carrying.
                  </p>
                </div>
              </div>

              <div className="booking-form-grid">
                <div className="field">
                  <label>
                    Package type
                  </label>

                  <select
                    value={packageType}
                    onChange={(e) =>
                      setPackageType(e.target.value)
                    }
                  >
                    <option value="Box">
                      Box
                    </option>

                    <option value="Envelope">
                      Envelope
                    </option>

                    <option value="Document">
                      Document
                    </option>

                    <option value="Food">
                      Food
                    </option>

                    <option value="Fragile Item">
                      Fragile Item
                    </option>

                    <option value="Other">
                      Other
                    </option>
                  </select>
                </div>

                <div className="field">
                  <label>
                    Weight (kg)
                  </label>

                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={weightKg}
                    onChange={(e) =>
                      setWeightKg(e.target.value)
                    }
                    placeholder="e.g. 2.5"
                    required
                  />
                </div>
              </div>

              <div className="booking-subsection">
                <div className="booking-subsection-title">
                  Package dimensions
                </div>

                <div className="booking-dimension-grid">
                  <div className="field">
                    <label>
                      Length
                    </label>

                    <div className="input-with-unit">
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={lengthCm}
                        onChange={(e) =>
                          setLengthCm(e.target.value)
                        }
                        placeholder="30"
                      />

                      <span>
                        cm
                      </span>
                    </div>
                  </div>

                  <div className="field">
                    <label>
                      Width
                    </label>

                    <div className="input-with-unit">
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={widthCm}
                        onChange={(e) =>
                          setWidthCm(e.target.value)
                        }
                        placeholder="20"
                      />

                      <span>
                        cm
                      </span>
                    </div>
                  </div>

                  <div className="field">
                    <label>
                      Height
                    </label>

                    <div className="input-with-unit">
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={heightCm}
                        onChange={(e) =>
                          setHeightCm(e.target.value)
                        }
                        placeholder="15"
                      />

                      <span>
                        cm
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <label
                className={
                  "fragile-option" +
                  (fragile ? " selected" : "")
                }
              >
                <input
                  type="checkbox"
                  checked={fragile}
                  onChange={(e) =>
                    setFragile(e.target.checked)
                  }
                />

                <span className="fragile-check">
                  {fragile ? "✓" : ""}
                </span>

                <span className="fragile-content">
                  <strong>
                    Fragile package
                  </strong>

                  <small>
                    Requires additional handling care.
                  </small>
                </span>
              </label>

              <div className="booking-actions between">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={previousStep}
                >
                  ← Back
                </button>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={nextStep}
                >
                  Continue
                  <span>→</span>
                </button>
              </div>
            </section>
          )}

          {/* =================================================
              STEP 4 — DELIVERY OPTIONS
              ================================================= */}

          {step === 4 && (
            <section className="booking-card">
              <div className="booking-card-header">
                <div className="booking-card-number">
                  04
                </div>

                <div>
                  <h2>
                    Delivery options
                  </h2>

                  <p>
                    Choose your service level and pickup schedule.
                  </p>
                </div>
              </div>

              <div className="booking-service-grid">
                <button
                  type="button"
                  className={
                    "service-option" +
                    (serviceLevel === "standard"
                      ? " selected"
                      : "")
                  }
                  onClick={() =>
                    setServiceLevel("standard")
                  }
                >
                  <span className="service-radio">
                    {serviceLevel === "standard" ? "✓" : ""}
                  </span>

                  <span className="service-content">
                    <strong>
                      Standard
                    </strong>

                    <small>
                      Cost-effective delivery
                    </small>
                  </span>

                  <span className="service-tag">
                    Standard
                  </span>
                </button>

                <button
                  type="button"
                  className={
                    "service-option" +
                    (serviceLevel === "express"
                      ? " selected"
                      : "")
                  }
                  onClick={() =>
                    setServiceLevel("express")
                  }
                >
                  <span className="service-radio">
                    {serviceLevel === "express" ? "✓" : ""}
                  </span>

                  <span className="service-content">
                    <strong>
                      Express
                    </strong>

                    <small>
                      Priority delivery
                    </small>
                  </span>

                  <span className="service-tag express">
                    Priority
                  </span>
                </button>
              </div>

              <div className="booking-form-grid booking-schedule">
                <div className="field">
                  <label>
                    Pickup date
                  </label>

                  <input
                    type="date"
                    min={today}
                    value={pickupDate}
                    onChange={(e) =>
                      setPickupDate(e.target.value)
                    }
                    required
                  />
                </div>

                <div className="field">
                  <label>
                    Preferred pickup window
                  </label>

                  <select
                    value={pickupWindow}
                    onChange={(e) =>
                      setPickupWindow(e.target.value)
                    }
                  >
                    <option value="09:00-12:00">
                      09:00 – 12:00
                    </option>

                    <option value="12:00-15:00">
                      12:00 – 15:00
                    </option>

                    <option value="15:00-18:00">
                      15:00 – 18:00
                    </option>

                    <option value="18:00-21:00">
                      18:00 – 21:00
                    </option>
                  </select>
                </div>
              </div>

              <div className="field">
                <label>
                  Delivery instructions
                  <span className="optional-label">
                    Optional
                  </span>
                </label>

                <textarea
                  value={deliveryInstructions}
                  onChange={(e) =>
                    setDeliveryInstructions(e.target.value)
                  }
                  placeholder="Example: Please call before arriving. Leave the parcel at reception if nobody answers."
                  rows={4}
                />
              </div>

              <div className="booking-info-box">
                <span className="booking-info-icon">
                  ฿
                </span>

                <div>
                  <strong>
                    How your fee is calculated
                  </strong>

                  <p>
                    The final delivery fee is calculated from the
                    route distance, package weight, dimensions,
                    service level, and handling requirements.
                  </p>
                </div>
              </div>

              <div className="booking-actions between">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={previousStep}
                >
                  ← Back
                </button>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={nextStep}
                >
                  Review Booking
                  <span>→</span>
                </button>
              </div>
            </section>
          )}

          {/* =================================================
              STEP 5 — REVIEW
              ================================================= */}

          {step === 5 && (
            <section className="booking-card review-card">
              <div className="booking-card-header">
                <div className="booking-card-number">
                  05
                </div>

                <div>
                  <h2>
                    Review your shipment
                  </h2>

                  <p>
                    Check everything before creating your delivery.
                  </p>
                </div>
              </div>

              <div className="review-route">
                <div className="review-route-point">
                  <span className="review-route-dot pickup" />

                  <div>
                    <span>
                      PICKUP
                    </span>

                    <strong>
                      {pickup.address}
                    </strong>
                  </div>
                </div>

                <div className="review-route-line">
                  <span>→</span>
                </div>

                <div className="review-route-point">
                  <span className="review-route-dot dropoff" />

                  <div>
                    <span>
                      DESTINATION
                    </span>

                    <strong>
                      {dropoff.address}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="review-grid">
                <div className="review-section">
                  <div className="review-section-title">
                    Receiver
                  </div>

                  <div className="review-detail-list">
                    <div>
                      <span>Name</span>
                      <strong>{receiverName}</strong>
                    </div>

                    <div>
                      <span>Phone</span>
                      <strong>{receiverPhone}</strong>
                    </div>

                    <div>
                      <span>Address</span>
                      <strong>{receiverAddress}</strong>
                    </div>
                  </div>
                </div>

                <div className="review-section">
                  <div className="review-section-title">
                    Package
                  </div>

                  <div className="review-detail-grid">
                    <div>
                      <span>Type</span>
                      <strong>{packageType}</strong>
                    </div>

                    <div>
                      <span>Weight</span>
                      <strong>{weightKg} kg</strong>
                    </div>

                    <div>
                      <span>Dimensions</span>

                      <strong>
                        {lengthCm || "—"} × {widthCm || "—"} ×{" "}
                        {heightCm || "—"} cm
                      </strong>
                    </div>

                    <div>
                      <span>Fragile</span>

                      <strong>
                        {fragile ? "Yes" : "No"}
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="review-section">
                  <div className="review-section-title">
                    Delivery
                  </div>

                  <div className="review-detail-grid">
                    <div>
                      <span>Service</span>

                      <strong>
                        {serviceLevel === "express"
                          ? "Express"
                          : "Standard"}
                      </strong>
                    </div>

                    <div>
                      <span>Pickup date</span>
                      <strong>{pickupDate}</strong>
                    </div>

                    <div>
                      <span>Pickup window</span>
                      <strong>{pickupWindow}</strong>
                    </div>

                    {deliveryInstructions && (
                      <div className="review-full-width">
                        <span>Instructions</span>

                        <strong>
                          {deliveryInstructions}
                        </strong>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="review-confirm">
                <div>
                  <span className="review-confirm-label">
                    READY TO BOOK?
                  </span>

                  <strong>
                    Create this shipment now
                  </strong>

                  <p>
                    Your parcel will enter the delivery network
                    after booking.
                  </p>
                </div>

                <button
                  type="submit"
                  className="btn btn-primary review-submit"
                  disabled={busy}
                >
                  {busy
                    ? "Booking..."
                    : "Confirm & Book Parcel"}

                  {!busy && <span>→</span>}
                </button>
              </div>

              <div className="booking-actions left">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={previousStep}
                  disabled={busy}
                >
                  ← Back
                </button>
              </div>
            </section>
          )}
        </form>

        {/* =================================================
            LOCATION PICKER MODAL
            ================================================= */}

        {locationPicker.open && (
          <LocationPicker
            title={
              locationPicker.type === "pickup"
                ? "Confirm pickup location"
                : "Confirm drop-off location"
            }
            initialLocation={
              locationPicker.type === "pickup"
                ? pickup.lat != null && pickup.lng != null
                  ? {
                      lat: pickup.lat,
                      lng: pickup.lng,
                    }
                  : null
                : dropoff.lat != null && dropoff.lng != null
                ? {
                    lat: dropoff.lat,
                    lng: dropoff.lng,
                  }
                : null
            }
            onConfirm={handleLocationConfirm}
            onCancel={closeLocationPicker}
          />
        )}
      </div>
    </Layout>
  );
}