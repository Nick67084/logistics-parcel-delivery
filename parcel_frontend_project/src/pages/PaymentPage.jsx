import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import Layout from "../components/Layout";
import { api } from "../api/client";

const ONLINE_METHODS = [
  {
    value: "promptpay",
    title: "PromptPay / QR",
    description: "Use the demo QR payment screen.",
    icon: "▦",
  },
  {
    value: "card",
    title: "Credit / Debit Card",
    description: "Use a simulated card payment.",
    icon: "▣",
  },
];

function formatMoney(value) {
  return Number(value || 0).toFixed(2);
}

function formatDateTime(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatCountdown(milliseconds) {
  if (milliseconds <= 0) return "00:00:00";

  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function FakeQrCode({ value }) {
  const cells = useMemo(() => {
    const size = 21;
    const result = [];

    let seed = 0;
    for (const char of value) {
      seed = (seed * 31 + char.charCodeAt(0)) >>> 0;
    }

    const finder = (row, col, top, left) => {
      const r = row - top;
      const c = col - left;

      if (r < 0 || r > 6 || c < 0 || c > 6) return null;

      return (
        r === 0 ||
        r === 6 ||
        c === 0 ||
        c === 6 ||
        (r >= 2 && r <= 4 && c >= 2 && c <= 4)
      );
    };

    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        let dark = null;

        dark = finder(row, col, 0, 0);
        if (dark === null) dark = finder(row, col, 0, 14);
        if (dark === null) dark = finder(row, col, 14, 0);

        if (dark === null) {
          const index = row * size + col;
          const mixed =
            (seed ^ Math.imul(index + 17, 2654435761)) >>> 0;
          dark = mixed % 7 < 3;
        }

        result.push(dark);
      }
    }

    return result;
  }, [value]);

  return (
    <div
      aria-label="Demo payment QR code"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(21, 1fr)",
        width: 210,
        height: 210,
        padding: 12,
        background: "#ffffff",
        border: "1px solid #d9dee8",
        borderRadius: 16,
        boxShadow: "0 12px 30px rgba(15, 23, 42, 0.10)",
      }}
    >
      {cells.map((dark, index) => (
        <span
          key={index}
          style={{
            background: dark ? "#111827" : "#ffffff",
          }}
        />
      ))}
    </div>
  );
}

function PaymentReceipt({ parcel, payment }) {
  const isCod = payment.payment_method === "cash_on_delivery";

  return (
    <section
      style={{
        maxWidth: 760,
        margin: "0 auto",
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: 24,
        padding: 32,
        boxShadow: "0 18px 50px rgba(15, 23, 42, 0.08)",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div
          style={{
            width: 58,
            height: 58,
            margin: "0 auto 14px",
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            background: "#dcfce7",
            color: "#15803d",
            fontSize: 28,
            fontWeight: 800,
          }}
        >
          ✓
        </div>

        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: "0.14em",
            color: "#64748b",
          }}
        >
          FINAL RECEIPT
        </div>

        <h1 style={{ margin: "8px 0 6px", fontSize: 30 }}>
          Payment received
        </h1>

        <p style={{ margin: 0, color: "#64748b" }}>
          Your SwiftDrop booking is confirmed and the payment is recorded.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: 14,
          marginBottom: 24,
        }}
      >
        <ReceiptItem label="Tracking number" value={parcel.tracking_number} />
        <ReceiptItem label="Payment reference" value={payment.transaction_reference} />
        <ReceiptItem label="Payment method" value={isCod ? "Cash on Delivery" : payment.payment_method === "promptpay" ? "PromptPay / QR" : "Credit / Debit Card"} />
        <ReceiptItem label="Paid at" value={formatDateTime(payment.paid_at)} />
      </div>

      <div
        style={{
          padding: 22,
          borderRadius: 18,
          background: "#f8fafc",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 20,
        }}
      >
        <div>
          <div style={{ color: "#64748b", fontSize: 13 }}>Delivery fee</div>
          <div style={{ marginTop: 4, fontSize: 28, fontWeight: 800 }}>
            ฿{formatMoney(payment.amount)}
          </div>
        </div>

        <div
          style={{
            padding: "8px 14px",
            borderRadius: 999,
            background: "#dcfce7",
            color: "#166534",
            fontWeight: 800,
            fontSize: 13,
          }}
        >
          PAID
        </div>
      </div>
    </section>
  );
}

function ReceiptItem({ label, value }) {
  return (
    <div
      style={{
        padding: 16,
        border: "1px solid #e5e7eb",
        borderRadius: 14,
      }}
    >
      <div style={{ color: "#64748b", fontSize: 12 }}>{label}</div>
      <strong style={{ display: "block", marginTop: 5, wordBreak: "break-word" }}>
        {value || "—"}
      </strong>
    </div>
  );
}

