#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { cp, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createStaticServer } from "./serve.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
export const SCENARIO_TIMEOUT_MS = 25000;
// A 1x1 transparent PNG fixture is 68 B; 128 B allows up to 60 B of PNG framing/chunks.
// Empty detection prefers body Content-Length / Network.dataReceived bytes; transfer length is retained too.
export const EMPTY_TILE_BYTE_THRESHOLD = 128;
export const MAX_ARCHIVE_REPEAT_TILES = 6;
export const ARCHIVE_REPEAT_DELAYS_MS = Object.freeze([1500, 4000]);
const MIN_SETTLE_MS = 6000;
const ARCHIVE_WMS_HOST = "mapy.geoportal.gov.pl";
const ARCHIVE_WMS_PATH = "/wss/service/PZGIK/ORTO/WMS/StandardResolutionTime";
const RELEVANT_ARCHIVE_HEADERS = Object.freeze({
  "access-control-allow-origin": "Access-Control-Allow-Origin",
  "timing-allow-origin": "Timing-Allow-Origin",
  "content-type": "Content-Type",
  "content-length": "Content-Length",
  "cache-control": "Cache-Control",
  age: "Age",
  via: "Via",
  "x-cache": "X-Cache",
});
const SEARCH_SERVICE_RULES = Object.freeze([
  {
    host: "mapy.geoportal.gov.pl",
    path: "/wss/ims/maps/PRG_gugik_wyszukiwarka/FeatureServer/1/query",
    kind: "counties",
  },
  {
    host: "mapy.geoportal.gov.pl",
    path: "/wss/ims/maps/PRG_gugik_wyszukiwarka/FeatureServer/0/query",
    kind: "communes",
  },
  { host: "uldk.gugik.gov.pl", path: "/", kind: "uldk" },
  { host: "integracja.gugik.gov.pl", path: "/cgi-bin/KrajowaIntegracjaEwidencjiGruntow", kind: "kieg" },
]);
const TILE_HOST_RULES = Object.freeze([
  { host: "tile.openstreetmap.org", subdomains: true, tilePath: true },
  { host: "server.arcgisonline.com", tilePath: true },
  { host: "mapy.geoportal.gov.pl", path: "/wss/service/PZGIK/ORTO/WMS/StandardResolutionTime", wmsGetMap: true },
]);

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function getArg(argv, key) {
  const prefix = key + "=";
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === key) return argv[index + 1] ?? "";
    if (value.startsWith(prefix)) return value.slice(prefix.length);
  }
  return "";
}

export function normalizeSearchLabel(value) {
  return String(value ?? "").replace(/[Łł]/g, "l").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pl-PL").trim().replace(/\s+/g, " ");
}

export function matchSearchOption(options, requestedLabel) {
  const target = normalizeSearchLabel(requestedLabel);
  const candidates = (Array.isArray(options) ? options : []).map((item) => ({
    label: String(item?.label ?? item?.textContent ?? ""),
    value: String(item?.value ?? ""),
  }));
  if (!target) return { option: null, match: null, reason: "missing", labels: candidates.map(({ label }) => label) };

  const stages = [
    ["exact", (label) => normalizeSearchLabel(label) === target],
    ["prefix", (label) => normalizeSearchLabel(label).startsWith(target)],
    ["contains", (label) => normalizeSearchLabel(label).includes(target)],
  ];
  for (const [match, predicate] of stages) {
    const matched = candidates.filter((item) => predicate(item.label));
    if (matched.length === 1) return { option: matched[0], match, reason: null, labels: candidates.map(({ label }) => label) };
    if (matched.length > 1) return { option: null, match, reason: "ambiguous", labels: candidates.map(({ label }) => label) };
  }
  return { option: null, match: null, reason: "missing", labels: candidates.map(({ label }) => label) };
}

export function formatSearchOptionError(result) {
  const labels = Array.isArray(result?.labels) ? result.labels : [];
  return "Nie można jednoznacznie dopasować pozycji listy. Dostępne etykiety: "
    + (labels.length ? labels.join(" | ") : "brak");
}

export function selectRelevantResponseHeaders(...sources) {
  const selected = {};
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    for (const [name, rawValue] of Object.entries(source)) {
      const canonicalName = RELEVANT_ARCHIVE_HEADERS[String(name).toLowerCase()];
      if (!canonicalName || rawValue === undefined || rawValue === null) continue;
      const value = Array.isArray(rawValue) ? rawValue.join(", ") : String(rawValue);
      selected[canonicalName] = value;
    }
  }
  return selected;
}

export function parseSearchArguments(argv = []) {
  const names = ["--powiat", "--gmina", "--obreb", "--numer"];
  const values = Object.fromEntries(names.map((name) => [name, getArg(argv, name).trim()]));
  const present = Object.values(values).filter(Boolean).length;
  if (present !== 0 && present !== names.length) {
    throw new Error("Scenariusz wyszukiwania wymaga argumentów --powiat, --gmina, --obreb i --numer.");
  }
  return present === names.length ? {
    powiat: values["--powiat"],
    gmina: values["--gmina"],
    obreb: values["--obreb"],
    numer: values["--numer"],
  } : null;
}

