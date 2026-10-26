import { useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

const MANAGEABLE = ["created", "assigned"];

const WINDOWS = [
  "Morning (9:00 - 12:00)",
  "Afternoon (12:00 - 17:00)",
  "Evening (17:00 - 20:00)",
];

function localToday() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function ParcelManageActions({ parcel, onChanged }) {
  const { user } = useAuth();

  const [panel, setPanel] = useState(null); // "reschedule" | "cancel" | null
  const [date, setDate] = useState(parcel.pickup_date || "");
  const [windowValue, setWindowValue] = useState(
    parcel.pickup_window || WINDOWS[0]
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const isOwner =
    user && (user.role === "admin" || parcel.sender_id === user.id);

  if (!isOwner) return null;

  if (parcel.current_status === "cancelled") {
    return (
      <div className="card" style={{ marginBottom: 16 }}>
        <strong>This shipment was cancelled.</strong>
      </div>
    );
  }

  if (!MANAGEABLE.includes(parcel.current_status)) return null;

  const run = async (action, successMessage) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(successMessage);
      setPanel(null);
      onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleReschedule = (e) => {
    e.preventDefault();
    run(
      () =>
        api.rescheduleParcel(parcel.id, {
          pickup_date: date,
          pickup_window: windowValue,
        }),
      "Pickup rescheduled."
    );
  };

  const handleCancel = () =>
    run(
      () => api.cancelParcel(parcel.id, reason.trim() || null),
      "Shipment cancelled."
    );

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>Manage shipment</h3>
      <p style={{ opacity: 0.75, marginTop: 4 }}>
        You can change or cancel this shipment until the courier picks it up.
      </p>

      {error && <div className="error-banner">{error}</div>}
      {notice && <p style={{ color: "#15803d" }}>{notice}</p>}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setPanel(panel === "reschedule" ? null : "reschedule")}
        >
          Reschedule pickup
        </button>
        <button
          type="button"
          className="btn"
          style={{
            color: "#b91c1c",
            border: "1px solid #b91c1c",
            background: "transparent",
          }}
          onClick={() => setPanel(panel === "cancel" ? null : "cancel")}
        >
          Cancel shipment
        </button>
      </div>

      {panel === "reschedule" && (
        <form
          onSubmit={handleReschedule}
          style={{ marginTop: 14, display: "grid", gap: 10, maxWidth: 360 }}
        >
          <label>
            New pickup date
            <input
              type="date"
              min={localToday()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              style={{ display: "block", width: "100%", padding: "8px 10px" }}
            />
          </label>
          <label>
            Time window
            <select
              value={windowValue}
              onChange={(e) => setWindowValue(e.target.value)}
              style={{ display: "block", width: "100%", padding: "8px 10px" }}
            >
              {WINDOWS.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Saving..." : "Save new pickup time"}
          </button>
        </form>
      )}

      {panel === "cancel" && (
        <div style={{ marginTop: 14, display: "grid", gap: 10, maxWidth: 360 }}>
          <label>
            Reason (optional)
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Sent by mistake"
              style={{ display: "block", width: "100%", padding: "8px 10px" }}
            />
          </label>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={handleCancel}
            style={{ background: "#b91c1c", color: "#fff" }}
          >
            {busy ? "Cancelling..." : "Yes, cancel this shipment"}
          </button>
        </div>
      )}
    </div>
  );
}