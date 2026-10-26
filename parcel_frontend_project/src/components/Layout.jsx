import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const ROLE_LINKS = {
  customer: [
    { to: "/customer", label: "Dashboard", icon: "⌂" },
    { to: "/book", label: "Book a Parcel", icon: "＋" },
    { to: "/parcels", label: "My Parcels", icon: "▣" },
    { to: "/track", label: "Track a Parcel", icon: "⌕" },
    { to: "/profile", label: "My Profile", icon: "◎" },
  ],

  courier: [
    { to: "/courier", label: "Dashboard", icon: "⌂" },
    { to: "/track", label: "Track a Parcel", icon: "⌕" },
    { to: "/profile", label: "My Profile", icon: "◎" },
  ],

  hub_staff: [
    { to: "/hub", label: "Hub Operations", icon: "⌂" },
    { to: "/track", label: "Track a Parcel", icon: "⌕" },
    { to: "/profile", label: "My Profile", icon: "◎" },
  ],

  admin: [
    { to: "/admin", label: "Admin Overview", icon: "⌂" },
    { to: "/track", label: "Track a Parcel", icon: "⌕" },
    { to: "/profile", label: "My Profile", icon: "◎" },
  ],
};

const ROLE_LABELS = {
  customer: "Customer",
  courier: "Courier",
  hub_staff: "Hub Staff",
  admin: "Administrator",
};

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const links = ROLE_LINKS[user?.role] || [];
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="app-shell">

      {/* Mobile top bar */}
      <div className="mobile-topbar">
        <div className="mobile-brand-wrap">
          <div className="brand-mark">P</div>
          <span className="mobile-topbar-brand">Parcel Delivery</span>
        </div>

        <button
          className="hamburger-btn"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label="Toggle menu"
        >
          {menuOpen ? "✕" : "☰"}
        </button>
      </div>

      {/* Sidebar */}
      <aside className={`sidebar${menuOpen ? " sidebar-open" : ""}`}>

        {/* Brand */}
        <div className="sidebar-brand">
          <div className="brand-row">
            <div className="brand-mark">P</div>

            <div>
              <div className="brand-name">Parcel Delivery</div>
              <small>CSC480 · DELIVERY PLATFORM</small>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          <div className="nav-section-title">MENU</div>

          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={closeMenu}
              className={({ isActive }) =>
                "nav-link" + (isActive ? " active" : "")
              }
            >
              <span className="nav-icon">{link.icon}</span>
              <span>{link.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User section */}
        <div className="sidebar-footer">

          <div className="sidebar-user-card">
            <div className="user-avatar">
              {user?.name?.charAt(0)?.toUpperCase() || "U"}
            </div>

            <div className="sidebar-user">
              <strong>{user?.name}</strong>
              <span>{user?.email}</span>

              <div>
                <span className="role-badge">
                  {ROLE_LABELS[user?.role] || user?.role}
                </span>
              </div>
            </div>
          </div>

          <button className="logout-btn" onClick={handleLogout}>
            <span>↪</span>
            Log out
          </button>

        </div>
      </aside>

      {/* Main content */}
      <main className="main-content" onClick={closeMenu}>
        {children}
      </main>

    </div>
  );
}