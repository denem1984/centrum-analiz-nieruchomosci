const initialState = Object.freeze({
  baseLayer: "osm",
  year: 2025,
  center: Object.freeze([52.07, 19.48]),
  zoom: 6,
  appliedPoint: null,
  search: Object.freeze({
    powiatCode: "",
    gminaCode: "",
    obrebCode: "",
    parcelNumber: "",
    powiaty: Object.freeze([]),
    gminy: Object.freeze([]),
    obreby: Object.freeze([]),
  }),
  selectedParcel: null,
  selectedMapParcels: Object.freeze([]),
  mapSelectionInitialized: false,
  egibLayers: Object.freeze({ numbers: true, parcels: true, buildings: false }),
  layerGroups: Object.freeze({ base: true, egib: true, planning: false, investments: false, infrastructure: false, tools: false }),
});

function copyPlain(value) {
  return value === null || value === undefined ? value : JSON.parse(JSON.stringify(value));
}

let current = {
  ...initialState,
  center: [...initialState.center],
  search: copyPlain(initialState.search),
};

export function getDzialkiState() {
  return {
    ...current,
    center: [...current.center],
    search: copyPlain(current.search),
    selectedParcel: copyPlain(current.selectedParcel),
    selectedMapParcels: copyPlain(current.selectedMapParcels),
    egibLayers: copyPlain(current.egibLayers),
    layerGroups: copyPlain(current.layerGroups),
  };
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
  if (patch.search && typeof patch.search === "object" && !Array.isArray(patch.search)) {
    current.search = { ...current.search, ...copyPlain(patch.search) };
  }
  if (patch.selectedParcel === null || (patch.selectedParcel && typeof patch.selectedParcel === "object")) {
    current.selectedParcel = copyPlain(patch.selectedParcel);
  }
  if (Array.isArray(patch.selectedMapParcels)) {
    current.selectedMapParcels = copyPlain(patch.selectedMapParcels);
  }
  if (typeof patch.mapSelectionInitialized === "boolean") {
    current.mapSelectionInitialized = patch.mapSelectionInitialized;
  }
  if (patch.egibLayers && typeof patch.egibLayers === "object" && !Array.isArray(patch.egibLayers)) {
    current.egibLayers = { ...current.egibLayers, ...copyPlain(patch.egibLayers) };
  }
  if (patch.layerGroups && typeof patch.layerGroups === "object" && !Array.isArray(patch.layerGroups)) {
    current.layerGroups = { ...current.layerGroups, ...copyPlain(patch.layerGroups) };
  }
  return getDzialkiState();
}

export function resetDzialkiState() {
  current = {
    ...initialState,
    center: [...initialState.center],
    search: copyPlain(initialState.search),
    selectedMapParcels: [],
  };
}
