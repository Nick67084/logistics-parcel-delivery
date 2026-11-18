
import React from "react";
import "./HomePage.css";

export default function HomePage({
  onLogin,
  onRegister,
  onBook,
  onTrack,
}) {
  const scrollToAbout = () => {
    document.getElementById("about-swiftdrop")?.scrollIntoView({
      behavior: "smooth",
    });
  };

  return (
    <main className="swift-home">
      <section className="sd-home-hero">
        <header className="swift-navbar">
          <div className="swift-brand">
            <span className="swift-logo">S</span>
            <div>
              <strong>SwiftDrop</strong>
              <small>LOGISTICS PLATFORM</small>
            </div>
          </div>

          <div className="swift-auth-actions">
            <button className="swift-login" onClick={onLogin}>
              Log In
            </button>
            <button className="swift-register" onClick={onRegister}>
              Create Account
            </button>
          </div>
        </header>

        <div className="swift-hero-content">
          <p className="swift-eyebrow">SMART PARCEL DELIVERY</p>

          <h1>
            Fast, Reliable, and
            <br />
            Transparent <em>Delivery.</em>
          </h1>

          <p className="swift-description">
            Book a delivery, track your parcel, and learn more
            about SwiftDrop — all in one platform.
          </p>

          <div className="swift-actions">
            <button onClick={onBook}>
              <span>▣</span>
              <strong>Book a Delivery</strong>
              <span>→</span>
            </button>

            <button onClick={onTrack}>
              <span>⌖</span>
              <strong>Track a Parcel</strong>
              <span>→</span>
            </button>

            <button onClick={scrollToAbout}>
              <span>♧</span>
              <strong>About Us</strong>
              <span>→</span>
            </button>
          </div>
        </div>
      </section>

      <section id="about-swiftdrop" className="swift-about">
        <span>ABOUT SWIFTDROP</span>
        <h2>Making every delivery simpler.</h2>
        <p>
          SwiftDrop is a parcel delivery management platform
          designed to make booking, tracking, and managing
          shipments easier. Customers, couriers, and staff
          can manage the delivery process in one connected system.
        </p>
      </section>
    </main>
  );
}
