const initialState = Object.freeze({
  baseLayer: "osm",
  year: 2025,
  center: Object.freeze([52.07, 19.48]),
  zoom: 6,
  appliedPoint: null,
});

let current = { ...initialState, center: [...initialState.center] };

export function getDzialkiState() {
  return { ...current, center: [...current.center] };
}

export function updateDzialkiState(patch) {
  if (patch.baseLayer && ["osm", "esri", "archive"].includes(patch.baseLayer)) {
    current.baseLayer = patch.baseLayer;
  }
  if (Number.isInteger(patch.year) && patch.year >= 1995 && patch.year <= 2025) {
    current.year = patch.year;
  }
  if (Array.isArray(patch.center) && patch.center.length === 2
      && patch.center.every(Number.isFinite)) {
    current.center = [...patch.center];
  }
  if (Number.isFinite(patch.zoom)) current.zoom = Math.max(0, Math.min(22, patch.zoom));
  if (patch.appliedPoint === null || typeof patch.appliedPoint === "string") {
    current.appliedPoint = patch.appliedPoint;
  }
  return getDzialkiState();
}

export function resetDzialkiState() {
  current = { ...initialState, center: [...initialState.center] };
}