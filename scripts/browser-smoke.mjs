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
// 1x1 transparent PNG fixture: 68 B; 128 B allows up to 60 B of PNG framing/chunks.
// Only an HTTP 200 image response below this size is classified as an empty tile.
export const EMPTY_TILE_BYTE_THRESHOLD = 128;
const MIN_SETTLE_MS = 6000;
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

export function aggregateRequests(requests = []) {
  const statuses = [...new Set(requests.map((request) => request.status)
    .filter((status) => Number.isFinite(status)))].sort((a, b) => a - b);
  const canceled = requests.filter((request) => request.canceled);
  const empty = requests.filter((request) => !request.canceled
    && request.status === 200 && isImageMime(request.mimeType)
    && Number.isFinite(request.encodedDataLength)
    && request.encodedDataLength < EMPTY_TILE_BYTE_THRESHOLD);
  const loaded = requests.filter((request) => !request.canceled && !empty.includes(request)
    && request.status >= 200 && request.status < 300 && isImageMime(request.mimeType));
  const failed = requests.filter((request) => !request.canceled && !empty.includes(request) && (
    request.errorText || !Number.isFinite(request.status) || request.status < 200
    || request.status >= 400 || !isImageMime(request.mimeType)
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
      return exactQueryKeys(params, ["request", "id", "result", "srid"])
        && /^\d{6}_\d\.\d{4}\.[0-9A-Za-z./-]{1,32}$/.test(params.get("id") ?? "")
        && params.get("result") === "id,teryt,parcel,county,commune,region,geom_wkt"
        && params.get("srid") === "4326";
    }
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
    "return { mapVisible: Boolean(document.querySelector('.leaflet-container')), tileCount: tiles.length, loadedCount: loaded.length, failedCount: match ? Number(match[1]) : 0, selectedParcelCount, searchStatus, base, year, zoom };",
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
        };
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
        const allowed = isAllowedBrowserRequest(request.url, request.method, { appOrigins, healthRoutes });
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
      const expression = "(() => { const select = document.querySelector(" + JSON.stringify(selector) + ");"
        + " if (!select) return false; const normalize = (value) => String(value || '').replace(/[Łł]/g, 'l').normalize('NFD')"
        + ".replace(/[\\u0300-\\u036f]/g, '').toLowerCase().trim().replace(/\\s+/g, ' ');"
        + " const target = normalize(" + JSON.stringify(label) + ");"
        + " const option = [...select.options].find((item) => normalize(item.textContent) === target || item.value === "
        + JSON.stringify(label) + "); if (!option) return false; select.value = option.value;"
        + " select.dispatchEvent(new Event('change', { bubbles: true })); return true; })()";
      if (!await evaluate(expression)) {
        throw new Error("Nie znaleziono pozycji listy dla podanego scenariusza wyszukiwania.");
      }
    }

    async function waitForSearchResult(deadline) {
      const expression = "(() => { const text = document.querySelector('#dzialki-search-status')?.textContent || '';"
        + " return /Znaleziono działkę|Nie znaleziono działki|Nie udało się|Upłynął limit czasu/.test(text); })()";
      while (Date.now() < deadline) {
        if (await evaluate(expression).catch(() => false)) return;
        await sleep(150);
      }
      throw new Error("Wyszukiwanie nie zakończyło się przed limitem scenariusza.");
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
      const state = await evaluateState();
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
      const screenshot = await captureScenario(name);
      screenshot.search = {
        resultTimeMs,
        statusText: state.searchStatus,
        selectedParcelElements: state.selectedParcelCount,
        outlineElements: state.selectedParcelCount,
        requests: requestDetails,
      };
      return screenshot;
    }

    async function runArchiveStability(origin) {
      const runs = [];
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
      }
      return { runs, consistency: compareProblemCoordinateSets(runs) };
    }

    function tileRequestsFor(name) {
      return tileRequests.filter((request) => request.scenario === name);
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

    async function captureScenario(name) {
      currentScenario = name;
      const state = await waitForTiles(name);
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
    const retryScenarios = [beforeRun?.retryScenario, afterRun.retryScenario].filter(Boolean);
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
      archive2025Stability: stability.consistency,
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
    lines.push("Elementy obrysu w wyszukiwaniu M4c: "
      + (parcelSearch ? parcelSearch.search.outlineElements : "scenariusz pominięty — brak argumentów"));
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
