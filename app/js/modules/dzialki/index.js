import { getBackendStatus } from "../../health.js";
import { contextStore } from "../../context.js";
import { attachTileRetry, resolveTileRetryConfig } from "./tile-retry.js";
import { archiveTimeForYear, createBaseLayers, createMap, BASE_LAYER_OPTIONS } from "./layers-base.js";
import { loadLeaflet } from "./leaflet-loader.js";
import { getDzialkiState, updateDzialkiState } from "./state.js";
import { mountParcelSearch } from "./search-ui.js";

const STATUS_LABELS = Object.freeze({
  idle: "Nie sprawdzono",
  waking: "Usługa się budzi",
  ready: "Dostępna",
  error: "Brak odpowiedzi",
});

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function addStatus(statusNode, status) {
  const label = STATUS_LABELS[status?.state] ?? "Nieznany stan";
  const wait = status?.state === "waking" ? " · oczekiwanie: " + status.waitSeconds + " s" : "";
  statusNode.textContent = "Stan usługi Działki: " + label + wait;
  statusNode.dataset.state = status?.state ?? "idle";
}

function pointKey(point) {
  return point ? JSON.stringify([point.lat, point.lon]) : null;
}

function retryIsVisible(event, layer, map) {
  if (!map.hasLayer(layer)) return false;
  const coords = event?.coords;
  if (!coords || !layer._tiles) return true;
  const key = typeof layer._tileCoordsToKey === "function"
    ? layer._tileCoordsToKey(coords)
    : String(coords.x) + ":" + String(coords.y) + ":" + String(coords.z);
  const record = layer._tiles[key];
  return record ? record.current !== false : true;
}

