import { useEffect, useState } from "react";
   import {
     MapContainer,
     Marker,
     useMap,
     useMapEvents,
   } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { addEnglishBasemap } from "../mapTiles";

import { api } from "../api/client";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";


delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

function MapEvents({ onSelect }) {
  useMapEvents({
    click(e) {
      onSelect(e.latlng.lat, e.latlng.lng);
    },
  });

  return null;
}

function DraggableMarker({ position, onMove }) {
  return (
    <Marker
      position={position}
      draggable={true}
      eventHandlers={{
        dragend(e) {
          const marker = e.target;
          const location = marker.getLatLng();

          onMove(location.lat, location.lng);
        },
      }}
    />
  );
}

export default function LocationPicker({
  type,
  initialLocation,
  onConfirm,
  onCancel,
}) {
  const defaultLocation = initialLocation?.lat
    ? [initialLocation.lat, initialLocation.lng]
    : [13.7563, 100.5018];

  const [position, setPosition] = useState(defaultLocation);
  const [address, setAddress] = useState(
    initialLocation?.address || "Move the pin to select a location"
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function reverseGeocode(lat, lng) {
    try {
      setLoading(true);
      setError("");

      const result = await api.geocodeReverse(lat, lng);

      setAddress(
        result?.display_name ||
          result?.address ||
          `${lat.toFixed(6)}, ${lng.toFixed(6)}`
      );
    } catch (err) {
      setError("Unable to detect the address. Please move the pin again.");
    } finally {
      setLoading(false);
    }
  }

  async function updatePosition(lat, lng) {
    setPosition([lat, lng]);
    await reverseGeocode(lat, lng);
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by this browser.");
      return;
    }

    setLoading(true);
    setError("");

    navigator.geolocation.getCurrentPosition(
      async (location) => {
        await updatePosition(
          location.coords.latitude,
          location.coords.longitude
        );
      },
      () => {
        setLoading(false);
        setError("Unable to access your current location.");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      }
    );
  }
function EnglishBasemap() {
  const map = useMap();

  useEffect(() => {
    const layer = addEnglishBasemap(map);

    return () => {
      if (layer) {
        map.removeLayer(layer);
      }
    };
  }, [map]);

  return null;
}

  function handleConfirm() {
    if (!address || address === "Move the pin to select a location") {
      setError("Please select a location first.");
      return;
    }

    onConfirm({
      address,
      lat: position[0],
      lng: position[1],
    });
  }

  useEffect(() => {
    if (initialLocation?.lat && initialLocation?.lng) {
      reverseGeocode(initialLocation.lat, initialLocation.lng);
    }
  }, []);

  const title =
    type === "pickup"
      ? "Confirm pickup location"
      : "Confirm drop-off location";

  return (
    <div className="location-picker-overlay">
      <div className="location-picker-modal">

        {/* Header */}
        <div className="location-picker-header">
          <div>
            <div className="location-picker-eyebrow">
              LOCATION SELECTION
            </div>

            <h2>{title}</h2>

            <p>
              Move the pin to select the exact location.
            </p>
          </div>

          <button
            type="button"
            className="location-picker-close"
            onClick={onCancel}
          >
            ×
          </button>
        </div>

        {/* Map */}
        <div className="location-picker-map-wrapper">
          <MapContainer
            center={position}
            zoom={15}
            scrollWheelZoom={true}
            className="location-picker-map"
          >
                  <EnglishBasemap />

            <MapEvents onSelect={updatePosition} />

            <DraggableMarker
              position={position}
              onMove={updatePosition}
            />
          </MapContainer>

          {/* Map instruction */}
          <div className="location-picker-map-hint">
            📍 Drag the pin or tap the map
          </div>
        </div>

        {/* Selected address */}
        <div className="location-picker-address">
          <div className="location-picker-address-icon">
            📍
          </div>

          <div>
            <div className="location-picker-address-label">
              SELECTED LOCATION
            </div>

            <div className="location-picker-address-text">
              {loading
                ? "Finding address..."
                : address}
            </div>

            <div className="location-picker-coordinates">
              {position[0].toFixed(6)}, {position[1].toFixed(6)}
            </div>
          </div>
        </div>

        {/* Current location */}
        <button
          type="button"
          className="location-current-button"
          onClick={useCurrentLocation}
          disabled={loading}
        >
          <span>◎</span>

          {loading
            ? "Detecting location..."
            : "Use my current location"}
        </button>

        {error && (
          <div className="location-picker-error">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="location-picker-footer">
          <button
            type="button"
            className="location-cancel-button"
            onClick={onCancel}
          >
            Cancel
          </button>

          <button
            type="button"
            className="location-confirm-button"
            onClick={handleConfirm}
            disabled={
              loading ||
              !address ||
              address === "Move the pin to select a location"
            }
          >
            Confirm location
          </button>
        </div>
      </div>
    </div>
  );
}