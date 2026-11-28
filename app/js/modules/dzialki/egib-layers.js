import { BACKENDS } from "../../config.js";
import { checkBackend, getBackendStatus, subscribeBackendStatus } from "../../health.js";
import { getDzialkiState, updateDzialkiState } from "./state.js";
import { KIEG_ENDPOINT, parseKiegFeatureInfo, readKiegParcelId, parcelContainsPoint } from "./egib.js";
import { mapPopupOptions } from "./map-popup.js";
import { createSearchApi } from "./search.js";
import { attachTileRetry, resolveTileRetryConfig } from "./tile-retry.js";

export const PARCEL_WFS_URL = BACKENDS.Dzialki.baseUrl + "/api/wfs";
export const EGiB_MIN_ZOOM = 13;
export const EGiB_REFRESH_DEBOUNCE_MS = 180;
export const EGiB_RETRY_DELAY_MS = 500;
export const KIEG_COMPLETENESS_SWEEP_MS = 3000;
export const KIEG_COMPLETENESS_WINDOW_MS = 40000;

export function isLoadedKiegTileImage(image) {
  return Boolean(image?.complete && Number(image.naturalWidth) > 1 && Number(image.naturalHeight) > 1);
}

export function countVisibleKiegTiles(layers = [], map = null) {
  const activeLayers = layers.filter((layer) => layer && (!map || map.hasLayer?.(layer)));
  const bounds = map?.getContainer?.()?.getBoundingClientRect?.()
    ?? map?.container?.getBoundingClientRect?.()
    ?? null;
  let total = 0;
  let loaded = 0;
  for (const layer of activeLayers) {
    for (const record of Object.values(layer._tiles ?? {})) {
      if (record?.current === false) continue;
      const image = record?.el ?? record?.tile ?? null;
      if (bounds && image?.getBoundingClientRect) {
        const rect = image.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0
            || rect.right <= bounds.left || rect.left >= bounds.right
            || rect.bottom <= bounds.top || rect.top >= bounds.bottom) continue;
      }
      total += 1;
      if (isLoadedKiegTileImage(image)) loaded += 1;
    }
  }
  return Object.freeze({ active: activeLayers.length > 0, total, loaded, missing: total - loaded });
}

function withParams(url, values) {
  for (const [key, value] of values) url.searchParams.set(key, value);
  return url.toString();
}

export function paddedMapBounds(bounds) {
  if (!bounds || ![bounds.getSouth, bounds.getWest, bounds.getNorth, bounds.getEast]
    .every((method) => typeof method === "function")) {
    throw new TypeError("Nieprawidłowy widok mapy dla warstw EGiB.");
  }
  const southValue = bounds.getSouth();
  const westValue = bounds.getWest();
  const northValue = bounds.getNorth();
  const eastValue = bounds.getEast();
  const latSpan = northValue - southValue;
  const lonSpan = eastValue - westValue;
  if (![southValue, westValue, northValue, eastValue, latSpan, lonSpan].every(Number.isFinite)
      || latSpan <= 0 || lonSpan <= 0) {
    throw new TypeError("Nieprawidłowe granice widoku mapy.");
  }
  const padding = 0.15;
  return {
    south: Math.max(-90, southValue - latSpan * padding),
    west: Math.max(-180, westValue - lonSpan * padding),
    north: Math.min(90, northValue + latSpan * padding),
    east: Math.min(180, eastValue + lonSpan * padding),
  };
}

export function buildParcelWfsUrl(bounds) {
  const box = paddedMapBounds(bounds);
  return withParams(new URL(PARCEL_WFS_URL), [[
    "bbox", [box.south, box.west, box.north, box.east].join(","),
  ]]);
}

export function buildKiegGetMapUrl({ layer, bbox, width = 256, height = 256 } = {}) {
  if (!["dzialki", "budynki"].includes(layer)
      || !Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(Number.isFinite)
      || !Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
    throw new TypeError("Nieprawidłowe parametry kafelka EGiB.");
  }
  const url = new URL(KIEG_ENDPOINT);
  const query = [
    ["service", "WMS"], ["request", "GetMap"], ["layers", layer], ["styles", ""],
    ["format", "image/png"], ["transparent", "true"], ["version", "1.1.1"],
    ["width", String(width)], ["height", String(height)], ["srs", "EPSG:3857"],
    ["bbox", bbox.join(",")],
  ];
  return withParams(url, query);
}

