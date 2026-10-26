import { useEffect, useRef, useState } from "react";

import Layout from "../components/Layout";
import StatusBadge from "../components/StatusBadge";

import { api } from "../api/client";

const NEXT_STEPS = {
  created: [],
  assigned: ["picked_up", "failed"],
  picked_up: ["at_hub", "in_transit", "failed"],
  at_hub: ["in_transit", "out_for_delivery", "failed"],
  in_transit: ["at_hub", "out_for_delivery", "failed"],
  out_for_delivery: ["delivered", "failed"],
  delivered: [],
  failed: ["picked_up"],
  cancelled: [],
};

const ACTIVE_STATUSES = [
  "assigned",
  "picked_up",
  "at_hub",
  "in_transit",
  "out_for_delivery",
];

const STATUS_LABELS = {
  created: "Shipment Created",
  assigned: "Job Accepted",
  picked_up: "Picked Up",
  at_hub: "At Hub",
  in_transit: "In Transit",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  failed: "Delivery Failed",
  cancelled: "Cancelled",
};

const STATUS_ORDER = [
  "created",
  "assigned",
  "picked_up",
  "at_hub",
  "in_transit",
  "out_for_delivery",
  "delivered",
];

const LOCATION_INTERVAL_MS = 10_000;

function formatStatus(status) {
  return STATUS_LABELS[status] || status?.replaceAll("_", " ");
}

function formatServiceLevel(level) {
  if (!level) return "Standard";

  return level.charAt(0).toUpperCase() + level.slice(1);
}

