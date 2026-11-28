import { checkBackend, getBackendStatus, subscribeBackendStatus } from "../../health.js";
import { getDzialkiState, updateDzialkiState } from "./state.js";
import { attachTileRetry } from "./tile-retry.js";
import { buildMapClickFeatureInfoUrl, countVisibleKiegTiles, EGiB_MIN_ZOOM } from "./egib-layers.js";
import { loadPlanningProjection, createEmapaLayer } from "./planning-projection.js";
import { PLANNING_LAYERS, POG_GUGIK_WMS, NO_MPZP, NO_DRAFT_ZONE, buildEmapaCapabilitiesUrl,
  buildEmapaInfoUrl, buildDraftZoneInfoUrl, parseEmapaInfo, parseDraftZoneInfo, planningRequest, loadMpzp } from "./planning-services.js";
import { renderMpzp, renderAdoptedPog, renderDraftPog } from "./planning-popup.js";

const HELP = {
  mpzp: "Typowe oznaczenia MPZP — dokładne znaczenie ustala konkretna uchwała: MN – zabudowa jednorodzinna; MW – wielorodzinna; MU – mieszkaniowo-usługowa; U – usługi; UC – handel wielkopowierzchniowy; UO – oświata; UZ – zdrowie; US – sport/rekreacja; P – produkcja, składy, magazyny; PU – produkcyjno-usługowa; R – rolnictwo; RM – zabudowa zagrodowa; ZL/LS – lasy; ZP – parki; ZN – zieleń nieurządzona; ZC – cmentarze; ZD – ogrody działkowe; WS – wody; KDG/KDZ/KDL/KDD – drogi; KK – kolej; KS – parkingi; E/W/K/G/C – infrastruktura techniczna.",
  buildingLines: "Warstwa krajowa pokazuje udostępnione wektorowo linie zabudowy, w tym nieprzekraczalne. Usługa nie rozróżnia rodzaju wszystkich linii. Publikacja zależy od gminy; plany wyłącznie rastrowe nie mają tu osobnej warstwy linii. Widoczność od skali 1:5 000 i większego przybliżenia. Źródło: Geoportal / KIMPZP.",
  pogDraftGugik: "Legenda stref planistycznych – GUGiK. Kliknij mapę w obrębie strefy, aby zobaczyć jej oznaczenie i dane.",
};
export const PLANNING_LEGEND_URLS = Object.freeze({
  buildingLines: "https://opendata.geoportal.gov.pl/Geoportal/ikony/mpzp/mpzp-lzb.png",
  pogDraftGugik: POG_GUGIK_WMS + "?version=1.3.0&service=WMS&request=GetLegendGraphic&sld_version=1.1.0&layer=strefaPlanistyczna&format=image/png&STYLE=default",
});
function node(document, tag, text, className) {
  const result = document.createElement(tag);
  if (text !== undefined) result.textContent = text;
  if (className) result.className = className;
  return result;
}
function mercator(lng, lat) {
  const r = 6378137, phi = Math.max(-85.0511287798, Math.min(85.0511287798, lat)) * Math.PI / 180;
  return [r * lng * Math.PI / 180, r * Math.log(Math.tan(Math.PI / 4 + phi / 2))];
}

