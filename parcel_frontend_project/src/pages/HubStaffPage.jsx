import { useEffect, useMemo, useState } from "react";

import Layout from "../components/Layout";
import StatusBadge from "../components/StatusBadge";

import { api } from "../api/client";

const HUB_STATUSES = ["picked_up", "at_hub", "in_transit"];

const STATUS_LABELS = {
  picked_up: "Picked Up",
  at_hub: "At Hub",
  in_transit: "In Transit",
};

const STATUS_FILTERS = [
  { value: "all", label: "All Statuses" },
  { value: "picked_up", label: "Picked Up" },
  { value: "at_hub", label: "At Hub" },
  { value: "in_transit", label: "In Transit" },
];

function formatStatus(status) {
  return STATUS_LABELS[status] || status?.replaceAll("_", " ");
}

export default function HubStaffPage() {
  const [hubs, setHubs] = useState([]);
  const [parcels, setParcels] = useState([]);

  const [selectedHub, setSelectedHub] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [parcelId, setParcelId] = useState("");
  const [toHubId, setToHubId] = useState("");

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [busyId, setBusyId] = useState(null);
  const [transferring, setTransferring] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setError("");

    try {
      const [hubData, parcelData] = await Promise.all([
        api.listHubs(),
        api.myParcels(),
      ]);

      setHubs(hubData);
      setParcels(parcelData);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    setError("");

    try {
      await refresh();
      setMessage("Hub data refreshed successfully.");
    } finally {
      setRefreshing(false);
    }
  };

  const updateStatus = async (id, status) => {
    setError("");
    setMessage("");
    setBusyId(id);

    try {
      await api.updateParcelStatus(id, {
        status,
      });

      setMessage(
        `Parcel #${id} updated to ${STATUS_LABELS[status]}.`
      );

      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleTransfer = async (e) => {
    e.preventDefault();

    setError("");
    setMessage("");

    if (!parcelId || !toHubId) {
      setError("Please select a parcel and destination hub.");
      return;
    }

    setTransferring(true);

    try {
      await api.hubTransfer({
        parcel_id: parseInt(parcelId, 10),
        to_hub_id: parseInt(toHubId, 10),
      });

      setMessage(
        `Parcel #${parcelId} transferred to hub #${toHubId}.`
      );

      setParcelId("");
      setToHubId("");

      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setTransferring(false);
    }
  };

  const visibleParcels = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return parcels.filter((parcel) => {
      const matchesHub =
        !selectedHub ||
        String(parcel.current_hub_id) === String(selectedHub);

      const matchesStatus =
        statusFilter === "all" ||
        parcel.current_status === statusFilter;

      const matchesSearch =
        !normalizedSearch ||
        String(parcel.id).includes(normalizedSearch) ||
        String(parcel.tracking_number || "")
          .toLowerCase()
          .includes(normalizedSearch) ||
        String(parcel.receiver_name || "")
          .toLowerCase()
          .includes(normalizedSearch);

      return (
        matchesHub &&
        matchesStatus &&
        matchesSearch
      );
    });
  }, [parcels, selectedHub, statusFilter, search]);

  const hubParcels = visibleParcels.filter((parcel) =>
    HUB_STATUSES.includes(parcel.current_status)
  );

  const pickedUpParcels = hubParcels.filter(
    (parcel) => parcel.current_status === "picked_up"
  );

  const atHubParcels = hubParcels.filter(
    (parcel) => parcel.current_status === "at_hub"
  );

  const inTransitParcels = hubParcels.filter(
    (parcel) => parcel.current_status === "in_transit"
  );

  const selectedHubData = hubs.find(
    (hub) => String(hub.id) === String(selectedHub)
  );

  return (
    <Layout>
      <div className="hub-page">
        {/* =====================================================
            HEADER
        ===================================================== */}

        <section className="hub-header">
          <div>
            <span className="hub-eyebrow">
              HUB OPERATIONS
            </span>

            <h1 className="hub-title">
              Hub Staff Dashboard
            </h1>

            <p className="hub-subtitle">
              Receive, process, transfer, and monitor parcels
              moving through the hub network.
            </p>
          </div>

          <button
            className="btn btn-secondary hub-refresh-btn"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing..." : "↻ Refresh"}
          </button>
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

        {/* =====================================================
            WORKING HUB
        ===================================================== */}

        <section className="hub-working-card">
          <div className="hub-working-info">
            <div className="hub-working-icon">
              ◈
            </div>

            <div>
              <span className="hub-section-label">
                WORKING HUB
              </span>

              <strong>
                {selectedHubData
                  ? selectedHubData.name
                  : "All Hubs"}
              </strong>

              <p>
                {selectedHubData
                  ? `${Number(selectedHubData.latitude).toFixed(
                      4
                    )}, ${Number(
                      selectedHubData.longitude
                    ).toFixed(4)}`
                  : "Monitoring the complete hub network"}
              </p>
            </div>
          </div>

          <div className="hub-selector-wrapper">
            <label>Working Hub</label>

            <select
              value={selectedHub}
              onChange={(e) =>
                setSelectedHub(e.target.value)
              }
            >
              <option value="">
                All Hubs
              </option>

              {hubs.map((hub) => (
                <option
                  key={hub.id}
                  value={hub.id}
                >
                  {hub.name}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* =====================================================
            SUMMARY
        ===================================================== */}

        <section className="hub-stats-grid">
          <div className="hub-stat-card">
            <div className="hub-stat-icon incoming">
              ↓
            </div>

            <div>
              <span>Incoming</span>
              <strong>
                {pickedUpParcels.length}
              </strong>
              <small>Waiting for reception</small>
            </div>
          </div>

          <div className="hub-stat-card">
            <div className="hub-stat-icon stored">
              ▣
            </div>

            <div>
              <span>At Hub</span>
              <strong>
                {atHubParcels.length}
              </strong>
              <small>Ready for next movement</small>
            </div>
          </div>

          <div className="hub-stat-card">
            <div className="hub-stat-icon transit">
              →
            </div>

            <div>
              <span>In Transit</span>
              <strong>
                {inTransitParcels.length}
              </strong>
              <small>Currently moving</small>
            </div>
          </div>

          <div className="hub-stat-card">
            <div className="hub-stat-icon total">
              #
            </div>

            <div>
              <span>Total Visible</span>
              <strong>
                {visibleParcels.length}
              </strong>
              <small>Matching current filters</small>
            </div>
          </div>
        </section>

        {/* =====================================================
            SEARCH / FILTER
        ===================================================== */}

        <section className="hub-filter-card">
          <div className="hub-filter-search">
            <label>Search Parcels</label>

            <input
              type="text"
              placeholder="Search tracking number, parcel ID, or receiver..."
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
            />
          </div>

          <div className="hub-filter-status">
            <label>Status</label>

            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value)
              }
            >
              {STATUS_FILTERS.map((filter) => (
                <option
                  key={filter.value}
                  value={filter.value}
                >
                  {filter.label}
                </option>
              ))}
            </select>
          </div>

          <button
            className="btn btn-secondary hub-clear-btn"
            onClick={() => {
              setSearch("");
              setStatusFilter("all");
              setSelectedHub("");
            }}
          >
            Clear Filters
          </button>
        </section>

        {/* =====================================================
            INCOMING PARCELS
        ===================================================== */}

        <section className="hub-section">
          <div className="hub-section-header">
            <div>
              <span className="hub-section-label">
                INBOUND OPERATIONS
              </span>

              <h2>Incoming Parcels</h2>

              <p>
                Parcels picked up by couriers and waiting
                to be received at the hub.
              </p>
            </div>

            <span className="hub-count-badge">
              {pickedUpParcels.length} waiting
            </span>
          </div>

          {pickedUpParcels.length === 0 ? (
            <div className="hub-empty">
              <div className="hub-empty-icon">
                ✓
              </div>

              <h3>No incoming parcels</h3>

              <p>
                There are currently no parcels waiting
                for hub reception.
              </p>
            </div>
          ) : (
            <div className="hub-table-wrapper">
              <table className="table hub-table">
                <thead>
                  <tr>
                    <th>Tracking</th>
                    <th>Receiver</th>
                    <th>Package</th>
                    <th>Weight</th>
                    <th>Status</th>
                    <th>Hub</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {pickedUpParcels.map((parcel) => (
                    <tr key={parcel.id}>
                      <td className="mono">
                        {parcel.tracking_number}
                      </td>

                      <td>
                        {parcel.receiver_name || "—"}
                      </td>

                      <td>
                        {parcel.package_type || "Box"}
                      </td>

                      <td>
                        {parcel.weight_kg ?? 0} kg
                      </td>

                      <td>
                        <StatusBadge
                          status={
                            parcel.current_status
                          }
                        />
                      </td>

                      <td>
                        #{parcel.current_hub_id ?? "—"}
                      </td>

                      <td>
                        <button
                          className="btn btn-sm btn-primary"
                          disabled={
                            busyId === parcel.id
                          }
                          onClick={() =>
                            updateStatus(
                              parcel.id,
                              "at_hub"
                            )
                          }
                        >
                          {busyId === parcel.id
                            ? "Receiving..."
                            : "Receive"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* =====================================================
            PARCELS AT HUB
        ===================================================== */}

        <section className="hub-section">
          <div className="hub-section-header">
            <div>
              <span className="hub-section-label">
                HUB STORAGE
              </span>

              <h2>Parcels at Hub</h2>

              <p>
                Parcels received by the hub and ready
                for their next movement.
              </p>
            </div>

            <span className="hub-count-badge">
              {atHubParcels.length} stored
            </span>
          </div>

          {atHubParcels.length === 0 ? (
            <div className="hub-empty">
              <div className="hub-empty-icon">
                ▣
              </div>

              <h3>No parcels at the hub</h3>

              <p>
                Received parcels will appear here.
              </p>
            </div>
          ) : (
            <div className="hub-table-wrapper">
              <table className="table hub-table">
                <thead>
                  <tr>
                    <th>Tracking</th>
                    <th>Receiver</th>
                    <th>Package</th>
                    <th>Weight</th>
                    <th>Status</th>
                    <th>Current Hub</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {atHubParcels.map((parcel) => (
                    <tr key={parcel.id}>
                      <td className="mono">
                        {parcel.tracking_number}
                      </td>

                      <td>
                        {parcel.receiver_name || "—"}
                      </td>

                      <td>
                        {parcel.package_type || "Box"}
                      </td>

                      <td>
                        {parcel.weight_kg ?? 0} kg
                      </td>

                      <td>
                        <StatusBadge
                          status={
                            parcel.current_status
                          }
                        />
                      </td>

                      <td>
                        #{parcel.current_hub_id ?? "—"}
                      </td>

                      <td>
                        <button
                          className="btn btn-sm btn-primary"
                          disabled={
                            busyId === parcel.id
                          }
                          onClick={() =>
                            updateStatus(
                              parcel.id,
                              "in_transit"
                            )
                          }
                        >
                          {busyId === parcel.id
                            ? "Updating..."
                            : "Start Transit"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* =====================================================
            TRANSFER + HUBS
        ===================================================== */}

        <section className="hub-management-grid">
          <div className="hub-card">
            <div className="hub-card-header">
              <div>
                <span className="hub-section-label">
                  HUB NETWORK
                </span>

                <h2>Transfer Parcel</h2>

                <p>
                  Move a parcel from its current hub
                  to another hub.
                </p>
              </div>

              <div className="hub-card-icon">
                ⇄
              </div>
            </div>

            <form onSubmit={handleTransfer}>
              <div className="field">
                <label>Parcel</label>

                <select
                  value={parcelId}
                  onChange={(e) =>
                    setParcelId(e.target.value)
                  }
                  required
                >
                  <option value="">
                    Select a parcel...
                  </option>

                  {atHubParcels.map((parcel) => (
                    <option
                      key={parcel.id}
                      value={parcel.id}
                    >
                      #{parcel.id} —{" "}
                      {parcel.tracking_number}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>Transfer to Hub</label>

                <select
                  value={toHubId}
                  onChange={(e) =>
                    setToHubId(e.target.value)
                  }
                  required
                >
                  <option value="">
                    Select destination hub...
                  </option>

                  {hubs
                    .filter(
                      (hub) =>
                        String(hub.id) !==
                        String(
                          selectedHub
                        )
                    )
                    .map((hub) => (
                      <option
                        key={hub.id}
                        value={hub.id}
                      >
                        {hub.name}
                      </option>
                    ))}
                </select>
              </div>

              <button
                className="btn btn-primary hub-transfer-btn"
                disabled={transferring}
              >
                {transferring
                  ? "Transferring..."
                  : "Transfer Parcel →"}
              </button>
            </form>
          </div>

          <div className="hub-card">
            <div className="hub-card-header">
              <div>
                <span className="hub-section-label">
                  NETWORK
                </span>

                <h2>Available Hubs</h2>

                <p>
                  Hub locations available for parcel
                  transfers.
                </p>
              </div>

              <div className="hub-card-icon">
                ◉
              </div>
            </div>

            {hubs.length === 0 ? (
              <div className="hub-empty small">
                <p>No hubs available.</p>
              </div>
            ) : (
              <div className="hub-location-list">
                {hubs.map((hub) => (
                  <div
                    className={`hub-location-item ${
                      String(hub.id) ===
                      String(selectedHub)
                        ? "selected"
                        : ""
                    }`}
                    key={hub.id}
                  >
                    <div className="hub-location-marker">
                      {hub.id}
                    </div>

                    <div>
                      <strong>
                        {hub.name}
                      </strong>

                      <span>
                        {Number(
                          hub.latitude
                        ).toFixed(4)}
                        ,{" "}
                        {Number(
                          hub.longitude
                        ).toFixed(4)}
                      </span>
                    </div>

                    {String(hub.id) ===
                      String(selectedHub) && (
                      <span className="hub-current-label">
                        Current
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* =====================================================
            IN TRANSIT
        ===================================================== */}

        <section className="hub-section">
          <div className="hub-section-header">
            <div>
              <span className="hub-section-label">
                OUTBOUND OPERATIONS
              </span>

              <h2>In Transit</h2>

              <p>
                Parcels that have left the hub and
                are currently moving through the network.
              </p>
            </div>

            <span className="hub-count-badge">
              {inTransitParcels.length} moving
            </span>
          </div>

          {inTransitParcels.length === 0 ? (
            <div className="hub-empty">
              <div className="hub-empty-icon">
                →
              </div>

              <h3>No parcels in transit</h3>

              <p>
                Parcels started for transit will appear
                here.
              </p>
            </div>
          ) : (
            <div className="hub-transit-grid">
              {inTransitParcels.map((parcel) => (
                <div
                  className="hub-transit-card"
                  key={parcel.id}
                >
                  <div className="hub-transit-top">
                    <div>
                      <span className="hub-section-label">
                        TRACKING
                      </span>

                      <strong className="mono">
                        {parcel.tracking_number}
                      </strong>
                    </div>

                    <StatusBadge
                      status={
                        parcel.current_status
                      }
                    />
                  </div>

                  <div className="hub-transit-route">
                    <div>
                      <span>FROM HUB</span>
                      <strong>
                        #{parcel.current_hub_id ??
                          "—"}
                      </strong>
                    </div>

                    <div className="hub-transit-arrow">
                      →
                    </div>

                    <div>
                      <span>DESTINATION</span>
                      <strong>
                        {parcel.dropoff_address ||
                          "Customer destination"}
                      </strong>
                    </div>
                  </div>

                  <div className="hub-transit-footer">
                    <span>
                      Receiver:{" "}
                      {parcel.receiver_name ||
                        "—"}
                    </span>

                    <span>
                      {parcel.weight_kg ?? 0} kg
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* =====================================================
            PARCEL OVERVIEW
        ===================================================== */}

        <section className="hub-section">
          <div className="hub-section-header">
            <div>
              <span className="hub-section-label">
                OPERATIONS OVERVIEW
              </span>

              <h2>Parcel Overview</h2>

              <p>
                All parcels matching your current
                hub, status, and search filters.
              </p>
            </div>

            <span className="hub-count-badge">
              {visibleParcels.length} parcels
            </span>
          </div>

          {visibleParcels.length === 0 ? (
            <div className="hub-empty">
              <div className="hub-empty-icon">
                ◌
              </div>

              <h3>No parcels found</h3>

              <p>
                Try changing your filters or search
                term.
              </p>
            </div>
          ) : (
            <div className="hub-table-wrapper">
              <table className="table hub-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Tracking</th>
                    <th>Receiver</th>
                    <th>Status</th>
                    <th>Current Hub</th>
                    <th>Courier</th>
                  </tr>
                </thead>

                <tbody>
                  {visibleParcels.map((parcel) => (
                    <tr key={parcel.id}>
                      <td>
                        #{parcel.id}
                      </td>

                      <td className="mono">
                        {parcel.tracking_number}
                      </td>

                      <td>
                        {parcel.receiver_name ||
                          "—"}
                      </td>

                      <td>
                        <StatusBadge
                          status={
                            parcel.current_status
                          }
                        />
                      </td>

                      <td>
                        #{parcel.current_hub_id ??
                          "—"}
                      </td>

                      <td>
                        {parcel.assigned_courier_id
                          ? `#${parcel.assigned_courier_id}`
                          : "Unassigned"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}