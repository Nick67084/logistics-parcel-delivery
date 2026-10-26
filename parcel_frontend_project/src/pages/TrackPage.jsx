import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Layout from "../components/Layout";
import StatusBadge from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";

// Simple page frame for visitors who are not logged in.
function PublicShell({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: "#f6f8fb" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "16px 24px",
        }}
      >
        <Link
          to="/login"
          style={{ fontWeight: 800, fontSize: 22, color: "#0b3a5c", textDecoration: "none" }}
        >
          SwiftDrop
        </Link>
        <Link to="/login" className="btn btn-primary">
          Sign in
        </Link>
      </header>
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "8px 20px 40px" }}>
        {children}
      </main>
    </div>
  );
}

export default function TrackPage() {
  const { user, loading } = useAuth();
  const { trackingNumber: urlNumber } = useParams();
  const navigate = useNavigate();

  const [input, setInput] = useState(urlNumber || "");
  const [parcel, setParcel] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Look the parcel up whenever the tracking number in the URL changes.
  useEffect(() => {
    if (!urlNumber) {
      setParcel(null);
      setError("");
      return;
    }

    let cancelled = false;
    setBusy(true);
    setError("");
    setParcel(null);

    api
      .trackParcel(urlNumber)
      .then((result) => {
        if (!cancelled) setParcel(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [urlNumber]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const value = input.trim().toUpperCase();
    if (value) navigate(`/track/${encodeURIComponent(value)}`);
  };

  if (loading) return null;

  const content = (
    <>
      <h1 className="page-title">Track a Parcel</h1>
      <p className="page-subtitle">
        Enter your tracking number to see where your parcel is. No login required.
      </p>

      <div className="card">
        <form onSubmit={handleSubmit} style={{ display: "flex", gap: 10 }}>
          <input
            placeholder="e.g. PCL-AB12CD34EF"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            style={{
              flex: 1,
              padding: "9px 11px",
              border: "1px solid var(--border)",
              borderRadius: 8,
            }}
            required
          />
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Searching..." : "Track"}
          </button>
        </form>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {parcel && (
        <div className="card">
          <h2 className="card-title">
            {parcel.tracking_number} — <StatusBadge status={parcel.current_status} />
          </h2>
          <p>
            <strong>Receiver:</strong> {parcel.receiver_name_masked}
          </p>
          <p>
            <strong>Service:</strong> {parcel.service_level}
          </p>

          <h3 style={{ fontSize: 14, marginTop: 20 }}>Status Timeline</h3>
          <ul className="timeline">
            {parcel.status_history.map((h, i) => (
              <li className="timeline-item" key={i}>
                <span className="timeline-dot" />
                <StatusBadge status={h.status} />
                <div className="timeline-time">
                  {new Date(h.timestamp + "Z").toLocaleString()}
                </div>
              </li>
            ))}
          </ul>

          <p style={{ fontSize: 12, opacity: 0.7, marginTop: 16 }}>
            For privacy, addresses and contact details are hidden on this page.
          </p>
        </div>
      )}
    </>
  );

  return user ? <Layout>{content}</Layout> : <PublicShell>{content}</PublicShell>;
}