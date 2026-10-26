import L from "leaflet";

const ESRI_TILES =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";

const ESRI_ATTRIBUTION =
  "Tiles &copy; Esri — Source: Esri, TomTom, Garmin, FAO, NOAA, USGS, © OpenStreetMap contributors, and the GIS User Community";

/**
 * Adds the English/Latin-labelled basemap to a Leaflet map.
 */
export function addEnglishBasemap(map) {
  const layer = L.tileLayer(ESRI_TILES, {
    maxZoom: 19,
    attribution: ESRI_ATTRIBUTION,
  });

  layer.addTo(map);

  return layer;
}