export function mountDzialki(container, ctx = {}) {
  let disposed = false;
  let map = null;
  let leaflet = null;
  let activeLayer = null;
  let selectedParcelLayer = null;
  let updateSelectedParcelDetails = () => {};
  let retryController = null;
  let unmountSearch = () => {};
  let unsubscribeHealth = () => {};
  const root = element("section", undefined, "dzialki-module");
  root.dataset.module = "dzialki";
  root.setAttribute("aria-labelledby", "dzialki-title");

  const header = element("header", undefined, "dzialki-header");
  const title = element("h2", "Działki");
  title.id = "dzialki-title";
  header.append(title);
  const backendStatus = element("p", "", "dzialki-service-status");
  backendStatus.setAttribute("role", "status");
  backendStatus.setAttribute("aria-live", "polite");
  header.append(backendStatus);
  root.append(header);

  const layout = element("div", undefined, "dzialki-layout");
  const controls = element("aside", undefined, "dzialki-controls");
  controls.setAttribute("aria-label", "Ustawienia mapy Działki");

  function popupForSelection(selection, toggled = false, hasInteracted = false) {
    const popup = element("div", undefined, "dzialki-parcel-popup");
    popup.append(element("strong", "Działka " + selection.parcel?.id));
    popup.append(element("p", "Powierzchnia: " + (selection.egib?.area || "brak danych")));
    const group = selection.egib?.group;
    const groupDescription = selection.egib?.groupDescription;
    popup.append(element("p", "Grupa rejestrowa: "
      + (group ? group + (groupDescription ? " – " + groupDescription : "") : "brak danych")));
    const classes = selection.egib?.classUse?.map((item) => item.code).join(", ") || "brak danych o użytkach w ewidencji powiatu (KIEG)";
    popup.append(element("p", "Klasoużytki: " + classes));
    popup.append(element("small", toggled
      ? "✓ Zaznaczono tę działkę (klik ponownie, aby odznaczyć)."
      : hasInteracted ? "Odznaczono tę działkę." : "Kliknij działkę, aby ją zaznaczyć."));
    return popup;
  }

  function showSelectedParcel(selection) {
    if (!selection || !map || !leaflet?.geoJSON) return;
    if (selectedParcelLayer) map.removeLayer(selectedParcelLayer);
    const color = typeof getComputedStyle === "function"
      ? getComputedStyle(root).getPropertyValue("--dzialki-selection-stroke").trim()
      : "";
    const fill = typeof getComputedStyle === "function"
      ? getComputedStyle(root).getPropertyValue("--dzialki-selection-fill").trim()
      : "";
    selectedParcelLayer = leaflet.geoJSON(selection.geometry, {
      pane: "overlayPane",
      style: {
        color: color || "#b42355",
        fillColor: fill || "#f04472",
        weight: 4,
        fillOpacity: 0.18,
        className: "dzialki-selected-parcel",
      },
    });
    selectedParcelLayer.addTo(map);
    let toggled = false;
    let hasInteracted = false;
    let currentSelection = selection;
    const baseSelectionStyle = {
      color: color || "#b42355",
      fillColor: fill || "#f04472",
      weight: 4,
      fillOpacity: 0.18,
    };
    function updatePopup() {
      const content = popupForSelection(currentSelection, toggled, hasInteracted);
      const popup = selectedParcelLayer.getPopup?.();
      if (popup?.setContent) popup.setContent(content);
      else selectedParcelLayer.bindPopup(content);
    }
    selectedParcelLayer.bindPopup(popupForSelection(currentSelection, toggled, hasInteracted));
    selectedParcelLayer.on("click", () => {
      toggled = !toggled;
      hasInteracted = true;
      selectedParcelLayer.setStyle({
        ...baseSelectionStyle,
        weight: toggled ? 5 : baseSelectionStyle.weight,
        fillOpacity: toggled ? 0.42 : baseSelectionStyle.fillOpacity,
      });
      updatePopup();
    });
    updateSelectedParcelDetails = (nextSelection) => {
      currentSelection = nextSelection;
      updatePopup();
    };
    const label = element("span", selection.parcel?.number || selection.parcel?.id, "dzialki-parcel-label");
    selectedParcelLayer.bindTooltip(label, {
      permanent: true,
      direction: "center",
      className: "dzialki-parcel-label-tooltip",
    });
    map.fitBounds(selectedParcelLayer.getBounds(), { padding: [28, 28], maxZoom: 20 });
    const center = map.getCenter();
    if (center && Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
      updateDzialkiState({
        selectedParcel: selection,
        center: [center.lat, center.lng],
        zoom: Math.max(16, map.getZoom()),
      });
    } else {
      updateDzialkiState({ selectedParcel: selection });
    }
  }

  unmountSearch = mountParcelSearch(controls, {
    setContext: ctx.setContext,
    onSelect: showSelectedParcel,
    onEgib: (selection) => updateSelectedParcelDetails(selection),
  });

  const baseHeading = element("h3", "Podkład mapy");
  controls.append(baseHeading);
  const baseFieldset = element("fieldset", undefined, "dzialki-base-options");
  const baseLegend = element("legend", "Wybierz jeden podkład");
  baseFieldset.append(baseLegend);
  const baseInputs = new Map();
  for (const id of ["osm", "esri", "archive"]) {
    const row = element("label", undefined, "dzialki-radio-row");
    const input = element("input");
    input.type = "radio";
    input.name = "dzialki-base-layer";
    input.value = id;
    input.dataset.baseLayer = id;
    input.checked = id === getDzialkiState().baseLayer;
    const text = element("span", BASE_LAYER_OPTIONS[id].label);
    row.append(input, text);
    baseFieldset.append(row);
    baseInputs.set(id, input);
  }
  controls.append(baseFieldset);

  const archiveControls = element("div", undefined, "dzialki-archive-controls");
  const yearLabel = element("label", undefined, "dzialki-year-label");
  yearLabel.htmlFor = "dzialki-year";
  yearLabel.append(element("span", "Rok zdjęcia"));
  const yearValue = element("output", String(getDzialkiState().year));
  yearValue.htmlFor = "dzialki-year";
  yearLabel.append(yearValue);
  const yearInput = element("input");
  yearInput.id = "dzialki-year";
  yearInput.type = "range";
  yearInput.min = "1995";
  yearInput.max = "2025";
  yearInput.step = "1";
  yearInput.value = String(getDzialkiState().year);
  yearInput.setAttribute("aria-label", "Rok zdjęcia");
  archiveControls.append(yearLabel, yearInput);
  archiveControls.append(element(
    "p",
    "Dostępne lata: 1995–2025. W danym miejscu może brakować zdjęcia z wybranego roku.",
    "dzialki-help",
  ));
  controls.append(archiveControls);

  const zoomGroup = element("section", undefined, "dzialki-zoom-controls");
  zoomGroup.setAttribute("aria-label", "Przybliżenie mapy");
  zoomGroup.append(element("h3", "Przybliżenie"));
  const zoomRow = element("div", undefined, "dzialki-zoom-row");
  const zoomOut = element("button", "−");
  zoomOut.type = "button";
  zoomOut.setAttribute("aria-label", "Pomniejsz mapę");
  const zoomInput = element("input");
  zoomInput.type = "range";
  zoomInput.min = "0";
  zoomInput.max = "22";
  zoomInput.step = "0.1";
  zoomInput.value = String(getDzialkiState().zoom);
  zoomInput.setAttribute("aria-label", "Przybliżenie mapy");
  const zoomIn = element("button", "+");
  zoomIn.type = "button";
  zoomIn.setAttribute("aria-label", "Powiększ mapę");
  const zoomValue = element("output", Number(getDzialkiState().zoom).toFixed(1));
  zoomRow.append(zoomOut, zoomInput, zoomIn, zoomValue);
  zoomGroup.append(zoomRow);
  controls.append(zoomGroup);

  const retryStatus = element("p", "Niezaładowane kafelki: 0", "dzialki-tile-status");
  retryStatus.setAttribute("role", "status");
  retryStatus.setAttribute("aria-live", "polite");
  const exhaustedTileStatus = element("p", "", "dzialki-tile-exhausted-status");
  exhaustedTileStatus.setAttribute("role", "status");
  exhaustedTileStatus.setAttribute("aria-live", "polite");
  exhaustedTileStatus.hidden = true;
  const retryButton = element("button", "Spróbuj ponownie", "dzialki-retry-button");
  retryButton.type = "button";
  retryButton.disabled = true;
  retryButton.addEventListener("click", () => {
    retryController?.retryVisible();
  });
  controls.append(retryStatus, exhaustedTileStatus, retryButton);

  const futureHeading = element("h3", "Dostępne w kolejnych etapach");
  controls.append(futureHeading);
  const futureFeatures = [
    "EGiB",
    "Planowanie przestrzenne",
    "Inwestycje i zagrożenia",
    "Infrastruktura i własność",
  ];
  for (const feature of futureFeatures) {
    const row = element("p", undefined, "dzialki-future-row");
    const badge = element("span", "w kolejnych etapach");
    const label = element("span", feature);
    row.append(label, badge);
    controls.append(row);
  }

  const mapFrame = element("div", undefined, "dzialki-map-frame");
  const mapContainer = element("div", undefined, "dzialki-map");
  mapContainer.dataset.dzialkiMap = "";
  mapContainer.setAttribute("role", "region");
  mapContainer.setAttribute("aria-label", "Mapa Działki");
  mapFrame.append(mapContainer);
  const mapStatus = element("p", "Ładowanie lokalnej mapy…", "dzialki-map-status");
  mapStatus.setAttribute("role", "status");
  mapStatus.setAttribute("aria-live", "polite");
  mapFrame.append(mapStatus);
  layout.append(controls, mapFrame);
  root.append(layout);
  container.append(root);

  const initialStatus = typeof ctx.getBackendStatus === "function"
    ? ctx.getBackendStatus("Dzialki")
    : getBackendStatus("Dzialki");
  addStatus(backendStatus, initialStatus);
  if (typeof ctx.subscribeBackendStatus === "function") {
    unsubscribeHealth = ctx.subscribeBackendStatus("Dzialki", (status) => {
      if (!disposed) addStatus(backendStatus, status);
    });
  }

  const saved = getDzialkiState();
  const point = contextStore.get().point ?? null;
  const currentPointKey = pointKey(point);
  const applyNewPoint = point && currentPointKey !== saved.appliedPoint;
  let view = applyNewPoint
    ? { center: [point.lat, point.lon], zoom: Math.max(16, saved.zoom) }
    : { center: saved.center, zoom: saved.zoom };
  if (applyNewPoint) updateDzialkiState({ appliedPoint: currentPointKey });

  function setTileCount(count) {
    retryStatus.textContent = "Niezaładowane kafelki: " + count;
    retryButton.disabled = count === 0;
  }

  function setTileStats(stats) {
    if (typeof window !== "undefined") window.__DZIALKI_TILE_STATS__ = stats;
    const failed = Math.max(0, Number(stats?.finalUnloaded) || 0);
    exhaustedTileStatus.textContent = failed > 0
      ? "Usługa GUGiK nie zwróciła obrazu dla " + failed
        + " kafelków mimo ponowień. Spróbuj ponownie później lub zmień rok."
      : "";
    exhaustedTileStatus.hidden = failed === 0;
  }

  function detachRetry() {
    retryController?.cancel();
    retryController = null;
    setTileCount(0);
  }

  function attachRetry(layer) {
    retryController = attachTileRetry(layer, {
      ...resolveTileRetryConfig(typeof window === "undefined" ? undefined : window.__DZIALKI_TILE_RETRY__),
      onCount: setTileCount,
      onStats: setTileStats,
      isVisible: (event, target) => retryIsVisible(event, target, map),
    });
  }

  let baseLayers;
  let selectedBase = saved.baseLayer;

  function buildLayer(id) {
    return id === "archive" ? baseLayers.archive(getDzialkiState().year) : baseLayers[id];
  }

  function selectBase(id) {
    if (!["osm", "esri", "archive"].includes(id) || id === selectedBase && id !== "archive") return;
    detachRetry();
    if (map && activeLayer) map.removeLayer(activeLayer);
    selectedBase = id;
    updateDzialkiState({ baseLayer: id });
    for (const [baseId, input] of baseInputs) input.checked = baseId === id;
    archiveControls.hidden = id !== "archive";
    if (!map || !baseLayers) return;
    activeLayer = buildLayer(id);
    map.addLayer(activeLayer);
    attachRetry(activeLayer);
  }

  for (const [id, input] of baseInputs) {
    input.addEventListener("change", () => {
      if (input.checked) selectBase(id);
    });
  }
  archiveControls.hidden = selectedBase !== "archive";
  yearInput.addEventListener("input", () => {
    const year = Math.max(1995, Math.min(2025, Number(yearInput.value) || 1995));
    yearValue.textContent = String(year);
  });
  yearInput.addEventListener("change", () => {
    const year = Math.max(1995, Math.min(2025, Math.round(Number(yearInput.value) || 1995)));
    yearInput.value = String(year);
    yearValue.textContent = String(year);
    updateDzialkiState({ year });
    if (selectedBase === "archive") selectBase("archive");
  });

  const syncZoom = () => {
    if (!map) return;
    const zoom = Math.max(0, Math.min(22, map.getZoom()));
    zoomInput.value = String(zoom);
    zoomValue.textContent = zoom.toFixed(1);
    updateDzialkiState({ zoom });
  };
  zoomInput.addEventListener("input", () => {
    const zoom = Math.max(0, Math.min(22, Number(zoomInput.value)));
    if (map) map.setZoom(zoom, { animate: false });
    else {
      view = { ...view, zoom };
      updateDzialkiState({ zoom });
    }
    zoomValue.textContent = zoom.toFixed(1);
  });
  zoomOut.addEventListener("click", () => map?.zoomOut(0.1, { animate: false }));
  zoomIn.addEventListener("click", () => map?.zoomIn(0.1, { animate: false }));

  void loadLeaflet().then((L) => {
    if (disposed) return;
    try {
      leaflet = L;
      map = createMap(L, mapContainer, view);
      baseLayers = createBaseLayers(L);
      activeLayer = buildLayer(selectedBase);
      map.addLayer(activeLayer);
      attachRetry(activeLayer);
      map.on("zoomend", syncZoom);
      map.on("moveend", () => {
        if (!map || disposed) return;
        const center = map.getCenter();
        updateDzialkiState({
          center: [center.lat, center.lng],
          zoom: map.getZoom(),
        });
      });
      mapStatus.textContent = "";
      mapStatus.hidden = true;
      syncZoom();
      const savedParcel = getDzialkiState().selectedParcel;
      if (savedParcel) showSelectedParcel(savedParcel);
    } catch {
      mapStatus.textContent = "Nie udało się uruchomić mapy. Odśwież stronę i spróbuj ponownie.";
    }
  }).catch(() => {
    if (!disposed) mapStatus.textContent = "Nie udało się załadować lokalnej mapy. Odśwież stronę i spróbuj ponownie.";
  });

  return function unmountDzialki() {
    if (disposed) return;
    disposed = true;
    unsubscribeHealth();
    unmountSearch();
    detachRetry();
    if (map) {
      map.off("zoomend", syncZoom);
      map.remove();
      map = null;
    }
    root.replaceChildren();
  };
}

export const dzialkiModule = Object.freeze({
  id: "dzialki",
  label: "Działki",
  description: "Mapa i podkłady działek w natywnej zakładce.",
  backend: "Dzialki",
  mount: mountDzialki,
});