export function buildMapClickFeatureInfoUrl(latlng) {
  const lat = Number(latlng?.lat);
  const lon = Number(latlng?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)
      || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw new TypeError("Nieprawidłowe współrzędne kliknięcia mapy.");
  }
  const span = 0.0012;
  const bbox = [lon - span, lat - span, lon + span, lat + span].join(",");
  return withParams(new URL(KIEG_ENDPOINT), [
    ["SERVICE", "WMS"], ["VERSION", "1.1.1"], ["REQUEST", "GetFeatureInfo"],
    ["SRS", "EPSG:4326"], ["BBOX", bbox], ["WIDTH", "1000"], ["HEIGHT", "1000"],
    ["X", "500"], ["Y", "500"], ["LAYERS", "dzialki"], ["QUERY_LAYERS", "dzialki"],
    ["INFO_FORMAT", "text/xml"], ["FORMAT", "image/png"], ["TRANSPARENT", "TRUE"],
  ]);
}

function element(document, tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function svgIcon(document, kind) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  const shapes = {
    base: "M4 5h16v14H4zM4 10h16M9 5v5m6-5v5",
    egib: "M4 5l6-2 10 4v12l-6 2-10-4zM10 3v14m4-11v13",
    planning: "M4 20V5l8-2 8 2v15l-8-2zM12 3v15",
    investment: "M4 20l5-7 4 3 7-10M15 6h5v5",
    infrastructure: "M3 12h18M12 3v18M5 5l14 14M19 5L5 19",
    tools: "M4 7h16M4 12h16M4 17h16M8 5v4m8 1v4m-5 1v4",
  };
  path.setAttribute("d", shapes[kind] ?? shapes.egib);
  svg.append(path);
  return svg;
}

function featureId(feature) {
  const properties = feature?.properties ?? {};
  for (const key of ["id_dzialki", "idDzialki", "NUMER_DZIALKI", "numer_dzialki"]) {
    if (typeof properties[key] === "string" && properties[key].trim()) return properties[key].trim();
  }
  return "";
}

function labelText(id) {
  return String(id).split(".").at(-1) || String(id);
}

function interiorLabelPoint(geometry) {
  const polygons = geometry?.type === "Polygon" ? [geometry.coordinates]
    : geometry?.type === "MultiPolygon" ? geometry.coordinates : [];
  for (const polygon of polygons) {
    const ring = polygon?.[0];
    if (!Array.isArray(ring) || ring.length < 4) continue;
    let twiceArea = 0, xSum = 0, ySum = 0;
    for (let i = 0; i < ring.length - 1; i += 1) {
      const [x1, y1] = ring[i], [x2, y2] = ring[i + 1];
      const cross = x1 * y2 - x2 * y1;
      twiceArea += cross;
      xSum += (x1 + x2) * cross;
      ySum += (y1 + y2) * cross;
    }
    if (Math.abs(twiceArea) > 1e-12) {
      const point = [xSum / (3 * twiceArea), ySum / (3 * twiceArea)];
      if (point.every(Number.isFinite)) return point;
    }
    const xs = ring.map(([x]) => x), ys = ring.map(([, y]) => y);
    const fallback = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    if (fallback.every(Number.isFinite)) return fallback;
  }
  return null;
}

function popupContent(document, selection, note) {
  const root = element(document, "div", undefined, "dzialki-egib-popup");
  root.append(element(document, "strong", "Działka " + selection.parcel.id));
  root.append(element(document, "p", "Powierzchnia: " + (selection.egib?.area || "brak danych")));
  const group = selection.egib?.group;
  const description = selection.egib?.groupDescription;
  root.append(element(document, "p", "Grupa rejestrowa: "
    + (group ? group + (description ? " – " + description : "") : "brak danych")));
  const classes = selection.egib?.classUse?.map((item) => item.code).join(", ") || "brak danych";
  root.append(element(document, "p", "Klasoużytki: " + classes));
  root.append(element(document, "small", note));
  return root;
}

function matchesFeatureId(feature, id) {
  return featureId(feature) === id;
}

