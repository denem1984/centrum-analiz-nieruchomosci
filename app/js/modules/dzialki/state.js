export const SELECTION_COLORS = Object.freeze([
  ["#dc2626","Czerwony"],["#f97316","Pomarańczowy"],["#eab308","Żółty"],["#16a34a","Zielony"],
  ["#2563eb","Niebieski"],["#7c3aed","Fioletowy"],["#db2777","Różowy"],["#475569","Grafitowy"],
]);
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
  appearance: Object.freeze({outlineColor:"#2563eb",selectionColor:"#dc2626"}),
  measurement: null,
  egibLayers: Object.freeze({ numbers: true, parcels: true, buildings: false }),
  planningLayers: Object.freeze({ mpzp: false, buildingLines: false, pogAdopted: false, pogDraftRu: false, pogDraftGugik: false }),
  thematicLayers: Object.freeze({ rwdz: false, flood: false, kiut: false, ownership: false }),
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
    planningLayers: copyPlain(current.planningLayers),
    thematicLayers: copyPlain(current.thematicLayers),
    appearance: copyPlain(current.appearance),
    measurement: copyPlain(current.measurement),
    layerGroups: copyPlain(current.layerGroups),
  };
}

export function updateDzialkiState(patch) {
  if (patch.measurement === null) current.measurement = null;
  else if (patch.measurement && ["distance", "area"].includes(patch.measurement.mode)
      && Array.isArray(patch.measurement.points) && patch.measurement.points.every(p => p
        && Number.isFinite(p.lat) && Math.abs(p.lat) <= 90 && Number.isFinite(p.lng) && Math.abs(p.lng) <= 180)) {
    current.measurement = copyPlain(patch.measurement);
  }
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
  if (patch.appearance) {
    const next={...current.appearance};
    if (/^#[0-9a-f]{6}$/i.test(patch.appearance.outlineColor ?? "")) next.outlineColor=patch.appearance.outlineColor.toLowerCase();
    if (SELECTION_COLORS.some(([color])=>color===patch.appearance.selectionColor)) next.selectionColor=patch.appearance.selectionColor;
    current.appearance=next;
  }
  if (patch.egibLayers && typeof patch.egibLayers === "object" && !Array.isArray(patch.egibLayers)) {
    current.egibLayers = { ...current.egibLayers, ...copyPlain(patch.egibLayers) };
  }
  if (patch.layerGroups && typeof patch.layerGroups === "object" && !Array.isArray(patch.layerGroups)) {
    current.layerGroups = { ...current.layerGroups, ...copyPlain(patch.layerGroups) };
  }
  if (patch.planningLayers && typeof patch.planningLayers === "object" && !Array.isArray(patch.planningLayers)) {
    current.planningLayers = { ...current.planningLayers, ...copyPlain(patch.planningLayers) };
  }
  if (patch.thematicLayers && typeof patch.thematicLayers === "object" && !Array.isArray(patch.thematicLayers)) {
    current.thematicLayers = { ...current.thematicLayers, ...copyPlain(patch.thematicLayers) };
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
