import { BACKENDS } from "../../config.js";

export const MPZP_WMS = "https://mapy.geoportal.gov.pl/wss/ext/KrajowaIntegracjaMiejscowychPlanowZagospodarowaniaPrzestrzennego";
export const POG_RU_WMS = "https://rejestr-urbanistyczny.gov.pl/uslugi-sieciowe/wms-pog/ows";
export const POG_GUGIK_WMS = "https://mapy.geoportal.gov.pl/wss/ext/ProjektowanePlanyOgolneGmin";
export const EMAPA_POG_BASE = "https://wms.e-mapa.net/cgi-bin/pog/";
export const PLANNING_LAYERS = Object.freeze({
  mpzp: { label: "MPZP – plany miejscowe", url: MPZP_WMS, layers: "plany,raster,wektor-str,wektor-lzb,wektor-pow,wektor-lin,wektor-pkt,granice", version: "1.1.1", styles: "", crs: "EPSG3857", opacity: 0.6, tileSize: 1024 },
  buildingLines: { label: "Linie zabudowy w MPZP (w tym nieprzekraczalne)", url: MPZP_WMS, layers: "wektor-lzb", version: "1.3.0", styles: "default", crs: "EPSG3857", opacity: 0.95, tileSize: 256 },
  pogAdopted: { label: "Plan ogólny gminy – uchwalony", url: POG_RU_WMS, layers: "APP.POG.PrawnieWiazacyLubRealizowany", version: "1.3.0", styles: "", crs: "EPSG4326", opacity: 0.6, tileSize: 256 },
  pogDraftRu: { label: "Plan ogólny gminy – projektowany (Rejestr Urbanistyczny)", url: POG_RU_WMS, layers: "APP.POG.WOpracowaniu,APP.POG.WTrakciePrzyjmowania", version: "1.3.0", styles: ",", crs: "EPSG4326", opacity: 0.6, tileSize: 256 },
  pogDraftGugik: { label: "Plan ogólny gminy – projektowany (GUGiK)", url: POG_GUGIK_WMS, layers: "strefaPlanistyczna", version: "1.3.0", styles: "default", crs: "EPSG3857", opacity: 0.6, tileSize: 256 },
});

export const NO_MPZP = "Sprawdzone źródła nie zwróciły szczegółów dla tego punktu. Rysunek MPZP na mapie może nadal pokazywać plan.";
export const NO_DRAFT_ZONE = "Brak danych projektowanej strefy w tym miejscu.";

// Public GetFeatureInfo example from GUGiK's KIMPZP documentation. Opened by the user.
export function buildMpzpMapInfoLink([east, north]) {
  if (![east, north].every(Number.isFinite)) throw new TypeError("Nieprawidłowy punkt EPSG:2180.");
  const layers = "granice,raster,wektor-str,wektor-lzb,wektor-lin,wektor-pow,wektor-pkt";
  return MPZP_WMS + "?" + new URLSearchParams({
    SERVICE: "WMS", VERSION: "1.1.1", REQUEST: "GetFeatureInfo",
    LAYERS: layers, QUERY_LAYERS: layers, SRS: "EPSG:2180",
    BBOX: [east - 50, north - 50, east + 50, north + 50].map(value => value.toFixed(2)).join(","),
    WIDTH: "101", HEIGHT: "101", X: "50", Y: "50",
    FORMAT: "image/png", INFO_FORMAT: "text/html", TRANSPARENT: "TRUE",
  });
}

function point(latlng) {
  const { lat, lng } = latlng ?? {};
  if (![lat, lng].every(Number.isFinite) || lat < -90 || lat > 90 || lng < -180 || lng > 180) throw new TypeError("Nieprawidłowy punkt mapy.");
  return latlng;
}
function commune(teryt) {
  if (!/^\d{6}$/.test(teryt ?? "")) throw new TypeError("Wymagany jest sześciocyfrowy kod gminy.");
  return teryt;
}