export function mountPlanningLayers(container, options = {}) {
  const document = options.document ?? globalThis.document;
  const fetchImpl = options.fetchImpl ?? ((...args) => globalThis.fetch(...args));
  const setTimer = options.setTimeoutFn ?? setTimeout, clearTimer = options.clearTimeoutFn ?? clearTimeout;
  const now = options.nowFn ?? Date.now;
  const entries = new Map();
  const capabilities = new Map();
  let map, L, disposed = false, viewTimer = null, coverageController = null, popupController = null, activePopupRoot = null;
  let popupBackendStatus = null;
  let activePopup = null;
  let coverageGeneration = 0;
  const enabled = () => getDzialkiState().planningLayers;

  for (const [id, def] of Object.entries(PLANNING_LAYERS)) {
    const row = node(document, "div", undefined, "dzialki-planning-row");
    const input = node(document, "input");
    input.type = "checkbox";
    input.id = "dzialki-planning-" + id;
    input.dataset.planningLayer = id;
    input.checked = enabled()[id];
    const label = node(document, "label", def.label);
    label.htmlFor = input.id;
    row.append(input, label);
    if (HELP[id]) {
      const help = node(document, "p", HELP[id], "dzialki-planning-help");
      help.id = input.id + "-help";
      help.hidden = true;
      const button = node(document, "button", "?", "dzialki-layer-help-button");
      button.type = "button";
      button.setAttribute("aria-label", "Informacja: " + def.label);
      button.setAttribute("aria-controls", help.id);
      button.setAttribute("aria-expanded", "false");
      let image;
      button.addEventListener("click", () => {
        help.hidden = !help.hidden;
        button.setAttribute("aria-expanded", String(!help.hidden));
        if (!help.hidden && PLANNING_LEGEND_URLS[id] && !image) {
          image = node(document, "img");
          image.alt = "Legenda: " + def.label;
          image.src = PLANNING_LEGEND_URLS[id];
          help.append(image);
        }
      });
      row.append(button);
      container.append(row, help);
    } else container.append(row);
    const status = node(document, "p", "Warstwa wyłączona.", "dzialki-planning-status");
    status.dataset.planningStatus = id;
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const retry = node(document, "button", "Spróbuj ponownie: " + def.label, "dzialki-planning-retry");
    retry.type = "button";
    retry.hidden = true;
    container.append(status, retry);
    const entry = { id, def, input, status, retry, layers: [], retries: [], timer: null, started: null, coverage: "inactive", coverageText: "" };
    entries.set(id, entry);
    input.addEventListener("change", () => {
      updateDzialkiState({ planningLayers: { ...enabled(), [id]: input.checked } });
      sync(entry);
      if (id === "pogAdopted") scheduleCoverage();
    });
    retry.addEventListener("click", () => {
      for (const layer of entry.layers) layer.redraw?.();
      sync(entry);
      if (id === "pogAdopted") scheduleCoverage();
    });
  }
  container.append(node(document, "p", "Wczytanie kafelków potwierdza otrzymanie obrazu usługi, nie kompletność publikacji gminy. Pusty obszar może oznaczać brak opublikowanych danych.", "dzialki-help"));

  function stopMonitor(entry) {
    if (entry.timer !== null) clearTimer(entry.timer);
    entry.timer = null;
  }
  function monitor(entry) {
    stopMonitor(entry);
    if (disposed || !map || !enabled()[entry.id]) return;
    const stats = countVisibleKiegTiles(entry.layers, map);
    entry.status.dataset.loaded = String(stats.loaded);
    entry.status.dataset.total = String(stats.total);
    const awaitingCoverage = entry.id === "pogAdopted" && ["loading", "error"].includes(entry.coverage);
    const complete = stats.total > 0 && stats.missing === 0 && !awaitingCoverage;
    const exhausted = now() - entry.started >= 40000 || entry.coverage === "error";
    entry.status.dataset.state = complete ? "complete" : exhausted ? "incomplete" : "loading";
    entry.status.textContent = (complete ? "Kafelki wczytane: " : exhausted ? "Niepełne wczytanie: " : "Wczytywanie: ")
      + stats.loaded + "/" + stats.total + (entry.coverageText ? ". " + entry.coverageText : "");
    entry.retry.hidden = complete || !exhausted;
    if (!complete && !exhausted) entry.timer = setTimer(() => {
      entry.timer = null;
      for (const retry of entry.retries) retry.retryIncompleteVisible();
      monitor(entry);
    }, Math.min(3000, Math.max(0, 40000 - (now() - entry.started))));
  }
  function remove(entry) {
    stopMonitor(entry);
    for (const retry of entry.retries) retry.cancel();
    entry.retries = [];
    for (const layer of entry.layers) {
      if (map?.hasLayer(layer)) map.removeLayer(layer);
    }
    entry.layers = [];
  }
  function watch(entry, layer) {
    entry.layers.push(layer);
    const start = (event) => { if (event.tile?.dataset) event.tile.dataset.planningPending = "true"; };
    const finish = (event) => {
      if (event.tile?.dataset) event.tile.dataset.planningPending = "false";
      monitor(entry);
    };
    layer.on("tileloadstart", start);
    for (const event of ["tileload", "tileerror", "tileunload"]) layer.on(event, finish);
    const retry = attachTileRetry(layer, {
      setTimeoutImpl: setTimer, clearTimeoutImpl: clearTimer,
      isVisible: (event) => map?.hasLayer(layer) && event.tile?.dataset?.planningPending !== "true"
        && event.tile?.dataset?.tileState !== "loading",
      retryTile: (event, target) => {
        if (event.tile?.retryPlanningTile) event.tile.retryPlanningTile();
        else if (target.getTileUrl && event.coords && event.tile?.removeAttribute) {
          event.tile.removeAttribute("src");
          event.tile.src = target.getTileUrl(event.coords);
        } else target.redraw();
      },
    });
    const cancel = retry.cancel;
    entry.retries.push({ ...retry, cancel() {
      cancel();
      layer.off("tileloadstart", start);
      for (const event of ["tileload", "tileerror", "tileunload"]) layer.off(event, finish);
    } });
    map.addLayer(layer);
  }
  function sync(entry) {
    if (!map || disposed) return;
    if (!enabled()[entry.id]) {
      remove(entry);
      entry.status.dataset.state = "inactive";
      entry.status.textContent = "Warstwa wyłączona.";
      entry.retry.hidden = true;
      if (entry.id === "pogAdopted") { coverageController?.abort(); entry.coverage = "inactive"; entry.coverageText = ""; }
      return;
    }
    entry.started = now();
    if (!entry.layers.length) {
      const def = entry.def;
      watch(entry, L.tileLayer.wms(def.url, { pane: "overlayPane", layers: def.layers, styles: def.styles,
        version: def.version, crs: L.CRS[def.crs], format: "image/png", transparent: true, opacity: def.opacity,
        tileSize: def.tileSize, maxZoom: 22, updateWhenZooming: false, updateWhenIdle: true, keepBuffer: 1,
        attribution: "© " + (def.url.includes("rejestr-urbanistyczny") ? "Rejestr Urbanistyczny" : "GUGiK / Geoportal"),
        className: "dzialki-planning-tile-" + entry.id,
      }));
    }
    monitor(entry);
  }

  async function parcelIdAt(latlng, signal) {
    const xml = await planningRequest(buildMapClickFeatureInfoUrl(latlng), { fetchImpl, signal, format: "text" });
    const match = xml.match(/<Attribute\b[^>]*\bName\s*=\s*["']Identyfikator działki["'][^>]*>([\s\S]*?)<\/Attribute\s*>/i);
    const id = match?.[1]?.replace(/^<!\[CDATA\[|\]\]>$/g, "").trim();
    return /^\d{6}_\d\.\d{4}\.[0-9A-Za-z./-]{1,32}$/.test(id ?? "") ? id : null;
  }
  async function hasCapabilities(teryt, signal) {
    if (capabilities.has(teryt)) return capabilities.get(teryt);
    try {
      const response = await planningRequest(buildEmapaCapabilitiesUrl(teryt), { fetchImpl, signal, format: "text" });
      if (!/WMS_Capabilities|WMT_MS_Capabilities/.test(response) || /ServiceException|ExceptionReport/.test(response)) throw new Error("Brak poprawnego dokumentu WMS.");
      capabilities.set(teryt, true);
      return true;
    } catch (error) {
      if (error.status === 404) { capabilities.set(teryt, false); return false; }
      throw error;
    }
  }
  function scheduleCoverage() {
    if (viewTimer !== null) clearTimer(viewTimer);
    coverageController?.abort();
    const generation = ++coverageGeneration;
    const entry = entries.get("pogAdopted");
    while (entry.layers.length > 1) {
      entry.retries.pop().cancel();
      const old = entry.layers.pop();
      if (map?.hasLayer(old)) map.removeLayer(old);
    }
    if (!enabled().pogAdopted || !map || disposed) return;
    if (map.getZoom() < 13) {
      entry.coverage = "below-zoom";
      entry.coverageText = "Uzupełnienie gminne dostępne od przybliżenia 13";
      monitor(entry);
      return;
    }
    entry.coverage = "loading";
    entry.coverageText = "Sprawdzanie uzupełnienia gminnego POG";
    monitor(entry);
    viewTimer = setTimer(async () => {
      viewTimer = null;
      const controller = new AbortController();
      coverageController = controller;
      try {
        const id = await parcelIdAt(map.getCenter(), controller.signal);
        if (!id) throw new Error("Nie ustalono gminy w środku widoku");
        const teryt = id.slice(0, 6);
        const available = await hasCapabilities(teryt, controller.signal);
        if (controller.signal.aborted || disposed || generation !== coverageGeneration) return;
        if (available) {
          const project = await (options.loadProjection ?? loadPlanningProjection)();
          if (controller.signal.aborted || disposed || generation !== coverageGeneration) return;
          watch(entry, (options.createEmapaLayer ?? createEmapaLayer)(L, { project, teryt, documentRef: document }));
          entry.coverageText = "Uzupełnienie gminne POG aktywne";
        } else entry.coverageText = "Brak usługi gminnej POG (HTTP 404); dostępna warstwa Rejestru Urbanistycznego";
        entry.coverage = available ? "ready" : "no-data";
      } catch (error) {
        if (controller.signal.aborted || disposed || generation !== coverageGeneration) return;
        entry.coverage = "error";
        entry.coverageText = "Nie udało się sprawdzić uzupełnienia gminnego POG";
      }
      monitor(entry);
    }, 500);
  }

  function resetView() {
    for (const entry of entries.values()) if (enabled()[entry.id]) { entry.started = now(); monitor(entry); }
    scheduleCoverage();
  }
  const cancelPopupRequests = () => popupController?.abort();
  function updatePopupLayout() {
    const content = activePopup?.getContent?.();
    if (content === activePopupRoot || content?.contains?.(activePopupRoot)) activePopup.update?.();
  }
  const unsubscribe = (options.subscribeBackendStatus ?? subscribeBackendStatus)("Dzialki", (status) => {
    if (popupBackendStatus && status.state === "waking") popupBackendStatus.textContent = "Usługa się budzi · oczekiwanie: " + status.waitSeconds + " s";
  });
  async function backendReady(signal) {
    signal.throwIfAborted();
    const cached = (options.getBackendStatus ?? getBackendStatus)("Dzialki");
    if (cached.state !== "ready") {
      const result = await (options.checkBackend ?? checkBackend)("Dzialki", { force: cached.state === "error" });
      signal.throwIfAborted();
      if (result.state !== "ready") throw new Error("Backend nie odpowiedział.");
    }
  }
  function extendPopup(content, event, selection = null) {
    popupController?.abort();
    if (disposed || !(enabled().mpzp || enabled().pogAdopted || enabled().pogDraftGugik)) return content;
    const controller = new AbortController();
    popupController = controller;
    const signal = controller.signal;
    const root = node(document, "div", undefined, "dzialki-planning-popup");
    if (typeof content === "string") root.append(node(document, "p", content));
    else root.append(content);
    activePopupRoot = root;
    let idTask;
    const parcelId = () => idTask ??= selection?.parcel?.id
      ? Promise.resolve(selection.parcel.id) : parcelIdAt(event.latlng, signal);
    function section(label, load, render, empty) {
      const section = node(document, "section");
      section.append(node(document, "h4", label));
      const status = node(document, "p", "Wczytywanie…");
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      section.append(status);
      const body = node(document, "div");
      const retry = node(document, "button", "Spróbuj ponownie");
      retry.type = "button";
      retry.hidden = true;
      section.append(body, retry);
      root.append(section);
      async function run() {
        retry.hidden = true;
        body.replaceChildren();
        section.dataset.state = "loading";
        status.textContent = "Wczytywanie…";
        try {
          const result = await load();
          if (signal.aborted || disposed) return;
          const found = render(document, body, result);
          const incomplete = result?.incomplete;
          section.dataset.state = incomplete ? "incomplete" : found ? "ready" : "empty";
          status.textContent = incomplete ? "Nie udało się sprawdzić wszystkich źródeł planu. Wynik jest niepełny." : found ? "Wczytano." : empty;
          retry.hidden = !incomplete;
          updatePopupLayout();
        } catch {
          if (signal.aborted || disposed) return;
          section.dataset.state = "error";
          status.textContent = "Nie udało się pobrać informacji z usługi. Spróbuj ponownie.";
          retry.hidden = false;
          updatePopupLayout();
        }
      }
      retry.addEventListener("click", () => { idTask = null; void run(); });
      signal.addEventListener("abort", () => {
        if (section.dataset.state === "loading") {
          section.dataset.state = "cancelled";
          status.textContent = "Anulowano sprawdzanie. Kliknij ponownie wybrane miejsce.";
          retry.hidden = true;
        }
      }, { once: true });
      void run();
      return status;
    }
    if (enabled().mpzp) popupBackendStatus = section("Plan miejscowy", async () => {
      let parcelFailed = false;
      const id = await parcelId().catch((error) => {
        if (signal.aborted) throw error;
        parcelFailed = true;
        return null;
      });
      await backendReady(signal);
      const result = await loadMpzp(event.latlng, id, { signal, fetchImpl });
      return { ...result, incomplete: result.incomplete || parcelFailed };
    }, renderMpzp, NO_MPZP);
    if (enabled().pogAdopted) section("Uchwalony plan ogólny – usługa gminna", async () => {
      const id = await parcelId();
      if (!id) throw new Error("Nie ustalono gminy.");
      if (!await hasCapabilities(id.slice(0, 6), signal)) return { zones: [], plan: null };
      const project = await (options.loadProjection ?? loadPlanningProjection)();
      const xml = await planningRequest(buildEmapaInfoUrl(id.slice(0, 6), project([event.latlng.lng, event.latlng.lat])), { signal, fetchImpl, format: "text" });
      return parseEmapaInfo(xml, options.DOMParser ?? globalThis.DOMParser);
    }, renderAdoptedPog, "Brak danych uchwalonej strefy w usłudze gminnej dla tego miejsca.");
    if (enabled().pogDraftGugik) section("Projektowany plan ogólny – GUGiK", async () => {
      const bounds = map.getBounds(), size = map.getSize();
      const sw = mercator(bounds.getWest(), bounds.getSouth()), ne = mercator(bounds.getEast(), bounds.getNorth());
      const html = await planningRequest(buildDraftZoneInfoUrl({ bbox: [...sw, ...ne], size,
        pixel: event.containerPoint ?? map.latLngToContainerPoint(event.latlng) }), { signal, fetchImpl, format: "text" });
      return parseDraftZoneInfo(html, options.DOMParser ?? globalThis.DOMParser);
    }, renderDraftPog, NO_DRAFT_ZONE);
    return root;
  }
  async function standaloneClick(event) {
    if (options.isMapInteractionBlocked?.()) return;
    popupController?.abort();
    if (disposed || !map || !L || !(enabled().mpzp || enabled().pogAdopted || enabled().pogDraftGugik || options.hasAdditionalPopup?.())) return;
    const egib = getDzialkiState().egibLayers;
    if (map.getZoom() >= EGiB_MIN_ZOOM && (egib.numbers || egib.parcels)) return;
    const base = node(document,"p","Informacje dla wskazanego miejsca.");
    const content = options.extendStandalonePopup ? options.extendStandalonePopup(base,event) : extendPopup(base,event);
    activePopup = L.popup({ maxWidth: 380, maxHeight: 450 }).setLatLng(event.latlng).setContent(content).openOn(map);
    options.onPopupOpen?.(activePopup);
  }
  const closePopup = (event) => {
    const content = event.popup?.getContent?.();
    if (content === activePopupRoot || content?.contains?.(activePopupRoot)) popupController?.abort();
  };
  return {
    extendPopup,
    cancelMapInteraction: cancelPopupRequests,
    onPopupOpen(popup) { activePopup = popup; },
    attach(nextMap, nextL) {
      map = nextMap;
      L = nextL;
      for (const entry of entries.values()) sync(entry);
      map.on("moveend", resetView);
      map.on("zoomend", resetView);
      map.on("click", standaloneClick);
      map.on("popupclose", closePopup);
      for (const name of ["dragstart", "zoomstart", "keydown"]) map.on(name, cancelPopupRequests);
      scheduleCoverage();
    },
    cleanup() {
      if (disposed) return;
      disposed = true;
      if (viewTimer !== null) clearTimer(viewTimer);
      coverageController?.abort();
      popupController?.abort();
      unsubscribe();
      for (const entry of entries.values()) remove(entry);
      for (const [name, handler] of [["moveend", resetView], ["zoomend", resetView], ["click", standaloneClick], ["popupclose", closePopup]]) map?.off(name, handler);
      for (const name of ["dragstart", "zoomstart", "keydown"]) map?.off(name, cancelPopupRequests);
    },
  };
}
