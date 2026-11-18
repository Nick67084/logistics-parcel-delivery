
import { useState } from "react";
import {
  Link,
  useNavigate,
  useSearchParams,
  useLocation,
} from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import deliveryScooter from "../assets/delivery-scooter.png";

const HOME_BY_ROLE = {
  customer: "/customer",
  courier: "/courier",
  hub_staff: "/hub",
  admin: "/admin",
};

export default function AuthPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const requestedMode =
    searchParams.get("mode") === "register" ? "register" : "login";

  const [mode, setMode] = useState(requestedMode);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const update = (key) => (e) => {
    setForm((current) => ({
      ...current,
      [key]: e.target.value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);

    try {
      if (mode === "register") {
        await api.register({
          ...form,
          role: "customer",
        });
      }

      await login(form.email, form.password);

      // The dashboard redirect checks the authenticated role.
      // Preserve the requested booking destination for customers.
      const destination = location.state?.from;

      if (destination === "/book") {
        // PrivateRoute protects this page if authentication fails.
        navigate("/book", { replace: true });
      } else {
        navigate("/dashboard", { replace: true });
      }
    } catch (err) {
      setError(err.message || "Authentication failed.");
    } finally {
      setBusy(false);
    }
  };

  const switchMode = () => {
    setMode((current) =>
      current === "login" ? "register" : "login"
    );
    setError("");
  };

  return (
    <div className="auth-page">
      {/* LEFT BRAND PANEL */}
      <section className="auth-brand-panel">
        <div className="auth-brand">
          <div className="auth-brand-mark">S</div>
          <div className="auth-brand-text">
            <div className="auth-brand-name">SwiftDrop</div>
            <div className="auth-brand-label">
              LOGISTICS PLATFORM
            </div>
          </div>
        </div>

        {/* Original animated scooter scene */}
        <div className="swift-hero">
          <div className="swift-glow swift-glow-orange" />
          <div className="swift-glow swift-glow-blue" />

          <div className="parallax-layer cloud-layer">
            <div className="cloud cloud-1" />
            <div className="cloud cloud-2" />
            <div className="cloud cloud-3" />
            <div className="birds">
              <span className="bird" />
              <span className="bird" />
            </div>
          </div>

          <div className="parallax-layer city-layer">
            <div className="city-block">
              <span className="building b-1" />
              <span className="building b-2" />
              <span className="building b-3" />
              <span className="building b-4" />
              <span className="building b-5" />
              <span className="building b-6" />
            </div>
            <div className="city-block">
              <span className="building b-1" />
              <span className="building b-2" />
              <span className="building b-3" />
              <span className="building b-4" />
              <span className="building b-5" />
              <span className="building b-6" />
            </div>
          </div>

          <div className="parallax-layer tree-layer">
            <div className="tree-block">
              <div className="tree t-1">
                <div className="tree-top" />
              </div>
              <div className="tree t-2">
                <div className="tree-top" />
              </div>
              <div className="tree t-3">
                <div className="tree-top" />
              </div>
            </div>
            <div className="tree-block">
              <div className="tree t-1">
                <div className="tree-top" />
              </div>
              <div className="tree t-2">
                <div className="tree-top" />
              </div>
              <div className="tree t-3">
                <div className="tree-top" />
              </div>
            </div>
          </div>

          <div className="swift-ground">
            <div className="road-stripes" />
          </div>

          <div className="swift-speed-lines">
            <span className="speed-line-one" />
            <span className="speed-line-two" />
          </div>

          <div className="swift-scooter-track">
            <img
              src={deliveryScooter}
              alt="SwiftDrop delivery scooter"
              className="swift-scooter"
            />
          </div>

          <div className="swift-route">
            <span className="swift-route-start" />
            <span className="swift-route-dashes" />
            <span className="swift-route-end">→</span>
          </div>
        </div>

        <div className="swift-live-status">
          <span className="swift-live-dot" />
          <span>Fast. Reliable. Always moving.</span>
        </div>

        <div className="auth-brand-footer">
          CSC480 · SwiftDrop Logistics Platform
        </div>
      </section>

      {/* RIGHT AUTH PANEL */}
      <section className="auth-form-panel">
        <div className="auth-form-container">
          <div className="auth-mobile-brand">
            <div className="auth-brand-mark">S</div>
            <div className="auth-brand-name">SwiftDrop</div>
          </div>

          <div className="auth-heading">
            <div className="auth-form-eyebrow">
              {mode === "login"
                ? "ACCOUNT LOGIN"
                : "CREATE ACCOUNT"}
            </div>

            <h2>
              {mode === "login"
                ? "Welcome back"
                : "Create your account"}
            </h2>

            <p>
              {mode === "login"
                ? "Sign in to continue to your delivery dashboard."
                : "Create a customer account to start booking parcels."}
            </p>
          </div>

          {error && (
            <div className="auth-error">
              <span>!</span>
              <div>{error}</div>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {mode === "register" && (
              <>
                <div className="auth-field">
                  <label htmlFor="name">Full name</label>
                  <input
                    id="name"
                    type="text"
                    value={form.name}
                    onChange={update("name")}
                    placeholder="Enter your name"
                    required
                  />
                </div>

                <div className="auth-field">
                  <label htmlFor="phone">Phone number</label>
                  <input
                    id="phone"
                    type="tel"
                    value={form.phone}
                    onChange={update("phone")}
                    placeholder="e.g. 0812345678"
                  />
                </div>
              </>
            )}

            <div className="auth-field">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                value={form.email}
                onChange={update("email")}
                placeholder="you@example.com"
                required
              />
            </div>

            <div className="auth-field">
              <div className="auth-label-row">
                <label htmlFor="password">Password</label>
                {mode === "login" && (
                  <span className="auth-helper">
                    Secure login
                  </span>
                )}
              </div>

              <input
                id="password"
                type="password"
                value={form.password}
                onChange={update("password")}
                placeholder="Enter your password"
                required
              />

              {mode === "register" && (
                <small
                  style={{
                    display: "block",
                    marginTop: 6,
                    opacity: 0.7,
                  }}
                >
                  At least 8 characters, with at least one
                  letter and one number.
                </small>
              )}
            </div>

            <button
              type="submit"
              className="auth-submit"
              disabled={busy}
            >
              {busy
                ? "Please wait..."
                : mode === "login"
                ? "Sign in"
                : "Create account"}

              {!busy && (
                <span className="auth-submit-arrow">→</span>
              )}
            </button>
          </form>

          <div className="auth-switch">
            <span>
              {mode === "login"
                ? "Don't have an account?"
                : "Already have an account?"}
            </span>
            <button type="button" onClick={switchMode}>
              {mode === "login"
                ? "Create account"
                : "Sign in"}
            </button>
          </div>

          <p
            style={{
              textAlign: "center",
              marginTop: 14,
              fontSize: 14,
            }}
          >
            <Link to="/track">
              Track a parcel without signing in
            </Link>
          </p>

          <div className="auth-security">
            <span className="auth-security-icon">✓</span>
            <span>
              Your session is protected by secure authentication.
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
