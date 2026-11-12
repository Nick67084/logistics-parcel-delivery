import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import Layout from "../components/Layout";
import StatusBadge from "../components/StatusBadge";
import { api } from "../api/client";

const STATUS_LABELS = {
  created: "Order Created",
  assigned: "Courier Assigned",
  picked_up: "Picked Up",
  at_hub: "At Hub",
  in_transit: "In Transit",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  failed: "Delivery Failed",
  cancelled: "Cancelled",
};

const STATUS_FILTERS = [
  { value: "all", label: "All Parcels" },
  { value: "created", label: "Created" },
  { value: "assigned", label: "Courier Assigned" },
  { value: "picked_up", label: "Picked Up" },
  { value: "at_hub", label: "At Hub" },
  { value: "in_transit", label: "In Transit" },
  { value: "out_for_delivery", label: "Out for Delivery" },
  { value: "delivered", label: "Delivered" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

function formatStatus(status) {
  return STATUS_LABELS[status] || status?.replaceAll("_", " ");
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

function getParcelRoute(parcel) {
  const pickup = parcel.pickup_address || "Pickup location";
  const dropoff = parcel.dropoff_address || parcel.receiver_address || "Delivery location";

  return {
    pickup,
    dropoff,
  };
}

export default function MyParcelsPage() {
  const [parcels, setParcels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const navigate = useNavigate();

  useEffect(() => {
    api
      .myParcels()
      .then(setParcels)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filteredParcels = useMemo(() => {
    const query = search.trim().toLowerCase();

    return parcels.filter((parcel) => {
      const matchesStatus =
        statusFilter === "all" || parcel.current_status === statusFilter;

      if (!matchesStatus) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [
        parcel.tracking_number,
        parcel.receiver_name,
        parcel.receiver_address,
        parcel.pickup_address,
        parcel.dropoff_address,
        parcel.package_type,
        parcel.service_level,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [parcels, search, statusFilter]);

  const summary = useMemo(() => {
    return {
      total: parcels.length,
      active: parcels.filter(
        (parcel) =>
          parcel.current_status !== "delivered" &&
          parcel.current_status !== "failed" &&
          parcel.current_status !== "cancelled"
      ).length,
      delivered: parcels.filter(
        (parcel) => parcel.current_status === "delivered"
      ).length,
      failed: parcels.filter(
        (parcel) => parcel.current_status === "failed"
      ).length,
    };
  }, [parcels]);

  return (
    <Layout>
      <div className="parcels-page">
        <div className="parcels-header">
          <div>
            <div className="parcels-eyebrow">SHIPMENT MANAGEMENT</div>

            <h1 className="parcels-title">My Parcels</h1>

            <p className="parcels-subtitle">
              Manage your shipments and monitor every delivery from pickup to
              destination.
            </p>
          </div>

          <button
            className="btn btn-primary parcels-book-btn"
            onClick={() => navigate("/book")}
          >
            <span>＋</span>
            Book New Parcel
          </button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {!loading && (
          <div className="parcels-summary-grid">
            <div className="parcels-summary-card">
              <div className="parcels-summary-icon">▣</div>
              <div>
                <span>Total Shipments</span>
                <strong>{summary.total}</strong>
              </div>
            </div>

            <div className="parcels-summary-card">
              <div className="parcels-summary-icon">◷</div>
              <div>
                <span>Active Deliveries</span>
                <strong>{summary.active}</strong>
              </div>
            </div>

            <div className="parcels-summary-card">
              <div className="parcels-summary-icon">✓</div>
              <div>
                <span>Delivered</span>
                <strong>{summary.delivered}</strong>
              </div>
            </div>

            <div className="parcels-summary-card">
              <div className="parcels-summary-icon">!</div>
              <div>
                <span>Failed</span>
                <strong>{summary.failed}</strong>
              </div>
            </div>
          </div>
        )}

        <div className="parcels-toolbar">
          <div className="parcels-search">
            <span className="parcels-search-icon">⌕</span>

            <input
              type="text"
              placeholder="Search tracking number, receiver, address..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            {search && (
              <button
                className="parcels-search-clear"
                onClick={() => setSearch("")}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>

          <div className="parcels-filter-wrap">
            <label htmlFor="parcel-status-filter">Status</label>

            <select
              id="parcel-status-filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              {STATUS_FILTERS.map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="parcels-results-header">
          <div>
            <strong>
              {filteredParcels.length}{" "}
              {filteredParcels.length === 1 ? "shipment" : "shipments"}
            </strong>

            {search || statusFilter !== "all" ? (
              <span> matching your filters</span>
            ) : (
              <span> in your account</span>
            )}
          </div>

          {(search || statusFilter !== "all") && (
            <button
              className="parcels-clear-filter"
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        {loading ? (
          <div className="parcels-list">
            {[1, 2, 3].map((item) => (
              <div className="parcel-card parcel-card-skeleton" key={item}>
                <div className="skeleton-line skeleton-short" />
                <div className="skeleton-line skeleton-medium" />
                <div className="skeleton-line skeleton-long" />
                <div className="skeleton-line skeleton-long" />
              </div>
            ))}
          </div>
        ) : filteredParcels.length === 0 ? (
          <div className="parcels-empty">
            <div className="parcels-empty-icon">▣</div>

            <h3>
              {parcels.length === 0
                ? "No parcels yet"
                : "No matching parcels"}
            </h3>

            <p>
              {parcels.length === 0
                ? "Your booked shipments will appear here."
                : "Try changing your search or status filter."}
            </p>

            {parcels.length === 0 && (
              <button
                className="btn btn-primary"
                onClick={() => navigate("/book")}
              >
                Book Your First Parcel
              </button>
            )}

            {parcels.length > 0 && (
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                }}
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <div className="parcels-list">
            {filteredParcels.map((parcel) => {
              const route = getParcelRoute(parcel);

              return (
                <article className="parcel-card" key={parcel.id}>
                  <div className="parcel-card-top">
                    <div className="parcel-tracking">
                      <span className="parcel-label">TRACKING NUMBER</span>

                      <button
                        className="parcel-tracking-number"
                        onClick={() => navigate(`/parcels/${parcel.id}`)}
                      >
                        {parcel.tracking_number}
                      </button>
                    </div>

                    <StatusBadge status={parcel.current_status} />
                  </div>

                  <div className="parcel-card-body">
                    <div className="parcel-route">
                      <div className="parcel-route-point">
                        <div className="parcel-route-marker pickup">
                          <span />
                        </div>

                        <div>
                          <span className="parcel-route-label">FROM</span>
                          <strong>{route.pickup}</strong>
                        </div>
                      </div>

                      <div className="parcel-route-line" />

                      <div className="parcel-route-point">
                        <div className="parcel-route-marker dropoff">
                          <span />
                        </div>

                        <div>
                          <span className="parcel-route-label">TO</span>
                          <strong>{route.dropoff}</strong>
                        </div>
                      </div>
                    </div>

                    <div className="parcel-details-grid">
                      <div className="parcel-detail">
                        <span>Receiver</span>
                        <strong>{parcel.receiver_name || "—"}</strong>
                      </div>

                      <div className="parcel-detail">
                        <span>Package</span>
                        <strong>{parcel.package_type || "Box"}</strong>
                      </div>

                      <div className="parcel-detail">
                        <span>Weight</span>
                        <strong>
                          {parcel.weight_kg
                            ? `${parcel.weight_kg} kg`
                            : "—"}
                        </strong>
                      </div>

                      <div className="parcel-detail">
                        <span>Service</span>
                        <strong>
                          {parcel.service_level
                            ? parcel.service_level.charAt(0).toUpperCase() +
                              parcel.service_level.slice(1)
                            : "Standard"}
                        </strong>
                      </div>

                      <div className="parcel-detail">
                        <span>Pickup Date</span>
                        <strong>{formatDate(parcel.pickup_date)}</strong>
                      </div>

                      <div className="parcel-detail">
                        <span>Courier</span>
                        <strong>
                          {parcel.assigned_courier_id
                            ? `Courier #${parcel.assigned_courier_id}`
                            : "Not assigned"}
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="parcel-card-footer">
                    <div className="parcel-footer-meta">
                      <span className="parcel-status-text">
                        {formatStatus(parcel.current_status)}
                      </span>

                      {parcel.estimated_fee != null && (
                        <span className="parcel-fee">
                          Estimated fee:{" "}
                          <strong>
                            ฿{Number(parcel.estimated_fee).toFixed(2)}
                          </strong>
                        </span>
                      )}
                    </div>

                    <div className="parcel-actions">
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => navigate(`/parcels/${parcel.id}`)}
                      >
                        View Details
                      </button>

                      {parcel.booking_status === "pending_payment" && (
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => navigate(`/payments/${parcel.id}`)}
                        >
                          Choose Payment
                        </button>
                      )}

                      {parcel.booking_status !== "pending_payment" && (
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => navigate(`/parcels/${parcel.id}`)}
                        >
                          Track Parcel
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}