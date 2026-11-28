import { checkBackend, getBackendStatus } from "../../health.js";
import { contextStore } from "../../context.js";
import { attachTileRetry, resolveTileRetryConfig } from "./tile-retry.js";
import { archiveTimeForYear, createBaseLayers, createMap, BASE_LAYER_OPTIONS } from "./layers-base.js";
import { loadLeaflet } from "./leaflet-loader.js";
import { getDzialkiState, updateDzialkiState } from "./state.js";
import { mountParcelSearch } from "./search-ui.js";
import { mountEgibLayers } from "./egib-layers.js";
import { mountPlanningLayers, MPZP_SYMBOLS_HELP } from "./planning-layers.js";
import { mountThematicLayers } from "./thematic-layers.js";
import { mountParcelAppearance } from "./appearance-tools.js";
import { mountMapTools } from "./map-tools.js";
import { mountParcelPdf } from "./report-ui.js";

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
  let egibLayerController = null;
  let planningLayerController = null;
  let thematicLayerController = null;
  let mapTools = null;
  let parcelPdf = null;
  let mapResizeObserver = null;
  let pendingSearchSelection = null;
  let retryController = null;
  let baseFailedTileCount = 0;
  let kiegFailedTileCount = 0;
  let retryButton = null;
  let unmountSearch = () => {};
  let unsubscribeHealth = () => {};

  function updateRetryAvailability() {
    if (retryButton) retryButton.disabled = baseFailedTileCount + kiegFailedTileCount === 0;
  }
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
  controls.setAttribute("tabindex", "0");
  const searchArea = element("section", undefined, "dzialki-search-area");
  searchArea.setAttribute("aria-label", "Wyszukiwanie i raport działki");
  controls.append(searchArea);

  function showSelectedParcel(selection) {
    if (!selection) return;
    if (!map || !egibLayerController) {
      pendingSearchSelection = selection;
      return;
    }
    const selectionLayer = egibLayerController.addSearchSelection(selection);
    if (!selectionLayer) return;
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

  unmountSearch = mountParcelSearch(searchArea, {
    setContext: ctx.setContext,
    onSelect: (selection) => { showSelectedParcel(selection); parcelPdf?.refresh(); },
    onEgib: (selection) => { egibLayerController?.updateSearchSelection(selection); parcelPdf?.refresh(); },
  });

  const mapLayersPanel = element("section", undefined, "dzialki-map-layers");
  mapLayersPanel.setAttribute("aria-labelledby", "dzialki-map-layers-heading");
  const layersHeading = element("h3", "3. Warstwy mapy");
  layersHeading.id = "dzialki-map-layers-heading";
  mapLayersPanel.append(layersHeading);

  function addGroupIcon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const paths = {
      base: "M4 5h16v14H4zM4 10h16M9 5v5m6-5v5",
      planning: "M4 20V5l8-2 8 2v15l-8-2zM12 3v15",
      investments: "M4 20l5-7 4 3 7-10M15 6h5v5",
      infrastructure: "M3 12h18M12 3v18M5 5l14 14M19 5L5 19",
      tools: "M4 7h16M4 12h16M4 17h16M8 5v4m8 1v4m-5 1v4",
    };
    path.setAttribute("d", paths[name] ?? paths.base);
    svg.append(path);
    return svg;
  }

  function createGroup(id, label, iconName, open) {
    const details = element("details", undefined, "dzialki-layer-group");
    details.dataset.layerGroup = id;
    details.open = open;
    const summary = element("summary", undefined, "dzialki-layer-group-summary");
    summary.append(addGroupIcon(iconName), element("span", label));
    const arrow = element("span", "⌄", "dzialki-layer-chevron");
    arrow.setAttribute("aria-hidden", "true");
    summary.append(arrow);
    const body = element("div", undefined, "dzialki-layer-group-body");
    details.append(summary, body);
    details.addEventListener("toggle", () => {
      const state = getDzialkiState().layerGroups;
      updateDzialkiState({ layerGroups: { ...state, [id]: details.open } });
    });
    return { details, body };
  }

  const groups = getDzialkiState().layerGroups;
  const baseGroup = createGroup("base", "Podkłady mapowe", "base", groups.base);
  mapLayersPanel.append(baseGroup.details);
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
  baseGroup.body.append(baseFieldset);

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
  baseGroup.body.append(archiveControls);

  function extendMapPopup(content,event,selection) {
    const planning = planningLayerController?.extendPopup(content,event,selection) ?? content;
    return thematicLayerController?.extendPopup(planning,event,selection) ?? planning;
  }
  function popupOpened(popup) {
    planningLayerController?.onPopupOpen(popup);
    thematicLayerController?.onPopupOpen(popup);
  }
  egibLayerController = mountEgibLayers(mapLayersPanel, {
    isMapInteractionBlocked: () => mapTools?.isMeasuring(),
    extendPopup: extendMapPopup,
    onPopupOpen: popupOpened,
    getBackendStatus: ctx.getBackendStatus ?? getBackendStatus,
    checkBackend: ctx.checkBackend ?? checkBackend,
    subscribeBackendStatus: ctx.subscribeBackendStatus,
    onKiegTileStats(stats) {
      kiegFailedTileCount = (Number(stats?.parcels?.finalUnloaded) || 0)
        + (Number(stats?.buildings?.finalUnloaded) || 0);
      updateRetryAvailability();
    },
  });

  const planningGroup = createGroup("planning", "Planowanie przestrzenne", "planning", groups.planning);
  mapLayersPanel.append(planningGroup.details);
  planningLayerController = mountPlanningLayers(planningGroup.body, {
    isMapInteractionBlocked: () => mapTools?.isMeasuring(),
    hasAdditionalPopup: () => thematicLayerController?.hasPopup(),
    extendStandalonePopup: extendMapPopup,
    onPopupOpen: popupOpened,
    getBackendStatus: ctx.getBackendStatus ?? getBackendStatus,
    checkBackend: ctx.checkBackend ?? checkBackend,
    subscribeBackendStatus: ctx.subscribeBackendStatus,
  });

  const investmentGroup = createGroup("investments","Inwestycje i zagrożenia","investments",groups.investments);
  const infrastructureGroup = createGroup("infrastructure","Infrastruktura i własność","infrastructure",groups.infrastructure);
  mapLayersPanel.append(investmentGroup.details,infrastructureGroup.details);
  thematicLayerController = mountThematicLayers(investmentGroup.body,infrastructureGroup.body,{
    getBackendStatus:ctx.getBackendStatus ?? getBackendStatus,
    checkBackend:ctx.checkBackend ?? checkBackend,
    subscribeBackendStatus:ctx.subscribeBackendStatus,
  });

  const toolsGroup=createGroup("tools","Wygląd i narzędzia działek","tools",groups.tools);
  mapLayersPanel.append(toolsGroup.details);
  mountParcelAppearance(toolsGroup.body,{
    onAppearance:()=>egibLayerController.refreshAppearance(),
    onClear:()=>egibLayerController.clearSelections(),
  });

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
  mapLayersPanel.append(zoomGroup);

  const retryStatus = element("p", "Niezaładowane kafelki: 0", "dzialki-tile-status");
  retryStatus.setAttribute("role", "status");
  retryStatus.setAttribute("aria-live", "polite");
  const exhaustedTileStatus = element("p", "", "dzialki-tile-exhausted-status");
  exhaustedTileStatus.setAttribute("role", "status");
  exhaustedTileStatus.setAttribute("aria-live", "polite");
  exhaustedTileStatus.hidden = true;
  retryButton = element("button", "Spróbuj ponownie", "dzialki-retry-button");
  retryButton.type = "button";
  retryButton.disabled = true;
  retryButton.addEventListener("click", () => {
    retryController?.retryVisible();
    egibLayerController?.retryFailedTiles();
  });
  mapLayersPanel.append(retryStatus, exhaustedTileStatus, retryButton);
  controls.append(mapLayersPanel);

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
  parcelPdf = mountParcelPdf(controls, {
    getMapNode: () => map && mapStatus.hidden ? mapContainer : null,
    planningHelp: MPZP_SYMBOLS_HELP,
    getLayerNotices() {
      const notices = [];
      if (baseFailedTileCount || kiegFailedTileCount) notices.push("Nie wszystkie kafelki podkładu lub EGiB były wczytane.");
      if (mapContainer.querySelectorAll(".leaflet-tile-pane .leaflet-tile:not(.leaflet-tile-loaded)").length) {
        notices.push("Część podkładu jeszcze się wczytuje lub jest niedostępna.");
      }
      for (const status of mapLayersPanel.querySelectorAll("[data-planning-status], [data-thematic-status]")) {
        if (["incomplete", "loading", "error"].includes(status.dataset.state)) {
          notices.push("Część włączonych warstw jest w trakcie wczytywania lub ma braki.");
          break;
        }
      }
      return notices;
    },
  });
  mapTools = mountMapTools(toolsGroup.body, {
    menuContainer: mapFrame,
    resultContainer: mapFrame,
    onChange: (measurement) => updateDzialkiState({ measurement }),
    onAddParcel: (point) => parcelPdf.addParcel({ point }),
    onAddSnapshot: () => parcelPdf.addSnapshot(),
    onStart: () => {
      egibLayerController.cancelMapInteraction();
      planningLayerController.cancelMapInteraction();
      map?.closePopup?.();
    },
  });
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
    baseFailedTileCount = Math.max(0, Number(count) || 0);
    retryStatus.textContent = "Niezaładowane kafelki: " + count;
    updateRetryAvailability();
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
      if (typeof globalThis.ResizeObserver === "function") {
        mapResizeObserver = new ResizeObserver(() => {
          if (map && !disposed) map.invalidateSize({ pan: false, animate: false });
        });
        mapResizeObserver.observe(mapContainer);
      }
      baseLayers = createBaseLayers(L);
      activeLayer = buildLayer(selectedBase);
      map.addLayer(activeLayer);
      attachRetry(activeLayer);
      egibLayerController.attach(map, L);
      planningLayerController.attach(map, L);
      thematicLayerController.attach(map,L);
      mapTools.attach(map, L, getDzialkiState().measurement);
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
      parcelPdf.refresh();
      syncZoom();
      const savedState = getDzialkiState();
      if (savedState.mapSelectionInitialized) {
        egibLayerController.restoreSelections(savedState.selectedMapParcels);
      } else if (savedState.selectedParcel) showSelectedParcel(savedState.selectedParcel);
      else if (pendingSearchSelection) showSelectedParcel(pendingSearchSelection);
      pendingSearchSelection = null;
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
    mapTools?.cleanup();
    parcelPdf?.cleanup();
    mapResizeObserver?.disconnect();
    egibLayerController?.cleanup();
    planningLayerController?.cleanup();
    thematicLayerController?.cleanup();
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