export function buildMpzpInfoUrl(latlng, teryt = null) {
  point(latlng);
  return BACKENDS.Dzialki.baseUrl + (teryt === null ? "/api/mpzp-info?" : "/api/mpzp-gmina-info?teryt=" + commune(teryt) + "&")
    + "lat=" + latlng.lat + "&lon=" + latlng.lng;
}
export function buildDzinfoUrl(parcelId) {
  if (!/^\d{6}_\d\.\d{4}\.[0-9A-Za-z./-]{1,32}$/.test(parcelId ?? "")) throw new TypeError("Nieprawidłowy identyfikator działki.");
  const url = new URL(BACKENDS.Dzialki.baseUrl + "/api/dzinfo");
  url.searchParams.set("id", parcelId);
  return url.toString();
}
export function buildEmapaCapabilitiesUrl(teryt) {
  return EMAPA_POG_BASE + commune(teryt) + "?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0";
}
export function buildEmapaInfoUrl(teryt, projected) {
  const [e, n] = projected ?? [];
  if (![e, n].every(Number.isFinite)) throw new TypeError("Nieprawidłowy punkt EPSG:2180.");
  const layers = encodeURIComponent("app.StrefaPlanistyczna,app.AktPlanowaniaPrzestrzennego.POG");
  return EMAPA_POG_BASE + commune(teryt) + "?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetFeatureInfo&LAYERS=" + layers
    + "&QUERY_LAYERS=" + layers + "&STYLES=%2C&SRS=EPSG:2180&BBOX=" + [e - 20, n - 20, e + 20, n + 20].join(",")
    + "&WIDTH=101&HEIGHT=101&X=50&Y=50&INFO_FORMAT=text%2Fxml&FEATURE_COUNT=5&FORMAT=image%2Fpng";
}
export function buildDraftZoneInfoUrl({ bbox, size, pixel }) {
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(Number.isFinite)
      || ![size?.x, size?.y, pixel?.x, pixel?.y].every(Number.isFinite) || size.x < 1 || size.y < 1) throw new TypeError("Nieprawidłowy widok mapy.");
  return POG_GUGIK_WMS + "?" + new URLSearchParams({
    SERVICE: "WMS", VERSION: "1.3.0", REQUEST: "GetFeatureInfo", LAYERS: "strefaPlanistyczna", QUERY_LAYERS: "strefaPlanistyczna",
    STYLES: "default", CRS: "EPSG:3857", BBOX: bbox.join(","), WIDTH: String(size.x), HEIGHT: String(size.y),
    FORMAT: "image/png", INFO_FORMAT: "text/html", I: String(Math.max(0, Math.min(size.x - 1, Math.floor(pixel.x)))),
    J: String(Math.max(0, Math.min(size.y - 1, Math.floor(pixel.y)))),
  });
}
export function buildPlanningGetMapUrl(id, bbox, width = PLANNING_LAYERS[id]?.tileSize, height = width) {
  const def = PLANNING_LAYERS[id];
  if (!def || !Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(Number.isFinite)
      || ![width, height].every((v) => Number.isInteger(v) && v > 0)) throw new TypeError("Nieprawidłowy kafelek planowania.");
  // Leaflet WMS emits lowercase bbox unless its uppercase option is explicitly set.
  const params = new URLSearchParams({ service: "WMS", request: "GetMap", layers: def.layers, styles: def.styles,
    format: "image/png", transparent: "true", version: def.version, width: String(width), height: String(height),
    [def.version === "1.3.0" ? "crs" : "srs"]: def.crs.replace("EPSG", "EPSG:"),
  });
  return def.url + "?" + params + "&bbox=" + bbox.join(",");
}

export function safePlanningHref(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function parseEmapaInfo(xml, Parser = globalThis.DOMParser) {
  const doc = new Parser().parseFromString(xml, "text/xml");
  if (doc.querySelector("parsererror") || /ServiceException|ExceptionReport/.test(xml)) throw new Error("Nieprawidłowa odpowiedź POG.");
  const zones = [];
  let plan = null;
  for (const layer of doc.querySelectorAll("Layer")) {
    for (const feature of layer.querySelectorAll("Feature")) {
      const fields = Object.fromEntries([...feature.querySelectorAll("Attribute")].map((node) => [node.getAttribute("name"), node.getAttribute("value")]));
      if (layer.getAttribute("name") === "app.StrefaPlanistyczna") zones.push(fields);
      else if (layer.getAttribute("name") === "app.AktPlanowaniaPrzestrzennego.POG" && !plan) plan = fields;
    }
  }
  return { zones, plan };
}

export function parseDraftZoneInfo(html, Parser = globalThis.DOMParser) {
  // Only text from a detached, resource-free document is read; service markup is never mounted.
  const inert = String(html).replace(/<(script|style|iframe|object|embed|video|audio)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(?:img|link|source|iframe|object|embed)\b[^>]*>/gi, "");
  if (/ServiceException|ExceptionReport/.test(inert)) throw new Error("Usługa zwróciła błąd strefy.");
  const doc = new Parser().parseFromString(inert, "text/html");
  return [...doc.querySelectorAll(".accordion-content ul")].map((ul) => {
    const result = {};
    for (const row of ul.querySelectorAll("li")) {
      const labelNode = row.querySelector(".list-item-value");
      if (!labelNode) continue;
      const label = labelNode.textContent.trim();
      const value = row.textContent.replace(labelNode.textContent, "").trim();
      if (label && value) Object.defineProperty(result, label, { value, enumerable: true });
    }
    return result;
  }).filter((record) => record.Oznaczenie || record.Symbol || record.Nazwa).slice(0, 2);
}

export async function planningRequest(url, { signal, fetchImpl = globalThis.fetch, format = "json" } = {}) {
  const response = await fetchImpl(url, { method: "GET", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) });
  if (!response.ok) throw Object.assign(new Error("Usługa planowania nie odpowiedziała poprawnie."), { status: response.status });
  return format === "json" ? response.json() : response.text();
}

export async function loadMpzp(latlng, parcelId, options = {}) {
  const teryt = /^\d{6}_/.test(parcelId ?? "") ? parcelId.slice(0, 6) : null;
  let failed = false;
  const read = (url) => planningRequest(url, options).catch((error) => {
    if (options.signal?.aborted) throw error;
    failed = true;
    return null;
  });
  const plansTask = (async () => {
    const gmina = teryt ? await read(buildMpzpInfoUrl(latlng, teryt)) : null;
    if (gmina && !Array.isArray(gmina.plans)) failed = true;
    if (Array.isArray(gmina?.plans) && gmina.plans.length) return gmina.plans;
    const ru = await read(buildMpzpInfoUrl(latlng));
    if (ru && typeof ru.found !== "boolean") failed = true;
    return ru?.found && Array.isArray(ru.plany) ? ru.plany.map((p) => ({ tytul: p.tytul, status: p.status,
      obowiazujeOd: p.wersjaOd, links: p.link ? [{ label: "Rejestr Urbanistyczny", href: p.link }] : [] })) : [];
  })();
  const [plans, details] = await Promise.all([plansTask, parcelId ? read(buildDzinfoUrl(parcelId)) : null]);
  return { plans, mpzp: details?.mpzp ?? null, incomplete: failed };
}