export default function PaymentPage() {
  const { parcelId } = useParams();
  const navigate = useNavigate();

  const [parcel, setParcel] = useState(null);
  const [payment, setPayment] = useState(null);
  const [selectedMethod, setSelectedMethod] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      const parcelData = await api.getParcel(parcelId);
      setParcel(parcelData);

      try {
        const paymentData = await api.getPayment(parcelId);
        setPayment(paymentData);
      } catch (paymentError) {
        if (!paymentError.message.toLowerCase().includes("not been selected")) {
          throw paymentError;
        }
        setPayment(null);
      }

      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [parcelId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!payment || payment.payment_status !== "pending") return undefined;

    const timer = window.setInterval(() => {
      load();
    }, 5000);

    return () => window.clearInterval(timer);
  }, [payment, load]);

  const startOnlinePayment = async (method) => {
    setBusy(true);
    setError("");

    try {
      const data = await api.startPayment(parcelId, method);
      setPayment(data);
      setSelectedMethod(method);
    } catch (e) {
      setError(e.message);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const startCod = async () => {
    setBusy(true);
    setError("");

    try {
      const data = await api.startPayment(parcelId, "cash_on_delivery");
      setPayment(data);
    } catch (e) {
      setError(e.message);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const completeOnlinePayment = async () => {
    setBusy(true);
    setError("");

    try {
      const data = await api.completeOnlinePayment(parcelId);
      setPayment(data);
      await load();
    } catch (e) {
      setError(e.message);
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (loading || !parcel) {
    return (
      <Layout>
        <div style={{ maxWidth: 900, margin: "80px auto", padding: 24, textAlign: "center" }}>
          {error ? <p>{error}</p> : <p>Loading payment information...</p>}
        </div>
      </Layout>
    );
  }

  const deadline = payment?.expires_at ? new Date(payment.expires_at).getTime() : null;
  const remaining = deadline ? deadline - now : 0;
  const expired = payment?.payment_status === "expired" || (payment?.payment_status === "pending" && remaining <= 0);
  const paid = payment?.payment_status === "paid";
  const codUnpaid = payment?.payment_method === "cash_on_delivery" && payment?.payment_status === "unpaid";

  return (
    <Layout>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "34px 20px 80px" }}>
        <div style={{ marginBottom: 26 }}>
          <div style={{ color: "#64748b", fontSize: 12, fontWeight: 800, letterSpacing: "0.14em" }}>
            SWIFTDROP PAYMENT
          </div>
          <h1 style={{ margin: "8px 0 6px", fontSize: 34 }}>Complete your booking</h1>
          <p style={{ margin: 0, color: "#64748b" }}>
            Tracking number: <strong>{parcel.tracking_number}</strong>
          </p>
        </div>

        {error && (
          <div className="error-banner" style={{ marginBottom: 20 }}>
            {error}
          </div>
        )}

        {!payment && (
          <section
            style={{
              background: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: 24,
              padding: 28,
              boxShadow: "0 18px 50px rgba(15, 23, 42, 0.07)",
            }}
          >
            <div style={{ marginBottom: 22 }}>
              <div style={{ color: "#64748b", fontSize: 13 }}>DELIVERY FEE</div>
              <div style={{ fontSize: 34, fontWeight: 800, marginTop: 4 }}>
                ฿{formatMoney(parcel.estimated_fee)}
              </div>
            </div>

            <h2 style={{ marginBottom: 8 }}>Choose payment method</h2>
            <p style={{ color: "#64748b", marginTop: 0 }}>
              Online payment must be completed within one hour of booking.
              Cash on delivery is paid to the courier at delivery.
            </p>

            <div style={{ display: "grid", gap: 14, marginTop: 24 }}>
              {ONLINE_METHODS.map((method) => (
                <button
                  key={method.value}
                  type="button"
                  disabled={busy}
                  onClick={() => startOnlinePayment(method.value)}
                  style={{
                    textAlign: "left",
                    border: "1px solid #dbe2ea",
                    background: "#ffffff",
                    borderRadius: 18,
                    padding: 18,
                    cursor: busy ? "wait" : "pointer",
                  }}
                >
                  <strong style={{ display: "block", fontSize: 16 }}>
                    {method.icon} {method.title}
                  </strong>
                  <span style={{ display: "block", marginTop: 5, color: "#64748b" }}>
                    {method.description}
                  </span>
                </button>
              ))}

              <button
                type="button"
                disabled={busy}
                onClick={startCod}
                style={{
                  textAlign: "left",
                  border: "1px solid #dbe2ea",
                  background: "#f8fafc",
                  borderRadius: 18,
                  padding: 18,
                  cursor: busy ? "wait" : "pointer",
                }}
              >
                <strong style={{ display: "block", fontSize: 16 }}>▣ Cash on Delivery</strong>
                <span style={{ display: "block", marginTop: 5, color: "#64748b" }}>
                  Get an unpaid voucher now and pay the courier when the parcel is delivered.
                </span>
              </button>
            </div>
          </section>
        )}

        {payment && paid && (
          <>
            <PaymentReceipt parcel={parcel} payment={payment} />
            <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 22, flexWrap: "wrap" }}>
              <button className="btn btn-primary" type="button" onClick={() => window.print()}>
                Print Receipt
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => navigate(`/parcels/${parcel.id}`)}>
                View Parcel
              </button>
            </div>
          </>
        )}

        {payment && codUnpaid && (
          <section
            style={{
              maxWidth: 760,
              margin: "0 auto",
              background: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: 24,
              padding: 32,
              boxShadow: "0 18px 50px rgba(15, 23, 42, 0.07)",
            }}
          >
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div style={{ color: "#64748b", fontSize: 12, fontWeight: 800, letterSpacing: "0.14em" }}>
                UNPAID DELIVERY VOUCHER
              </div>
              <h2 style={{ margin: "8px 0" }}>Cash on Delivery</h2>
              <p style={{ color: "#64748b" }}>
                The booking is confirmed. The courier will collect the cash at delivery.
              </p>
            </div>

            <div style={{ padding: 22, background: "#fff7ed", borderRadius: 18, marginBottom: 18 }}>
              <div style={{ color: "#9a3412", fontSize: 13 }}>AMOUNT TO COLLECT</div>
              <strong style={{ display: "block", marginTop: 4, fontSize: 34 }}>
                ฿{formatMoney(payment.amount)}
              </strong>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <ReceiptItem label="Tracking number" value={parcel.tracking_number} />
              <ReceiptItem label="Payment status" value="UNPAID — CASH TO COURIER" />
            </div>

            <div style={{ display: "flex", justifyContent: "center", marginTop: 22 }}>
              <button className="btn btn-primary" type="button" onClick={() => navigate(`/parcels/${parcel.id}`)}>
                View Parcel
              </button>
            </div>
          </section>
        )}

        {payment && !paid && !codUnpaid && !expired && payment.payment_method === "promptpay" && (
          <section
            style={{
              maxWidth: 760,
              margin: "0 auto",
              background: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: 24,
              padding: 32,
              textAlign: "center",
              boxShadow: "0 18px 50px rgba(15, 23, 42, 0.07)",
            }}
          >
            <div style={{ color: "#64748b", fontSize: 12, fontWeight: 800, letterSpacing: "0.14em" }}>
              DEMO PROMPTPAY
            </div>
            <h2 style={{ margin: "8px 0" }}>Scan the demo QR</h2>
            <p style={{ color: "#64748b" }}>
              This QR is simulated for the university demonstration. No real money is transferred.
            </p>

            <div style={{ display: "flex", justifyContent: "center", margin: "24px 0" }}>
              <FakeQrCode value={`${parcel.tracking_number}-${payment.amount}`} />
            </div>

            <div style={{ fontSize: 30, fontWeight: 800, marginBottom: 6 }}>
              ฿{formatMoney(payment.amount)}
            </div>

            <div style={{ color: "#64748b", marginBottom: 20 }}>
              Time remaining: <strong>{formatCountdown(remaining)}</strong>
            </div>

            <button className="btn btn-primary" type="button" disabled={busy} onClick={completeOnlinePayment}>
              {busy ? "Processing..." : "I've Completed Payment"}
            </button>
          </section>
        )}

        {payment && !paid && !codUnpaid && !expired && payment.payment_method === "card" && (
          <section
            style={{
              maxWidth: 760,
              margin: "0 auto",
              background: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: 24,
              padding: 32,
              boxShadow: "0 18px 50px rgba(15, 23, 42, 0.07)",
            }}
          >
            <div style={{ color: "#64748b", fontSize: 12, fontWeight: 800, letterSpacing: "0.14em" }}>
              DEMO CARD PAYMENT
            </div>
            <h2 style={{ margin: "8px 0" }}>Secure test checkout</h2>
            <p style={{ color: "#64748b" }}>
              This is a simulated card payment for the university demonstration. No real card data is processed.
            </p>

            <div style={{ display: "grid", gap: 14, maxWidth: 500, margin: "24px auto" }}>
              <input placeholder="Cardholder name" />
              <input placeholder="Test card number" value="4242 4242 4242 4242" readOnly />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <input placeholder="MM / YY" value="12 / 30" readOnly />
                <input placeholder="CVC" value="123" readOnly />
              </div>
            </div>

            <div style={{ textAlign: "center", color: "#64748b", marginBottom: 20 }}>
              Time remaining: <strong>{formatCountdown(remaining)}</strong>
            </div>

            <div style={{ textAlign: "center" }}>
              <button className="btn btn-primary" type="button" disabled={busy} onClick={completeOnlinePayment}>
                {busy ? "Processing..." : `Pay ฿${formatMoney(payment.amount)}`}
              </button>
            </div>
          </section>
        )}

        {payment && expired && (
          <section
            style={{
              maxWidth: 760,
              margin: "0 auto",
              background: "#ffffff",
              border: "1px solid #fecaca",
              borderRadius: 24,
              padding: 32,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 42 }}>!</div>
            <h2>Payment window expired</h2>
            <p style={{ color: "#64748b" }}>
              The online payment was not completed within one hour, so this booking was not confirmed.
            </p>
            <button className="btn btn-secondary" type="button" onClick={() => navigate("/book")}>
              Create a New Booking
            </button>
          </section>
        )}
      </div>
    </Layout>
  );
}
