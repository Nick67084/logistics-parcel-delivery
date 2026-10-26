import { useEffect, useRef, useState, useCallback } from "react";

import { useParams } from "react-router-dom";

import L from "leaflet";

import "leaflet/dist/leaflet.css";

import Layout from "../components/Layout";
import StatusBadge from "../components/StatusBadge";
import ParcelManageActions from "../components/ParcelManageActions";

import { api, wsUrl } from "../api/client";

import { addEnglishBasemap } from "../mapTiles";


/* =========================================================
   LEAFLET DEFAULT ICON
   ========================================================= */

delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",

  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",

  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});


/* =========================================================
   CUSTOM MAP ICONS
   ========================================================= */

const courierIcon = L.divIcon({
  className: "courier-map-icon-wrapper",

  html: `
    <div class="courier-map-icon">
      <span>🛵</span>
    </div>
  `,

  iconSize: [38, 38],
  iconAnchor: [19, 19],
  popupAnchor: [0, -20],
});


const destinationIcon = L.divIcon({
  className: "destination-map-icon-wrapper",

  html: `
    <div class="destination-map-icon">
      <span>●</span>
    </div>
  `,

  iconSize: [34, 34],
  iconAnchor: [17, 30],
});


const pickupIcon = L.divIcon({
  className: "pickup-map-icon-wrapper",

  html: `
    <div class="pickup-map-icon">
      <span>●</span>
    </div>
  `,

  iconSize: [30, 30],
  iconAnchor: [15, 27],
});


/* =========================================================
   STATUS
   ========================================================= */

const ACTIVE_STATUSES = [
  "picked_up",
  "at_hub",
  "in_transit",
  "out_for_delivery",
];


const STATUS_LABELS = {
  created: "Order Confirmed",
  assigned: "Courier Assigned",
  picked_up: "Picked Up",
  at_hub: "At Hub",
  in_transit: "In Transit",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  failed: "Delivery Failed",
  cancelled: "Cancelled",
};


const STATUS_STEPS = [
  {
    key: "created",
    label: "Order Confirmed",
    shortLabel: "Confirmed",
  },
  {
    key: "assigned",
    label: "Courier Assigned",
    shortLabel: "Assigned",
  },
  {
    key: "picked_up",
    label: "Picked Up",
    shortLabel: "Picked Up",
  },
  {
    key: "at_hub",
    label: "At Hub",
    shortLabel: "At Hub",
  },
  {
    key: "in_transit",
    label: "In Transit",
    shortLabel: "Transit",
  },
  {
    key: "out_for_delivery",
    label: "Out for Delivery",
    shortLabel: "Out for Delivery",
  },
  {
    key: "delivered",
    label: "Delivered",
    shortLabel: "Delivered",
  },
];


const STATUS_ORDER = [
  "created",
  "assigned",
  "picked_up",
  "at_hub",
  "in_transit",
  "out_for_delivery",
  "delivered",
];


/* =========================================================
   HELPERS
   ========================================================= */

function formatStatus(status) {
  return (
    STATUS_LABELS[status] ||
    status?.replaceAll("_", " ") ||
    "Unknown"
  );
}


function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}


function formatDateTime(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}


function formatTime(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}


function getStatusIndex(status) {
  const index = STATUS_ORDER.indexOf(status);

  return index === -1 ? 0 : index;
}


function isStepCompleted(status, stepKey) {
  return getStatusIndex(status) >= getStatusIndex(stepKey);
}


function isStepCurrent(status, stepKey) {
  return status === stepKey;
}


/* =========================================================
   OSRM ROAD ROUTE
   ========================================================= */

