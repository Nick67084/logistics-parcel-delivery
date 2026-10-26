import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import Layout from "../components/Layout";
import StatusBadge from "../components/StatusBadge";
import { api } from "../api/client";

const ACTIVE_STATUSES = [
  "created",
  "assigned",
  "picked_up",
  "at_hub",
  "in_transit",
  "out_for_delivery",
];

const STATUS_LABELS = {
  created: "Shipment Created",
  assigned: "Courier Assigned",
  picked_up: "Picked Up",
  at_hub: "At Hub",
  in_transit: "In Transit",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  failed: "Delivery Failed",
  cancelled: "Cancelled",
};

export default function CustomerDashboardPage() {
  const [parcels, setParcels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const navigate = useNavigate();

  useEffect(() => {
    api.myParcels()
      .then(setParcels)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const activeParcels = parcels.filter((p) =>
    ACTIVE_STATUSES.includes(p.current_status)
  );

  const deliveredParcels = parcels.filter(
    (p) => p.current_status === "delivered"
  );

  const recentParcels = [...parcels].slice(0, 5);

  return (
    <Layout>
      <div className="customer-dashboard">

        {/* =================================================
            HEADER
            ================================================= */}

        <section className="dashboard-header">

          <div className="dashboard-header-content">

            <div className="dashboard-eyebrow">
              CUSTOMER PORTAL
            </div>

            <h1 className="dashboard-title">
              Welcome back
            </h1>

            <p className="dashboard-subtitle">
              Manage your shipments, monitor active deliveries,
              and track your parcels in real time.
            </p>

          </div>

          <button
            className="btn btn-primary dashboard-book-btn"
            onClick={() => navigate("/book")}
          >
            <span className="dashboard-book-icon">＋</span>
            Book a Parcel
          </button>

        </section>


        {/* =================================================
            ERROR
            ================================================= */}

        {error && (
          <div className="error-banner">
            {error}
          </div>
        )}


        {loading ? (

          /* =================================================
             LOADING STATE
             ================================================= */

          <section className="dashboard-loading">

            <div className="dashboard-loading-grid">

              <div className="dashboard-skeleton-card">
                <div className="skeleton skeleton-small" />
                <div className="skeleton skeleton-number" />
              </div>

              <div className="dashboard-skeleton-card">
                <div className="skeleton skeleton-small" />
                <div className="skeleton skeleton-number" />
              </div>

              <div className="dashboard-skeleton-card">
                <div className="skeleton skeleton-small" />
                <div className="skeleton skeleton-number" />
              </div>

            </div>

            <div className="card">
              <div className="skeleton skeleton-heading" />
              <div className="skeleton skeleton-line" />
              <div className="skeleton skeleton-large" />
            </div>

          </section>

        ) : (

          <>

            {/* =================================================
                SUMMARY CARDS
                ================================================= */}

            <section className="dashboard-stats">

              <div className="dashboard-stat-card">

                <div className="dashboard-stat-top">
                  <span className="dashboard-stat-label">
                    Total Shipments
                  </span>

                  <span className="dashboard-stat-icon">
                    ▣
                  </span>
                </div>

                <div className="dashboard-stat-value">
                  {parcels.length}
                </div>

                <div className="dashboard-stat-footer">
                  All parcels you've booked
                </div>

              </div>


              <div className="dashboard-stat-card dashboard-stat-active">

                <div className="dashboard-stat-top">
                  <span className="dashboard-stat-label">
                    Active Shipments
                  </span>

                  <span className="dashboard-stat-icon">
                    ↗
                  </span>
                </div>

                <div className="dashboard-stat-value">
                  {activeParcels.length}
                </div>

                <div className="dashboard-stat-footer">
                  Currently in progress
                </div>

              </div>


              <div className="dashboard-stat-card dashboard-stat-delivered">

                <div className="dashboard-stat-top">
                  <span className="dashboard-stat-label">
                    Delivered
                  </span>

                  <span className="dashboard-stat-icon">
                    ✓
                  </span>
                </div>

                <div className="dashboard-stat-value">
                  {deliveredParcels.length}
                </div>

                <div className="dashboard-stat-footer">
                  Successfully completed
                </div>

              </div>

            </section>


            {/* =================================================
                ACTIVE DELIVERIES
                ================================================= */}

            <section className="dashboard-section">

              <div className="dashboard-section-header">

                <div>
                  <div className="dashboard-section-eyebrow">
                    DELIVERY MONITOR
                  </div>

                  <h2 className="dashboard-section-title">
                    Active Deliveries
                  </h2>

                  <p className="dashboard-section-subtitle">
                    Keep an eye on parcels that are currently
                    moving through the delivery network.
                  </p>
                </div>

                {activeParcels.length > 0 && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => navigate("/parcels")}
                  >
                    View All
                  </button>
                )}

              </div>


              {activeParcels.length === 0 ? (

                <div className="dashboard-empty">

                  <div className="dashboard-empty-icon">
                    ✓
                  </div>

                  <h3>
                    No active deliveries
                  </h3>

                  <p>
                    You don't have any parcels currently in progress.
                    Book a parcel when you're ready to send something.
                  </p>

                  <button
                    className="btn btn-primary"
                    onClick={() => navigate("/book")}
                  >
                    Book a Parcel
                  </button>

                </div>

              ) : (

                <div className="active-delivery-list">

                  {activeParcels.slice(0, 3).map((p) => (

                    <article
                      key={p.id}
                      className="active-delivery-card"
                    >

                      {/* Top row */}

                      <div className="active-delivery-top">

                        <div>

                          <div className="tracking-label">
                            TRACKING NUMBER
                          </div>

                          <div className="tracking-number">
                            {p.tracking_number}
                          </div>

                        </div>

                        <StatusBadge
                          status={p.current_status}
                        />

                      </div>


                      {/* Route */}

                      <div className="delivery-route">

                        <div className="route-point">

                          <span className="route-dot route-dot-start" />

                          <div className="route-content">

                            <span className="route-label">
                              PICKUP
                            </span>

                            <strong>
                              {p.pickup_address || "Pickup location"}
                            </strong>

                          </div>

                        </div>


                        <div className="route-line">

                          <span className="route-line-progress" />

                        </div>


                        <div className="route-point">

                          <span className="route-dot route-dot-end" />

                          <div className="route-content">

                            <span className="route-label">
                              DESTINATION
                            </span>

                            <strong>
                              {p.dropoff_address || "Delivery location"}
                            </strong>

                          </div>

                        </div>

                      </div>


                      {/* Bottom row */}

                      <div className="active-delivery-bottom">

                        <div className="active-delivery-status">

                          <span className="status-indicator" />

                          <div>

                            <span className="active-status-label">
                              CURRENT STATUS
                            </span>

                            <strong>
                              {STATUS_LABELS[p.current_status] ||
                                p.current_status}
                            </strong>

                          </div>

                        </div>


                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() =>
                            navigate(`/parcels/${p.id}`)
                          }
                        >
                          Track Parcel
                          <span>→</span>
                        </button>

                      </div>

                    </article>

                  ))}

                </div>

              )}

            </section>


            {/* =================================================
                RECENT SHIPMENTS
                ================================================= */}

            <section className="dashboard-section">

              <div className="dashboard-section-header">

                <div>

                  <div className="dashboard-section-eyebrow">
                    SHIPMENT HISTORY
                  </div>

                  <h2 className="dashboard-section-title">
                    Recent Shipments
                  </h2>

                  <p className="dashboard-section-subtitle">
                    Your latest parcel bookings and delivery status.
                  </p>

                </div>

                {recentParcels.length > 0 && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => navigate("/parcels")}
                  >
                    View All
                  </button>
                )}

              </div>


              {recentParcels.length === 0 ? (

                <div className="dashboard-empty">

                  <div className="dashboard-empty-icon">
                    ▣
                  </div>

                  <h3>
                    No shipments yet
                  </h3>

                  <p>
                    Your booked parcels will appear here.
                  </p>

                  <button
                    className="btn btn-primary"
                    onClick={() => navigate("/book")}
                  >
                    Create Your First Shipment
                  </button>

                </div>

              ) : (

                <div className="dashboard-table-wrapper">

                  <table className="table dashboard-table">

                    <thead>
                      <tr>
                        <th>Tracking Number</th>
                        <th>Receiver</th>
                        <th>Route</th>
                        <th>Status</th>
                        <th></th>
                      </tr>
                    </thead>

                    <tbody>

                      {recentParcels.map((p) => (

                        <tr key={p.id}>

                          <td>

                            <div className="shipment-tracking">

                              <span className="shipment-package-icon">
                                ▣
                              </span>

                              <span className="mono">
                                {p.tracking_number}
                              </span>

                            </div>

                          </td>


                          <td>

                            <div className="shipment-receiver">
                              {p.receiver_name}
                            </div>

                          </td>


                          <td>

                            <div className="shipment-route">

                              <span>
                                {p.pickup_address || "Pickup"}
                              </span>

                              <span className="shipment-route-arrow">
                                →
                              </span>

                              <span>
                                {p.dropoff_address || "Destination"}
                              </span>

                            </div>

                          </td>


                          <td>

                            <StatusBadge
                              status={p.current_status}
                            />

                          </td>


                          <td>

                            <button
                              className="btn btn-sm btn-secondary"
                              onClick={() =>
                                navigate(`/parcels/${p.id}`)
                              }
                            >
                              Track
                            </button>

                          </td>

                        </tr>

                      ))}

                    </tbody>

                  </table>

                </div>

              )}

            </section>

          </>

        )}

      </div>
    </Layout>
  );
}