export function mountEgibLayers(container, options = {}) {
  const document = container.ownerDocument;
  const saved = getDzialkiState();
  const group = element(document, "details", undefined, "dzialki-layer-group dzialki-layer-group--egib");
  group.dataset.layerGroup = "egib";
  group.open = saved.layerGroups.egib;
  const summary = element(document, "summary", undefined, "dzialki-layer-group-summary");
  summary.append(svgIcon(document, "egib"), element(document, "span", "EGiB"));
  const chevron = element(document, "span", "⌄", "dzialki-layer-chevron");
  chevron.setAttribute("aria-hidden", "true");
  summary.append(chevron);
  group.append(summary);
  const body = element(document, "div", undefined, "dzialki-layer-group-body");
  const inputs = new Map();
  for (const [id, label, checked] of [
    ["numbers", "Numery działek", saved.egibLayers.numbers],
    ["parcels", "Kontury działek", saved.egibLayers.parcels],
    ["buildings", "Kontury budynków", saved.egibLayers.buildings],
  ]) {
    const row = element(document, "label", undefined, "dzialki-layer-toggle");
    const input = element(document, "input");
    input.type = "checkbox";
    input.checked = checked;
    input.id = "dzialki-layer-" + id;
    input.dataset.egibLayer = id;
    row.append(input, element(document, "span", label));
    body.append(row);
    inputs.set(id, input);
  }
  const status = element(document, "p", "Gotowe. Warstwy EGiB pojawiają się od przybliżenia 13.", "dzialki-egib-status");
  status.id = "dzialki-egib-status";
  status.dataset.state = "idle";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  body.append(status);
  const parcelTileStatus = element(document, "p", "Kontury działek: 0 kafelków niezaładowanych", "dzialki-kieg-tile-status");
  parcelTileStatus.id = "dzialki-kieg-parcel-tile-status";
  parcelTileStatus.setAttribute("role", "status");
  parcelTileStatus.setAttribute("aria-live", "polite");
  const buildingTileStatus = element(document, "p", "Kontury budynków: 0 kafelków niezaładowanych", "dzialki-kieg-tile-status");
  buildingTileStatus.id = "dzialki-kieg-building-tile-status";
  buildingTileStatus.setAttribute("role", "status");
  buildingTileStatus.setAttribute("aria-live", "polite");
  body.append(parcelTileStatus, buildingTileStatus);
  const retry = element(document, "button", "Spróbuj ponownie", "dzialki-egib-retry");
  retry.id = "dzialki-egib-retry";
  retry.type = "button";
  retry.hidden = true;
  body.append(retry);
  const completenessStatus = element(document, "p", "Kontury nie są jeszcze widoczne.", "dzialki-egib-completeness");
  completenessStatus.id = "dzialki-egib-completeness";
  completenessStatus.setAttribute("role", "status");
  completenessStatus.setAttribute("aria-live", "polite");
  body.append(completenessStatus);
  group.append(body);
  container.append(group);

  let disposed = false;
  let map = null;
  let leaflet = null;
  let parcelWms = null;
  let buildingWms = null;
  let parcelTileRetry = null;
  let buildingTileRetry = null;
  let outlineLayer = null;
  let labelLayers = [];
  let features = [];
  let selected = new Map();
  let debounceHandle = null;
  let retryDelayHandle = null;
  let completenessTimer = null;
  let completenessStartedAt = null;
  let statusRetryVisible = false;
  let completenessRetryVisible = false;
  let activeController = null;
  let activePromise = null;
  let clickController = null;
  let generation = 0;
  let healthUnsubscribe = () => {};
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const setTimeoutFn = options.setTimeoutFn ?? globalThis.setTimeout;
  const clearTimeoutFn = options.clearTimeoutFn ?? globalThis.clearTimeout;
  const setIntervalFn = options.setIntervalFn ?? globalThis.setInterval;
  const clearIntervalFn = options.clearIntervalFn ?? globalThis.clearInterval;
  const nowFn = options.nowFn ?? Date.now;
  const sweepIntervalMs = options.completenessSweepMs ?? KIEG_COMPLETENESS_SWEEP_MS;
  const completenessWindowMs = options.completenessWindowMs ?? KIEG_COMPLETENESS_WINDOW_MS;
  const getStatus = options.getBackendStatus ?? getBackendStatus;
  const check = options.checkBackend ?? checkBackend;
  const delay = options.retryDelayMs ?? EGiB_RETRY_DELAY_MS;
  const debounceMs = options.debounceMs ?? EGiB_REFRESH_DEBOUNCE_MS;

  function readKiegTileStats() {
    return {
      parcels: parcelTileRetry?.getStats() ?? { errors: 0, retries: 0, finalUnloaded: 0, pending: 0 },
      buildings: buildingTileRetry?.getStats() ?? { errors: 0, retries: 0, finalUnloaded: 0, pending: 0 },
    };
  }

  function activeKiegLayers() {
    return [parcelWms, buildingWms].filter((layer) => layer && map?.hasLayer(layer));
  }

  function readVisibleKiegTiles() {
    return countVisibleKiegTiles(activeKiegLayers(), map);
  }

  function syncRetryButton() {
    retry.hidden = !(statusRetryVisible || completenessRetryVisible);
  }

  function clearCompletenessTimer() {
    if (completenessTimer !== null) clearTimeoutFn(completenessTimer);
    completenessTimer = null;
  }

  function updateCompleteness() {
    if (disposed) return;
    const tiles = readVisibleKiegTiles();
    const elapsed = completenessStartedAt === null ? 0 : Math.max(0, nowFn() - completenessStartedAt);
    if (!tiles.active) {
      completenessStatus.textContent = "Kontury nie są aktywne.";
      completenessStatus.dataset.state = "inactive";
      completenessRetryVisible = false;
      syncRetryButton();
      clearCompletenessTimer();
      return;
    }
    if (tiles.total > 0 && tiles.missing === 0) {
      completenessStatus.textContent = "Kontury kompletne";
      completenessStatus.dataset.state = "complete";
      completenessStatus.dataset.loaded = String(tiles.loaded);
      completenessStatus.dataset.total = String(tiles.total);
      completenessRetryVisible = false;
      syncRetryButton();
      clearCompletenessTimer();
      return;
    }
    completenessStatus.dataset.loaded = String(tiles.loaded);
    completenessStatus.dataset.total = String(tiles.total);
    if (elapsed >= completenessWindowMs) {
      completenessStatus.textContent = "Nie udało się wczytać części konturów (" + tiles.missing + " kafelków)";
      completenessStatus.dataset.state = "incomplete";
      completenessRetryVisible = true;
      syncRetryButton();
      clearCompletenessTimer();
      return;
    }
    completenessStatus.textContent = "Wczytywanie konturów: " + tiles.loaded + "/" + tiles.total;
    completenessStatus.dataset.state = "loading";
    completenessRetryVisible = false;
    syncRetryButton();
    if (completenessTimer === null) {
      completenessTimer = setTimeoutFn(() => {
        completenessTimer = null;
        const shouldSweep = typeof window === "undefined" || window.__DZIALKI_KIEG_SWEEP__ !== false;
        if (shouldSweep && nowFn() - completenessStartedAt < completenessWindowMs) {
          parcelTileRetry?.retryIncompleteVisible();
          buildingTileRetry?.retryIncompleteVisible();
        }
        updateCompleteness();
      }, Math.min(sweepIntervalMs, Math.max(0, completenessWindowMs - elapsed)));
    }
  }

  function resetCompletenessWindow() {
    clearCompletenessTimer();
    completenessStartedAt = nowFn();
    updateCompleteness();
  }

  function publishKiegTileStats() {
    const stats = readKiegTileStats();
    parcelTileStatus.textContent = "Kontury działek: " + stats.parcels.finalUnloaded + " kafelków niezaładowanych";
    buildingTileStatus.textContent = "Kontury budynków: " + stats.buildings.finalUnloaded + " kafelków niezaładowanych";
    if (typeof window !== "undefined") window.__DZIALKI_KIEG_TILE_STATS__ = stats;
    try { options.onKiegTileStats?.(stats); } catch { /* Diagnostyka nie może przerwać mapy. */ }
    updateCompleteness();
  }

  function retryLayerVisible(event, layer) {
    if (!map?.hasLayer(layer)) return false;
    const coords = event?.coords;
    if (!coords || !layer._tiles) return true;
    const key = typeof layer._tileCoordsToKey === "function"
      ? layer._tileCoordsToKey(coords)
      : String(coords.x) + ":" + String(coords.y) + ":" + String(coords.z);
    const record = layer._tiles[key];
    return record ? record.current !== false : true;
  }

  function attachKiegTileRetries() {
    const config = resolveTileRetryConfig(typeof window === "undefined" ? undefined : window.__DZIALKI_TILE_RETRY__);
    const shared = {
      ...config,
      setTimeoutImpl: options.setTimeoutFn ?? globalThis.setTimeout,
      clearTimeoutImpl: options.clearTimeoutFn ?? globalThis.clearTimeout,
      random: options.retryRandom ?? Math.random,
      isVisible: retryLayerVisible,
      onStats: publishKiegTileStats,
    };
    parcelTileRetry = attachTileRetry(parcelWms, shared);
    buildingTileRetry = attachTileRetry(buildingWms, shared);
    publishKiegTileStats();
  }

  function setStatus(message, state = "idle", canRetry = false) {
    if (disposed) return;
    status.textContent = message;
    status.dataset.state = state;
    statusRetryVisible = canRetry;
    syncRetryButton();
  }

  function readLayerOptions() {
    return getDzialkiState().egibLayers;
  }

  function applyVisibility() {
    if (!map || !leaflet || disposed) return;
    const layers = readLayerOptions();
    if (layers.parcels && parcelWms && !map.hasLayer(parcelWms)) map.addLayer(parcelWms);
    if (!layers.parcels && parcelWms && map.hasLayer(parcelWms)) map.removeLayer(parcelWms);
    if (layers.buildings && buildingWms && !map.hasLayer(buildingWms)) map.addLayer(buildingWms);
    if (!layers.buildings && buildingWms && map.hasLayer(buildingWms)) map.removeLayer(buildingWms);
    if (outlineLayer) {
      const show = layers.parcels && map.getZoom() >= EGiB_MIN_ZOOM && features.length > 0;
      if (show && !map.hasLayer(outlineLayer)) map.addLayer(outlineLayer);
      if (!show && map.hasLayer(outlineLayer)) map.removeLayer(outlineLayer);
    }
    for (const layer of labelLayers) {
      const show = layers.numbers && map.getZoom() >= EGiB_MIN_ZOOM;
      if (show && !map.hasLayer(layer)) map.addLayer(layer);
      if (!show && map.hasLayer(layer)) map.removeLayer(layer);
    }
    if (layers.numbers || layers.parcels) scheduleRefresh();
    else {
      generation += 1;
      activeController?.abort();
      if (debounceHandle !== null) clearTimeoutFn(debounceHandle);
      debounceHandle = null;
      clearDataLayers();
      setStatus("Warstwy EGiB są wyłączone.");
    }
    resetCompletenessWindow();
  }

  function clearDataLayers() {
    if (!map) return;
    if (outlineLayer && map.hasLayer(outlineLayer)) map.removeLayer(outlineLayer);
    for (const layer of labelLayers) if (map.hasLayer(layer)) map.removeLayer(layer);
    outlineLayer = null;
    labelLayers = [];
    features = [];
  }

  async function ensureBackendReady(force = false) {
    const initial = getStatus("Dzialki");
    if (initial.state === "ready") return true;
    const startedAt = Date.now();
    let lastSecond = -1;
    setStatus("Usługa się budzi… Oczekiwanie: 0 s", "waking");
    const interval = setIntervalFn(() => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      if (seconds !== lastSecond) {
        lastSecond = seconds;
        setStatus("Usługa się budzi… Oczekiwanie: " + seconds + " s", "waking");
      }
    }, 1000);
    try {
      const result = await check("Dzialki", {
        force: force || initial.state === "error",
        onState(next) {
          if (next.state === "waking") setStatus("Usługa się budzi… Oczekiwanie: " + next.waitSeconds + " s", "waking");
        },
      });
      if (disposed) return false;
      if (result?.state === "ready") {
        setStatus("Usługa dostępna. Pobieranie warstw EGiB…", "ready");
        return true;
      }
      setStatus("Usługa nie odpowiedziała. Spróbuj ponownie.", "error", true);
      return false;
    } catch {
      if (!disposed) setStatus("Nie udało się połączyć z usługą. Spróbuj ponownie.", "error", true);
      return false;
    } finally {
      clearIntervalFn(interval);
    }
  }

  async function fetchGeoJson(signal) {
    const response = await fetchImpl(buildParcelWfsUrl(map.getBounds()), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal,
      redirect: "error",
    });
    if (!response?.ok) {
      const error = new Error("Usługa EGiB zwróciła błąd HTTP " + (response?.status ?? "?") + ".");
      error.name = "HttpResponseError";
      throw error;
    }
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.features)) throw new Error("Nieprawidłowa odpowiedź warstwy EGiB.");
    return payload.features.filter((feature) => feature?.geometry && featureId(feature));
  }

  function waitForRetry(signal) {
    return new Promise((resolvePromise, reject) => {
      const onAbort = () => {
        if (retryDelayHandle !== null) clearTimeoutFn(retryDelayHandle);
        retryDelayHandle = null;
        signal.removeEventListener("abort", onAbort);
        const aborted = new Error("Żądanie anulowane.");
        aborted.name = "AbortError";
        reject(aborted);
      };
      if (signal.aborted) {
        onAbort();
        return;
      }
      retryDelayHandle = setTimeoutFn(() => {
        retryDelayHandle = null;
        signal.removeEventListener("abort", onAbort);
        resolvePromise();
      }, delay);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  function renderFeatures(nextFeatures) {
    clearDataLayers();
    features = nextFeatures;
    if (!features.length || !map || !leaflet) return;
    const collection = { type: "FeatureCollection", features };
    outlineLayer = leaflet.geoJSON(collection, {
      pane: "dzialki-selection-pane",
      style: () => ({
        color: getDzialkiState().appearance.outlineColor,
        weight: 2,
        fill: false,
        dashArray: "5,4",
        className: "dzialki-egib-outline",
        bubblingMouseEvents: true,
      }),
    });
    if (readLayerOptions().parcels && map.getZoom() >= EGiB_MIN_ZOOM) map.addLayer(outlineLayer);
    if (!readLayerOptions().numbers || map.getZoom() < EGiB_MIN_ZOOM) return;
    for (const feature of features) {
      const id = featureId(feature);
      const point = interiorLabelPoint(feature.geometry);
      if (!point || !leaflet.marker || !leaflet.divIcon) continue;
      const labelNode = element(document, "span", labelText(id), "dzialki-egib-label");
      labelNode.dataset.egibLabel = "";
      const icon = leaflet.divIcon({ className: "dzialki-egib-label-icon", html: labelNode, iconSize: [1, 1], iconAnchor: [0, 0] });
      const marker = leaflet.marker([point[1], point[0]], { icon, pane: "dzialki-labels-pane", interactive: false, keyboard: false });
      labelLayers.push(marker);
      map.addLayer(marker);
    }
  }

  async function refresh(token, forceHealth = false) {
    if (disposed || token !== generation) return;
    if (activePromise) await activePromise.catch(() => {});
    if (disposed || token !== generation) return;
    if (!map || map.getZoom() < EGiB_MIN_ZOOM || !(readLayerOptions().numbers || readLayerOptions().parcels)) {
      setStatus("Przybliż mapę co najmniej do poziomu 13, aby wczytać warstwy EGiB.");
      return;
    }
    if (!await ensureBackendReady(forceHealth) || disposed || token !== generation) return;
    const controller = new AbortController();
    activeController = controller;
    const task = (async () => {
      setStatus("Pobieranie warstw EGiB…", "loading");
      try {
        let nextFeatures;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            nextFeatures = await fetchGeoJson(controller.signal);
            break;
          } catch (error) {
            if (controller.signal.aborted || error?.name === "AbortError") throw error;
            if (error?.name === "HttpResponseError" || attempt === 1) throw error;
            await waitForRetry(controller.signal);
          }
        }
        if (disposed || token !== generation || controller.signal.aborted) return;
        renderFeatures(nextFeatures);
        setStatus("Warstwy EGiB wczytane. Obiekty: " + nextFeatures.length + ".", "ready");
      } catch (error) {
        if (disposed || controller.signal.aborted || error?.name === "AbortError") return;
        setStatus(error?.message || "Nie udało się pobrać warstw EGiB.", "error", true);
      } finally {
        if (activeController === controller) activeController = null;
        if (activePromise === task) activePromise = null;
      }
    })();
    activePromise = task;
    await task;
  }

  function scheduleRefresh(forceHealth = false) {
    if (disposed) return;
    generation += 1;
    const token = generation;
    activeController?.abort();
    if (debounceHandle !== null) clearTimeoutFn(debounceHandle);
    debounceHandle = setTimeoutFn(() => {
      debounceHandle = null;
      void refresh(token, forceHealth);
    }, debounceMs);
  }

  function findFeature(id) {
    return features.find((feature) => matchesFeatureId(feature, id)) ?? null;
  }

  function addSelected(selection) {
    if (!map || !leaflet || !selection?.geometry || !selection?.parcel?.id) return null;
    const id = String(selection.parcel.id);
    const previous = selected.get(id);
    if (previous) {
      previous.selection = { ...previous.selection, ...selection };
      persistSelections();
      return previous.layer;
    }
    const layer = leaflet.geoJSON(selection.geometry, {
      pane: "dzialki-selection-pane",
      style: () => ({
        color: getDzialkiState().appearance.selectionColor, weight: 5, fillColor: getDzialkiState().appearance.selectionColor,
        fillOpacity: getDzialkiState().thematicLayers.ownership ? 0 : 0.42,
        className: "dzialki-selected-parcel", bubblingMouseEvents: true,
      }),
    });
    selected.set(id, { selection, layer });
    map.addLayer(layer);
    persistSelections();
    return layer;
  }

  function persistSelections() {
    updateDzialkiState({
      selectedMapParcels: [...selected.values()].map(({ selection }) => selection),
      mapSelectionInitialized: true,
    });
  }

  function updateBoundPopup(entry) {
    if (!entry?.layer || typeof entry.layer.bindPopup !== "function") return;
    entry.layer.bindPopup(popupContent(document, entry.selection,
      "Działka zaznaczona. Opcja odznaczenia jest w menu pod prawym przyciskiem."), mapPopupOptions(map));
  }

  function addSearchSelection(selection) {
    const layer = addSelected(selection);
    updateBoundPopup(selected.get(String(selection?.parcel?.id ?? "")));
    if (layer && map && typeof layer.getBounds === "function") {
      map.fitBounds(layer.getBounds(), { padding: [28, 28], maxZoom: 20 });
    }
    return layer;
  }

  function updateSearchSelection(selection) {
    const id = String(selection?.parcel?.id ?? "");
    const entry = selected.get(id);
    if (entry) {
      entry.selection = { ...entry.selection, ...selection };
      updateBoundPopup(entry);
      persistSelections();
    }
  }

  function restoreSelections(selections = []) {
    for (const selection of Array.isArray(selections) ? selections : []) {
      const layer = addSelected(selection);
      if (layer) updateBoundPopup(selected.get(String(selection?.parcel?.id ?? "")));
    }
  }

  function refreshAppearance() {
    const { appearance: { outlineColor, selectionColor }, thematicLayers } = getDzialkiState();
    outlineLayer?.setStyle({color:outlineColor});
    for (const {layer} of selected.values()) {
      layer.setStyle({ color: selectionColor, fillColor: selectionColor, fillOpacity: thematicLayers.ownership ? 0 : 0.42 });
    }
  }
  function clearSelections() {
    clickController?.abort();
    for (const {layer} of selected.values()) if (map?.hasLayer(layer)) map.removeLayer(layer);
    selected.clear();persistSelections();
    map?.closePopup?.();
    setStatus("Zaznaczenie wyczyszczone.","ready");
  }

  async function handleMapClick(event) {
    if (options.isMapInteractionBlocked?.() || disposed || !map || map.getZoom() < EGiB_MIN_ZOOM
        || !(readLayerOptions().numbers || readLayerOptions().parcels)) return;
    return runParcelAction(event.latlng, "info", event);
  }

  async function setSelectionAt(point, shouldSelect) {
    if (disposed || !map || options.isMapInteractionBlocked?.()) return;
    const entry = [...selected.values()].find(item => parcelContainsPoint(item.selection.geometry, point));
    if (entry) {
      clickController?.abort();
      if (shouldSelect) setStatus("Ta działka jest już zaznaczona.", "ready");
      else removeSelected(entry.selection.parcel.id, entry);
      return;
    }
    if (map.getZoom() < EGiB_MIN_ZOOM) {
      setStatus("Przybliż mapę co najmniej do poziomu 13, aby wskazać działkę.", "ready");
      return;
    }
    return runParcelAction(point, shouldSelect ? "select" : "deselect");
  }

  function removeSelected(id, entry) {
    map.removeLayer(entry.layer);
    selected.delete(id);
    persistSelections();
    setStatus("Odznaczono tę działkę.", "ready");
  }

  async function runParcelAction(point, action, event) {
    clickController?.abort();
    const controller = new AbortController();
    clickController = controller;
    if (action !== "info") setStatus("Sprawdzanie wskazanej działki…", "loading");
    try {
      const response = await fetchImpl(buildMapClickFeatureInfoUrl(point), {
        method: "GET", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]), redirect: "error",
      });
      if (!response?.ok) throw new Error("Usługa EGiB nie odpowiedziała prawidłowo.");
      const text = await response.text();
      if (controller.signal.aborted || disposed) return;
      const id = readKiegParcelId(text);
      if (!id) {
        setStatus("Nie znaleziono działki w tym miejscu.", "ready");
        if (event && options.extendPopup) openParcelPopup("Brak działki w tym miejscu.", event, null);
        return;
      }
      const entry = selected.get(id);
      if (action === "deselect") {
        if (entry) removeSelected(id, entry);
        else setStatus("Ta działka nie jest zaznaczona.", "ready");
        return;
      }
      if (action === "select" && entry) {
        setStatus("Ta działka jest już zaznaczona.", "ready");
        return;
      }
      let geometry = entry?.selection.geometry ?? findFeature(id)?.geometry;
      if (action === "select" && !geometry) {
        const parts = /^(\d{6}_\d\.\d{4})\.(.+)$/.exec(id);
        if (parts) {
          const parcel = await createSearchApi({ fetchImpl, timeoutMs: 20000, retries: 0 })
            .parcel(parts[1], parts[2], { signal: controller.signal });
          if (parcel?.id === id) geometry = parcel.geometry;
        }
        controller.signal.throwIfAborted();
      }
      if (action === "select" && !geometry) throw new Error("Brak geometrii działki.");
      const selection = { ...entry?.selection, parcel: { id, number: labelText(id) }, geometry,
        egib: parseKiegFeatureInfo(text, id, geometry) };
      if (event) {
        openParcelPopup(popupContent(document, selection, entry ? "Działka zaznaczona." : ""), event, selection);
      } else {
        addSelected(selection);
        setStatus("Zaznaczono tę działkę.", "ready");
      }
    } catch (error) {
      if (controller.signal.aborted || error?.name === "AbortError" || disposed) return;
      setStatus(event ? "Nie udało się pobrać informacji o działce."
        : "Nie udało się zmienić zaznaczenia. Wskaż działkę ponownie.", "error", Boolean(event));
      if (event && options.extendPopup) openParcelPopup("Nie udało się pobrać danych działki.", event, null);
    } finally {
      if (clickController === controller) clickController = null;
    }
  }

  function openParcelPopup(content, event, selection) {
    if (!leaflet?.popup) return;
    const extended = options.extendPopup ? options.extendPopup(content, event, selection) : content;
    const popup = leaflet.popup(mapPopupOptions(map)).setLatLng(event.latlng).setContent(extended).openOn(map);
    options.onPopupOpen?.(popup);
  }

  function attach(nextMap, nextLeaflet) {
    if (disposed || map) return;
    map = nextMap;
    leaflet = nextLeaflet;
    parcelWms = leaflet.tileLayer.wms(KIEG_ENDPOINT, {
      pane: "dzialki-parcels-pane",
      layers: "dzialki",
      styles: "",
      version: "1.1.1",
      format: "image/png",
      transparent: true,
      crs: leaflet.CRS.EPSG3857,
      opacity: 0.95,
      maxZoom: 22,
      updateWhenZooming: false,
      updateWhenIdle: true,
      keepBuffer: 1,
      className: "dzialki-egib-parcels-tile",
    });
    buildingWms = leaflet.tileLayer.wms(KIEG_ENDPOINT, {
      pane: "dzialki-buildings-pane",
      layers: "budynki",
      styles: "",
      version: "1.1.1",
      format: "image/png",
      transparent: true,
      crs: leaflet.CRS.EPSG3857,
      opacity: 0.95,
      maxZoom: 22,
      updateWhenZooming: false,
      updateWhenIdle: true,
      keepBuffer: 1,
      className: "dzialki-egib-buildings-tile",
    });
    attachKiegTileRetries();
    map.on("moveend", scheduleRefresh);
    map.on("moveend", resetCompletenessWindow);
    map.on("zoomend", applyVisibility);
    map.on("click", handleMapClick);
    for (const layer of [parcelWms, buildingWms]) {
      layer.on("tileload", updateCompleteness);
      layer.on("tileerror", updateCompleteness);
      layer.on("tileunload", updateCompleteness);
    }
    healthUnsubscribe = (options.subscribeBackendStatus ?? subscribeBackendStatus)("Dzialki", (next) => {
      if (next.state === "ready" && (readLayerOptions().numbers || readLayerOptions().parcels)) scheduleRefresh();
    });
    applyVisibility();
  }

  for (const [id, input] of inputs) {
    input.addEventListener("change", () => {
      const current = getDzialkiState().egibLayers;
      updateDzialkiState({ egibLayers: { ...current, [id]: input.checked } });
      applyVisibility();
    });
  }
  group.addEventListener("toggle", () => {
    updateDzialkiState({ layerGroups: { ...getDzialkiState().layerGroups, egib: group.open } });
  });
  retry.addEventListener("click", () => {
    completenessRetryVisible = false;
    syncRetryButton();
    resetCompletenessWindow();
    retryFailedTiles();
    scheduleRefresh(true);
  });

  function cleanup() {
    if (disposed) return;
    disposed = true;
    generation += 1;
    if (debounceHandle !== null) clearTimeoutFn(debounceHandle);
    if (retryDelayHandle !== null) clearTimeoutFn(retryDelayHandle);
    clearCompletenessTimer();
    activeController?.abort();
    clickController?.abort();
    healthUnsubscribe();
    if (map) {
      map.off("moveend", scheduleRefresh);
      map.off("moveend", resetCompletenessWindow);
      map.off("zoomend", applyVisibility);
      map.off("click", handleMapClick);
      clearDataLayers();
      for (const { layer } of selected.values()) if (map.hasLayer(layer)) map.removeLayer(layer);
      if (parcelWms && map.hasLayer(parcelWms)) map.removeLayer(parcelWms);
      if (buildingWms && map.hasLayer(buildingWms)) map.removeLayer(buildingWms);
    }
    parcelTileRetry?.cancel();
    buildingTileRetry?.cancel();
    for (const layer of [parcelWms, buildingWms]) {
      layer?.off("tileload", updateCompleteness);
      layer?.off("tileerror", updateCompleteness);
      layer?.off("tileunload", updateCompleteness);
    }
    parcelTileRetry = null;
    buildingTileRetry = null;
    if (typeof window !== "undefined") delete window.__DZIALKI_KIEG_TILE_STATS__;
    selected.clear();
  }

  return {
    attach,
    cleanup,
    addSearchSelection,
    updateSearchSelection,
    restoreSelections,
    refreshAppearance,
    setSelectionAt,
    clearSelections,
    cancelMapInteraction: () => clickController?.abort(),
    refresh: () => scheduleRefresh(true),
    retryFailedTiles() {
      const parcels = parcelTileRetry?.retryVisible() ?? false;
      const buildings = buildingTileRetry?.retryVisible() ?? false;
      return parcels || buildings;
    },
    getKiegTileStats: readKiegTileStats,
    getVisibleKiegTiles: readVisibleKiegTiles,
    inputs,
    group,
    status,
  };
}