export function parseCdpMessage(message) {
  const raw = typeof message === "string" ? message : message?.data ?? message;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

export function parseCdpLoadingFailed(event = {}) {
  return {
    requestId: String(event.requestId ?? ""),
    errorText: typeof event.errorText === "string" ? event.errorText : "Unknown network error",
    canceled: event.canceled === true,
    blockedReason: typeof event.blockedReason === "string" ? event.blockedReason : null,
    timestamp: Number.isFinite(event.timestamp) ? event.timestamp : null,
  };
}

function isImageMime(value) {
  return typeof value === "string" && value.toLowerCase().startsWith("image/");
}

function responsePayloadBytes(request) {
  const contentLength = request.responseHeaders?.["Content-Length"]
    ?? request.responseHeaders?.["content-length"];
  if (contentLength !== undefined && /^\d+$/.test(String(contentLength))) return Number(contentLength);
  if (Number.isFinite(request.encodedBodyLength)) return request.encodedBodyLength;
  return Number.isFinite(request.encodedDataLength) ? request.encodedDataLength : null;
}

function isArchiveGetMapUrl(value) {
  let url;
  try { url = value instanceof URL ? value : new URL(value); } catch { return false; }
  const params = url.searchParams;
  return url.protocol === "https:" && !url.port && !url.username && !url.password && !url.hash
    && url.hostname === ARCHIVE_WMS_HOST && url.pathname === ARCHIVE_WMS_PATH
    && params.get("service")?.toUpperCase() === "WMS"
    && params.get("request")?.toUpperCase() === "GETMAP"
    && params.get("layers") === "Raster";
}

export function aggregateRequests(requests = []) {
  const statuses = [...new Set(requests.map((request) => request.status)
    .filter((status) => Number.isFinite(status)))].sort((a, b) => a - b);
  const canceled = requests.filter((request) => request.canceled);
  const empty = requests.filter((request) => !request.canceled
    && request.status === 200 && isImageMime(request.mimeType)
    && responsePayloadBytes(request) !== null
    && responsePayloadBytes(request) < EMPTY_TILE_BYTE_THRESHOLD);
  const loaded = requests.filter((request) => !request.canceled && !empty.includes(request)
    && request.status >= 200 && request.status < 300 && isImageMime(request.mimeType));
  const failed = requests.filter((request) => !request.canceled && !empty.includes(request) && (
    request.errorText || !Number.isFinite(request.status) || request.status < 200
    || request.status >= 300 || !isImageMime(request.mimeType)
  ));
  const coordinatesFor = (items) => [...new Set(items.map((request) => tileCoordinateKey(request.url)).filter(Boolean))].sort();
  return {
    total: requests.length,
    loaded: loaded.length,
    empty: empty.length,
    failed: failed.length,
    canceled: canceled.length,
    statuses,
    examples: failed.slice(0, 3).map((request) => request.url),
    loadedCoordinates: coordinatesFor(loaded),
    emptyCoordinates: coordinatesFor(empty),
    failedCoordinates: coordinatesFor(failed),
  };
}

export function tileCoordinateKey(rawUrl) {
  let url;
  try { url = new URL(rawUrl); } catch { return ""; }
  let match = url.pathname.match(/^\/(\d+)\/(\d+)\/(\d+)\.png$/);
  if (match && (url.hostname === "tile.openstreetmap.org" || url.hostname.endsWith(".tile.openstreetmap.org"))) {
    return `z=${match[1]}/x=${match[2]}/y=${match[3]}`;
  }
  match = url.pathname.match(/\/MapServer\/tile\/(\d+)\/(\d+)\/(\d+)$/);
  if (match && url.hostname === "server.arcgisonline.com") {
    return `z=${match[1]}/x=${match[3]}/y=${match[2]}`;
  }
  const bbox = url.searchParams.get("BBOX") ?? url.searchParams.get("bbox");
  return bbox ? "bbox=" + bbox : url.pathname;
}

export function compareProblemCoordinateSets(runs = []) {
  const sets = runs.map((run) => [...new Set([
    ...(run.aggregate?.emptyCoordinates ?? []),
    ...(run.aggregate?.failedCoordinates ?? []),
  ])].sort());
  const first = JSON.stringify(sets[0] ?? []);
  const same = sets.every((set) => JSON.stringify(set) === first);
  return { same, status: same ? "te same" : "różne", sets };
}

export function summarizeArchiveStability(runs = []) {
  const emptySets = runs.map((run) => new Set(run.aggregate?.emptyCoordinates ?? []));
  const loadedSets = runs.map((run) => new Set(run.aggregate?.loadedCoordinates ?? []));
  const emptyUnion = new Set(emptySets.flatMap((set) => [...set]));
  const emptyIntersection = [...emptyUnion].filter((coordinate) => emptySets.length > 0
    && emptySets.every((set) => set.has(coordinate))).sort();
  const variableCoordinates = [...emptyUnion].filter((coordinate) =>
    emptySets.some((set) => set.has(coordinate)) && loadedSets.some((set) => set.has(coordinate)))
    .sort();
  const emptyCountSum = emptySets.reduce((sum, set) => sum + set.size, 0);
  return {
    emptySets: emptySets.map((set) => [...set].sort()),
    emptyIntersection,
    emptyUnion: [...emptyUnion].sort(),
    variableCoordinates,
    variableCount: variableCoordinates.length,
    emptyCountSum,
    variableRatio: emptyCountSum ? variableCoordinates.length / emptyCountSum : null,
    problemConsistency: compareProblemCoordinateSets(runs),
  };
}

export function selectRepeatableArchiveRequests(requests = [], maxTiles = MAX_ARCHIVE_REPEAT_TILES) {
  const limit = Math.max(0, Math.min(MAX_ARCHIVE_REPEAT_TILES, Number.isInteger(maxTiles) ? maxTiles : 0));
  const seen = new Set();
  const selected = [];
  for (const request of requests) {
    if (selected.length >= limit) break;
    const payloadBytes = responsePayloadBytes(request);
    if (!isArchiveGetMapUrl(request.url) || request.method && request.method !== "GET"
        || request.canceled || request.errorText || request.status !== 200 || !isImageMime(request.mimeType)
        || payloadBytes === null || payloadBytes >= EMPTY_TILE_BYTE_THRESHOLD) continue;
    const key = new URL(request.url).href;
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push({ url: key, coordinate: tileCoordinateKey(key), payloadBytes,
      encodedDataLength: request.encodedDataLength, encodedBodyLength: request.encodedBodyLength ?? null });
  }
  return selected;
}

export function isAllowedArchiveRepeatRequest(rawUrl, method, originalUrls = []) {
  let url;
  try { url = new URL(rawUrl); } catch { return false; }
  if (String(method ?? "").toUpperCase() !== "GET" || !isArchiveGetMapUrl(url)) return false;
  const originals = new Set();
  for (const original of originalUrls) {
    try { originals.add(new URL(original).href); } catch {}
  }
  return originals.has(url.href) && isAllowedBrowserRequest(url.href, "GET");
}

export function summarizeArchiveRetry(selectedTiles = [], retryRequests = []) {
  const perTile = selectedTiles.map((tile) => {
    const requests = retryRequests.filter((request) => {
      try { return new URL(request.url).href === new URL(tile.url).href; } catch { return false; }
    });
    const filled = requests.some((request) => !request.canceled && !request.errorText
      && request.status >= 200 && request.status < 300 && isImageMime(request.mimeType)
      && responsePayloadBytes(request) !== null
      && responsePayloadBytes(request) >= EMPTY_TILE_BYTE_THRESHOLD);
    const allResponsesClassified = requests.length >= 2 && requests.slice(0, 2).every((request) =>
      request.canceled || request.errorText || Number.isFinite(request.status));
    const remainedEmpty = requests.length >= 2 && requests.slice(0, 2).every((request) =>
      !request.canceled && !request.errorText && request.status === 200 && isImageMime(request.mimeType)
      && responsePayloadBytes(request) !== null
      && responsePayloadBytes(request) < EMPTY_TILE_BYTE_THRESHOLD);
    return {
      coordinate: tile.coordinate,
      initialPayloadBytes: tile.payloadBytes ?? null,
      retryCount: requests.length,
      filled,
      remainedEmpty,
      allResponsesClassified,
    };
  });
  const filledTiles = perTile.filter((tile) => tile.filled).length;
  let conclusion = "niejednoznaczne";
  let reason = "Nie zarejestrowano wystarczających odpowiedzi dla jednoznacznego wniosku.";
  if (!perTile.length) {
    reason = "Pierwsze wczytanie nie zawierało pustych kafelków do ponowienia.";
  } else if (filledTiles === perTile.length) {
    conclusion = "pomaga";
    reason = `${filledTiles}/${perTile.length} ponowionych pustych kafelków otrzymało niepustą odpowiedź.`;
  } else if (filledTiles === 0 && perTile.every((tile) => tile.remainedEmpty)) {
    conclusion = "nie pomaga";
    reason = `0/${perTile.length} kafelków wypełniło się; wszystkie ${perTile.length * 2} ponowne odpowiedzi pozostały puste.`;
  } else {
    reason = `${filledTiles}/${perTile.length} kafelków wypełniło się; część wyników jest mieszana lub niekompletna.`;
  }
  return {
    selectedTiles: perTile.length,
    retryRequests: retryRequests.length,
    filledTiles,
    conclusion,
    reason,
    perTile,
  };
}

export function chooseBrowserPath(options = {}) {
  const exists = options.exists ?? existsSync;
  const explicit = String(options.explicitPath ?? "").trim();
  const environment = String(options.envPath ?? "").trim();
  if (explicit) return exists(explicit) ? explicit : null;
  if (environment) return exists(environment) ? environment : null;
  for (const candidate of options.candidates ?? []) {
    const path = typeof candidate === "string" ? candidate : candidate?.path;
    if (path && exists(path)) return path;
  }
  return null;
}

function parseHealthRoutes(source) {
  const routes = [];
  const pattern = /id:\s*"([^"]+)"[\s\S]*?baseUrl:\s*"([^"]+)"[\s\S]*?healthPath:\s*"([^"]+)"/g;
  for (const match of source.matchAll(pattern)) {
    try {
      const base = new URL(match[2]);
      const path = match[3];
      if (base.protocol === "https:" && path.startsWith("/") && !path.includes("?")) {
        routes.push({ origin: base.origin, path, method: "GET", service: match[1] });
      }
    } catch {
      // Nieprawidłowy wpis konfiguracji nie trafia na allowlistę.
    }
  }
  return routes;
}