function formatDate(dateValue) {
  if (!dateValue) return "—";

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return dateValue;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getProgressPercent(status) {
  const index = STATUS_ORDER.indexOf(status);

  if (index < 0) return 0;

  return Math.round((index / (STATUS_ORDER.length - 1)) * 100);
}

function getStatusIndex(status) {
  const index = STATUS_ORDER.indexOf(status);
  return index === -1 ? 0 : index;
}

export default function CourierDashboardPage() {
  const [courier, setCourier] = useState(null);
  const [parcels, setParcels] = useState([]);
  const [jobs, setJobs] = useState([]);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [simulating, setSimulating] = useState(false);
  const [sharingLive, setSharingLive] = useState(false);
  const [gpsError, setGpsError] = useState("");

  const [acceptingJob, setAcceptingJob] = useState(null);
  const [updatingParcel, setUpdatingParcel] = useState(null);
  const [refreshingJobs, setRefreshingJobs] = useState(false);

  const intervalRef = useRef(null);

  const refresh = () => {
    setError("");

    api.courierMe()
      .then(setCourier)
      .catch((e) => setError(e.message));

    api.myParcels()
      .then(setParcels)
      .catch((e) => setError(e.message));

    api.courierJobs()
      .then(setJobs)
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    refresh();
  }, []);

  const hasActiveDelivery = parcels.some((parcel) =>
    ACTIVE_STATUSES.includes(parcel.current_status)
  );

  const activeParcels = parcels.filter((parcel) =>
    ACTIVE_STATUSES.includes(parcel.current_status)
  );

  const completedParcels = parcels.filter(
    (parcel) => parcel.current_status === "delivered"
  );

  const failedParcels = parcels.filter(
    (parcel) => parcel.current_status === "failed"
  );

  const pickedUpCount = parcels.filter(
    (parcel) => parcel.current_status === "picked_up"
  ).length;

  const outForDeliveryCount = parcels.filter(
    (parcel) => parcel.current_status === "out_for_delivery"
  ).length;

  const sendLocation = async (lat, lng) => {
    try {
      const updated = await api.updateCourierLocation(lat, lng);
      setCourier(updated);
    } catch (e) {
      setError(e.message);
    }
  };

  /*
   * Real GPS sharing.
   *
   * GPS starts automatically when at least one parcel
   * is actively being delivered.
   */
  useEffect(() => {
    if (!hasActiveDelivery) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      setSharingLive(false);
      return;
    }

    if (!navigator.geolocation) {
      setGpsError(
        "This browser/device doesn't support location sharing."
      );
      return;
    }

    const pushRealLocation = () => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setGpsError("");
          setSharingLive(true);

          sendLocation(
            position.coords.latitude,
            position.coords.longitude
          );
        },
        () => {
          setGpsError(
            'Location permission denied — use "Simulate route" for this demo.'
          );
          setSharingLive(false);
        }
      );
    };

    pushRealLocation();

    intervalRef.current = setInterval(
      pushRealLocation,
      LOCATION_INTERVAL_MS
    );

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasActiveDelivery]);

  const toggleAvailability = async () => {
    setError("");
    setMessage("");

    const next =
      courier.status === "offline" ? "available" : "offline";

    try {
      const updated = await api.updateCourierStatus(next);

      setCourier(updated);

      if (next === "available") {
        setMessage("You are now available for delivery jobs.");

        api
          .courierJobs()
          .then(setJobs)
          .catch(() => {});
      } else {
        setMessage("You are now offline.");
        setJobs([]);
      }
    } catch (e) {
      setError(e.message);
    }
  };

  const refreshJobs = async () => {
    setRefreshingJobs(true);
    setError("");

    try {
      const updatedJobs = await api.courierJobs();
      setJobs(updatedJobs);
    } catch (e) {
      setError(e.message);
    } finally {
      setRefreshingJobs(false);
    }
  };

  const acceptJob = async (parcelId) => {
    setError("");
    setMessage("");
    setAcceptingJob(parcelId);

    try {
      const acceptedParcel =
        await api.acceptCourierJob(parcelId);

      setMessage(
        `Delivery ${acceptedParcel.tracking_number} accepted successfully.`
      );

      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setAcceptingJob(null);
    }
  };

  const simulateMovement = async () => {
    setError("");
    setMessage("");
    setSimulating(true);

    const start = {
      lat: 13.7563,
      lng: 100.5018,
    };

    const end = {
      lat: 14.0208,
      lng: 100.525,
    };

    const steps = 6;

    for (let i = 1; i <= steps; i++) {
      const lat =
        start.lat + ((end.lat - start.lat) * i) / steps;

      const lng =
        start.lng + ((end.lng - start.lng) * i) / steps;

      await sendLocation(lat, lng);

      setMessage(
        `Simulated location sent: ${lat.toFixed(
          4
        )}, ${lng.toFixed(4)}`
      );

      await new Promise((resolve) =>
        setTimeout(resolve, 1000)
      );
    }

    setSimulating(false);
  };

  const changeStatus = async (parcelId, status) => {
    setError("");
    setMessage("");
    setUpdatingParcel(parcelId);

    try {
      await api.updateParcelStatus(parcelId, {
        status,
      });

      if (status === "picked_up") {
        setMessage(
          "Parcel picked up. Live GPS sharing will start automatically."
        );
      } else if (status === "delivered") {
        setMessage(
          "Parcel delivered. Live GPS sharing will stop automatically."
        );
      } else {
        setMessage(
          `Parcel status updated to ${formatStatus(status)}.`
        );
      }

      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setUpdatingParcel(null);
    }
  };

  if (!courier) {
    return (
      <Layout>
        <div className="courier-loading-page">
          <div className="courier-loading-spinner" />
          <h2>Loading courier dashboard...</h2>
          <p>Preparing your delivery workspace.</p>
        </div>
      </Layout>
    );
  }

  const currentLocation =
    courier.current_lat != null &&
    courier.current_lng != null
      ? `${courier.current_lat.toFixed(
          4
        )}, ${courier.current_lng.toFixed(4)}`
      : "Location unavailable";

  return (
    <Layout>
      <div className="courier-page">
        {/* =====================================================
            HEADER
            ===================================================== */}

        <section className="courier-header">
          <div>
            <div className="courier-eyebrow">
              COURIER OPERATIONS
            </div>

            <h1 className="courier-title">
              Delivery Dashboard
            </h1>

            <p className="courier-subtitle">
              Manage your delivery jobs, availability, live
              location, and active shipments.
            </p>
          </div>

          <div
            className={`courier-availability-badge ${
              courier.status === "available"
                ? "is-available"
                : courier.status === "on_delivery"
                ? "is-delivering"
                : "is-offline"
            }`}
          >
            <span className="courier-status-dot" />

            <div>
              <span>COURIER STATUS</span>
              <strong>
                {formatStatus(courier.status)}
              </strong>
            </div>
          </div>
        </section>

        {/* =====================================================
            ALERTS
            ===================================================== */}

        {error && (
          <div className="error-banner">
            {error}
          </div>
        )}

        {message && (
          <div className="success-banner">
            {message}
          </div>
        )}

        {gpsError && (
          <div className="error-banner">
            {gpsError}
          </div>
        )}

        {/* =====================================================
            PERFORMANCE SUMMARY
            ===================================================== */}

        <section className="courier-stats-grid">
          <div className="courier-stat-card">
            <div className="courier-stat-icon">◈</div>

            <div>
              <span>Available Jobs</span>
              <strong>{jobs.length}</strong>
              <small>Waiting for a courier</small>
            </div>
          </div>

          <div className="courier-stat-card">
            <div className="courier-stat-icon">↗</div>

            <div>
              <span>Active Deliveries</span>
              <strong>{activeParcels.length}</strong>
              <small>Currently in progress</small>
            </div>
          </div>

          <div className="courier-stat-card">
            <div className="courier-stat-icon">✓</div>

            <div>
              <span>Completed</span>
              <strong>{completedParcels.length}</strong>
              <small>Successfully delivered</small>
            </div>
          </div>

          <div className="courier-stat-card">
            <div className="courier-stat-icon">▣</div>

            <div>
              <span>Total Assigned</span>
              <strong>{parcels.length}</strong>
              <small>Shipments handled</small>
            </div>
          </div>
        </section>

        {/* =====================================================
            AVAILABILITY + LIVE GPS
            ===================================================== */}

        <section className="courier-control-grid">
          <div className="courier-control-card">
            <div className="courier-control-header">
              <div>
                <span className="courier-section-eyebrow">
                  WORK STATUS
                </span>

                <h2>Availability</h2>
              </div>

              <div
                className={`courier-control-icon ${
                  courier.status === "available"
                    ? "available"
                    : courier.status === "on_delivery"
                    ? "delivery"
                    : "offline"
                }`}
              >
                ●
              </div>
            </div>

            <div className="courier-status-display">
              <span
                className={`courier-large-status-dot ${
                  courier.status
                }`}
              />

              <div>
                <strong>
                  {formatStatus(courier.status)}
                </strong>

                <span>
                  {courier.status === "available"
                    ? "You can receive new delivery jobs."
                    : courier.status === "on_delivery"
                    ? "You are currently handling a delivery."
                    : "You are currently unavailable for jobs."}
                </span>
              </div>
            </div>

            <button
              className={`btn ${
                courier.status === "offline"
                  ? "btn-primary"
                  : "btn-secondary"
              } courier-full-btn`}
              onClick={toggleAvailability}
              disabled={courier.status === "on_delivery"}
            >
              {courier.status === "offline"
                ? "Go Available"
                : courier.status === "on_delivery"
                ? "Currently On Delivery"
                : "Go Offline"}
            </button>

            {courier.status === "on_delivery" && (
              <p className="courier-help-text">
                Finish or update your current delivery before
                going offline.
              </p>
            )}
          </div>

          <div className="courier-control-card">
            <div className="courier-control-header">
              <div>
                <span className="courier-section-eyebrow">
                  LOCATION SERVICES
                </span>

                <h2>Live Location</h2>
              </div>

              <div
                className={`courier-gps-icon ${
                  sharingLive ? "live" : ""
                }`}
              >
                ◎
              </div>
            </div>

            <div className="courier-gps-status">
              <div
                className={`courier-gps-indicator ${
                  sharingLive ? "live" : "waiting"
                }`}
              >
                <span
                  className={
                    sharingLive
                      ? "courier-pulse"
                      : ""
                  }
                />

                {hasActiveDelivery
                  ? sharingLive
                    ? "LIVE GPS SHARING"
                    : "WAITING FOR LOCATION"
                  : "GPS INACTIVE"}
              </div>
            </div>

            <div className="courier-location-display">
              <span>Current coordinates</span>
              <strong>{currentLocation}</strong>
            </div>

            <p className="courier-help-text">
              {hasActiveDelivery
                ? `Location is automatically sent every ${
                    LOCATION_INTERVAL_MS / 1000
                  } seconds while delivering.`
                : "GPS sharing starts automatically when a parcel is picked up."}
            </p>

            <button
              className="btn btn-secondary courier-full-btn"
              onClick={simulateMovement}
              disabled={simulating}
            >
              {simulating
                ? "Simulating Route..."
                : "Simulate Route (Demo)"}
            </button>
          </div>
        </section>

        {/* =====================================================
            AVAILABLE JOBS
            ===================================================== */}

        <section className="courier-section">
          <div className="courier-section-header">
            <div>
              <span className="courier-section-eyebrow">
                JOB QUEUE
              </span>

              <h2>Available Delivery Jobs</h2>

              <p>
                New shipments waiting to be accepted by an
                available courier.
              </p>
            </div>

            <button
              className="btn btn-secondary btn-sm"
              onClick={refreshJobs}
              disabled={
                refreshingJobs ||
                courier.status !== "available"
              }
            >
              {refreshingJobs
                ? "Refreshing..."
                : "Refresh Jobs"}
            </button>
          </div>

          {courier.status !== "available" ? (
            <div className="courier-empty">
              <div className="courier-empty-icon">◷</div>

              <h3>You're not available</h3>

              <p>
                Go available to receive new delivery jobs.
              </p>
            </div>
          ) : jobs.length === 0 ? (
            <div className="courier-empty">
              <div className="courier-empty-icon">✓</div>

              <h3>No jobs available</h3>

              <p>
                There are currently no new shipments waiting
                for a courier.
              </p>
            </div>
          ) : (
            <div className="courier-job-list">
              {jobs.map((job) => (
                <article
                  className="courier-job-card"
                  key={job.id}
                >
                  <div className="courier-job-header">
                    <div>
                      <span className="courier-job-label">
                        TRACKING NUMBER
                      </span>

                      <strong className="courier-job-tracking">
                        {job.tracking_number}
                      </strong>
                    </div>

                    <span className="courier-new-badge">
                      NEW JOB
                    </span>
                  </div>

                  <div className="courier-job-route">
                    <div className="courier-job-location">
                      <span className="courier-route-dot pickup" />

                      <div>
                        <small>PICKUP</small>
                        <strong>
                          {job.pickup_address ||
                            "Pickup location"}
                        </strong>
                      </div>
                    </div>

                    <div className="courier-route-connector" />

                    <div className="courier-job-location">
                      <span className="courier-route-dot dropoff" />

                      <div>
                        <small>DESTINATION</small>
                        <strong>
                          {job.dropoff_address ||
                            "Delivery location"}
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="courier-job-details">
                    <div>
                      <span>Receiver</span>
                      <strong>
                        {job.receiver_name || "—"}
                      </strong>
                    </div>

                    <div>
                      <span>Package</span>
                      <strong>
                        {job.package_type || "Box"}
                      </strong>
                    </div>

                    <div>
                      <span>Weight</span>
                      <strong>
                        {job.weight_kg ?? 0} kg
                      </strong>
                    </div>

                    <div>
                      <span>Service</span>
                      <strong>
                        {formatServiceLevel(
                          job.service_level
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>Pickup Date</span>
                      <strong>
                        {formatDate(job.pickup_date)}
                      </strong>
                    </div>

                    <div>
                      <span>Estimated Fee</span>
                      <strong>
                        {job.estimated_fee != null
                          ? `฿${Number(
                              job.estimated_fee
                            ).toFixed(2)}`
                          : "—"}
                      </strong>
                    </div>
                  </div>

                  <div className="courier-job-tags">
                    <span>
                      {formatServiceLevel(
                        job.service_level
                      )}
                    </span>

                    {job.fragile && (
                      <span className="fragile">
                        ⚠ Fragile
                      </span>
                    )}

                    {job.pickup_window && (
                      <span>
                        Pickup: {job.pickup_window}
                      </span>
                    )}
                  </div>

                  <div className="courier-job-footer">
                    <span>
                      Ready for courier assignment
                    </span>

                    <button
                      className="btn btn-primary"
                      onClick={() => acceptJob(job.id)}
                      disabled={
                        acceptingJob === job.id
                      }
                    >
                      {acceptingJob === job.id
                        ? "Accepting..."
                        : "Accept Delivery →"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* =====================================================
            ACTIVE DELIVERIES
            ===================================================== */}

        <section className="courier-section">
          <div className="courier-section-header">
            <div>
              <span className="courier-section-eyebrow">
                CURRENT WORK
              </span>

              <h2>Active Deliveries</h2>

              <p>
                Shipments currently assigned to you and moving
                through the delivery process.
              </p>
            </div>
          </div>

          {activeParcels.length === 0 ? (
            <div className="courier-empty">
              <div className="courier-empty-icon">✓</div>

              <h3>No active deliveries</h3>

              <p>
                Your active shipments will appear here after
                you accept and pick up a parcel.
              </p>
            </div>
          ) : (
            <div className="courier-active-list">
              {activeParcels.map((parcel) => {
                const progress = getProgressPercent(
                  parcel.current_status
                );

                const currentIndex = getStatusIndex(
                  parcel.current_status
                );

                return (
                  <article
                    className="courier-active-card"
                    key={parcel.id}
                  >
                    <div className="courier-active-header">
                      <div>
                        <span className="courier-job-label">
                          ACTIVE SHIPMENT
                        </span>

                        <strong className="courier-active-tracking">
                          {parcel.tracking_number}
                        </strong>
                      </div>

                      <StatusBadge
                        status={parcel.current_status}
                      />
                    </div>

                    <div className="courier-progress">
                      <div className="courier-progress-track">
                        <div
                          className="courier-progress-fill"
                          style={{
                            width: `${progress}%`,
                          }}
                        />
                      </div>

                      <div className="courier-progress-labels">
                        <span>Pickup</span>
                        <span>Hub</span>
                        <span>Transit</span>
                        <span>Delivery</span>
                      </div>
                    </div>

                    <div className="courier-active-route">
                      <div>
                        <span className="courier-job-label">
                          FROM
                        </span>

                        <strong>
                          {parcel.pickup_address ||
                            "Pickup location"}
                        </strong>
                      </div>

                      <span className="courier-active-arrow">
                        →
                      </span>

                      <div>
                        <span className="courier-job-label">
                          TO
                        </span>

                        <strong>
                          {parcel.dropoff_address ||
                            parcel.receiver_address ||
                            "Delivery location"}
                        </strong>
                      </div>
                    </div>

                    <div className="courier-active-info">
                      <div>
                        <span>Receiver</span>
                        <strong>
                          {parcel.receiver_name ||
                            "—"}
                        </strong>
                      </div>

                      <div>
                        <span>Phone</span>
                        <strong>
                          {parcel.receiver_phone ||
                            "—"}
                        </strong>
                      </div>

                      <div>
                        <span>Package</span>
                        <strong>
                          {parcel.package_type ||
                            "Box"}
                        </strong>
                      </div>

                      <div>
                        <span>Weight</span>
                        <strong>
                          {parcel.weight_kg ?? 0} kg
                        </strong>
                      </div>
                    </div>

                    {parcel.delivery_instructions && (
                      <div className="courier-instructions">
                        <span>DELIVERY INSTRUCTIONS</span>
                        <p>
                          {parcel.delivery_instructions}
                        </p>
                      </div>
                    )}

                    <div className="courier-active-footer">
                      <div className="courier-current-status">
                        <span className="courier-status-live-dot" />

                        <div>
                          <span>CURRENT STATUS</span>
                          <strong>
                            {formatStatus(
                              parcel.current_status
                            )}
                          </strong>
                        </div>
                      </div>

                      <div className="courier-active-actions">
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() =>
                            window.location.assign(
                              `/parcels/${parcel.id}`
                            )
                          }
                        >
                          Track
                        </button>

                        {NEXT_STEPS[
                          parcel.current_status
                        ]?.map((nextStatus) => (
                          <button
                            key={nextStatus}
                            className={`btn btn-sm ${
                              nextStatus === "delivered"
                                ? "btn-primary"
                                : "btn-secondary"
                            }`}
                            onClick={() =>
                              changeStatus(
                                parcel.id,
                                nextStatus
                              )
                            }
                            disabled={
                              updatingParcel ===
                              parcel.id
                            }
                          >
                            {updatingParcel ===
                            parcel.id
                              ? "Updating..."
                              : nextStatus ===
                                "failed"
                              ? "Mark Failed"
                              : nextStatus ===
                                "picked_up"
                              ? "Pick Up"
                              : `→ ${formatStatus(
                                  nextStatus
                                )}`}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="courier-active-meta">
                      <span>
                        Progress: {progress}%
                      </span>

                      <span>
                        Step {currentIndex + 1} of{" "}
                        {STATUS_ORDER.length}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* =====================================================
            DELIVERY PERFORMANCE
            ===================================================== */}

        <section className="courier-performance-grid">
          <div className="courier-performance-card">
            <span className="courier-section-eyebrow">
              TODAY'S WORKLOAD
            </span>

            <div className="courier-performance-number">
              {parcels.length}
            </div>

            <p>Total shipments assigned</p>
          </div>

          <div className="courier-performance-card">
            <span className="courier-section-eyebrow">
              PICKED UP
            </span>

            <div className="courier-performance-number">
              {pickedUpCount}
            </div>

            <p>Awaiting next delivery step</p>
          </div>

          <div className="courier-performance-card">
            <span className="courier-section-eyebrow">
              OUT FOR DELIVERY
            </span>

            <div className="courier-performance-number">
              {outForDeliveryCount}
            </div>

            <p>Currently approaching customers</p>
          </div>

          <div className="courier-performance-card">
            <span className="courier-section-eyebrow">
              FAILED
            </span>

            <div className="courier-performance-number">
              {failedParcels.length}
            </div>

            <p>Shipments requiring attention</p>
          </div>
        </section>
      </div>
    </Layout>
  );
}