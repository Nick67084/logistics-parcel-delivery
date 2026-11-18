import { useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout";
import StatusBadge from "../components/StatusBadge";
import { api } from "../api/client";
const PARCEL_STATUSES = [
  "created",
  "assigned",
  "picked_up",
  "at_hub",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "failed",
  "cancelled",
];
const STATUS_LABELS = {
  created: "Created",
  assigned: "Assigned",
  picked_up: "Picked Up",
  at_hub: "At Hub",
  in_transit: "In Transit",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  failed: "Failed",
  cancelled: "Cancelled",
};
const ROLE_LABELS = {
  customer: "Customers",
  courier: "Couriers",
  hub_staff: "Hub Staff",
  admin: "Admins",
};
const THAILAND_TIMEZONE = "Asia/Bangkok";

function thailandToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: THAILAND_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatBaht(value) {
  return new Intl.NumberFormat("en-TH", {
    style: "currency",
    currency: "THB",
  }).format(Number(value || 0));
}

function formatPaymentTime(value) {
  if (!value) return "—";
  // API stores naive UTC timestamps; add Z to interpret correctly.
  const utc = /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`;
  const date = new Date(utc);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("en-GB", { timeZone: THAILAND_TIMEZONE, dateStyle: "medium", timeStyle: "short" });
}

const PAYMENT_METHOD_LABELS = {
  cash_on_delivery: "Cash on Delivery",
  card: "Card",
  promptpay: "PromptPay",
};

export default function AdminPage() {
  const [parcels, setParcels] = useState([]);
  const [users, setUsers] = useState([]);
  const [hubs, setHubs] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  // Admin payment reporting (independent from existing dashboard requests).
  const [paymentDate, setPaymentDate] = useState(thailandToday);
  const [paymentReport, setPaymentReport] = useState(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [paymentSearch, setPaymentSearch] = useState("");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("all");

  // Parcel filters
  const [parcelSearch, setParcelSearch] = useState("");
  const [parcelStatus, setParcelStatus] = useState("all");
  // User filters
  const [userSearch, setUserSearch] = useState("");
  const [userRole, setUserRole] = useState("all");
  // New hub form
  const [hubForm, setHubForm] = useState({
    name: "",
    address: "",
    latitude: "",
    longitude: "",
  });
  const [hubMessage, setHubMessage] = useState("");
  // New staff account form
  const [staffForm, setStaffForm] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    role: "courier",
  });
  const [staffMessage, setStaffMessage] = useState("");
  const refresh = async () => {
    setRefreshing(true);
    setError("");
    try {
      const [parcelData, userData, hubData] = await Promise.all([
        api.myParcels(),
        api.listUsers(),
        api.listHubs(),
      ]);
      setParcels(parcelData);
      setUsers(userData);
      setHubs(hubData);
    } catch (err) {
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  };
  useEffect(() => {
    refresh();
  }, []);

  const refreshPaymentReport = async (dateToLoad = paymentDate) => {
    setPaymentLoading(true);
    setPaymentError("");
    try {
      const report = await api.adminPaymentReport(dateToLoad);
      setPaymentReport(report);
    } catch (err) {
      setPaymentError(err.message || "Unable to load payment report");
    } finally {
      setPaymentLoading(false);
    }
  };

  useEffect(() => {
    refreshPaymentReport(paymentDate);
  }, [paymentDate]);

  const filteredPayments = useMemo(() => {
    const search = paymentSearch.trim().toLowerCase();
    return (paymentReport?.payments || []).filter((payment) => {
      const matchesMethod = paymentMethodFilter === "all" || payment.payment_method === paymentMethodFilter;
      const matchesStatus = paymentStatusFilter === "all" || payment.payment_status === paymentStatusFilter;
      const matchesSearch = !search || [
        payment.tracking_number,
        payment.payment_id,
        payment.parcel_id,
        payment.collected_by_name,
      ].filter((value) => value != null).join(" ").toLowerCase().includes(search);
      return matchesMethod && matchesStatus && matchesSearch;
    });
  }, [paymentReport, paymentSearch, paymentMethodFilter, paymentStatusFilter]);

  // ---------------------------------------------------------
  // Statistics
  // ---------------------------------------------------------
  const stats = useMemo(() => {
    return {
      totalParcels: parcels.length,
      delivered: parcels.filter(
        (p) => p.current_status === "delivered"
      ).length,
      failed: parcels.filter(
        (p) => p.current_status === "failed"
      ).length,
      active: parcels.filter(
        (p) =>
          !["delivered", "failed", "cancelled"].includes(p.current_status)
      ).length,
      customers: users.filter(
        (u) => u.role === "customer"
      ).length,
      couriers: users.filter(
        (u) => u.role === "courier"
      ).length,
      hubStaff: users.filter(
        (u) => u.role === "hub_staff"
      ).length,
      admins: users.filter(
        (u) => u.role === "admin"
      ).length,
      hubs: hubs.length,
    };
  }, [parcels, users, hubs]);
  const parcelStatusStats = useMemo(() => {
    const result = {};
    PARCEL_STATUSES.forEach((status) => {
      result[status] = parcels.filter(
        (p) => p.current_status === status
      ).length;
    });
    return result;
  }, [parcels]);
  // ---------------------------------------------------------
  // Filtered parcels
  // ---------------------------------------------------------
  const filteredParcels = useMemo(() => {
    const search = parcelSearch.trim().toLowerCase();
    return parcels.filter((parcel) => {
      const matchesStatus =
        parcelStatus === "all" ||
        parcel.current_status === parcelStatus;
      if (!search) {
        return matchesStatus;
      }
      const searchableText = [
        parcel.tracking_number,
        parcel.receiver_name,
        parcel.receiver_phone,
        parcel.receiver_address,
        parcel.package_type,
        parcel.service_level,
        parcel.assigned_courier_id,
        parcel.current_hub_id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return matchesStatus && searchableText.includes(search);
    });
  }, [parcels, parcelSearch, parcelStatus]);
  // ---------------------------------------------------------
  // Filtered users
  // ---------------------------------------------------------
  const filteredUsers = useMemo(() => {
    const search = userSearch.trim().toLowerCase();
    return users.filter((user) => {
      const matchesRole =
        userRole === "all" || user.role === userRole;
      if (!search) {
        return matchesRole;
      }
      const searchableText = [
        user.name,
        user.email,
        user.phone,
        user.role,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return matchesRole && searchableText.includes(search);
    });
  }, [users, userSearch, userRole]);
  // ---------------------------------------------------------
  // Create staff account
  // ---------------------------------------------------------
  const handleCreateStaff = async (e) => {
    e.preventDefault();
    setStaffMessage("");
    setError("");
    try {
      await api.createStaff(staffForm);
      setStaffMessage(
        `${ROLE_LABELS[staffForm.role]?.replace(
          "s",
          ""
        ) || staffForm.role} account created for ${staffForm.email}.`
      );
      setStaffForm({
        name: "",
        email: "",
        password: "",
        phone: "",
        role: "courier",
      });
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  };
  // ---------------------------------------------------------
  // Create hub
  // ---------------------------------------------------------
  const handleCreateHub = async (e) => {
    e.preventDefault();
    setHubMessage("");
    setError("");
    try {
      await api.createHub({
        name: hubForm.name,
        address: hubForm.address,
        latitude: parseFloat(hubForm.latitude),
        longitude: parseFloat(hubForm.longitude),
      });
      setHubMessage("Hub created successfully.");
      setHubForm({
        name: "",
        address: "",
        latitude: "",
        longitude: "",
      });
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  };
  // ---------------------------------------------------------
  // Helper
  // ---------------------------------------------------------
  const getHubName = (hubId) => {
    if (!hubId) return "—";
    const hub = hubs.find((h) => h.id === hubId);
    return hub ? hub.name : `Hub #${hubId}`;
  };
  return (
    <Layout>
      <div className="admin-page">
        {/* ================================================= */}
        {/* Header */}
        {/* ================================================= */}
        <div className="admin-header">
          <div>
            <div className="admin-eyebrow">
              PLATFORM ADMINISTRATION
            </div>
            <h1 className="admin-title">
              Admin Control Center
            </h1>
            <p className="admin-subtitle">
              Manage users, parcels, couriers, hubs, and
              overall platform operations.
            </p>
          </div>
          <button
            className="btn btn-secondary admin-refresh-btn"
            onClick={refresh}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing..." : "↻ Refresh"}
          </button>
        </div>
        {/* ================================================= */}
        {/* Alerts */}
        {/* ================================================= */}
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
        {/* ================================================= */}
        {/* Main Statistics */}
        {/* ================================================= */}
        <section className="admin-section">
          <div className="admin-stats-grid">
            <div className="admin-stat-card">
              <div className="admin-stat-icon">
                📦
              </div>
              <div>
                <div className="admin-stat-value">
                  {stats.totalParcels}
                </div>
                <div className="admin-stat-label">
                  Total Parcels
                </div>
              </div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-icon">
                👥
              </div>
              <div>
                <div className="admin-stat-value">
                  {users.length}
                </div>
                <div className="admin-stat-label">
                  Total Users
                </div>
              </div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-icon">
                🚚
              </div>
              <div>
                <div className="admin-stat-value">
                  {stats.couriers}
                </div>
                <div className="admin-stat-label">
                  Couriers
                </div>
              </div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-icon">
                🏢
              </div>
              <div>
                <div className="admin-stat-value">
                  {stats.hubs}
                </div>
                <div className="admin-stat-label">
                  Hubs
                </div>
              </div>
            </div>
          </div>
        </section>
        {/* ================================================= */}
        {/* Payment Management */}
        {/* ================================================= */}
        <section className="admin-section">
          <div className="admin-section-heading">
            <div>
              <h2>Payment Management</h2>
              <p>Successful payments for the selected Thailand date, courier cash collections, and current outstanding COD.</p>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => refreshPaymentReport()}
              disabled={paymentLoading}
            >
              {paymentLoading ? "Loading..." : "↻ Refresh payments"}
            </button>
          </div>

          <div className="admin-filter-bar">
            <label className="field" style={{ marginBottom: 0 }}>
              <span>Report date (Thailand)</span>
              <input
                type="date"
                className="admin-search"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value || thailandToday())}
              />
            </label>
            <button type="button" className="btn btn-secondary" onClick={() => setPaymentDate(thailandToday())}>
              Today
            </button>
          </div>

          {paymentError && <div className="error-banner">{paymentError}</div>}
          {paymentLoading && !paymentReport && <div className="admin-card"><div className="empty-state">Loading payment report...</div></div>}

          {paymentReport && (
            <>
              <div className="admin-stats-grid" style={{ marginBottom: 20 }}>
                <div className="admin-stat-card">
                  <div className="admin-stat-icon">💵</div>
                  <div>
                    <div className="admin-stat-value">{formatBaht(paymentReport.summary.cod_collected_amount)}</div>
                    <div className="admin-stat-label">COD collected · {paymentReport.summary.cod_collection_count} payments</div>
                  </div>
                </div>
                <div className="admin-stat-card">
                  <div className="admin-stat-icon">💳</div>
                  <div>
                    <div className="admin-stat-value">{formatBaht(paymentReport.summary.online_paid_amount)}</div>
                    <div className="admin-stat-label">Online received · {paymentReport.summary.online_paid_count} payments</div>
                  </div>
                </div>
                <div className="admin-stat-card">
                  <div className="admin-stat-icon">💰</div>
                  <div>
                    <div className="admin-stat-value">{formatBaht(paymentReport.summary.cod_collected_amount + paymentReport.summary.online_paid_amount)}</div>
                    <div className="admin-stat-label">Total received on selected date</div>
                  </div>
                </div>
                <div className="admin-stat-card">
                  <div className="admin-stat-icon">⏳</div>
                  <div>
                    <div className="admin-stat-value">{paymentReport.summary.unpaid_cod_count}</div>
                    <div className="admin-stat-label">Currently unpaid COD · all dates</div>
                  </div>
                </div>
              </div>

              <div className="admin-card" style={{ marginBottom: 20 }}>
                <div className="admin-card-header">
                  <div>
                    <h2>Cash Collection by Courier</h2>
                    <p>Confirmed COD collections on {paymentReport.summary.date} (Thailand time)</p>
                  </div>
                </div>
                {paymentReport.courier_collections.length === 0 ? (
                  <div className="empty-state">No courier COD collections on this date.</div>
                ) : (
                  <div className="admin-table-wrapper">
                    <table className="table admin-table">
                      <thead><tr><th>Courier</th><th>Collections</th><th>Total Collected</th></tr></thead>
                      <tbody>
                        {paymentReport.courier_collections.map((courier) => (
                          <tr key={courier.courier_user_id}>
                            <td><div className="admin-primary-text">{courier.courier_name}</div><div className="admin-secondary-text">User #{courier.courier_user_id}</div></td>
                            <td>{courier.collection_count}</td>
                            <td>{formatBaht(courier.total_amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="admin-card">
                <div className="admin-card-header">
                  <div>
                    <h2>Payment Records</h2>
                    <p>Paid on {paymentReport.summary.date}, plus currently unpaid COD from all dates.</p>
                  </div>
                  <div className="admin-section-count">{filteredPayments.length} records</div>
                </div>
                <div className="admin-filter-bar">
                  <input
                    className="admin-search"
                    placeholder="Search tracking number, parcel, courier..."
                    value={paymentSearch}
                    onChange={(e) => setPaymentSearch(e.target.value)}
                  />
                  <select className="admin-filter-select" value={paymentMethodFilter} onChange={(e) => setPaymentMethodFilter(e.target.value)}>
                    <option value="all">All methods</option>
                    <option value="cash_on_delivery">Cash on Delivery</option>
                    <option value="card">Card</option>
                    <option value="promptpay">PromptPay</option>
                  </select>
                  <select className="admin-filter-select" value={paymentStatusFilter} onChange={(e) => setPaymentStatusFilter(e.target.value)}>
                    <option value="all">All statuses</option>
                    <option value="paid">Paid</option>
                    <option value="unpaid">Unpaid</option>
                  </select>
                </div>
                {filteredPayments.length === 0 ? (
                  <div className="empty-state">No payments match these filters.</div>
                ) : (
                  <div className="admin-table-wrapper">
                    <table className="table admin-table">
                      <thead>
                        <tr><th>Tracking #</th><th>Method</th><th>Status</th><th>Amount</th><th>Collected By</th><th>Paid At (Thailand)</th></tr>
                      </thead>
                      <tbody>
                        {filteredPayments.map((payment) => (
                          <tr key={payment.payment_id}>
                            <td className="mono">{payment.tracking_number}</td>
                            <td>{PAYMENT_METHOD_LABELS[payment.payment_method] || payment.payment_method}</td>
                            <td><StatusBadge status={payment.payment_status} /></td>
                            <td>{formatBaht(payment.amount)}</td>
                            <td>{payment.collected_by_name || "—"}</td>
                            <td>{formatPaymentTime(payment.paid_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        {/* ================================================= */}
        {/* Parcel Status Overview */}
        {/* ================================================= */}
        <section className="admin-section">
          <div className="admin-section-heading">
            <div>
              <h2>Parcel Status Overview</h2>
              <p>
                Current distribution of parcels across
                the delivery workflow.
              </p>
            </div>
          </div>
          <div className="admin-status-grid">
            {PARCEL_STATUSES.map((status) => (
              <div
                className="admin-status-card"
                key={status}
              >
                <div className="admin-status-number">
                  {parcelStatusStats[status]}
                </div>
                <div className="admin-status-name">
                  {STATUS_LABELS[status]}
                </div>
              </div>
            ))}
          </div>
        </section>
        {/* ================================================= */}
        {/* User Overview */}
        {/* ================================================= */}
        <section className="admin-section">
          <div className="admin-section-heading">
            <div>
              <h2>User Overview</h2>
              <p>
                Breakdown of accounts by platform role.
              </p>
            </div>
          </div>
          <div className="admin-role-grid">
            <div className="admin-role-card">
              <div className="admin-role-icon">
                👤
              </div>
              <div>
                <div className="admin-role-number">
                  {stats.customers}
                </div>
                <div className="admin-role-label">
                  Customers
                </div>
              </div>
            </div>
            <div className="admin-role-card">
              <div className="admin-role-icon">
                🚚
              </div>
              <div>
                <div className="admin-role-number">
                  {stats.couriers}
                </div>
                <div className="admin-role-label">
                  Couriers
                </div>
              </div>
            </div>
            <div className="admin-role-card">
              <div className="admin-role-icon">
                🏢
              </div>
              <div>
                <div className="admin-role-number">
                  {stats.hubStaff}
                </div>
                <div className="admin-role-label">
                  Hub Staff
                </div>
              </div>
            </div>
            <div className="admin-role-card">
              <div className="admin-role-icon">
                🛡️
              </div>
              <div>
                <div className="admin-role-number">
                  {stats.admins}
                </div>
                <div className="admin-role-label">
                  Admins
                </div>
              </div>
            </div>
          </div>
        </section>
        {/* ================================================= */}
        {/* Parcels */}
        {/* ================================================= */}
        <section className="admin-section">
          <div className="admin-section-heading">
            <div>
              <h2>Parcel Management</h2>
              <p>
                View and search all parcels in the system.
              </p>
            </div>
            <div className="admin-section-count">
              {filteredParcels.length} parcels
            </div>
          </div>
          <div className="admin-filter-bar">
            <input
              className="admin-search"
              placeholder="Search tracking number, receiver, service..."
              value={parcelSearch}
              onChange={(e) =>
                setParcelSearch(e.target.value)
              }
            />
            <select
              className="admin-filter-select"
              value={parcelStatus}
              onChange={(e) =>
                setParcelStatus(e.target.value)
              }
            >
              <option value="all">
                All statuses
              </option>
              {PARCEL_STATUSES.map((status) => (
                <option
                  key={status}
                  value={status}
                >
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>
          <div className="admin-card">
            {filteredParcels.length === 0 ? (
              <div className="empty-state">
                No parcels match the current filters.
              </div>
            ) : (
              <div className="admin-table-wrapper">
                <table className="table admin-table">
                  <thead>
                    <tr>
                      <th>Tracking #</th>
                      <th>Receiver</th>
                      <th>Service</th>
                      <th>Status</th>
                      <th>Courier</th>
                      <th>Hub</th>
                      <th>Fee</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredParcels.map((parcel) => (
                      <tr key={parcel.id}>
                        <td className="mono">
                          {parcel.tracking_number}
                        </td>
                        <td>
                          <div className="admin-primary-text">
                            {parcel.receiver_name}
                          </div>
                          <div className="admin-secondary-text">
                            {parcel.receiver_phone}
                          </div>
                        </td>
                        <td>
                          <span className="admin-service-badge">
                            {parcel.service_level}
                          </span>
                        </td>
                        <td>
                          <StatusBadge
                            status={parcel.current_status}
                          />
                        </td>
                        <td>
                          {parcel.assigned_courier_id
                            ? `#${parcel.assigned_courier_id}`
                            : "Unassigned"}
                        </td>
                        <td>
                          {getHubName(
                            parcel.current_hub_id
                          )}
                        </td>
                        <td>
                          {parcel.estimated_fee != null
                            ? `฿${Number(
                                parcel.estimated_fee
                              ).toFixed(2)}`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
        {/* ================================================= */}
        {/* Users */}
        {/* ================================================= */}
        <section className="admin-section">
          <div className="admin-section-heading">
            <div>
              <h2>User Management</h2>
              <p>
                View registered customers and staff accounts.
              </p>
            </div>
            <div className="admin-section-count">
              {filteredUsers.length} users
            </div>
          </div>
          <div className="admin-filter-bar">
            <input
              className="admin-search"
              placeholder="Search name, email, phone..."
              value={userSearch}
              onChange={(e) =>
                setUserSearch(e.target.value)
              }
            />
            <select
              className="admin-filter-select"
              value={userRole}
              onChange={(e) =>
                setUserRole(e.target.value)
              }
            >
              <option value="all">
                All roles
              </option>
              <option value="customer">
                Customer
              </option>
              <option value="courier">
                Courier
              </option>
              <option value="hub_staff">
                Hub Staff
              </option>
              <option value="admin">
                Admin
              </option>
            </select>
          </div>
          <div className="admin-card">
            {filteredUsers.length === 0 ? (
              <div className="empty-state">
                No users match the current filters.
              </div>
            ) : (
              <div className="admin-table-wrapper">
                <table className="table admin-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>Role</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => (
                      <tr key={user.id}>
                        <td>
                          <div className="admin-primary-text">
                            {user.name}
                          </div>
                          <div className="admin-secondary-text">
                            User #{user.id}
                          </div>
                        </td>
                        <td>
                          {user.email}
                        </td>
                        <td>
                          {user.phone || "—"}
                        </td>
                        <td>
                          <span className="role-badge">
                            {user.role}
                          </span>
                        </td>
                        <td>
                          {user.created_at
                            ? new Date(
                                user.created_at
                              ).toLocaleDateString()
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
        {/* ================================================= */}
        {/* Staff + Hub Management */}
        {/* ================================================= */}
        <section className="admin-management-grid">
          {/* Staff */}
          <div className="admin-card admin-management-card">
            <div className="admin-card-header">
              <div>
                <h2>
                  Staff Management
                </h2>
                <p>
                  Create courier, hub staff, or admin
                  accounts.
                </p>
              </div>
              <div className="admin-card-icon">
                👥
              </div>
            </div>
            {staffMessage && (
              <div className="success-banner">
                {staffMessage}
              </div>
            )}
            <form onSubmit={handleCreateStaff}>
              <div className="grid-2">
                <div className="field">
                  <label>
                    Full name
                  </label>
                  <input
                    value={staffForm.name}
                    onChange={(e) =>
                      setStaffForm((f) => ({
                        ...f,
                        name: e.target.value,
                      }))
                    }
                    required
                  />
                </div>
                <div className="field">
                  <label>
                    Email
                  </label>
                  <input
                    type="email"
                    value={staffForm.email}
                    onChange={(e) =>
                      setStaffForm((f) => ({
                        ...f,
                        email: e.target.value,
                      }))
                    }
                    required
                  />
                </div>
              </div>
              <div className="grid-2">
                <div className="field">
                  <label>
                    Temporary password
                  </label>
                  <input
                    type="password"
                    value={staffForm.password}
                    onChange={(e) =>
                      setStaffForm((f) => ({
                        ...f,
                        password: e.target.value,
                      }))
                    }
                    minLength={6}
                    required
                  />
                </div>
                <div className="field">
                  <label>
                    Phone
                  </label>
                  <input
                    value={staffForm.phone}
                    onChange={(e) =>
                      setStaffForm((f) => ({
                        ...f,
                        phone: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
              <div className="field">
                <label>
                  Role
                </label>
                <select
                  value={staffForm.role}
                  onChange={(e) =>
                    setStaffForm((f) => ({
                      ...f,
                      role: e.target.value,
                    }))
                  }
                >
                  <option value="courier">
                    Courier
                  </option>
                  <option value="hub_staff">
                    Hub Staff
                  </option>
                  <option value="admin">
                    Admin
                  </option>
                </select>
              </div>
              <button
                className="btn btn-primary"
                type="submit"
              >
                Create Staff Account
              </button>
            </form>
          </div>
          {/* Hub */}
          <div className="admin-card admin-management-card">
            <div className="admin-card-header">
              <div>
                <h2>
                  Hub Management
                </h2>
                <p>
                  Create and view delivery hubs.
                </p>
              </div>
              <div className="admin-card-icon">
                🏢
              </div>
            </div>
            {hubMessage && (
              <div className="success-banner">
                {hubMessage}
              </div>
            )}
            <form onSubmit={handleCreateHub}>
              <div className="field">
                <label>
                  Hub name
                </label>
                <input
                  value={hubForm.name}
                  onChange={(e) =>
                    setHubForm((f) => ({
                      ...f,
                      name: e.target.value,
                    }))
                  }
                  placeholder="Bangkok Central Hub"
                  required
                />
              </div>
              <div className="field">
                <label>
                  Address
                </label>
                <input
                  value={hubForm.address}
                  onChange={(e) =>
                    setHubForm((f) => ({
                      ...f,
                      address: e.target.value,
                    }))
                  }
                  placeholder="Bangkok, Thailand"
                />
              </div>
              <div className="grid-2">
                <div className="field">
                  <label>
                    Latitude
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={hubForm.latitude}
                    onChange={(e) =>
                      setHubForm((f) => ({
                        ...f,
                        latitude: e.target.value,
                      }))
                    }
                    placeholder="13.7563"
                    required
                  />
                </div>
                <div className="field">
                  <label>
                    Longitude
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={hubForm.longitude}
                    onChange={(e) =>
                      setHubForm((f) => ({
                        ...f,
                        longitude: e.target.value,
                      }))
                    }
                    placeholder="100.5018"
                    required
                  />
                </div>
              </div>
              <button
                className="btn btn-primary"
                type="submit"
              >
                Create Hub
              </button>
            </form>
            {/* Existing hubs */}
            <div className="admin-existing-hubs">
              <div className="admin-existing-title">
                Existing Hubs
              </div>
              {hubs.length === 0 ? (
                <div className="empty-state">
                  No hubs created yet.
                </div>
              ) : (
                <div className="admin-hub-list">
                  {hubs.map((hub) => (
                    <div
                      className="admin-hub-item"
                      key={hub.id}
                    >
                      <div className="admin-hub-marker">
                        🏢
                      </div>
                      <div className="admin-hub-info">
                        <div className="admin-primary-text">
                          {hub.name}
                        </div>
                        <div className="admin-secondary-text">
                          {hub.address || "No address"}
                        </div>
                      </div>
                      <div className="admin-hub-id">
                        #{hub.id}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
}