function isLocalOrigin(url, appOrigins) {
  const origins = Array.isArray(appOrigins) ? appOrigins : [appOrigins];
  return origins.includes(url.origin)
    && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
}

function isTileHostAllowed(url) {
  return TILE_HOST_RULES.some((rule) => {
    const hostMatches = rule.subdomains
      ? url.hostname === rule.host || url.hostname.endsWith("." + rule.host)
      : url.hostname === rule.host;
    const pathMatches = rule.path
      ? url.pathname === rule.path
      : rule.tilePath && rule.host === "tile.openstreetmap.org"
        ? /^\/[0-9]+\/[0-9]+\/[0-9]+\.png$/.test(url.pathname)
        : rule.tilePath && rule.host === "server.arcgisonline.com"
          ? /^\/ArcGIS\/rest\/services\/World_Imagery\/MapServer\/tile\/[0-9]+\/[0-9]+\/[0-9]+$/.test(url.pathname)
          : Boolean(rule.pathPrefix && url.pathname.startsWith(rule.pathPrefix));
    return hostMatches && pathMatches;
  });
}

function exactQueryKeys(params, keys) {
  const entries = [...params.keys()];
  return entries.length === keys.length
    && keys.every((key) => params.getAll(key).length === 1)
    && keys.every((key) => params.has(key));
}

export function isAllowedSearchServiceRequest(url) {
  if (url.protocol !== "https:" || url.port || url.username || url.password || url.hash) return false;
  const rule = SEARCH_SERVICE_RULES.find((item) => item.host === url.hostname && item.path === url.pathname);
  if (!rule) return false;
  const params = new URLSearchParams(url.search);
  if (rule.kind === "counties") {
    return exactQueryKeys(params, ["where", "outFields", "returnGeometry", "orderByFields", "f"])
      && params.get("where") === "1=1"
      && params.get("outFields") === "teryt,nazwa"
      && params.get("returnGeometry") === "false"
      && params.get("orderByFields") === "nazwa"
      && params.get("f") === "json";
  }
  if (rule.kind === "communes") {
    return exactQueryKeys(params, ["where", "outFields", "returnGeometry", "outSR", "orderByFields", "f"])
      && /^teryt LIKE '\d{4}%'$/.test(params.get("where") ?? "")
      && params.get("outFields") === "teryt,nazwa"
      && params.get("returnGeometry") === "true"
      && params.get("outSR") === "4326"
      && params.get("orderByFields") === "nazwa"
      && params.get("f") === "json";
  }
  if (rule.kind === "uldk") {
    if (url.pathname !== "/") return false;
    const request = params.get("request");
    if (request === "GetRegionByNameOrId") {
      return exactQueryKeys(params, ["request", "id", "result"])
        && /^\d{6}_\d$/.test(params.get("id") ?? "")
        && params.get("result") === "id,teryt,region,commune,county";
    }
    if (request === "GetParcelById") {
      if (!exactQueryKeys(params, ["request", "id", "result", "srid"])
          || !/^\d{6}_\d\.\d{4}\.[0-9A-Za-z./-]{1,32}$/.test(params.get("id") ?? "")) return false;
      return (params.get("result") === "id,teryt,parcel,county,commune,region,geom_wkt" && params.get("srid") === "4326")
        || (params.get("result") === "id,geom_wkt" && params.get("srid") === "2180");
    }
  }
  if (rule.kind === "kieg") {
    const keys = ["SERVICE", "VERSION", "REQUEST", "SRS", "BBOX", "WIDTH", "HEIGHT", "X", "Y", "LAYERS", "QUERY_LAYERS", "INFO_FORMAT", "FORMAT", "TRANSPARENT"];
    if (!exactQueryKeys(params, keys)) return false;
    const bbox = (params.get("BBOX") ?? "").split(",").map(Number);
    return params.get("SERVICE") === "WMS" && params.get("VERSION") === "1.1.1"
      && params.get("REQUEST") === "GetFeatureInfo" && params.get("SRS") === "EPSG:2180"
      && bbox.length === 4 && bbox.every(Number.isFinite)
      && Math.abs((bbox[2] - bbox[0]) - 200) < 0.001 && Math.abs((bbox[3] - bbox[1]) - 200) < 0.001
      && params.get("WIDTH") === "1000" && params.get("HEIGHT") === "1000"
      && params.get("X") === "500" && params.get("Y") === "500"
      && params.get("LAYERS") === "dzialki" && params.get("QUERY_LAYERS") === "dzialki"
      && params.get("INFO_FORMAT") === "text/xml" && params.get("FORMAT") === "image/png"
      && params.get("TRANSPARENT") === "TRUE";
  }
  return false;
}

function isHealthRequest(url, method, healthRoutes = []) {
  return healthRoutes.some((item) => item.origin === url.origin
    && item.path === url.pathname && item.method === method && !url.search && !url.hash);
}

function isObservedExternalRequest(url, method, healthRoutes = []) {
  return method === "GET" && (isHealthRequest(url, method, healthRoutes)
    || isTileHostAllowed(url)
    || isAllowedSearchServiceRequest(url));
}

export function isAllowedBrowserRequest(rawUrl, method, options = {}) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  const requestMethod = String(method ?? "").toUpperCase();
  if (requestMethod !== "GET") return false;
  if (isLocalOrigin(url, options.appOrigins ?? options.appOrigin)) return true;
  if (url.protocol !== "https:" || url.port || url.username || url.password) return false;

  if (isHealthRequest(url, requestMethod, options.healthRoutes ?? [])) return true;
  if (isTileHostAllowed(url)) {
    const matchingRule = TILE_HOST_RULES.find((rule) => {
      const hostMatches = rule.subdomains
        ? url.hostname === rule.host || url.hostname.endsWith("." + rule.host)
        : url.hostname === rule.host;
      return hostMatches && isTileHostAllowed(url);
    });
    if (matchingRule?.tilePath) return !url.search && !url.hash;
    if (matchingRule?.wmsGetMap) {
      const params = new URLSearchParams(url.search);
      return params.get("service")?.toUpperCase() === "WMS"
        && params.get("request")?.toUpperCase() === "GETMAP"
        && params.get("layers") === "Raster"
        && !url.hash;
    }
  }
  return isAllowedSearchServiceRequest(url);
}

function browserCandidates() {
  if (process.platform !== "win32") return [];
  return [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ];
}

function getFreePort() {
  return new Promise((resolvePromise, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const port = probe.address().port;
      probe.close((error) => error ? reject(error) : resolvePromise(port));
    });
  });
}

function startServer(port, rootDir) {
  return new Promise((resolvePromise, reject) => {
    const server = createStaticServer(rootDir ? { rootDir } : {});
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolvePromise(server));
  });
}

function cdpError(result, method) {
  if (!result?.error) return;
  throw new Error("CDP " + method + ": " + String(result.error.message ?? "błąd protokołu"));
}