async function getRoadRoute(startLat, startLng, endLat, endLng) {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${startLng},${startLat};${endLng},${endLat}` +
    `?overview=full&geometries=geojson`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Unable to calculate delivery route.");
  }

  const data = await response.json();

  if (
    data.code !== "Ok" ||
    !data.routes ||
    !data.routes.length
  ) {
    throw new Error("No driving route was found.");
  }

  const route = data.routes[0];

  return {
    coordinates: route.geometry.coordinates.map(
      ([lng, lat]) => [lat, lng]
    ),

    distanceKm: route.distance / 1000,

    durationMinutes: route.duration / 60,
  };
}


/* =========================================================
   PAGE
   ========================================================= */

export default function ParcelDetailPage() {
  const { id } = useParams();

  const [parcel, setParcel] = useState(null);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [connectionState, setConnectionState] = useState("connecting");

  const [lastUpdated, setLastUpdated] = useState(null);
  const [lastLocationAt, setLastLocationAt] = useState(null);

  const [routeInfo, setRouteInfo] = useState(null);

  const [routeLoading, setRouteLoading] = useState(false);


  /* =======================================================
     MAP REFS
     ======================================================= */

  const mapRef = useRef(null);

  const mapInstanceRef = useRef(null);

  const courierMarkerRef = useRef(null);

  const courierPositionRef = useRef(null);

  const routeLayerRef = useRef(null);

  const routeShadowRef = useRef(null);

  const destinationMarkerRef = useRef(null);

  const pickupMarkerRef = useRef(null);

  const routeRequestRef = useRef(0);
  const socketRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const shouldReconnectRef = useRef(true);


  /* =======================================================
     LOAD PARCEL
     ======================================================= */

  const load = useCallback(() => {
    api
      .getParcel(id)
      .then((data) => {
        setParcel(data);
        setLastUpdated(new Date());
      })
      .catch((e) => setError(e.message));
  }, [id]);


  useEffect(() => {
    load();
  }, [load]);


  /* =======================================================
     DRAW ROAD ROUTE
     ======================================================= */

  const drawRoute = useCallback(
    async (startLat, startLng, endLat, endLng) => {
      if (!mapInstanceRef.current) {
        return;
      }

      const requestId = ++routeRequestRef.current;

      try {
        setRouteLoading(true);

        const route = await getRoadRoute(
          startLat,
          startLng,
          endLat,
          endLng
        );

        /*
         * Ignore an old route request if a newer GPS update
         * has already requested another route.
         */
        if (requestId !== routeRequestRef.current) {
          return;
        }

        const map = mapInstanceRef.current;

        /*
         * Remove previous route.
         */
        if (routeShadowRef.current) {
          routeShadowRef.current.remove();
        }

        if (routeLayerRef.current) {
          routeLayerRef.current.remove();
        }

        /*
         * White casing underneath the route.
         * This makes the route much easier to see
         * over the map roads.
         */
        routeShadowRef.current = L.polyline(
          route.coordinates,
          {
            color: "#ffffff",
            weight: 10,
            opacity: 0.9,
            lineCap: "round",
            lineJoin: "round",
          }
        ).addTo(map);


        /*
         * Main highlighted delivery route.
         */
        routeLayerRef.current = L.polyline(
          route.coordinates,
          {
            className: "parcel-route-line",
            color: "#2563eb",
            weight: 6,
            opacity: 0.95,
            lineCap: "round",
            lineJoin: "round",
          }
        ).addTo(map);


        setRouteInfo({
          distanceKm: route.distanceKm,
          durationMinutes: route.durationMinutes,
        });


        /*
         * Keep courier + destination visible.
         */
        const points = [
          [startLat, startLng],
          [endLat, endLng],
        ];

        map.fitBounds(points, {
          padding: [55, 55],
          maxZoom: 15,
        });
      } catch (err) {
        console.error("Route calculation failed:", err);

        setRouteInfo(null);
      } finally {
        if (requestId === routeRequestRef.current) {
          setRouteLoading(false);
        }
      }
    },
    []
  );


  /* =======================================================
     SMOOTH COURIER MOVEMENT
     ======================================================= */

  const moveCourierSmoothly = useCallback(
    (lat, lng) => {
      const marker = courierMarkerRef.current;

      if (!marker) {
        return;
      }

      const previous = courierPositionRef.current;

      if (!previous) {
        marker.setLatLng([lat, lng]);

        courierPositionRef.current = {
          lat,
          lng,
        };

        return;
      }

      const startLat = previous.lat;
      const startLng = previous.lng;

      const duration = 1200;

      const startTime = performance.now();

      function animate(now) {
        const progress = Math.min(
          (now - startTime) / duration,
          1
        );

        /*
         * Smooth ease-out movement.
         */
        const eased =
          1 - Math.pow(1 - progress, 3);

        const currentLat =
          startLat +
          (lat - startLat) * eased;

        const currentLng =
          startLng +
          (lng - startLng) * eased;

        marker.setLatLng([
          currentLat,
          currentLng,
        ]);

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          courierPositionRef.current = {
            lat,
            lng,
          };
        }
      }

      requestAnimationFrame(animate);
    },
    []
  );


  /* =======================================================
     CREATE MAP
     ======================================================= */

  useEffect(() => {
    if (
      !parcel ||
      mapInstanceRef.current ||
      !mapRef.current
    ) {
      return;
    }

    if (
      parcel.pickup_lat == null ||
      parcel.pickup_lng == null ||
      parcel.dropoff_lat == null ||
      parcel.dropoff_lng == null
    ) {
      return;
    }


    const map = L.map(mapRef.current, {
      scrollWheelZoom: false,
      zoomControl: true,
    });


    mapInstanceRef.current = map;


         addEnglishBasemap(map);


    const pickup = [
      parcel.pickup_lat,
      parcel.pickup_lng,
    ];


    const dropoff = [
      parcel.dropoff_lat,
      parcel.dropoff_lng,
    ];


    /* =====================================================
       PICKUP MARKER
       ===================================================== */

    pickupMarkerRef.current = L.marker(
      pickup,
      {
        icon: pickupIcon,
      }
    )
      .addTo(map)
      .bindPopup(
        `<strong>Pickup</strong><br />${
          parcel.pickup_address ||
          "Pickup location"
        }`
      );


    /* =====================================================
       DESTINATION MARKER
       ===================================================== */

    destinationMarkerRef.current = L.marker(
      dropoff,
      {
        icon: destinationIcon,
      }
    )
      .addTo(map)
      .bindPopup(
        `<strong>Delivery destination</strong><br />${
          parcel.dropoff_address ||
          "Drop-off location"
        }`
      );


    /*
     * Initially show the road route from pickup
     * to destination.
     */
    drawRoute(
      parcel.pickup_lat,
      parcel.pickup_lng,
      parcel.dropoff_lat,
      parcel.dropoff_lng
    );


    return () => {
      map.remove();

      mapInstanceRef.current = null;

      courierMarkerRef.current = null;

      courierPositionRef.current = null;

      routeLayerRef.current = null;

      routeShadowRef.current = null;

      destinationMarkerRef.current = null;

      pickupMarkerRef.current = null;
    };
  }, [parcel, drawRoute]);


  /* =======================================================
     WEBSOCKET — LIVE COURIER TRACKING
     ======================================================= */

  useEffect(() => {
    shouldReconnectRef.current = true;

    const connect = () => {
      if (!shouldReconnectRef.current) return;

      setConnectionState("connecting");

      const socket = new WebSocket(wsUrl(id));
      socketRef.current = socket;

      socket.onopen = () => {
        setConnected(true);
        setConnectionState("connected");
      };

      socket.onclose = () => {
        setConnected(false);
        setConnectionState("reconnecting");
        socketRef.current = null;

        if (shouldReconnectRef.current) {
          reconnectTimerRef.current = setTimeout(connect, 3000);
        }
      };

      socket.onerror = () => {
        setConnected(false);
        setConnectionState("reconnecting");
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.event === "status_update") {
            load();
          }

          if (
            data.event === "courier_location" &&
            mapInstanceRef.current &&
            data.latitude != null &&
            data.longitude != null
          ) {
            const lat = Number(data.latitude);
            const lng = Number(data.longitude);

            if (Number.isNaN(lat) || Number.isNaN(lng)) return;

            const pos = [lat, lng];

            if (!courierMarkerRef.current) {
              courierMarkerRef.current = L.marker(pos, {
                icon: courierIcon,
                zIndexOffset: 1000,
              })
                .addTo(mapInstanceRef.current)
                .bindPopup(`
                  <strong>🛵 Courier</strong><br />
                  Live delivery location
                `);
            }

            moveCourierSmoothly(lat, lng);
            courierPositionRef.current = { lat, lng };

            if (
              parcel?.dropoff_lat != null &&
              parcel?.dropoff_lng != null
            ) {
              drawRoute(
                lat,
                lng,
                parcel.dropoff_lat,
                parcel.dropoff_lng
              );
            }

            const now = new Date();
            setLastUpdated(now);
            setLastLocationAt(now);
          }
        } catch (_) {
          // Ignore malformed WebSocket messages.
        }
      };
    };

    connect();

    return () => {
      shouldReconnectRef.current = false;

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }

      setConnected(false);
      setConnectionState("offline");
    };
  }, [id, load, drawRoute, moveCourierSmoothly]);


  /* =======================================================
     ERROR
     ======================================================= */

  if (error) {
    return (
      <Layout>
        <div className="tracking-page">
          <div className="tracking-error">
            <div className="tracking-error-icon">
              !
            </div>

            <div>
              <h2>Unable to load parcel</h2>

              <p>{error}</p>
            </div>
          </div>
        </div>
      </Layout>
    );
  }


  /* =======================================================
     LOADING
     ======================================================= */

  if (!parcel) {
    return (
      <Layout>
        <div className="tracking-page">
          <div className="tracking-loading">
            <div className="tracking-loading-spinner" />

            <strong>
              Loading tracking information...
            </strong>

            <span>
              Please wait while we retrieve your parcel.
            </span>
          </div>
        </div>
      </Layout>
    );
  }


  /* =======================================================
     STATUS VARIABLES
     ======================================================= */

  const isActive = ACTIVE_STATUSES.includes(
    parcel.current_status
  );


  const isDelivered =
    parcel.current_status === "delivered";


  const isFailed =
    parcel.current_status === "failed";


  const currentStatusLabel =
    STATUS_LABELS[parcel.current_status] ||
    parcel.current_status.replaceAll("_", " ");


  const currentStatusIndex =
    getStatusIndex(parcel.current_status);


  const history =
    Array.isArray(parcel.status_history)
      ? parcel.status_history
      : [];


  /* =======================================================
     RENDER
     ======================================================= */

  return (
    <Layout>
      <div className="tracking-page">

        {/* =================================================
            PAGE HEADER
        ================================================= */}

        <section className="tracking-header">

          <div className="tracking-header-left">

            <div className="tracking-eyebrow">
              <span className="tracking-eyebrow-line" />

              PARCEL TRACKING
            </div>


            <div className="tracking-title-row">

              <div>

                <h1 className="tracking-title">
                  {parcel.tracking_number}
                </h1>

                <p className="tracking-subtitle">
                  Follow your parcel from pickup to delivery.
                </p>

              </div>


              <div className="tracking-status-stack">

                <StatusBadge
                  status={parcel.current_status}
                />


                <span
                  className={`tracking-connection ${
                    connected
                      ? "tracking-connection-online"
                      : "tracking-connection-offline"
                  }`}
                >

                  <span className="tracking-connection-dot" />

                  {connectionState === "connected"
                    ? "LIVE TRACKING"
                    : connectionState === "reconnecting"
                      ? "RECONNECTING"
                      : "CONNECTING..."}

                </span>

              </div>

            </div>

          </div>


          <div className="tracking-current-card">

            <span>
              Current status
            </span>

            <strong>
              {currentStatusLabel}
            </strong>

            {lastUpdated && (
              <small>
                Updated {formatTime(lastUpdated)}
              </small>
            )}

          </div>

        </section>


        {/* =================================================
            DELIVERY STATE
        ================================================= */}

        <ParcelManageActions parcel={parcel} onChanged={load} />

        {isActive && (
          <section className="tracking-live-banner">

            <div className="tracking-live-banner-icon">
              ●
            </div>

            <div className="tracking-live-banner-content">

              <strong>
                Your parcel is currently moving
              </strong>

              <span>
                The courier's location is being updated
                automatically.
              </span>

            </div>

            <div className="tracking-live-banner-status">

              <span className="tracking-live-dot" />

              Live

            </div>

          </section>
        )}


        {isDelivered && (
          <section className="tracking-complete-banner">

            <div className="tracking-complete-icon">
              ✓
            </div>

            <div>

              <strong>
                Parcel delivered successfully
              </strong>

              <span>
                Your parcel has reached its destination.
              </span>

            </div>

          </section>
        )}


        {isFailed && (
          <section className="tracking-failed-banner">

            <div className="tracking-failed-icon">
              !
            </div>

            <div>

              <strong>
                Delivery requires attention
              </strong>

              <span>
                This delivery was marked as failed.
              </span>

            </div>

          </section>
        )}


        {/* =================================================
            PROGRESS
        ================================================= */}

        <section className="tracking-progress-card">

          <div className="tracking-section-heading">

            <div>

              <span className="section-kicker">
                DELIVERY PROGRESS
              </span>

              <h2>
                Where is my parcel?
              </h2>

            </div>

            <span className="tracking-progress-count">

              {isDelivered
                ? "Completed"
                : `${Math.min(
                    currentStatusIndex + 1,
                    STATUS_STEPS.length
                  )} / ${STATUS_STEPS.length}`}

            </span>

          </div>


          <div className="tracking-stepper">

            {STATUS_STEPS.map((step, index) => {

              const completed =
                isStepCompleted(
                  parcel.current_status,
                  step.key
                );


              const current =
                isStepCurrent(
                  parcel.current_status,
                  step.key
                );


              return (
                <div
                  className="tracking-step-wrapper"
                  key={step.key}
                >

                  <div
                    className={`tracking-step ${
                      completed
                        ? "tracking-step-completed"
                        : ""
                    } ${
                      current
                        ? "tracking-step-current"
                        : ""
                    }`}
                  >

                    <div className="tracking-step-circle">

                      {completed && !current
                        ? "✓"
                        : index + 1}

                    </div>

                    <span className="tracking-step-label">
                      {step.shortLabel}
                    </span>

                  </div>


                  {index <
                    STATUS_STEPS.length - 1 && (
                    <div
                      className={`tracking-step-line ${
                        getStatusIndex(
                          parcel.current_status
                        ) > index
                          ? "tracking-step-line-active"
                          : ""
                      }`}
                    />
                  )}

                </div>
              );
            })}

          </div>

        </section>


        {/* =================================================
            ROUTE SUMMARY
        ================================================= */}

        <section className="tracking-route-card">

          <div className="tracking-route-point">

            <div className="tracking-route-marker pickup">
              <span />
            </div>

            <div>

              <span className="tracking-route-label">
                PICKUP
              </span>

              <strong>
                {parcel.pickup_address}
              </strong>

            </div>

          </div>


          <div className="tracking-route-connector">

            <span />
            <span />
            <span />
            <span />

          </div>


          <div className="tracking-route-point">

            <div className="tracking-route-marker dropoff">
              <span />
            </div>

            <div>

              <span className="tracking-route-label">
                DESTINATION
              </span>

              <strong>
                {parcel.dropoff_address}
              </strong>

            </div>

          </div>

        </section>


        {/* =================================================
            MAIN CONTENT
        ================================================= */}

        <div className="tracking-main-grid">


          {/* =================================================
              LIVE MAP
          ================================================= */}

          <section className="tracking-map-card">

            <div className="tracking-card-header">

              <div>

                <span className="section-kicker">
                  REAL-TIME LOCATION
                </span>

                <h2>
                  Live Delivery Map
                </h2>

              </div>


              {isActive && (
                <span
                  className={`map-live-badge ${
                    connected
                      ? "map-live-active"
                      : "map-live-inactive"
                  }`}
                >

                  <span />

                  {connectionState === "connected"
                    ? "LIVE"
                    : connectionState === "reconnecting"
                      ? "RECONNECTING"
                      : "CONNECTING"}

                </span>
              )}

            </div>


            <p className="tracking-card-description">

              {isActive
                ? "Follow the courier along the live driving route to your destination."
                : "The planned road route is shown below. Courier location will appear once the parcel is picked up."}

            </p>


            {/* =================================================
                MAP
            ================================================= */}

            <div
              ref={mapRef}
              className="tracking-map"
            />


            {/* =================================================
                ROUTE INFORMATION
            ================================================= */}

            {routeInfo && (
              <div className="tracking-route-info">

                <div className="tracking-route-info-item">

                  <span className="tracking-route-info-icon">
                    🛣️
                  </span>

                  <div>

                    <span>
                      Driving route
                    </span>

                    <strong>
                      {routeInfo.distanceKm.toFixed(1)} km
                    </strong>

                  </div>

                </div>


                <div className="tracking-route-info-item">

                  <span className="tracking-route-info-icon">
                    ⏱
                  </span>

                  <div>

                    <span>
                      Estimated travel
                    </span>

                    <strong>
                      {Math.max(
                        1,
                        Math.round(
                          routeInfo.durationMinutes
                        )
                      )} min
                    </strong>

                  </div>

                </div>


                {routeLoading && (
                  <span className="tracking-route-recalculating">
                    Updating route...
                  </span>
                )}

              </div>
            )}


            {/* =================================================
                MAP FOOTER
            ================================================= */}

            <div className="tracking-map-footer">

              <div className="tracking-map-location-status">

                <span
                  className={`tracking-location-dot ${
                    connected
                      ? "location-online"
                      : "location-offline"
                  }`}
                />

                <span>

                  {lastLocationAt
                    ? `Courier GPS updated ${formatTime(lastLocationAt)}`
                    : "Waiting for courier GPS location"}

                </span>

              </div>


              {isActive && (
                <span className="tracking-map-live-text">
                  {connectionState === "connected"
                    ? "Live GPS • Auto-updating"
                    : "Waiting for live GPS"}
                </span>
              )}

            </div>

          </section>


          {/* =================================================
              DELIVERY DETAILS
          ================================================= */}

          <section className="tracking-details-card">

            <div className="tracking-card-header">

              <div>

                <span className="section-kicker">
                  SHIPMENT INFORMATION
                </span>

                <h2>
                  Delivery Details
                </h2>

              </div>

            </div>


            <div className="tracking-info-list">

              <div className="tracking-info-row">

                <span className="tracking-info-icon">
                  R
                </span>

                <div>

                  <span>
                    Receiver
                  </span>

                  <strong>
                    {parcel.receiver_name}
                  </strong>

                </div>

              </div>


              <div className="tracking-info-row">

                <span className="tracking-info-icon">
                  P
                </span>

                <div>

                  <span>
                    Phone
                  </span>

                  <strong>
                    {parcel.receiver_phone}
                  </strong>

                </div>

              </div>


              <div className="tracking-info-row">

                <span className="tracking-info-icon">
                  C
                </span>

                <div>

                  <span>
                    Courier
                  </span>

                  <strong>
                    {parcel.assigned_courier_id
                      ? `Courier #${parcel.assigned_courier_id}`
                      : "Waiting for assignment"}
                  </strong>

                </div>

              </div>


              <div className="tracking-info-row">

                <span className="tracking-info-icon">
                  B
                </span>

                <div>

                  <span>
                    Package
                  </span>

                  <strong>
                    {parcel.package_type ||
                      "Standard package"}
                  </strong>

                </div>

              </div>


              <div className="tracking-info-row">

                <span className="tracking-info-icon">
                  W
                </span>

                <div>

                  <span>
                    Weight
                  </span>

                  <strong>

                    {parcel.weight_kg != null
                      ? `${parcel.weight_kg} kg`
                      : "—"}

                  </strong>

                </div>

              </div>


              <div className="tracking-info-row">

                <span className="tracking-info-icon">
                  S
                </span>

                <div>

                  <span>
                    Service
                  </span>

                  <strong className="tracking-service-value">

                    {parcel.service_level
                      ? parcel.service_level
                          .charAt(0)
                          .toUpperCase() +
                        parcel.service_level.slice(1)
                      : "Standard"}

                  </strong>

                </div>

              </div>


              {parcel.fragile && (
                <div className="tracking-fragile">

                  <span>
                    !
                  </span>

                  Handle with care — fragile package

                </div>
              )}

            </div>

          </section>

        </div>


        {/* =================================================
            ADDITIONAL DELIVERY INFORMATION
        ================================================= */}

        <section className="tracking-extra-grid">

          <div className="tracking-extra-card">

            <span className="section-kicker">
              PICKUP INFORMATION
            </span>

            <h3>
              Scheduled Pickup
            </h3>

            <div className="tracking-extra-content">

              <div>

                <span>
                  Date
                </span>

                <strong>
                  {formatDate(parcel.pickup_date)}
                </strong>

              </div>

              <div>

                <span>
                  Time window
                </span>

                <strong>
                  {parcel.pickup_window || "—"}
                </strong>

              </div>

            </div>

          </div>


          <div className="tracking-extra-card">

            <span className="section-kicker">
              PAYMENT
            </span>

            <h3>
              Estimated Delivery Fee
            </h3>

            <div className="tracking-price">

              <span>
                ฿
              </span>

              <strong>

                {parcel.estimated_fee != null
                  ? Number(
                      parcel.estimated_fee
                    ).toFixed(2)
                  : "—"}

              </strong>

            </div>

          </div>


          <div className="tracking-extra-card">

            <span className="section-kicker">
              INSTRUCTIONS
            </span>

            <h3>
              Delivery Instructions
            </h3>

            <p className="tracking-instructions">

              {parcel.delivery_instructions ||
                "No special delivery instructions."}

            </p>

          </div>

        </section>


        {/* =================================================
            TRACKING TIMELINE
        ================================================= */}

        <section className="tracking-timeline-card">

          <div className="tracking-card-header">

            <div>

              <span className="section-kicker">
                DELIVERY HISTORY
              </span>

              <h2>
                Tracking Timeline
              </h2>

            </div>


            {history.length > 0 && (
              <span className="tracking-event-count">

                {history.length} event
                {history.length !== 1
                  ? "s"
                  : ""}

              </span>
            )}

          </div>


          {history.length > 0 ? (

            <div className="tracking-history">

              {history.map(
                (historyItem, index) => {

                  const isLatest =
                    index ===
                    history.length - 1;


                  return (
                    <div
                      className={`tracking-history-item ${
                        isLatest
                          ? "tracking-history-latest"
                          : ""
                      }`}
                      key={`${historyItem.status}-${historyItem.timestamp}-${index}`}
                    >

                      <div className="tracking-history-marker">

                        <span>
                          {isLatest
                            ? "●"
                            : "✓"}
                        </span>

                      </div>


                      {index <
                        history.length - 1 && (
                        <div className="tracking-history-line" />
                      )}


                      <div className="tracking-history-content">

                        <div className="tracking-history-top">

                          <div>

                            <strong>

                              {STATUS_LABELS[
                                historyItem.status
                              ] ||
                                formatStatus(
                                  historyItem.status
                                )}

                            </strong>


                            {isLatest && (
                              <span className="tracking-latest-badge">
                                CURRENT
                              </span>
                            )}

                          </div>


                          <time>

                            {formatDateTime(
                              `${historyItem.timestamp}Z`
                            )}

                          </time>

                        </div>


                        <div className="tracking-history-status">

                          <StatusBadge
                            status={
                              historyItem.status
                            }
                          />

                        </div>


                        {historyItem.note && (
                          <p>
                            {historyItem.note}
                          </p>
                        )}


                        {historyItem.location_lat !=
                          null &&
                          historyItem.location_lng !=
                            null && (

                            <span className="tracking-history-location">

                              Location:{" "}

                              {Number(
                                historyItem.location_lat
                              ).toFixed(4)}

                              ,{" "}

                              {Number(
                                historyItem.location_lng
                              ).toFixed(4)}

                            </span>

                          )}

                      </div>

                    </div>
                  );
                }
              )}

            </div>

          ) : (

            <div className="tracking-empty-history">

              <div>
                ⏱
              </div>

              <strong>
                No tracking events yet
              </strong>

              <span>
                Updates will appear here as your
                parcel moves through the delivery
                process.
              </span>

            </div>

          )}

        </section>


        {/* =================================================
            FOOTER
        ================================================= */}

        <div className="tracking-security-note">

          <span>
            ✓
          </span>

          <div>

            <strong>
              Live tracking is protected
            </strong>

            <p>
              Location updates are provided by the
              assigned courier while the parcel is
              actively being delivered.
            </p>

          </div>

        </div>

      </div>
    </Layout>
  );
}