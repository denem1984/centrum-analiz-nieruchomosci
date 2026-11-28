export const ARCHIVE_WMS_URL =
  "https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolutionTime";

export const BASE_LAYER_OPTIONS = Object.freeze({
  osm: Object.freeze({
    label: "OpenStreetMap",
    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
  }),
  esri: Object.freeze({
    label: "Satelita – Esri World Imagery",
    attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
  }),
  archive: Object.freeze({
    label: "Ortofotomapa archiwalna – GUGiK",
    attribution: "© GUGiK — ortofotomapy archiwalne",
  }),
});

export function archiveTimeForYear(value) {
  const numericYear = Number(value);
  const year = Number.isFinite(numericYear)
    ? Math.max(1995, Math.min(2025, Math.round(numericYear)))
    : 1995;
  return year === 2025 ? "2025-11-01" : String(year) + "-12-01";
}

export function archiveWmsOptionsForYear(year) {
  return {
    layers: "Raster",
    styles: "default",
    version: "1.3.0",
    format: "image/png",
    transparent: true,
    time: archiveTimeForYear(year),
    maxZoom: 22,
  };
}

export function createBaseLayers(L) {
  if (!L?.tileLayer || typeof L.tileLayer.wms !== "function") {
    throw new Error("Leaflet nie udostępnia obsługi warstw kafelkowych.");
  }
  const common = { pane: "tilePane", maxZoom: 22, maxNativeZoom: 19 };
  return {
    osm: L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      { ...common, attribution: BASE_LAYER_OPTIONS.osm.attribution },
    ),
    esri: L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { ...common, attribution: BASE_LAYER_OPTIONS.esri.attribution },
    ),
    archive: (year) => L.tileLayer.wms(ARCHIVE_WMS_URL, {
      pane: "tilePane",
      ...archiveWmsOptionsForYear(year),
      crs: L.CRS?.EPSG3857,
      attribution: BASE_LAYER_OPTIONS.archive.attribution,
    }),
  };
}

export function createMap(L, container, view) {
  const map = L.map(container, {
    zoomControl: false,
    attributionControl: true,
    zoomSnap: 0.1,
    zoomDelta: 0.1,
    minZoom: 0,
    maxZoom: 22,
  });
  map.setView(view.center, view.zoom, { animate: false });
  for (const [name,zIndex] of [["dzialki-kiut-pane",410],["dzialki-rwdz-pane",420],["dzialki-parcels-pane",430],
    ["dzialki-buildings-pane",435],["dzialki-selection-pane",440],["dzialki-labels-pane",450]]) {
    if (map.createPane) {
      const pane = map.getPane?.(name) ?? map.createPane(name);
      pane.style.zIndex = String(zIndex);
      if (name === "dzialki-labels-pane") pane.style.pointerEvents = "none";
    }
  }
  if (L.control?.scale) {
    L.control.scale({ imperial: false, metric: true }).addTo(map);
  }
  return map;
}