class CdpConnection {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.nextId = 0;
    this.pending = new Map();
    this.onEvent = () => {};
  }

  async connect() {
    if (typeof globalThis.WebSocket !== "function") {
      throw new Error("Wymagany jest Node.js 22 lub nowszy z globalnym WebSocket.");
    }
    this.socket = new globalThis.WebSocket(this.url);
    await new Promise((resolvePromise, reject) => {
      const timeout = setTimeout(() => reject(new Error("Przekroczono czas łączenia z CDP.")), 10000);
      this.socket.addEventListener("open", () => {
        clearTimeout(timeout);
        resolvePromise();
      }, { once: true });
      this.socket.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("Nie udało się połączyć z CDP na localhost."));
      }, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = parseCdpMessage(event);
      if (!message) return;
      if (Number.isInteger(message.id)) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        clearTimeout(pending.timeout);
        try {
          cdpError(message, pending.method);
          pending.resolve(message.result ?? {});
        } catch (error) {
          pending.reject(error);
        }
        return;
      }
      this.onEvent(message);
    });
    this.socket.addEventListener("close", () => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error("Połączenie CDP zostało zamknięte."));
      }
      this.pending.clear();
    });
  }

  command(method, params = {}, timeoutMs = 15000) {
    if (!this.socket || this.socket.readyState !== globalThis.WebSocket.OPEN) {
      return Promise.reject(new Error("Połączenie CDP nie jest otwarte."));
    }
    const id = ++this.nextId;
    return new Promise((resolvePromise, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Przekroczono czas polecenia CDP: " + method));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolvePromise, reject, timeout, method });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    try { this.socket?.close(); } catch {}
  }
}

async function waitForDebugger(port, child) {
  const address = "http://127.0.0.1:" + port + "/json/version";
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error("Przeglądarka zakończyła pracę przed uruchomieniem CDP (kod="
        + String(child.exitCode) + ", sygnał=" + String(child.signalCode) + ").");
    }
    try {
      const response = await fetch(address, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return await response.json();
    } catch {
      await sleep(150);
    }
  }
  throw new Error("Przeglądarka nie uruchomiła zdalnego debugowania na 127.0.0.1.");
}

async function createPageTarget(port) {
  const response = await fetch("http://127.0.0.1:" + port + "/json/new?about:blank", { method: "PUT" });
  if (!response.ok) throw new Error("Nie udało się utworzyć karty CDP.");
  const target = await response.json();
  if (!target.webSocketDebuggerUrl) throw new Error("CDP nie zwrócił adresu WebSocket karty.");
  return target.webSocketDebuggerUrl;
}

function makeContextHash() {
  const context = {
    version: "1",
    source: "start",
    kind: "punkt",
    match: "exact",
    point: { lat: 53.1508, lon: 16.7385, crs: "EPSG:4326" },
  };
  return Buffer.from(JSON.stringify(context), "utf8").toString("base64url");
}

function extractHealthRoutes(configPath) {
  const source = readFileSync(configPath, "utf8");
  const routes = parseHealthRoutes(source);
  if (routes.length !== 4) throw new Error("Konfiguracja nie zawiera dokładnie czterech tras zdrowia.");
  return routes;
}

function cdpSummaryText(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
}

function bodyHint(response) {
  if (response.base64Encoded) {
    const binary = Buffer.from(response.body ?? "", "base64");
    const preview = binary.subarray(0, 256).toString("utf8");
    return cdpSummaryText(preview.replace(/<[^>]*>/g, " "));
  }
  return cdpSummaryText(String(response.body ?? "").replace(/<[^>]*>/g, " "));
}

export function buildStateExpression() {
  return [
    "(() => {",
    "const tiles = document.querySelectorAll('.leaflet-tile');",
    "const loaded = document.querySelectorAll('.leaflet-tile-loaded');",
    "const status = document.querySelector('.dzialki-tile-status')?.textContent || '';",
    "const match = status.match(/Niezaładowane kafelki:\\s*(\\d+)/);",
    "const base = document.querySelector('[data-base-layer]:checked')?.value || '';",
    "const year = document.querySelector('#dzialki-year')?.value || '';",
    "const zoom = document.querySelector('input[aria-label=\"Przybliżenie mapy\"]')?.value || '';",
    "const selectedParcelCount = document.querySelectorAll('.dzialki-selected-parcel').length;",
    "const searchStatus = document.querySelector('#dzialki-search-status')?.textContent || '';",
    "const report = document.querySelector('#dzialki-parcel-report');",
    "const reportText = report?.textContent || '';",
    "const egibState = report?.dataset.egibState || 'idle';",
    "return { mapVisible: Boolean(document.querySelector('.leaflet-container')), tileCount: tiles.length, loadedCount: loaded.length, failedCount: match ? Number(match[1]) : 0, selectedParcelCount, searchStatus, reportText, egibState, base, year, zoom };",
    "})()",
  ].join("\n");
}

