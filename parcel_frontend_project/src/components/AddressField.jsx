import { useState, useRef } from "react";
import { api } from "../api/client";

export default function AddressField({
  label,
  value,
  onChange,
  hideLocationButton = false,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const debounceRef = useRef(null);

  const handleTextChange = (text) => {
    onChange({
      address: text,
      lat: null,
      lng: null,
    });

    setError("");

    clearTimeout(debounceRef.current);

    if (text.trim().length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);

      try {
        const results = await api.geocodeSearch(text);

        setSuggestions(results);
        setShowSuggestions(true);
      } catch (_) {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 500);
  };

  const pickSuggestion = (suggestion) => {
    onChange({
      address: suggestion.display_name,
      lat: suggestion.latitude,
      lng: suggestion.longitude,
    });

    setSuggestions([]);
    setShowSuggestions(false);
    setError("");
  };

  return (
    <div
      className="field"
      style={{ position: "relative" }}
    >
      <label>{label}</label>

      <input
        value={value.address}
        onChange={(e) =>
          handleTextChange(e.target.value)
        }
        onFocus={() =>
          suggestions.length > 0 &&
          setShowSuggestions(true)
        }
        onBlur={() =>
          setTimeout(
            () => setShowSuggestions(false),
            150
          )
        }
        placeholder="Start typing an address..."
        required
      />

      {value.lat != null && (
        <div
          style={{
            fontSize: 11,
            color: "var(--muted)",
            marginTop: 3,
          }}
        >
          ✓ Location confirmed (
          {value.lat.toFixed(4)},{" "}
          {value.lng.toFixed(4)})
        </div>
      )}

      {searching && (
        <div
          style={{
            fontSize: 11,
            color: "var(--muted)",
            marginTop: 3,
          }}
        >
          Searching...
        </div>
      )}

      {error && (
        <div
          style={{
            fontSize: 11.5,
            color: "var(--danger)",
            marginTop: 3,
          }}
        >
          {error}
        </div>
      )}

      {showSuggestions &&
        suggestions.length > 0 && (
          <ul
            style={{
              listStyle: "none",
              margin: "4px 0 0",
              padding: 4,
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              background: "white",
              border: "1px solid var(--border)",
              borderRadius: 8,
              boxShadow: "var(--shadow)",
              zIndex: 10,
              maxHeight: 220,
              overflowY: "auto",
            }}
          >
            {suggestions.map((suggestion, index) => (
              <li
                key={index}
                onMouseDown={() =>
                  pickSuggestion(suggestion)
                }
                style={{
                  padding: "8px 10px",
                  fontSize: 13,
                  cursor: "pointer",
                  borderRadius: 6,
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background =
                    "var(--ice)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background =
                    "transparent")
                }
              >
                {suggestion.display_name}
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}