async function runBrowserSmoke() {
  if (typeof globalThis.WebSocket !== "function") {
    throw new Error("Wymagany jest Node.js 22 lub nowszy z globalnym WebSocket.");
  }

  const argv = process.argv.slice(2);
  const requestedPort = getArg(argv, "--port");
  const searchArgs = parseSearchArguments(argv);
  const beforeRef = getArg(argv, "--before-ref") || (argv.includes("--compare-before") ? "HEAD" : "");
  if (beforeRef && !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}(?:\^[0-9]+)?$/.test(beforeRef)) {
    throw new Error("Nieprawidłowa wartość --before-ref.");
  }
  const compareBefore = Boolean(beforeRef);
  const parsedPort = requestedPort ? Number(requestedPort) : 0;
  if (requestedPort && (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535)) {
    throw new Error("Port musi być liczbą z zakresu 1–65535.");
  }

  const explicitBrowser = getArg(argv, "--browser");
  const selectedBrowser = chooseBrowserPath({
    explicitPath: explicitBrowser,
    envPath: process.env.EDGE_PATH,
    candidates: browserCandidates(),
  });
  if (!selectedBrowser) {
    throw new Error(explicitBrowser || process.env.EDGE_PATH
      ? "Nie znaleziono wskazanej przeglądarki. Sprawdź ścieżkę --browser lub EDGE_PATH."
      : "Nie znaleziono Edge ani Chrome w typowych lokalizacjach. Podaj --browser <ścieżka> lub EDGE_PATH.");
  }

  const configPath = join(REPO_ROOT, "app", "js", "config.js");
  const healthRoutes = extractHealthRoutes(configPath);
  const debugPort = await getFreePort();
  const profile = await mkdtemp(join(tmpdir(), "m4b-browser-profile-"));
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const resultDir = join(REPO_ROOT, ".local-results", "browser-smoke-" + timestamp);
  await mkdir(resultDir, { recursive: true });

  let server;
  let baselineServer;
  let baselineOrigin = null;
  let appOrigin = "";
  let browser;
  let browserCdp;
  let pageCdp;
  let runError = null;
  let runReport = null;
  let browserStderr = "";
  const requestsById = new Map();
  const tileRequests = [];
  const externalRequests = [];
  const consoleErrors = [];
  const pageExceptions = [];
  const blockedRequests = [];
  let archiveRepeatAllowlist = [];
  let currentScenario = "";

  try {
    if (compareBefore) {
      const baselineRoot = join(resultDir, "before-app");
      await cp(join(REPO_ROOT, "app"), baselineRoot, { recursive: true });
      const originalLayerCode = execFileSync("git", ["show", beforeRef + ":app/js/modules/dzialki/layers-base.js"], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      await writeFile(join(baselineRoot, "js", "modules", "dzialki", "layers-base.js"), originalLayerCode, "utf8");
      baselineServer = await startServer(await getFreePort(), baselineRoot);
      baselineOrigin = "http://127.0.0.1:" + baselineServer.address().port;
    }
    const staticPort = parsedPort || await getFreePort();
    server = await startServer(staticPort, join(REPO_ROOT, "app"));
    appOrigin = "http://127.0.0.1:" + server.address().port;
    const appOrigins = [appOrigin, ...(baselineOrigin ? [baselineOrigin] : [])];
    const browserArgs = [
      "--headless=new",
      "--disable-gpu",
      "--disable-background-networking",
      "--disable-sync",
      "--disable-extensions",
      "--disable-component-update",
      "--disable-default-apps",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-notifications",
      "--remote-debugging-address=127.0.0.1",
      "--remote-debugging-port=" + debugPort,
      "--remote-allow-origins=*",
      "--user-data-dir=" + profile,
      "--window-size=1600,1050",
      "about:blank",
    ];
    browser = spawn(selectedBrowser, browserArgs, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    browser.stderr?.on("data", (chunk) => {
      browserStderr = (browserStderr + chunk.toString("utf8")).slice(-3000);
    });
    browser.once("error", (error) => {
      blockedRequests.push({ kind: "browser-launch-error", message: cdpSummaryText(error.message) });
    });

    const version = await waitForDebugger(debugPort, browser);
    browserCdp = new CdpConnection(version.webSocketDebuggerUrl);
    await browserCdp.connect();
    const targetSocketUrl = await createPageTarget(debugPort);
    pageCdp = new CdpConnection(targetSocketUrl);
    await pageCdp.connect();

    const evaluate = async (expression, timeoutMs = 10000) => {
      const response = await pageCdp.command("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      }, timeoutMs);
      if (response.exceptionDetails) {
        const description = response.exceptionDetails.exception?.description
          ?? response.exceptionDetails.text ?? "błąd wykonania w stronie";
        throw new Error("Błąd wykonania strony: " + cdpSummaryText(description));
      }
      return response.result?.value;
    };

    pageCdp.onEvent = (message) => {
      const event = message.method;
      const params = message.params ?? {};
      if (event === "Runtime.consoleAPICalled" && params.type === "error") {
        const text = (params.args ?? []).map((arg) => arg.value ?? arg.description ?? "")
          .filter(Boolean).join(" ");
        consoleErrors.push({ scenario: currentScenario, text: cdpSummaryText(text) });
      }
      if (event === "Runtime.exceptionThrown") {
        pageExceptions.push({
          scenario: currentScenario,
          text: cdpSummaryText(params.exceptionDetails?.exception?.description
            ?? params.exceptionDetails?.text),
        });
      }
      if (event === "Network.requestWillBeSent") {
        const url = params.request?.url ?? "";
        let parsed;
        try { parsed = new URL(url); } catch { return; }
        const method = String(params.request?.method ?? "GET").toUpperCase();
        const isTile = isTileHostAllowed(parsed);
        if (!isObservedExternalRequest(parsed, method, healthRoutes)) return;

        if (params.redirectResponse) {
          const previous = requestsById.get(params.requestId);
          if (previous) {
            previous.status = params.redirectResponse.status;
            previous.mimeType = params.redirectResponse.mimeType ?? previous.mimeType;
            previous.elapsedMs = Math.max(0, Math.round((params.timestamp - previous.startedAt) * 1000));
            previous.redirected = true;
            if (previous.responseHeaders) {
              previous.responseHeaders = selectRelevantResponseHeaders(
                previous.responseHeaders,
                params.redirectResponse.headers,
              );
            }
          }
        }
        const record = {
          scenario: currentScenario,
          requestId: params.requestId,
          url,
          host: parsed.host,
          method,
          resourceType: params.type ?? "Other",
          status: null,
          mimeType: "",
          errorText: "",
          canceled: false,
          startedAt: Number(params.timestamp ?? 0),
          elapsedMs: null,
          bodyHint: "",
          encodedDataLength: null,
          encodedBodyLength: null,
        };
        if (isArchiveGetMapUrl(parsed)) record.responseHeaders = {};
        requestsById.set(params.requestId, record);
        externalRequests.push(record);
        if (isTile) tileRequests.push(record);
      }
      if (event === "Network.responseReceived") {
        const record = requestsById.get(params.requestId);
        if (!record) return;
        record.status = params.response?.status ?? null;
        record.mimeType = params.response?.mimeType ?? "";
        record.resourceType = params.type ?? record.resourceType;
        record.responseUrl = params.response?.url ?? record.url;
        if (record.responseHeaders) {
          record.responseHeaders = selectRelevantResponseHeaders(record.responseHeaders, params.response?.headers);
        }
      }
      if (event === "Network.responseReceivedExtraInfo") {
        const headers = selectRelevantResponseHeaders(params.headers);
        const record = requestsById.get(params.requestId);
        if (record?.responseHeaders) {
          record.responseHeaders = selectRelevantResponseHeaders(record.responseHeaders, headers);
        }
      }
      if (event === "Network.dataReceived") {
        const record = requestsById.get(params.requestId);
        if (record?.responseHeaders) {
          const encodedChunkLength = Number.isFinite(params.encodedDataLength)
            ? params.encodedDataLength
            : null;
          if (encodedChunkLength !== null) {
            record.encodedBodyLength = (record.encodedBodyLength ?? 0) + encodedChunkLength;
          }
        }
      }
      if (event === "Network.loadingFailed") {
        const failure = parseCdpLoadingFailed(params);
        const record = requestsById.get(failure.requestId);
        if (!record) return;
        record.errorText = failure.errorText;
        record.canceled = failure.canceled;
        record.blockedReason = failure.blockedReason;
        if (failure.timestamp !== null) {
          record.elapsedMs = Math.max(0, Math.round((failure.timestamp - record.startedAt) * 1000));
        }
      }
      if (event === "Network.loadingFinished") {
        const record = requestsById.get(params.requestId);
        if (!record) return;
        record.encodedDataLength = Number.isFinite(params.encodedDataLength)
          ? params.encodedDataLength
          : null;
        if (Number.isFinite(params.timestamp)) {
          record.elapsedMs = Math.max(0, Math.round((params.timestamp - record.startedAt) * 1000));
        }
        if (record.url.includes("/wss/service/PZGIK/ORTO/WMS/StandardResolutionTime")
            && !isImageMime(record.mimeType)) {
          void pageCdp.command("Network.getResponseBody", { requestId: record.requestId })
            .then((body) => { record.bodyHint = bodyHint(body); })
            .catch(() => {});
        }
      }
      if (event === "Fetch.requestPaused") {
        const request = params.request ?? {};
        const isArchiveRepeatScenario = currentScenario.startsWith("stability-2025-repeat-attempt-");
        const allowed = isArchiveRepeatScenario
          ? isAllowedArchiveRepeatRequest(request.url, request.method, archiveRepeatAllowlist)
          : isAllowedBrowserRequest(request.url, request.method, { appOrigins, healthRoutes });
        if (!allowed) {
          let address = request.url;
          try {
            const url = new URL(request.url);
            address = url.origin + url.pathname;
          } catch {}
          blockedRequests.push({
            scenario: currentScenario,
            url: address,
            method: request.method ?? "",
          });
          void pageCdp.command("Fetch.failRequest", {
            requestId: params.requestId,
            errorReason: "BlockedByClient",
          }).catch(() => {});
        } else {
          void pageCdp.command("Fetch.continueRequest", { requestId: params.requestId }).catch(() => {});
        }
      }
    };

    await pageCdp.command("Page.enable");
    await pageCdp.command("Runtime.enable");
    await pageCdp.command("Network.enable", {
      maxTotalBufferSize: 10 * 1024 * 1024,
      maxResourceBufferSize: 2 * 1024 * 1024,
    });
    await pageCdp.command("Network.setCacheDisabled", { cacheDisabled: true });
    await pageCdp.command("Fetch.enable", {
      patterns: [{ urlPattern: "*", requestStage: "Request" }],
    });

    const contextEncoded = makeContextHash();

    async function evaluateState() {
      return await evaluate(buildStateExpression());
    }

    async function waitForMap(origin) {
      const pageDeadline = Date.now() + 20000;
      const mapReadyExpression = "(() => location.origin === " + JSON.stringify(origin)
        + " && document.readyState === \"complete\" && Boolean(document.querySelector(\".leaflet-container\")))()";
      while (Date.now() < pageDeadline) {
        const ready = await evaluate(mapReadyExpression).catch(() => false);
        if (ready) return;
        await sleep(150);
      }
      throw new Error("Mapa Leaflet nie pojawiła się w ciągu 20 sekund.");
    }

    async function setZoomForTest() {
      return await evaluate("(() => { const input = document.querySelector('input[aria-label=\"Przybliżenie mapy\"]'); if (!input) return false; input.value = '17.6'; input.dispatchEvent(new Event('input', { bubbles: true })); return true; })()");
    }

    async function selectBase(id) {
      const selector = "[data-base-layer=\"" + id + "\"]";
      const expression = "(() => { const input = document.querySelector("
        + JSON.stringify(selector)
        + "); if (!input) return false; input.checked = true; input.dispatchEvent(new Event('change', { bubbles: true })); return true; })()";
      const result = await evaluate(expression);
      if (!result) throw new Error("Nie znaleziono podkładu: " + id);
    }

    async function setYear(year) {
      const expression = "(() => { const input = document.querySelector('#dzialki-year'); if (!input) return false; input.value = "
        + JSON.stringify(String(year))
        + "; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); return true; })()";
      const result = await evaluate(expression);
      if (!result) throw new Error("Nie znaleziono suwaka roku.");
    }

    async function waitForOptions(selector, deadline) {
      const expression = "(() => { const select = document.querySelector(" + JSON.stringify(selector)
        + "); return Boolean(select && select.options.length > 1); })()";
      while (Date.now() < deadline) {
        if (await evaluate(expression).catch(() => false)) return;
        await sleep(150);
      }
      throw new Error("Lista wyszukiwania nie załadowała wyników w czasie scenariusza.");
    }

    async function chooseOption(selector, label) {
      const optionsExpression = "(() => { const select = document.querySelector(" + JSON.stringify(selector) + ");"
        + " return select ? [...select.options].filter((item) => item.value).map((item) => ({"
        + " label: item.textContent || '', value: item.value })) : null; })()";
      const options = await evaluate(optionsExpression);
      const match = matchSearchOption(options, label);
      if (!match.option) throw new Error(formatSearchOptionError(match));
      const selectExpression = "(() => { const select = document.querySelector(" + JSON.stringify(selector) + ");"
        + " if (!select) return false; const option = [...select.options].find((item) => item.value === "
        + JSON.stringify(match.option.value) + "); if (!option) return false; select.value = option.value;"
        + " select.dispatchEvent(new Event('change', { bubbles: true })); return true; })()";
      if (!await evaluate(selectExpression)) throw new Error(formatSearchOptionError(match));
    }

    async function waitForSearchResult(deadline) {
      const expression = "(() => { const paths = document.querySelectorAll('.dzialki-selected-parcel').length;"
        + " const text = document.querySelector('#dzialki-search-status')?.textContent || '';"
        + " return paths > 0 || /Nie znaleziono działki|Nie udało się|Upłynął limit czasu/.test(text); })()";
      while (Date.now() < deadline) {
        if (await evaluate(expression).catch(() => false)) return;
        await sleep(150);
      }
      throw new Error("Wyszukiwanie nie zakończyło się przed limitem scenariusza.");
    }

    async function waitForEgib(deadline) {
      while (Date.now() < deadline) {
        const state = await evaluateState().catch(() => null);
        if (state?.egibState === "ready" || state?.egibState === "error") return state;
        await sleep(150);
      }
      throw new Error("Dane EGiB nie zakończyły ładowania przed limitem scenariusza.");
    }

    async function runParcelSearchScenario(origin) {
      const name = "m4c-search";
      const deadline = Date.now() + SCENARIO_TIMEOUT_MS;
      currentScenario = name;
      await pageCdp.command("Page.navigate", {
        url: origin + "/?browserSmoke=m4c#/dzialki?ctx=" + contextEncoded,
      });
      await waitForMap(origin);
      await waitForOptions("#dzialki-search-powiat", deadline);
      const startedAt = await evaluate("performance.now()");
      await chooseOption("#dzialki-search-powiat", searchArgs.powiat);
      await waitForOptions("#dzialki-search-gmina", deadline);
      await chooseOption("#dzialki-search-gmina", searchArgs.gmina);
      await waitForOptions("#dzialki-search-obreb", deadline);
      await chooseOption("#dzialki-search-obreb", searchArgs.obreb);
      const fillExpression = "(() => { const input = document.querySelector('#dzialki-search-numer');"
        + " const button = document.querySelector('#dzialki-search-submit'); if (!input || !button) return false;"
        + " input.value = " + JSON.stringify(searchArgs.numer) + ";"
        + " input.dispatchEvent(new Event('input', { bubbles: true })); button.click(); return true; })()";
      if (!await evaluate(fillExpression)) throw new Error("Nie znaleziono pola numeru działki.");
      await waitForSearchResult(deadline);
      const resultTimeMs = Math.max(0, Math.round((await evaluate("performance.now()")) - startedAt));
      const resultState = await evaluateState();
      const state = resultState.selectedParcelCount > 0 ? await waitForEgib(deadline) : resultState;
      const egibTimeMs = state.selectedParcelCount > 0
        ? Math.max(0, Math.round((await evaluate("performance.now()")) - startedAt)) : null;
      const requestDetails = externalRequests.filter((request) => request.scenario === name)
        .map((request) => ({
          url: request.url,
          host: request.host,
          method: request.method,
          status: request.status,
          resourceType: request.resourceType,
          elapsedMs: request.elapsedMs,
          errorText: request.errorText,
        }));
      const egibRequests = requestDetails.filter((request) =>
        request.host === "integracja.gugik.gov.pl"
        || (request.host === "uldk.gugik.gov.pl" && new URL(request.url).searchParams.get("srid") === "2180"));
      const sourceRequests = requestDetails.filter((request) => [
        "mapy.geoportal.gov.pl", "uldk.gugik.gov.pl", "integracja.gugik.gov.pl",
      ].includes(new URL(request.url).hostname));
      const dzialkiBackendSearchRequests = requestDetails.filter((request) => {
        const url = new URL(request.url);
        return url.hostname === "analizator-nieruchomosci.onrender.com" && url.pathname !== "/health";
      });
      const screenshot = await captureScenario(name, state);
      screenshot.search = {
        resultTimeMs,
        egibTimeMs,
        statusText: state.searchStatus,
        selectedParcelElements: state.selectedParcelCount,
        outlineElements: state.selectedParcelCount,
        egibState: state.egibState,
        reportTextPresent: {
          heading: state.reportText.includes("2. Raport o działce"),
          parcelId: state.reportText.includes("Identyfikator działki"),
          area: state.reportText.includes("Powierzchnia ewidencyjna"),
          registrationGroup: state.reportText.includes("Grupa rejestrowa"),
          landUse: state.reportText.includes("Klasoużytki"),
          successStatus: state.searchStatus.includes("Działka została znaleziona. Powierzchnia i klasoużytki pobrane z EGiB."),
        },
        egibRequests,
        sourceRequests,
        dzialkiBackendSearchRequests,
        requests: requestDetails,
      };
      return screenshot;
    }

    async function runArchiveStability(origin) {
      const runs = [];
      let repeat = null;
      for (let index = 1; index <= 3; index += 1) {
        const name = "stability-2025-run-" + index;
        currentScenario = name;
        await pageCdp.command("Page.navigate", {
          url: origin + "/?browserSmoke=stability-" + index + "#/dzialki?ctx=" + contextEncoded,
        });
        await waitForMap(origin);
        await setZoomForTest();
        await selectBase("archive");
        await setYear(2025);
        runs.push(await captureScenario(name));
        if (index === 1) repeat = await runArchiveEmptyRetry(runs[0]);
      }
      return {
        runs,
        repeat,
        consistency: compareProblemCoordinateSets(runs),
        detail: summarizeArchiveStability(runs),
      };
    }

    function tileRequestsFor(name) {
      return tileRequests.filter((request) => request.scenario === name);
    }

    async function runArchiveEmptyRetry(seedRun) {
      const name = "stability-2025-repeat";
      const selected = selectRepeatableArchiveRequests(seedRun.tileRequests);
      if (!selected.length) {
        return {
          name,
          skipped: true,
          ...summarizeArchiveRetry([], []),
          tileRequests: [],
          aggregate: aggregateRequests([]),
          screenshot: null,
        };
      }

      const allowedOriginalUrls = selected.map((tile) => tile.url);
      if (!allowedOriginalUrls.every((url) => isAllowedArchiveRepeatRequest(url, "GET", allowedOriginalUrls))) {
        throw new Error("Powtórne pobranie wskazało adres spoza allowlisty ortofotomapy archiwalnej.");
      }
      archiveRepeatAllowlist = allowedOriginalUrls;
      const startedAt = Date.now();
      const deadline = startedAt + SCENARIO_TIMEOUT_MS;
      const urlsJson = JSON.stringify(allowedOriginalUrls);
      const launchImages = async (attempt) => {
        currentScenario = name + "-attempt-" + attempt;
        const expression = "(() => { const urls = " + urlsJson + ";"
          + " window.__denemArchiveSmokeImages = window.__denemArchiveSmokeImages || [];"
          + " for (const url of urls) { const image = new Image();"
          + " window.__denemArchiveSmokeImages.push(image); image.src = url; } return urls.length; })()";
        const count = await evaluate(expression, 5000);
        if (count !== allowedOriginalUrls.length) throw new Error("Nie udało się uruchomić wszystkich powtórnych GET-ów archiwalnych.");
      };

      await sleep(ARCHIVE_REPEAT_DELAYS_MS[0]);
      await launchImages(1);
      await sleep(ARCHIVE_REPEAT_DELAYS_MS[1]);
      await launchImages(2);

      const scenarioNames = [name + "-attempt-1", name + "-attempt-2"];
      const expectedRequests = selected.length * 2;
      while (Date.now() < deadline) {
        const requests = tileRequests.filter((request) => scenarioNames.includes(request.scenario));
        const completed = requests.filter((request) => request.status !== null || request.errorText || request.canceled);
        if (requests.length >= expectedRequests && completed.length >= expectedRequests) break;
        await sleep(150);
      }
      const requests = tileRequests.filter((request) => scenarioNames.includes(request.scenario));
      const screenshot = await pageCdp.command("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
      });
      const screenshotPath = join(resultDir, name + ".png");
      await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
      return {
        name,
        skipped: false,
        delaysMs: [...ARCHIVE_REPEAT_DELAYS_MS],
        selectedCoordinates: selected.map((tile) => tile.coordinate),
        ...summarizeArchiveRetry(selected, requests),
        tileRequests: requests,
        aggregate: aggregateRequests(requests),
        screenshot: screenshotPath,
        elapsedMs: Date.now() - startedAt,
      };
    }

    async function waitForTiles(scenario) {
      const start = Date.now();
      const deadline = start + SCENARIO_TIMEOUT_MS;
      const minEnd = start + MIN_SETTLE_MS;
      let previous = "";
      let stableSamples = 0;
      while (Date.now() < deadline) {
        const state = await evaluateState().catch(() => null);
        const outstanding = tileRequestsFor(scenario).filter((request) =>
          request.status === null && !request.errorText && !request.canceled).length;
        const signature = JSON.stringify([
          state?.tileCount ?? 0,
          state?.loadedCount ?? 0,
          state?.failedCount ?? 0,
          tileRequestsFor(scenario).length,
          outstanding,
        ]);
        if (signature === previous) stableSamples += 1;
        else stableSamples = 0;
        previous = signature;
        if (Date.now() >= minEnd && outstanding === 0 && stableSamples >= 4) break;
        await sleep(250);
      }
      return { ...(await evaluateState()), durationMs: Date.now() - start };
    }

    async function captureScenario(name, knownState = null) {
      currentScenario = name;
      const state = knownState ?? await waitForTiles(name);
      const screenshot = await pageCdp.command("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
      });
      const pngPath = join(resultDir, name + ".png");
      await writeFile(pngPath, Buffer.from(screenshot.data, "base64"));
      const aggregate = aggregateRequests(tileRequestsFor(name));
      return {
        name,
        ...state,
        tileRequests: tileRequestsFor(name),
        aggregate,
        screenshot: pngPath,
      };
    }

    async function runScenarios(phase, origin) {
      const scenarios = [];
      const name = (suffix) => phase + "-" + suffix;
      const dzialkiUrl = origin + "/#/dzialki?ctx=" + contextEncoded;
      currentScenario = name("01-osm-pila-z17_6");
      await pageCdp.command("Page.navigate", { url: dzialkiUrl });
      await waitForMap(origin);
      await setZoomForTest();
      scenarios.push(await captureScenario(name("01-osm-pila-z17_6")));

      currentScenario = name("02-esri-pila-z17_6");
      await selectBase("esri");
      scenarios.push(await captureScenario(name("02-esri-pila-z17_6")));

      currentScenario = name("03-archive-2025");
      await selectBase("archive");
      await setYear(2025);
      scenarios.push(await captureScenario(name("03-archive-2025")));

      currentScenario = name("03-archive-2015");
      await setYear(2015);
      scenarios.push(await captureScenario(name("03-archive-2015")));

      currentScenario = name("03-archive-2004");
      await setYear(2004);
      scenarios.push(await captureScenario(name("03-archive-2004")));

      let retryScenario = null;
      const archiveFailures = scenarios
        .filter((scenario) => scenario.name.includes("03-archive-"))
        .reduce((total, scenario) => total + scenario.failedCount, 0);
      if (archiveFailures > 0) {
        currentScenario = name("05-manual-retry");
        const clicked = await evaluate("(() => { const button = document.querySelector('.dzialki-retry-button'); if (!button || button.disabled) return false; button.click(); return true; })()");
        if (clicked) retryScenario = await captureScenario(name("05-manual-retry"));
      }

      currentScenario = name("04-tab-rcn");
      await evaluate("(() => { window.location.hash = " + JSON.stringify("#/rcn?ctx=" + contextEncoded) + "; return true; })()");
      await sleep(1000);
      currentScenario = name("04-return-dzialki");
      await evaluate("(() => { window.location.hash = " + JSON.stringify("#/dzialki?ctx=" + contextEncoded) + "; return true; })()");
      await sleep(250);
      const returned = await evaluateState();
      const statePreserved = returned.base === "archive" && returned.year === "2004"
        && Number(returned.zoom) >= 16;
      scenarios.push(await captureScenario(name("04-tab-return-dzialki")));
      return { scenarios, retryScenario, statePreserved };
    }

    const beforeRun = baselineOrigin ? await runScenarios("before", baselineOrigin) : null;
    const afterRun = await runScenarios("after", appOrigin);
    const stability = await runArchiveStability(appOrigin);
    const parcelSearch = searchArgs ? await runParcelSearchScenario(appOrigin) : null;
    const scenarios = [
      ...(beforeRun?.scenarios ?? []),
      ...afterRun.scenarios,
      ...stability.runs,
      ...(parcelSearch ? [parcelSearch] : []),
    ];
    const retryScenarios = [beforeRun?.retryScenario, afterRun.retryScenario,
      stability.repeat.skipped ? null : stability.repeat].filter(Boolean);
    const statePreserved = (!beforeRun || beforeRun.statePreserved) && afterRun.statePreserved;

    const report = {
      createdAt: new Date().toISOString(),
      nodeVersion: process.version,
      browser: selectedBrowser,
      browserVersion: version.Browser ?? "",
      appOrigin,
      baselineOrigin,
      baselineRef: beforeRef || null,
      comparisonMode: Boolean(baselineOrigin),
      browserRunCount: 1,
      testLocation: { name: "Piła (fallback, ponieważ współrzędne baseline D2 nie są zapisane w repo)", lat: 53.1508, lon: 16.7385, zoom: 17.6 },
      allowedHealthRoutes: healthRoutes,
      emptyTileByteThreshold: EMPTY_TILE_BYTE_THRESHOLD,
      scenarios,
      retryScenarios,
      archive2025Stability: {
        ...stability.detail,
        consistency: stability.consistency,
      },
      archive2025EmptyTileRetry: stability.repeat,
      parcelSearch,
      externalRequests,
      statePreserved,
      consoleErrors,
      pageExceptions,
      blockedRequests,
      browserExitCode: browser.exitCode,
      browserSignal: browser.signalCode,
      browserStderr: cdpSummaryText(browserStderr),
      requestCount: tileRequests.length,
      externalRequestCount: externalRequests.length,
    };
    runReport = report;
    await writeFile(join(resultDir, "report.json"), JSON.stringify(report, null, 2), "utf8");

    const lines = [
      "Scenariusz | kafelki załadowane/puste/błędne/anulowane | kody HTTP | przykładowe błędne adresy",
      "---------- | ----------------------------------------- | ---------- | -------------------------",
    ];
    for (const scenario of [...scenarios, ...retryScenarios]) {
      lines.push(
        scenario.name + " | " + scenario.aggregate.loaded + "/" + scenario.aggregate.empty + "/" + scenario.aggregate.failed
          + "/" + scenario.aggregate.canceled + " | "
          + (scenario.aggregate.statuses.join(",") || "brak")
          + " | " + (scenario.aggregate.examples.join(" ; ") || "brak"),
      );
    }
    lines.push("Zgodność zbiorów pustych/błędnych dla trzech odświeżeń 2025: " + stability.consistency.status);
    lines.push("Stabilność 2025: puste kafelki per przebieg "
      + stability.detail.emptySets.map((set, index) => `${index + 1}: ${set.length}`).join("; ")
      + "; przecięcie " + stability.detail.emptyIntersection.length
      + "; suma unikalnych " + stability.detail.emptyUnion.length
      + "; zmienne " + stability.detail.variableCount
      + "; suma pustych wystąpień " + stability.detail.emptyCountSum
      + "; wskaźnik zmiennych/sumy "
      + (stability.detail.variableRatio === null ? "brak" : stability.detail.variableRatio.toFixed(3)));
    lines.push("Ponowne pobranie pustych kafelków: " + stability.repeat.conclusion
      + " — " + stability.repeat.reason);
    if (stability.repeat.skipped) {
      lines.push("Ponowne pobranie pominięte: pierwszy przebieg nie zawierał pustych kafelków.");
    }
    lines.push("Elementy obrysu w wyszukiwaniu M4c: "
      + (parcelSearch ? parcelSearch.search.outlineElements : "scenariusz pominięty — brak argumentów"));
    if (parcelSearch?.search) {
      lines.push("M4c: czas do obrysu " + parcelSearch.search.resultTimeMs + " ms; czas do EGiB "
        + (parcelSearch.search.egibTimeMs ?? "brak") + " ms; stan EGiB " + parcelSearch.search.egibState
        + "; żądania EGiB " + parcelSearch.search.egibRequests.length
        + "; żądania backendu Działek poza /health " + parcelSearch.search.dzialkiBackendSearchRequests.length
        + "; teksty raportu/statusu "
        + Object.values(parcelSearch.search.reportTextPresent).every(Boolean));
    }
    lines.push("Żądania zarejestrowane: " + externalRequests.length + " (szczegóły adresów w report.json)");
    const summary = lines.join("\n") + "\n";
    await writeFile(join(resultDir, "summary.txt"), summary, "utf8");
    process.stdout.write("Wyniki zapisano w .local-results/browser-smoke-" + timestamp + "/\n");
    process.stdout.write("Hosty: " + [...new Set(tileRequests.map((request) => request.host))].join(", ") + "\n");
    process.stdout.write(summary);
    process.stdout.write("Zachowanie stanu po powrocie z RCN: " + (statePreserved ? "TAK" : "NIE") + "\n");
    process.stdout.write("Żądania zablokowane przez allowlistę: " + blockedRequests.length + "\n");
    if (blockedRequests.length > 0) process.exitCode = 3;
    if (!statePreserved) process.exitCode = 1;
  } catch (error) {
    runError = error;
    if (!runReport) {
      runReport = {
        createdAt: new Date().toISOString(),
        nodeVersion: process.version,
        browser: selectedBrowser,
        appOrigin: server?.listening ? "http://127.0.0.1:" + server.address().port : null,
        scenarios: [],
        consoleErrors,
        pageExceptions,
        blockedRequests,
        requests: tileRequests,
        externalRequests,
        baselineOrigin,
        baselineRef: beforeRef || null,
        comparisonMode: Boolean(baselineOrigin),
        browserExitCode: browser?.exitCode ?? null,
        browserSignal: browser?.signalCode ?? null,
        browserStderr: cdpSummaryText(browserStderr),
        error: cdpSummaryText(error?.message ?? error),
      };
    } else {
      runReport.error = cdpSummaryText(error?.message ?? error);
    }
    await writeFile(join(resultDir, "report.json"), JSON.stringify(runReport, null, 2), "utf8")
      .catch(() => {});
    const failureSummary = [
      "Scenariusz | kafelki OK/błąd/anulowane | kody HTTP | przykładowe błędne adresy",
      "---------- | -------------------------- | ---------- | -------------------------",
      "Przebieg przerwany przed zebraniem wyników: " + cdpSummaryText(error?.message ?? error),
    ].join("\n") + "\n";
    await writeFile(join(resultDir, "summary.txt"), failureSummary, "utf8").catch(() => {});
    process.stderr.write("browser-smoke: " + cdpSummaryText(error?.message ?? error) + "\n");
    process.exitCode = 2;
  } finally {
    pageCdp?.close();
    if (browserCdp) {
      try { await browserCdp.command("Browser.close", {}, 3000); } catch {}
      browserCdp.close();
    }
    if (browser && browser.exitCode === null) {
      browser.kill();
      await Promise.race([
        new Promise((resolvePromise) => browser.once("exit", resolvePromise)),
        sleep(5000),
      ]);
    }
    if (server) await new Promise((resolvePromise) => server.close(() => resolvePromise()));
    if (baselineServer) await new Promise((resolvePromise) => baselineServer.close(() => resolvePromise()));
    try {
      await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
    } catch (error) {
      process.stderr.write("browser-smoke: nie udało się usunąć profilu tymczasowego: "
        + cdpSummaryText(error?.message ?? error) + "\n");
      if (!runError) process.exitCode = 2;
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runBrowserSmoke().catch((error) => {
    process.stderr.write("browser-smoke: " + cdpSummaryText(error?.message ?? error) + "\n");
    process.exitCode = 2;
  });
}
