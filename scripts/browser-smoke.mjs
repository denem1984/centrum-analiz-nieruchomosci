#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { cp, mkdtemp, mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createStaticServer } from "./serve.mjs";
import { openSmokeBudget, validateSmokeTask } from "./smoke-budget.mjs";
import { isAllowedPlanningRequest } from "./planning-allowlist.mjs";
import { planningSmokeFixture } from "./planning-smoke-fixtures.mjs";
import { isAllowedThematicRequest } from "./thematic-allowlist.mjs";
import { runThematicSmoke } from "./thematic-smoke.mjs";
import { runAppearanceSmoke } from "./appearance-smoke.mjs";
import { runMapToolsSmoke } from "./map-tools-smoke.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
export const SCENARIO_TIMEOUT_MS = 25000;
export const DEFAULT_TILE_EXPERIMENT_SETTLE_MS = 35000;
export const MAX_TILE_EXPERIMENT_ORTHO_REQUESTS = 800;
export const TILE_EXPERIMENT_REPEATS = 3;
// A 1x1 transparent PNG fixture is 68 B; 128 B allows up to 60 B of PNG framing/chunks.
// Empty detection prefers body Content-Length / Network.dataReceived bytes; transfer length is retained too.
export const EMPTY_TILE_BYTE_THRESHOLD = 128;
export const MAX_ARCHIVE_REPEAT_TILES = 6;
export const MAX_EGIB_BACKEND_REQUESTS = 400;
export const DEFAULT_KIEG_RELIABILITY_SETTLE_MS = 25000;
export const MAX_KIEG_RELIABILITY_REQUESTS = 500;
export const M4D1C_MAX_BROWSER_LAUNCHES = 5;
export const M4D1C_MAX_KIEG_REQUESTS = 900;
export const M4D1C_DEFAULT_SETTLE_MS = 40000;
export const M4D1C_EXPERIMENT_REPEATS = 3;
export const KIEG_RELIABILITY_REPEATS = 3;
export const MAX_KIEG_DIAGNOSTIC_RETRY_TILES = 6;
export const KIEG_DIAGNOSTIC_RETRY_DELAYS_MS = Object.freeze([1500, 4000]);
export const ARCHIVE_REPEAT_DELAYS_MS = Object.freeze([1500, 4000]);
export const KIEG_EXPERIMENT_VARIANTS = Object.freeze([
  Object.freeze({ id: "V0", label: "obecny kod, headless", mode: "headless", retry: "default", sweep: false }),
  Object.freeze({ id: "V1", label: "obecny kod, headed", mode: "headed", retry: "default", sweep: false }),
  Object.freeze({ id: "V2", label: "wzmocnione ponawianie i sweep", mode: "headless", retry: "strengthened", sweep: true }),
  Object.freeze({ id: "V3", label: "adaptacyjny węzeł KIEG", mode: "headless", retry: "default", sweep: false }),
]);
export const KIEG_V2_RETRY_CONFIG = Object.freeze({
  attempts: 8,
  delaysMs: Object.freeze([300, 600, 1200, 2000, 3000, 4000, 5000, 6000]),
  maxConcurrent: 6,
  jitterMs: 250,
});
const MIN_SETTLE_MS = 6000;
const ARCHIVE_WMS_HOST = "mapy.geoportal.gov.pl";
const ARCHIVE_WMS_PATH = "/wss/service/PZGIK/ORTO/WMS/StandardResolutionTime";
const KIEG_WMS_HOST = "integracja.gugik.gov.pl";
const KIEG_WMS_PATH = "/cgi-bin/KrajowaIntegracjaEwidencjiGruntow";
const KIEG_WMS_REDIRECT_HOSTS = Object.freeze(["integracja01.gugik.gov.pl", "integracja02.gugik.gov.pl"]);
const DZIALKI_BACKEND_HOST = "analizator-nieruchomosci.onrender.com";
const DZIALKI_WFS_PATH = "/api/wfs";
export const M4D1C_BUDGET_STATE_FILENAME = "m4d1c-kieg-budget.json";
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

export const TILE_EXPERIMENT_CONFIGS = Object.freeze([
  Object.freeze({ id: "K0", label: "domyślna", config: null }),
  Object.freeze({ id: "K1", label: "5 prób, równoległość 3", config: Object.freeze({
    attempts: 5,
    delaysMs: Object.freeze([1500, 3000, 6000, 12000, 20000]),
    maxConcurrent: 3,
    jitterMs: 250,
  }) }),
  Object.freeze({ id: "K2", label: "5 prób, równoległość 6", config: Object.freeze({
    attempts: 5,
    delaysMs: Object.freeze([1500, 3000, 6000, 12000, 20000]),
    maxConcurrent: 6,
    jitterMs: 250,
  }) }),
  Object.freeze({ id: "K3", label: "8 prób, opóźnienia do 30 s", config: Object.freeze({
    attempts: 8,
    delaysMs: Object.freeze([200, 300, 500, 800, 1200, 1800, 3000, 30000]),
    maxConcurrent: 2,
    jitterMs: 250,
  }) }),
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

const EMPTY_KIEG_BUDGET_STATE = Object.freeze({
  version: 1,
  task: "M4d.1c",
  launches: 0,
  requestsSent: 0,
  lastUpdatedAt: null,
});

function validKiegBudgetState(value) {
  return value?.version === 1 && value.task === "M4d.1c"
    && Number.isSafeInteger(value.launches) && value.launches >= 0
    && Number.isSafeInteger(value.requestsSent) && value.requestsSent >= 0
    && (value.lastUpdatedAt === null || typeof value.lastUpdatedAt === "string");
}

async function readKiegBudgetStateFile(statePath) {
  let source;
  try { source = await readFile(statePath, "utf8"); }
  catch (error) {
    if (error?.code === "ENOENT") return { ...EMPTY_KIEG_BUDGET_STATE };
    throw error;
  }
  let state;
  try { state = JSON.parse(source); }
  catch { throw new Error("Plik licznika KIEG jest nieczytelny; dla bezpieczeństwa żądania pozostają zablokowane."); }
  if (!validKiegBudgetState(state)
      || state.launches > M4D1C_MAX_BROWSER_LAUNCHES
      || state.requestsSent > M4D1C_MAX_KIEG_REQUESTS) {
    throw new Error("Plik licznika KIEG ma nieprawidłowy stan; dla bezpieczeństwa żądania pozostają zablokowane.");
  }
  return state;
}

function isProcessAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error?.code !== "ESRCH"; }
}

async function withKiegBudgetLock(statePath, operation) {
  await mkdir(dirname(statePath), { recursive: true });
  const lockPath = statePath + ".lock";
  let lockHandle = null;
  for (let attempt = 0; attempt < 2 && !lockHandle; attempt += 1) {
    try {
      lockHandle = await open(lockPath, "wx");
      await lockHandle.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      let lock = null;
      try { lock = JSON.parse(await readFile(lockPath, "utf8")); } catch {}
      if (lock && isProcessAlive(Number(lock.pid))) {
        throw new Error("Inne uruchomienie browser-smoke używa licznika KIEG; nowe żądania są zablokowane.");
      }
      if (!lock) throw new Error("Plik blokady licznika KIEG jest nieczytelny; usuń go po upewnieniu się, że smoke nie działa.");
      await rm(lockPath, { force: true });
    }
  }
  if (!lockHandle) throw new Error("Nie udało się uzyskać blokady licznika KIEG.");
  try {
    const state = await readKiegBudgetStateFile(statePath);
    const result = await operation(state);
    const next = result?.state ?? state;
    const temporaryPath = statePath + ".tmp-" + process.pid + "-" + Date.now();
    await writeFile(temporaryPath, JSON.stringify(next, null, 2) + "\n", "utf8");
    await rename(temporaryPath, statePath);
    return result?.value ?? next;
  } finally {
    await lockHandle.close().catch(() => {});
    await rm(lockPath, { force: true }).catch(() => {});
  }
}

export async function readM4d1cKiegBudget(statePath) {
  return await readKiegBudgetStateFile(statePath);
}

export async function reserveM4d1cBrowserLaunch(statePath, now = () => new Date().toISOString()) {
  return await withKiegBudgetLock(statePath, async (state) => {
    if (state.requestsSent >= M4D1C_MAX_KIEG_REQUESTS) {
      throw new Error("Osiągnięto globalny limit 900 żądań KIEG M4d.1c; browser-smoke nie zostanie uruchomiony.");
    }
    if (state.launches >= M4D1C_MAX_BROWSER_LAUNCHES) {
      throw new Error("Osiągnięto globalny limit 5 uruchomień browser-smoke M4d.1c.");
    }
    const next = { ...state, launches: state.launches + 1, lastUpdatedAt: now() };
    return { state: next, value: next };
  });
}

export async function reserveM4d1cKiegRequest(statePath, now = () => new Date().toISOString()) {
  return await withKiegBudgetLock(statePath, async (state) => {
    if (state.requestsSent >= M4D1C_MAX_KIEG_REQUESTS) {
      return { state, value: { allowed: false, state } };
    }
    const next = { ...state, requestsSent: state.requestsSent + 1, lastUpdatedAt: now() };
    return { state: next, value: { allowed: true, state: next } };
  });
}

export function parseKiegExperimentArguments(argv = []) {
  const rawVariant = getArg(argv, "--kieg-experiment");
  if (!rawVariant) return null;
  if (!KIEG_EXPERIMENT_VARIANTS.some(({ id }) => id === rawVariant)) {
    throw new Error("--kieg-experiment wymaga wariantu V0, V1, V2 albo V3.");
  }
  const variant = KIEG_EXPERIMENT_VARIANTS.find(({ id }) => id === rawVariant);
  const rawSettle = getArg(argv, "--kieg-experiment-settle-ms");
  const settleMs = rawSettle ? Number(rawSettle) : M4D1C_DEFAULT_SETTLE_MS;
  if (!Number.isInteger(settleMs) || settleMs < 1000 || settleMs > 120000) {
    throw new Error("--kieg-experiment-settle-ms musi mieścić się w zakresie 1000–120000.");
  }
  if (argv.includes("--headed") && variant.id !== "V1") {
    throw new Error("W eksperymencie tylko wariant V1 używa trybu headed.");
  }
  return { ...variant, settleMs };
}

export function buildKiegExperimentOverrideSource(variant) {
  const specification = KIEG_EXPERIMENT_VARIANTS.find(({ id }) => id === variant);
  if (!specification) throw new TypeError("Nieznany wariant eksperymentu KIEG.");
  const sweep = specification.sweep ? "true" : "false";
  if (variant !== "V2") return "window.__DZIALKI_KIEG_SWEEP__ = " + sweep + ";";
  return "window.__DZIALKI_KIEG_SWEEP__ = true; window.__DZIALKI_TILE_RETRY__ = "
    + JSON.stringify(KIEG_V2_RETRY_CONFIG) + ";";
}

export function buildKiegDirectUrl(rawUrl, host) {
  if (!KIEG_WMS_REDIRECT_HOSTS.includes(host)) throw new TypeError("Niedozwolony węzeł KIEG.");
  const url = new URL(rawUrl);
  if (url.hostname !== KIEG_WMS_HOST || !isAllowedDzialkiEgibRequest(url, "GET")) {
    throw new TypeError("Do przełączenia dopuszczony jest wyłącznie zgodny adres GetMap KIEG.");
  }
  url.hostname = host;
  if (!isAllowedDzialkiEgibRequest(url, "GET")) throw new TypeError("Adres węzła KIEG nie przeszedł allowlisty.");
  return url.toString();
}

export function parseTileExperimentArguments(argv = []) {
  if (!argv.includes("--experiment-tiles")) return null;
  const requestLimit = getArg(argv, "--max-ortho-requests");
  const maxOrthophotoRequests = Number(requestLimit);
  if (!requestLimit || !Number.isInteger(maxOrthophotoRequests)
      || maxOrthophotoRequests < 1
      || maxOrthophotoRequests > MAX_TILE_EXPERIMENT_ORTHO_REQUESTS) {
    throw new Error("Tryb eksperymentu wymaga --max-ortho-requests z liczbą 1–800.");
  }
  const settleText = getArg(argv, "--settle-ms");
  const settleMs = settleText ? Number(settleText) : DEFAULT_TILE_EXPERIMENT_SETTLE_MS;
  if (!Number.isInteger(settleMs) || settleMs < 1000 || settleMs > 300000) {
    throw new Error("--settle-ms musi być liczbą całkowitą z zakresu 1000–300000.");
  }
  return { maxOrthophotoRequests, settleMs };
}

export function parseEgibBackendRequestLimit(argv = []) {
  const provided = argv.some((value) => value === "--max-egib-backend-requests"
    || value.startsWith("--max-egib-backend-requests="));
  if (!provided) return MAX_EGIB_BACKEND_REQUESTS;
  const raw = getArg(argv, "--max-egib-backend-requests");
  const limit = Number(raw);
  if (!raw || !Number.isInteger(limit) || limit < 1 || limit > MAX_EGIB_BACKEND_REQUESTS) {
    throw new Error("--max-egib-backend-requests musi być liczbą całkowitą z zakresu 1–400.");
  }
  return limit;
}

export function parseKiegReliabilityArguments(argv = []) {
  if (!argv.includes("--kieg-reliability")) return null;
  const variant = getArg(argv, "--kieg-variant");
  if (!["before", "after"].includes(variant)) {
    throw new Error("Tryb KIEG wymaga --kieg-variant before|after.");
  }
  const rawLimit = getArg(argv, "--max-kieg-requests");
  const maxRequests = Number(rawLimit);
  if (!rawLimit || !Number.isInteger(maxRequests)
      || maxRequests < 1 || maxRequests > MAX_KIEG_RELIABILITY_REQUESTS) {
    throw new Error("Tryb KIEG wymaga --max-kieg-requests z liczbą 1–500.");
  }
  const rawSettle = getArg(argv, "--kieg-settle-ms");
  const settleMs = rawSettle ? Number(rawSettle) : DEFAULT_KIEG_RELIABILITY_SETTLE_MS;
  if (!Number.isInteger(settleMs) || settleMs < 1000 || settleMs > DEFAULT_KIEG_RELIABILITY_SETTLE_MS) {
    throw new Error("--kieg-settle-ms musi mieścić się w zakresie 1000–25000.");
  }
  return { variant, maxRequests, settleMs };
}

export function shouldAllowKiegRequest(sent, limit) {
  return Number.isInteger(sent) && Number.isInteger(limit)
    && sent >= 0 && limit >= 1 && limit <= MAX_KIEG_RELIABILITY_REQUESTS
    && sent < limit;
}

export function buildKiegRetryOverrideSource(variant) {
  if (variant === "before") {
    return "window.__DZIALKI_TILE_RETRY__ = { attempts: 0, delaysMs: [], maxConcurrent: 1, jitterMs: 0 };";
  }
  return null;
}

export function classifyKiegTile(tile = {}) {
  if (tile.loaded === true || (tile.complete === true
      && Number(tile.naturalWidth) > 1 && Number(tile.naturalHeight) > 1)) return "loaded";
  if (tile.complete === false) return "pending";
  return "failed";
}

export function isKiegCompletenessMonitorConsistent(observed, loadedTiles, totalTiles) {
  const fraction = totalTiles > 0 ? loadedTiles / totalTiles : null;
  return Number(observed?.monitorLoaded) === loadedTiles
    && Number(observed?.monitorTotal) === totalTiles
    && (fraction !== 1 || observed?.monitor === "Kontury kompletne");
}

function medianNumber(values) {
  const sorted = [...values].sort((left, right) => left - right);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function summarizeKiegReliabilityRuns(runs = []) {
  const fractions = runs.map((run) => run.totalTiles > 0 ? run.loadedTiles / run.totalTiles : null)
    .filter(Number.isFinite);
  return {
    runCount: runs.length,
    finalFraction: fractions.length ? {
      min: Math.min(...fractions),
      median: medianNumber(fractions),
      max: Math.max(...fractions),
    } : { min: null, median: null, max: null },
    requests: runs.reduce((sum, run) => sum + (Number(run.kiegRequestCount) || 0), 0),
    orbErrors: runs.reduce((sum, run) => sum + (Number(run.orbErrors) || 0), 0),
  };
}

export function summarizeM4d1cKiegRuns(runs = [], expectedRuns = M4D1C_EXPERIMENT_REPEATS) {
  const fractions = runs.map((run) => run.finalFraction).filter(Number.isFinite);
  const timeTo100 = runs.map((run) => run.timeTo100Ms).filter(Number.isFinite);
  return {
    finalFraction: fractions.length ? {
      min: Math.min(...fractions), median: medianNumber(fractions), max: Math.max(...fractions),
    } : { min: null, median: null, max: null },
    timeTo100Ms: timeTo100.length ? {
      min: Math.min(...timeTo100), median: medianNumber(timeTo100), max: Math.max(...timeTo100),
    } : { min: null, median: null, max: null },
    timeTo100ReachedRuns: timeTo100.length,
    expectedRuns,
    requests: runs.reduce((sum, run) => sum + (Number(run.kiegRequestsSent) || 0), 0),
    orbErrors: runs.reduce((sum, run) => sum + (Number(run.orbErrors) || 0), 0),
    completedRuns: runs.length,
    allRuns100Within20s: runs.length === expectedRuns
      && runs.every((run) => run.finalFraction === 1
        && Number.isFinite(run.timeTo100Ms) && run.timeTo100Ms <= 20000),
  };
}

export function summarizeKiegHostOutcomes(requests = []) {
  const byHost = new Map();
  for (const request of requests) {
    let url;
    try { url = new URL(request.url); } catch { continue; }
    const row = byHost.get(url.hostname) ?? {
      host: url.hostname, requests: 0, http200: 0, redirects302: 0,
      imageResponses: 0, otherContentTypes: 0, orbErrors: 0, otherErrors: 0,
      renderedTiles: 0, nonRenderedTiles: 0,
    };
    row.requests += 1;
    if (request.status === 200) row.http200 += 1;
    if (request.status === 302) row.redirects302 += 1;
    if (/^image\//i.test(request.contentType ?? request.mimeType ?? "")) row.imageResponses += 1;
    else if (request.status !== null && request.status !== undefined) row.otherContentTypes += 1;
    if (/ERR_BLOCKED_BY_ORB/i.test(request.errorText ?? "")) row.orbErrors += 1;
    else if (request.errorText) row.otherErrors += 1;
    if (request.tileRendered === true) row.renderedTiles += 1;
    if (request.tileRendered === false) row.nonRenderedTiles += 1;
    byHost.set(url.hostname, row);
  }
  return [...byHost.values()].sort((left, right) => left.host.localeCompare(right.host));
}

export function summarizeKiegRequestDisposition(requests = []) {
  const sent = requests.filter((request) => request.requestSent === true);
  const blocked = requests.filter((request) => request.requestSent === false);
  return {
    sent: sent.length,
    blocked: blocked.length,
    unclassified: requests.length - sent.length - blocked.length,
    hostOutcomes: summarizeKiegHostOutcomes(sent),
  };
}

export function shouldAllowOrthophotoRequest(sent, limit) {
  return Number.isInteger(sent) && Number.isInteger(limit)
    && sent >= 0 && limit >= 1 && limit <= MAX_TILE_EXPERIMENT_ORTHO_REQUESTS
    && sent < limit;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function summarizeThresholdTimes(runs, key) {
  const values = runs.map((run) => run[key]).filter(Number.isFinite);
  return {
    reached: values.length,
    total: runs.length,
    minMs: values.length ? Math.min(...values) : null,
    medianMs: median(values),
    maxMs: values.length ? Math.max(...values) : null,
  };
}

export function summarizeTileExperiment(runs = []) {
  return TILE_EXPERIMENT_CONFIGS.map((configuration) => {
    const trials = runs.filter((run) => run.configuration === configuration.id);
    const fractions = trials.map((run) => run.finalFraction).filter(Number.isFinite);
    return {
      configuration: configuration.id,
      label: configuration.label,
      trials: trials.length,
      expectedTrials: TILE_EXPERIMENT_REPEATS,
      finalFraction: {
        min: fractions.length ? Math.min(...fractions) : null,
        median: median(fractions),
        max: fractions.length ? Math.max(...fractions) : null,
      },
      orthophotoRequests: trials.reduce((sum, run) => sum + run.orthophotoRequests, 0),
      pendingOrthophotoRequests: trials.reduce((sum, run) => sum + (run.pendingOrthophotoRequests ?? 0), 0),
      timeTo90: summarizeThresholdTimes(trials, "timeTo90Ms"),
      timeTo95: summarizeThresholdTimes(trials, "timeTo95Ms"),
    };
  });
}

export function buildTileExperimentStateExpression() {
  return [
    "(() => {",
    "const map = document.querySelector('.leaflet-container');",
    "const bounds = map?.getBoundingClientRect();",
    "const tiles = [...document.querySelectorAll('.leaflet-tile')].filter((image) => { const rect = image.getBoundingClientRect(); return bounds && rect.width > 0 && rect.height > 0 && rect.right > bounds.left && rect.left < bounds.right && rect.bottom > bounds.top && rect.top < bounds.bottom; });",
    "const loadedImages = tiles.filter((image) => image.classList.contains('leaflet-tile-loaded') && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0);",
    "const emptyImages = loadedImages.filter((image) => image.naturalWidth <= 1 || image.naturalHeight <= 1);",
    "const loaded = loadedImages.length - emptyImages.length;",
    "const pendingImages = tiles.filter((image) => !image.complete);",
    "const notLoaded = Math.max(0, tiles.length - loaded - emptyImages.length - pendingImages.length);",
    "const stats = window.__DZIALKI_TILE_STATS__ || {};",
    "return { totalVisibleTiles: tiles.length, loaded, emptyImages: emptyImages.length, notLoaded, pendingImages: pendingImages.length, exhausted: Number(stats.finalUnloaded) || 0, pendingRetries: Number(stats.pending) || 0, errors: Number(stats.errors) || 0, retries: Number(stats.retries) || 0, base: document.querySelector('[data-base-layer]:checked')?.value || '', year: document.querySelector('#dzialki-year')?.value || '' };",
    "})()",
  ].join("\n");
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

function hasArgument(argv, name) {
  return argv.some((value) => value === name || value.startsWith(name + "="));
}

export function parseExpectedAssertionArguments(argv = []) {
  const hasVoivodeship = hasArgument(argv, "--expect-voivodeship");
  const hasCounty = hasArgument(argv, "--expect-county");
  if (!hasVoivodeship && !hasCounty) return null;
  const voivodeship = getArg(argv, "--expect-voivodeship").trim();
  const county = getArg(argv, "--expect-county").trim();
  if (!hasVoivodeship || !hasCounty || !voivodeship || !county) {
    throw new Error("Asercje wyszukiwania wymagają niepustych argumentów --expect-voivodeship i --expect-county razem.");
  }
  return { voivodeship, county };
}

export function buildParcelSearchAssertions(observed = {}, expected = {}) {
  const province = String(observed.voivodeship ?? "").trim();
  const county = String(observed.county ?? "").trim();
  const locationSummary = String(observed.locationSummary ?? "");
  const identifierLength = Number(observed.identifierLength ?? 0);
  const identifierLineCount = Number(observed.identifierLineCount ?? 0);
  const footer = String(observed.footer ?? "");
  const reportText = String(observed.reportText ?? "");
  const searchStatus = String(observed.searchStatus ?? "");
  const expectedProvince = String(expected.voivodeship ?? "").trim();
  const expectedCounty = String(expected.county ?? "").trim();
  const expectedLocationFragment = "województwo: " + expectedProvince;
  const expectedFooterFragment = "wersja M4c";
  const requiredReportLabels = ["Powierzchnia ewidencyjna", "Grupa rejestrowa", "Klasoużytki"];
  const expectedSuccessStatus = "Działka została znaleziona. Powierzchnia i klasoużytki pobrane z EGiB.";
  const expectedReportLength = requiredReportLabels.reduce((sum, value) => sum + value.length, 0)
    + expectedSuccessStatus.length;
  const rows = [
    {
      name: "report-voivodeship",
      pass: province === expectedProvince,
      observedLength: province.length,
      expectedLength: expectedProvince.length,
    },
    {
      name: "report-county",
      pass: county === expectedCounty && !/^powiat(?:\s|$)/i.test(county),
      observedLength: county.length,
      expectedLength: expectedCounty.length,
    },
    {
      name: "location-toolbar-voivodeship",
      pass: locationSummary.includes(expectedLocationFragment),
      observedLength: locationSummary.length,
      expectedLength: expectedLocationFragment.length,
    },
    {
      name: "parcel-identifier-layout",
      pass: identifierLength > 0 && identifierLineCount === 1,
      observedLength: identifierLineCount,
      expectedLength: 1,
      valueLength: identifierLength,
    },
    {
      name: "footer-stage",
      pass: footer.includes(expectedFooterFragment),
      observedLength: footer.length,
      expectedLength: expectedFooterFragment.length,
    },
    {
      name: "report-fields-and-success-status",
      pass: requiredReportLabels.every((value) => reportText.includes(value))
        && searchStatus === expectedSuccessStatus,
      observedLength: reportText.length + searchStatus.length,
      expectedLength: expectedReportLength,
    },
  ];
  return rows.map(({ name, pass, observedLength, expectedLength, valueLength }) => ({
    name,
    pass,
    observedLength,
    expectedLength,
    ...(Number.isFinite(valueLength) ? { valueLength } : {}),
  }));
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

function validBbox(value, { minWidth = 0, exactWidth = null } = {}) {
  const bbox = String(value ?? "").split(",").map(Number);
  if (bbox.length !== 4 || !bbox.every(Number.isFinite)
      || bbox[0] < -10000000 || bbox[2] > 10000000
      || bbox[1] < -10000000 || bbox[3] > 10000000
      || bbox[0] >= bbox[2] || bbox[1] >= bbox[3]) return false;
  const width = bbox[2] - bbox[0];
  const height = bbox[3] - bbox[1];
  return exactWidth === null
    ? width >= minWidth && height >= minWidth
    : Math.abs(width - exactWidth) < 0.000001 && Math.abs(height - exactWidth) < 0.000001;
}

export function isAllowedDzialkiEgibRequest(url, method = "GET") {
  if (method !== "GET" || url.protocol !== "https:" || url.port || url.username || url.password || url.hash) return false;
  if (url.hostname === DZIALKI_BACKEND_HOST && url.pathname === DZIALKI_WFS_PATH) {
    const params = new URLSearchParams(url.search);
    const bbox = (params.get("bbox") ?? "").split(",").map(Number);
    return exactQueryKeys(params, ["bbox"]) && validBbox(params.get("bbox"))
      && bbox[0] >= -90 && bbox[2] <= 90 && bbox[1] >= -180 && bbox[3] <= 180;
  }
  const isKiegHost = url.hostname === KIEG_WMS_HOST || KIEG_WMS_REDIRECT_HOSTS.includes(url.hostname);
  if (!isKiegHost || url.pathname !== KIEG_WMS_PATH) return false;
  const isRedirectHost = url.hostname !== KIEG_WMS_HOST;
  const params = new URLSearchParams(url.search);
  const mapKeys = ["service", "request", "layers", "styles", "format", "transparent", "version", "width", "height", "srs", "bbox"];
  if (exactQueryKeys(params, mapKeys)
      && params.get("service")?.toUpperCase() === "WMS"
      && params.get("request")?.toUpperCase() === "GETMAP"
      && ["dzialki", "budynki"].includes(params.get("layers"))
      && params.get("styles") === ""
      && params.get("format") === "image/png"
      && params.get("transparent")?.toLowerCase() === "true"
      && params.get("version") === "1.1.1"
      && params.get("width") === "256" && params.get("height") === "256"
      && params.get("srs") === "EPSG:3857" && validBbox(params.get("bbox"))) return true;

  if (isRedirectHost) return false;

  const infoKeys = ["SERVICE", "VERSION", "REQUEST", "SRS", "BBOX", "WIDTH", "HEIGHT", "X", "Y", "LAYERS", "QUERY_LAYERS", "INFO_FORMAT", "FORMAT", "TRANSPARENT"];
  if (!exactQueryKeys(params, infoKeys)) return false;
  const bbox = (params.get("BBOX") ?? "").split(",").map(Number);
  return params.get("SERVICE") === "WMS" && params.get("VERSION") === "1.1.1"
    && params.get("REQUEST") === "GetFeatureInfo" && params.get("SRS") === "EPSG:4326"
    && bbox.length === 4 && bbox.every(Number.isFinite)
    && Math.abs((bbox[2] - bbox[0]) - 0.0024) < 0.000001
    && Math.abs((bbox[3] - bbox[1]) - 0.0024) < 0.000001
    && params.get("WIDTH") === "1000" && params.get("HEIGHT") === "1000"
    && params.get("X") === "500" && params.get("Y") === "500"
    && params.get("LAYERS") === "dzialki" && params.get("QUERY_LAYERS") === "dzialki"
    && params.get("INFO_FORMAT") === "text/xml" && params.get("FORMAT") === "image/png"
    && params.get("TRANSPARENT") === "TRUE";
}

export function shouldAllowEgibBackendRequest(sent, limit = MAX_EGIB_BACKEND_REQUESTS) {
  return Number.isInteger(sent) && sent >= 0 && Number.isInteger(limit)
    && limit >= 1 && limit <= MAX_EGIB_BACKEND_REQUESTS && sent < limit;
}

export function isDzialkiBackendHostRequest(url) {
  return url instanceof URL && url.hostname === DZIALKI_BACKEND_HOST;
}

function isKiegWmsHostRequest(url) {
  return url instanceof URL
    && [KIEG_WMS_HOST, ...KIEG_WMS_REDIRECT_HOSTS].includes(url.hostname)
    && url.pathname === KIEG_WMS_PATH;
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
    || isAllowedPlanningRequest(url, method)
    || isAllowedThematicRequest(url, method, { allowRedirectKiutHosts:true })
    || isTileHostAllowed(url)
    || isAllowedSearchServiceRequest(url)
    || isAllowedDzialkiEgibRequest(url, method));
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
  if (options.planningLayers && isAllowedPlanningRequest(url, requestMethod)) return true;
  if (options.thematicLayers && isAllowedThematicRequest(url, requestMethod, { allowRedirectKiutHosts:options.allowRedirectKiutHosts })) return true;
  if (KIEG_WMS_REDIRECT_HOSTS.includes(url.hostname)
      && url.pathname === KIEG_WMS_PATH
      && options.allowDirectKiegHosts !== true
      && options.allowRedirectKiegHosts !== true) return false;
  if (isAllowedDzialkiEgibRequest(url, requestMethod)) return true;
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

export function parseDevToolsActivePort(source) {
  const [portText, socketPath] = String(source).trim().split(/\r?\n/);
  const port = Number(portText);
  if (!/^\d+$/.test(portText) || !Number.isInteger(port) || port < 1 || port > 65535
      || !/^\/devtools\/browser\/[a-zA-Z0-9-]+$/.test(socketPath ?? "")) return null;
  return { port, webSocketDebuggerUrl: "ws://127.0.0.1:" + port + socketPath };
}

export function buildBrowserLaunchArgs({ headed = false, profile, compact = false }) {
  return [
    ...(headed ? [] : ["--headless=new", "--disable-gpu"]),
    "--disable-background-networking", "--disable-sync", "--disable-extensions",
    "--disable-component-update", "--disable-default-apps", "--disable-crash-reporter",
    "--disable-breakpad", "--no-first-run", "--no-default-browser-check",
    "--disable-notifications", "--disable-features=msEdgeStartupBoost",
    "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0",
    "--remote-allow-origins=*", "--user-data-dir=" + profile,
    compact ? "--window-size=833,620" : "--window-size=1600,1050", "about:blank",
  ];
}

export async function waitForDebugger(profile, child, options = {}) {
  const read = options.readFileImpl ?? readFile;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const pause = options.sleepImpl ?? sleep;
  const now = options.nowFn ?? Date.now;
  const deadline = now() + (options.timeoutMs ?? 15000);
  // A Windows launcher may exit before its browser process writes this file.
  // The fresh, isolated profile identifies the correct instance in either case.
  while (now() < deadline) {
    try {
      const active = parseDevToolsActivePort(await read(join(profile, "DevToolsActivePort"), "utf8"));
      if (active) {
        const response = await fetchImpl("http://127.0.0.1:" + active.port + "/json/version", {
          signal: AbortSignal.timeout(1000), redirect: "error",
        });
        if (response.ok) {
          const version = await response.json();
          const socket = new URL(version.webSocketDebuggerUrl);
          if (socket.protocol === "ws:" && ["127.0.0.1", "localhost"].includes(socket.hostname)
              && Number(socket.port) === active.port
              && socket.pathname === new URL(active.webSocketDebuggerUrl).pathname
              && !socket.username && !socket.password && !socket.search && !socket.hash) {
            return { port: active.port, version };
          }
        }
      }
    } catch {}
    await pause(150);
  }
  throw new Error("Przeglądarka nie uruchomiła CDP w osobnym profilu (kod="
    + String(child.exitCode) + ", sygnał=" + String(child.signalCode) + ").");
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

export function buildEgibStateExpression() {
  return [
    "(() => {",
    "const status = document.querySelector('#dzialki-egib-status');",
    "const service = document.querySelector('.dzialki-service-status');",
    "const popup = document.querySelector('.leaflet-popup-content');",
    "return {",
    "numbersChecked: Boolean(document.querySelector('#dzialki-layer-numbers')?.checked),",
    "parcelsChecked: Boolean(document.querySelector('#dzialki-layer-parcels')?.checked),",
    "buildingsChecked: Boolean(document.querySelector('#dzialki-layer-buildings')?.checked),",
    "egibState: status?.dataset.state || 'missing',",
    "egibStatus: status?.textContent || '',",
    "backendState: service?.dataset.state || 'missing',",
    "outlineCount: document.querySelectorAll('path.dzialki-egib-outline').length,",
    "labelCount: document.querySelectorAll('[data-egib-label]').length,",
    "buildingTiles: document.querySelectorAll('.dzialki-egib-buildings-tile .leaflet-tile-loaded').length,",
    "selectedCount: document.querySelectorAll('path.dzialki-selected-parcel').length,",
    "popupText: popup?.textContent || '',",
    "base: document.querySelector('[data-base-layer]:checked')?.value || '',",
    "zoom: document.querySelector('input[aria-label=\\\"Przybliżenie mapy\\\"]')?.value || ''",
    "};",
    "})()",
  ].join("\n");
}

export function buildKiegReliabilityStateExpression() {
  return [
    "(() => {",
    "const layer = document.querySelector('.dzialki-egib-parcels-tile');",
    "const map = document.querySelector('.leaflet-container'); const bounds = map?.getBoundingClientRect();",
    "const tiles = [...(layer?.querySelectorAll('img.leaflet-tile') || [])].filter((image) => { const rect = image.getBoundingClientRect(); return bounds && rect.width > 0 && rect.height > 0 && rect.right > bounds.left && rect.left < bounds.right && rect.bottom > bounds.top && rect.top < bounds.bottom; }).map((image) => ({",
    "url: image.currentSrc || image.src, complete: image.complete, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,",
    "loaded: image.classList.contains('leaflet-tile-loaded') && image.complete && image.naturalWidth > 1 && image.naturalHeight > 1,",
    "}));",
    "const stats = window.__DZIALKI_KIEG_TILE_STATS__ || {};",
    "return { tiles, stats, status: document.querySelector('#dzialki-egib-status')?.textContent || '', monitor: document.querySelector('#dzialki-egib-completeness')?.textContent || '' };",
    "})()",
  ].join("\n");
}

export function buildKiegExperimentStateExpression() {
  return [
    "(() => {",
    "const map = document.querySelector('.leaflet-container'); const bounds = map?.getBoundingClientRect();",
    "const layer = document.querySelector('.dzialki-egib-parcels-tile');",
    "const tiles = [...(layer?.querySelectorAll('img.leaflet-tile') || [])].filter((image) => { const rect = image.getBoundingClientRect(); return bounds && rect.width > 0 && rect.height > 0 && rect.right > bounds.left && rect.left < bounds.right && rect.bottom > bounds.top && rect.top < bounds.bottom; }).map((image) => ({ url: image.currentSrc || image.src, loaded: image.classList.contains('leaflet-tile-loaded') && image.complete && image.naturalWidth > 1 && image.naturalHeight > 1, complete: image.complete, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight }));",
    "const monitor = document.querySelector('#dzialki-egib-completeness');",
    "return { tiles, monitor: monitor?.textContent || '', monitorLoaded: Number(monitor?.dataset.loaded || 0), monitorTotal: Number(monitor?.dataset.total || 0), stats: window.__DZIALKI_KIEG_TILE_STATS__ || {} };",
    "})()",
  ].join("\n");
}

export function buildSearchAssertionStateExpression() {
  return [
    "(() => {",
    "const report = document.querySelector('#dzialki-parcel-report');",
    "const valueFor = (label) => { const dt = [...(report?.querySelectorAll('dt') || [])].find((item) => item.textContent.trim() === label); return dt?.nextElementSibling?.textContent.trim() || ''; };",
    "const identifier = report?.querySelector('.dzialki-report-identifier-value');",
    "let identifierLineCount = 0;",
    "if (identifier) { const range = document.createRange(); range.selectNodeContents(identifier); identifierLineCount = range.getClientRects().length; }",
    "return { voivodeship: valueFor('Województwo'), county: valueFor('Powiat'), locationSummary: document.querySelector('#location-summary')?.textContent || '', identifierLength: identifier?.textContent.trim().length || 0, identifierLineCount, footer: document.querySelector('#app-version')?.textContent || '', reportText: report?.textContent || '', searchStatus: document.querySelector('#dzialki-search-status')?.textContent || '' };",
    "})()",
  ].join("\n");
}

async function runBrowserSmoke() {
  if (typeof globalThis.WebSocket !== "function") {
    throw new Error("Wymagany jest Node.js 22 lub nowszy z globalnym WebSocket.");
  }

  const argv = process.argv.slice(2);
  const checkBrowserOnly = argv.includes("--check-browser");
  const smokeTask = checkBrowserOnly ? null : validateSmokeTask(getArg(argv, "--task"));
  const requestedPort = getArg(argv, "--port");
  const egibLayersMode = argv.includes("--egib-layers");
  const planningLayersMode = argv.includes("--planning-layers");
  const thematicLayersMode = argv.includes("--thematic-layers");
  const appearanceMode = argv.includes("--appearance-tools");
  const mapToolsMode = argv.includes("--map-tools");
  const offlineMapTools = argv.includes("--offline-map-tools");
  if (offlineMapTools && !mapToolsMode) throw new Error("--offline-map-tools wymaga --map-tools.");
  const offlinePlanning = argv.includes("--offline-planning");
  const offlineThematic = argv.includes("--offline-thematic");
  const offlineAppearance = argv.includes("--offline-appearance");
  if(offlineAppearance&&!appearanceMode)throw new Error("--offline-appearance wymaga --appearance-tools.");
  if (offlinePlanning && !planningLayersMode) throw new Error("--offline-planning wymaga --planning-layers.");
  if (offlineThematic && !thematicLayersMode) throw new Error("--offline-thematic wymaga --thematic-layers.");
  const egibRequestLimitProvided = argv.some((value) => value === "--max-egib-backend-requests"
    || value.startsWith("--max-egib-backend-requests="));
  const egibBackendRequestLimit = parseEgibBackendRequestLimit(argv);
  const searchArgs = parseSearchArguments(argv);
  const expectedAssertions = parseExpectedAssertionArguments(argv);
  const tileExperimentArgs = parseTileExperimentArguments(argv);
  const kiegReliabilityArgs = parseKiegReliabilityArguments(argv);
  const kiegExperimentArgs = parseKiegExperimentArguments(argv);
  const headedRequested = argv.includes("--headed");
  const headed = kiegExperimentArgs?.mode === "headed" || headedRequested;
  const kiegReliabilityMode = Boolean(kiegReliabilityArgs);
  const kiegExperimentMode = Boolean(kiegExperimentArgs);
  if (expectedAssertions && !searchArgs) {
    throw new Error("Argumenty --expect-voivodeship i --expect-county wymagają kompletnego scenariusza wyszukiwania działki.");
  }
  const beforeRef = getArg(argv, "--before-ref") || (argv.includes("--compare-before") ? "HEAD" : "");
  if (beforeRef && !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}(?:\^[0-9]+)?$/.test(beforeRef)) {
    throw new Error("Nieprawidłowa wartość --before-ref.");
  }
  const compareBefore = Boolean(beforeRef);
  if (mapToolsMode && (appearanceMode || thematicLayersMode || planningLayersMode || egibLayersMode || kiegReliabilityMode || kiegExperimentMode || tileExperimentArgs || searchArgs || compareBefore)) throw new Error("--map-tools działa jako osobny scenariusz.");
  if(appearanceMode&&(thematicLayersMode||planningLayersMode||egibLayersMode||kiegReliabilityMode||kiegExperimentMode||tileExperimentArgs||searchArgs||compareBefore))throw new Error("--appearance-tools działa jako osobny scenariusz.");
  if (thematicLayersMode && (planningLayersMode || egibLayersMode || kiegReliabilityMode || kiegExperimentMode || tileExperimentArgs || searchArgs || compareBefore)) {
    throw new Error("--thematic-layers działa jako osobny scenariusz.");
  }
  if (planningLayersMode && (egibLayersMode || kiegReliabilityMode || kiegExperimentMode || tileExperimentArgs || searchArgs || compareBefore)) {
    throw new Error("--planning-layers działa jako osobny scenariusz.");
  }
  if (egibLayersMode && (tileExperimentArgs || kiegExperimentMode || searchArgs || expectedAssertions || compareBefore)) {
    throw new Error("--egib-layers działa samodzielnie, bez wyszukiwania ani porównania baseline.");
  }
  if (kiegReliabilityMode && (egibLayersMode || kiegExperimentMode || tileExperimentArgs || searchArgs || expectedAssertions || compareBefore)) {
    throw new Error("--kieg-reliability działa samodzielnie i nie łączy się z innymi scenariuszami.");
  }
  if (kiegExperimentMode && (kiegReliabilityMode || egibLayersMode || tileExperimentArgs || searchArgs || expectedAssertions || compareBefore)) {
    throw new Error("--kieg-experiment działa samodzielnie i nie łączy się z innymi scenariuszami.");
  }
  if (!kiegExperimentMode && argv.some((value) => value === "--kieg-experiment-settle-ms"
      || value.startsWith("--kieg-experiment-settle-ms="))) {
    throw new Error("--kieg-experiment-settle-ms wymaga --kieg-experiment.");
  }
  if (!kiegReliabilityMode && argv.some((value) => value === "--kieg-variant"
      || value.startsWith("--kieg-variant=") || value === "--max-kieg-requests"
      || value.startsWith("--max-kieg-requests=") || value === "--kieg-settle-ms"
      || value.startsWith("--kieg-settle-ms="))) {
    throw new Error("Argumenty konfiguracji KIEG są dostępne tylko z --kieg-reliability.");
  }
  if (egibRequestLimitProvided && !egibLayersMode) {
    throw new Error("--max-egib-backend-requests jest dostępny tylko z --egib-layers.");
  }
  if (tileExperimentArgs && (searchArgs || expectedAssertions || compareBefore)) {
    throw new Error("--experiment-tiles działa osobno i nie łączy się z wyszukiwaniem M4c ani porównaniem --before-ref.");
  }
  if (!tileExperimentArgs && argv.some((value) => value === "--max-ortho-requests" || value.startsWith("--max-ortho-requests=")
      || value === "--settle-ms" || value.startsWith("--settle-ms="))) {
    throw new Error("--max-ortho-requests i --settle-ms są dostępne tylko z --experiment-tiles.");
  }
  const parsedPort = requestedPort ? Number(requestedPort) : 0;
  if (requestedPort && (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535)) {
    throw new Error("Port musi być liczbą z zakresu 1–65535.");
  }

  const explicitBrowser = getArg(argv, "--browser");
  const selectedBrowser = chooseBrowserPath({
    explicitPath: explicitBrowser,
    candidates: browserCandidates(),
  });
  if (!selectedBrowser) {
    throw new Error(explicitBrowser
      ? "Nie znaleziono wskazanej przeglądarki. Sprawdź ścieżkę --browser."
      : "Nie znaleziono Edge ani Chrome w typowych lokalizacjach. Podaj --browser <ścieżka>.");
  }

  const configPath = join(REPO_ROOT, "app", "js", "config.js");
  const healthRoutes = extractHealthRoutes(configPath);
  const profile = await mkdtemp(join(tmpdir(), "m4b-browser-profile-"));
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const resultDir = join(REPO_ROOT, ".local-results", "browser-smoke-" + timestamp);
  const kiegBudgetStatePath = join(REPO_ROOT, ".local-results", M4D1C_BUDGET_STATE_FILENAME);
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
  let taskBudget = null;
  let kiegBudgetState = null;
  let kiegBudgetRequestsReserved = 0;
  let m4d1cBudgetExceeded = false;
  let kiegBudgetBlockedCount = 0;
  let v3PreferHost02 = false;
  let v3LastHost01ProbeAt = 0;
  const requestsById = new Map();
  const pendingFetchHandlers = new Set();
  const tileRequests = [];
  const externalRequests = [];
  const consoleErrors = [];
  const pageExceptions = [];
  const blockedRequests = [];
  let archiveRepeatAllowlist = [];
  let currentScenario = "";
  let orthophotoRequestCount = 0;
  let orthophotoBudgetExceeded = false;
  let orthophotoBudgetBlockedCount = 0;
  let egibBackendRequestCount = 0;
  let egibBackendBudgetExceeded = false;
  let kiegRequestCount = 0;
  let kiegBudgetExceeded = false;

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
    const browserArgs = buildBrowserLaunchArgs({
      headed, profile, compact: Boolean(tileExperimentArgs || kiegReliabilityMode || kiegExperimentMode),
    });
    if (!checkBrowserOnly) {
      taskBudget = await openSmokeBudget(join(REPO_ROOT, ".local-results", "budgets", smokeTask + ".json"), smokeTask);
      if (!await taskBudget.reserveLaunch()) throw new Error("Wyczerpano limit czterech pełnych uruchomień zadania.");
      if (kiegExperimentMode) kiegBudgetState = await reserveM4d1cBrowserLaunch(kiegBudgetStatePath);
    }
    browser = spawn(selectedBrowser, browserArgs, { stdio: ["ignore", "ignore", "pipe"], windowsHide: !headed });
    browser.stderr?.on("data", (chunk) => {
      browserStderr = (browserStderr + chunk.toString("utf8")).slice(-3000);
    });
    browser.once("error", (error) => {
      blockedRequests.push({ kind: "browser-launch-error", message: cdpSummaryText(error.message) });
    });

    const { port: debugPort, version } = await waitForDebugger(profile, browser);
    browserCdp = new CdpConnection(version.webSocketDebuggerUrl);
    await browserCdp.connect();
    const browserIdentity = await browserCdp.command("Browser.getVersion");
    const targetSocketUrl = await createPageTarget(debugPort);
    pageCdp = new CdpConnection(targetSocketUrl);
    await pageCdp.connect();

    if (checkBrowserOnly) {
      await pageCdp.command("Runtime.evaluate", { expression: `
        document.title = 'Sprawdzenie Edge / CDP';
        document.body.textContent = 'PASS — połączenie CDP działa. Brak żądań do usług mapowych.';
        document.body.style.cssText = 'font:24px system-ui;padding:48px;color:#123d35;background:#eff8f4';
      ` });
      const screenshot = await pageCdp.command("Page.captureScreenshot", { format: "png" });
      await writeFile(join(resultDir, "browser-check.png"), Buffer.from(screenshot.data, "base64"));
      await writeFile(join(resultDir, "report.json"), JSON.stringify({
        scenario: "check-browser", pass: true, browserMode: headed ? "headed" : "headless",
        product: browserIdentity.product, externalRequests: 0,
      }, null, 2));
      process.stdout.write("PASS: Edge/CDP, tryb " + (headed ? "z oknem" : "headless")
        + ", bez usług mapowych. Wyniki: " + resultDir + "\n");
      return;
    }

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
            previous.redirectTargetHost = parsed.hostname;
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
          isRedirectDestination: Boolean(params.redirectResponse),
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
        if (isArchiveGetMapUrl(parsed) || isKiegWmsHostRequest(parsed)) record.responseHeaders = {};
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
        record.fromDiskCache = params.response?.fromDiskCache === true;
        record.fromServiceWorker = params.response?.fromServiceWorker === true;
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
        if (kiegExperimentArgs?.id === "V3" && record.host === "integracja01.gugik.gov.pl"
            && /ERR_BLOCKED_BY_ORB/i.test(record.errorText)) {
          v3PreferHost02 = true;
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
        const pendingHandler = (async () => {
          const request = params.request ?? {};
          const networkRecord = params.networkId ? requestsById.get(params.networkId) : null;
          const isRedirectDestination = networkRecord?.isRedirectDestination === true;
          const isArchiveRepeatScenario = currentScenario.startsWith("stability-2025-repeat-attempt-");
          let requestUrl = request.url;
          let allowed = isArchiveRepeatScenario
            ? isAllowedArchiveRepeatRequest(requestUrl, request.method, archiveRepeatAllowlist)
            : isAllowedBrowserRequest(requestUrl, request.method, {
              appOrigins,
              healthRoutes,
              planningLayers: planningLayersMode,
              thematicLayers: thematicLayersMode,
              allowRedirectKiutHosts: isRedirectDestination,
              allowDirectKiegHosts: kiegExperimentArgs?.id === "V3",
              allowRedirectKiegHosts: isRedirectDestination,
            });
          let parsedRequestUrl = null;
          try { parsedRequestUrl = new URL(requestUrl); } catch {}
          if (allowed && kiegExperimentArgs?.id === "V3" && v3PreferHost02
              && parsedRequestUrl?.hostname === KIEG_WMS_HOST
              && isKiegWmsHostRequest(parsedRequestUrl)) {
            parsedRequestUrl.hostname = "integracja02.gugik.gov.pl";
            requestUrl = parsedRequestUrl.toString();
            allowed = isAllowedBrowserRequest(requestUrl, request.method, {
              appOrigins, healthRoutes, allowDirectKiegHosts: true,
            });
            if (networkRecord) networkRecord.routedDirectlyTo = parsedRequestUrl.hostname;
          }
          const isEgibBackendRequest = parsedRequestUrl && isDzialkiBackendHostRequest(parsedRequestUrl);
          if (allowed && isEgibBackendRequest) {
            if (!shouldAllowEgibBackendRequest(egibBackendRequestCount, egibBackendRequestLimit)) {
              allowed = false;
              egibBackendBudgetExceeded = true;
            } else {
              egibBackendRequestCount += 1;
            }
          }
          const isKiegRequest = parsedRequestUrl && isKiegWmsHostRequest(parsedRequestUrl);
          if (allowed && isKiegRequest) {
            const localLimit = kiegReliabilityArgs?.maxRequests ?? Number.POSITIVE_INFINITY;
            if (kiegRequestCount >= localLimit) {
              allowed = false;
              kiegBudgetExceeded = true;
            } else {
              const reservation = kiegExperimentMode
                ? await reserveM4d1cKiegRequest(kiegBudgetStatePath)
                : { allowed: true, state: null };
              if (!reservation.allowed) {
                allowed = false;
                m4d1cBudgetExceeded = true;
              } else {
                kiegBudgetRequestsReserved += 1;
                kiegBudgetState = reservation.state;
                kiegRequestCount += 1;
              }
            }
          }
          if (isKiegRequest && networkRecord) networkRecord.requestAllowedBySmoke = allowed;
          if (!allowed) {
            let address = request.url;
            try {
              const url = new URL(request.url);
              address = url.origin + url.pathname;
            } catch {}
            if (isKiegRequest && (kiegBudgetExceeded || m4d1cBudgetExceeded)) {
              kiegBudgetBlockedCount += 1;
              if (networkRecord) networkRecord.budgetBlocked = true;
            } else {
              blockedRequests.push({ scenario: currentScenario, url: address, method: request.method ?? "" });
            }
            await pageCdp.command("Fetch.failRequest", {
              requestId: params.requestId,
              errorReason: "BlockedByClient",
            }).catch(() => {});
            return;
          }
          if (tileExperimentArgs && isArchiveGetMapUrl(request.url)) {
            if (!shouldAllowOrthophotoRequest(orthophotoRequestCount, tileExperimentArgs.maxOrthophotoRequests)) {
              orthophotoBudgetExceeded = true;
              orthophotoBudgetBlockedCount += 1;
              await pageCdp.command("Fetch.failRequest", {
                requestId: params.requestId,
                errorReason: "BlockedByClient",
              }).catch(() => {});
              return;
            }
            orthophotoRequestCount += 1;
          }
          if ((offlinePlanning || offlineThematic || offlineAppearance || offlineMapTools) && parsedRequestUrl && !appOrigins.includes(parsedRequestUrl.origin)) {
            if (networkRecord) networkRecord.mocked = true;
            await pageCdp.command("Fetch.fulfillRequest", { requestId: params.requestId, ...planningSmokeFixture(requestUrl) });
            return;
          }
          // Persist before dispatch; failed and redirected requests also consume budget.
          // Local HTTP/CDP traffic is outside the external-service counters.
          if (parsedRequestUrl && !appOrigins.includes(parsedRequestUrl.origin)
              && !await taskBudget.reserveRequest(requestUrl)) {
            blockedRequests.push({ scenario: currentScenario, kind: "task-budget", service: parsedRequestUrl.hostname });
            await pageCdp.command("Fetch.failRequest", {
              requestId: params.requestId, errorReason: "BlockedByClient",
            }).catch(() => {});
            return;
          }
          await pageCdp.command("Fetch.continueRequest", {
            requestId: params.requestId,
            ...(requestUrl !== request.url ? { url: requestUrl } : {}),
          }).catch(() => {});
        })().catch((error) => {
          runError = error;
          void pageCdp.command("Fetch.failRequest", {
            requestId: params.requestId,
            errorReason: "Failed",
          }).catch(() => {});
        });
        pendingFetchHandlers.add(pendingHandler);
        void pendingHandler.finally(() => pendingFetchHandlers.delete(pendingHandler));
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
    const kiegRetryOverrideSource = kiegExperimentMode
      ? buildKiegExperimentOverrideSource(kiegExperimentArgs.id)
      : buildKiegRetryOverrideSource(kiegReliabilityArgs?.variant);
    if (kiegRetryOverrideSource) {
      await pageCdp.command("Page.addScriptToEvaluateOnNewDocument", { source: kiegRetryOverrideSource });
    }
    if (tileExperimentArgs || kiegReliabilityMode || kiegExperimentMode) {
      await pageCdp.command("Emulation.setDeviceMetricsOverride", {
        width: 833,
        height: 620,
        deviceScaleFactor: 1,
        mobile: false,
        screenWidth: 833,
        screenHeight: 620,
      });
    }

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
      const assertionState = expectedAssertions
        ? await evaluate(buildSearchAssertionStateExpression())
        : null;
      const assertions = assertionState
        ? buildParcelSearchAssertions(assertionState, expectedAssertions)
        : null;
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
        assertions,
        egibRequests,
        sourceRequests,
        dzialkiBackendSearchRequests,
        requests: requestDetails,
      };
      return screenshot;
    }

    async function runEgibLayersScenario(origin) {
      const scenarioName = "egib-layers";
      currentScenario = scenarioName;
      const startedAt = Date.now();
      await pageCdp.command("Page.navigate", {
        url: origin + "/?browserSmoke=egib-layers#/dzialki?ctx=" + contextEncoded,
      });
      await waitForMap(origin);
      await setZoomForTest();
      const initial = await evaluate(buildEgibStateExpression());
      const sawWaking = initial.egibState === "waking" || /Usługa się budzi/.test(initial.egibStatus);
      const dataDeadline = Date.now() + 120000;
      let dataState = initial;
      let timeToDataMs = /^Warstwy EGiB wczytane\./.test(initial.egibStatus)
        ? Date.now() - startedAt
        : null;
      let coldStartObserved = sawWaking;
      while (Date.now() < dataDeadline) {
        dataState = await evaluate(buildEgibStateExpression()).catch(() => dataState);
        if (dataState.egibState === "waking" || /Usługa się budzi/.test(dataState.egibStatus)) coldStartObserved = true;
        const dataLoaded = /^Warstwy EGiB wczytane\./.test(dataState.egibStatus);
        if (dataLoaded && timeToDataMs === null) timeToDataMs = Date.now() - startedAt;
        if (dataLoaded || dataState.egibState === "error") break;
        await sleep(200);
      }

      const buildingToggle = await evaluate("(() => { const input = document.querySelector('#dzialki-layer-buildings'); if (!input) return false; input.checked = true; input.dispatchEvent(new Event('change', { bubbles: true })); return true; })()");
      if (!buildingToggle) throw new Error("Nie znaleziono przełącznika konturów budynków.");
      const buildingsDeadline = Date.now() + 15000;
      let afterBuildings = await evaluate(buildEgibStateExpression()).catch(() => dataState);
      while (Date.now() < buildingsDeadline && afterBuildings.buildingTiles === 0) {
        await sleep(250);
        afterBuildings = await evaluate(buildEgibStateExpression()).catch(() => afterBuildings);
      }

      const clickCenter = "(() => { const map = document.querySelector('.dzialki-map'); if (!map) return false;"
        + " const r = map.getBoundingClientRect(); const e = new MouseEvent('click', { bubbles: true, cancelable: true,"
        + " clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }); map.dispatchEvent(e); return true; })()";
      const clickStarted = Date.now();
      const firstClickSent = await evaluate(clickCenter);
      if (!firstClickSent) throw new Error("Nie udało się kliknąć środka widoku mapy.");
      const popupDeadline = Date.now() + 15000;
      let popupState = await evaluate(buildEgibStateExpression()).catch(() => null);
      while (Date.now() < popupDeadline && !/Powierzchnia:/.test(popupState?.popupText ?? "")) {
        await sleep(200);
        popupState = await evaluate(buildEgibStateExpression()).catch(() => popupState);
      }
      const popupTimeMs = Date.now() - clickStarted;

      const secondClickSent = await evaluate(clickCenter);
      if (!secondClickSent) throw new Error("Nie udało się wykonać drugiego kliknięcia mapy.");
      const deselectDeadline = Date.now() + 15000;
      let finalState = await evaluate(buildEgibStateExpression()).catch(() => popupState);
      while (Date.now() < deselectDeadline && !/Odznaczono tę działkę\./.test(finalState?.egibStatus ?? "")) {
        await sleep(200);
        finalState = await evaluate(buildEgibStateExpression()).catch(() => finalState);
      }

      const scenarioRequests = externalRequests.filter((request) => request.scenario === scenarioName);
      const egibRequests = scenarioRequests.filter((request) => {
        const url = new URL(request.url);
        return url.hostname === DZIALKI_BACKEND_HOST
          || ((url.hostname === KIEG_WMS_HOST || KIEG_WMS_REDIRECT_HOSTS.includes(url.hostname))
            && url.pathname === KIEG_WMS_PATH);
      }).map(({ url, method, status, mimeType, elapsedMs, errorText, resourceType }) => ({
        url, method, status, mimeType, elapsedMs, errorText, resourceType,
      }));
      const scenarioErrors = consoleErrors.filter((item) => item.scenario === scenarioName);
      const assertions = [
        { name: "Numery i kontury działek domyślnie włączone", pass: initial.numbersChecked && initial.parcelsChecked },
        { name: "Kontury budynków domyślnie wyłączone", pass: !initial.buildingsChecked },
        { name: "Po włączeniu konturów budynków pojawiły się kafelki", pass: afterBuildings.buildingTiles > 0 },
        { name: "Komunikat zimnego startu", pass: coldStartObserved || initial.backendState === "ready", observed: coldStartObserved },
        { name: "Popup zawiera powierzchnię, grupę i klasoużytki", pass: ["Powierzchnia:", "Grupa rejestrowa:", "Klasoużytki:"].every((part) => popupState?.popupText.includes(part)) },
        { name: "Drugie kliknięcie odznacza działkę", pass: /Odznaczono tę działkę\./.test(finalState?.egibStatus ?? "") },
        { name: "Brak błędów konsoli", pass: scenarioErrors.length === 0 },
      ];
      const screenshot = await pageCdp.command("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
      const screenshotPath = join(resultDir, scenarioName + ".png");
      await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
      return {
        name: scenarioName,
        durationMs: Date.now() - startedAt,
        timeToDataMs,
        timeToPopupMs: popupState?.popupText ? popupTimeMs : null,
        initial,
        afterBuildings,
        popupState,
        finalState,
        coldStartObserved,
        egibRequests,
        backendRequestCount: egibRequests.filter((request) => request.url.includes("/api/wfs?")).length,
        httpStatuses: [...new Set(egibRequests.map((request) => request.status)
          .filter((status) => status !== null))].sort((left, right) => left - right),
        assertions,
        consoleErrorCount: scenarioErrors.length,
        screenshot: screenshotPath,
        passed: assertions.every((assertion) => assertion.pass),
      };
    }

    async function runKiegReliability(origin) {
      const modeStartCount = kiegRequestCount;
      const runs = [];
      const failedUrls = [];
      for (let index = 1; index <= KIEG_RELIABILITY_REPEATS; index += 1) {
        const name = "kieg-" + kiegReliabilityArgs.variant + "-run-" + index;
        currentScenario = name;
        await pageCdp.command("Page.navigate", {
          url: origin + "/?browserSmoke=" + name + "#/dzialki?ctx=" + contextEncoded,
        });
        await waitForMap(origin);
        await setZoomForTest();
        await sleep(250);
        const startedAt = Date.now();
        await sleep(kiegReliabilityArgs.settleMs);
        const state = await evaluate(buildKiegReliabilityStateExpression());
        const tiles = Array.isArray(state.tiles) ? state.tiles : [];
        const loadedTiles = tiles.filter((tile) => classifyKiegTile(tile) === "loaded").length;
        const scenarioRequests = externalRequests.filter((request) => request.scenario === name
          && (() => { try { return isKiegWmsHostRequest(new URL(request.url)); } catch { return false; } })());
        const tileByQuery = new Map();
        for (const tile of tiles) {
          try {
            const url = new URL(tile.url);
            tileByQuery.set(url.pathname + url.search, classifyKiegTile(tile) === "loaded");
          } catch {}
        }
        const requestDetails = scenarioRequests.map((request) => {
          let key = "";
          try { const url = new URL(request.url); key = url.pathname + url.search; } catch {}
          const contentType = request.responseHeaders?.["content-type"] ?? "";
          return {
            url: request.url,
            host: request.host,
            redirectTargetHost: request.redirectTargetHost ?? null,
            status: request.status,
            mimeType: request.mimeType,
            contentType,
            contentLength: request.responseHeaders?.["content-length"] ?? null,
            cacheControl: request.responseHeaders?.["cache-control"] ?? null,
            resourceType: request.resourceType,
            elapsedMs: request.elapsedMs,
            errorText: request.errorText,
            fromDiskCache: request.fromDiskCache === true,
            requestSent: request.requestAllowedBySmoke === true,
            budgetBlocked: request.requestAllowedBySmoke === false,
            tileRendered: tileByQuery.has(key) ? tileByQuery.get(key) : null,
          };
        });
        const orbErrors = requestDetails.filter((request) => /ERR_BLOCKED_BY_ORB/i.test(request.errorText)).length;
        const screenshot = await pageCdp.command("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
        const screenshotPath = join(resultDir, name + ".png");
        await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
        runs.push({
          name,
          durationMs: Date.now() - startedAt,
          settleMs: kiegReliabilityArgs.settleMs,
          totalTiles: tiles.length,
          loadedTiles,
          failedTiles: tiles.filter((tile) => classifyKiegTile(tile) === "failed").length,
          pendingTiles: tiles.filter((tile) => classifyKiegTile(tile) === "pending").length,
          finalFraction: tiles.length ? loadedTiles / tiles.length : null,
          stats: state.stats,
          kiegRequestCount: requestDetails.length,
          orbErrors,
          requests: requestDetails,
          hostOutcomes: summarizeKiegHostOutcomes(requestDetails),
          screenshot: screenshotPath,
        });
        if (kiegReliabilityArgs.variant === "before") {
          for (const tile of tiles) {
            if (classifyKiegTile(tile) === "failed" && tile.url && !failedUrls.includes(tile.url)) failedUrls.push(tile.url);
          }
        }
      }

      const diagnosticRetries = [];
      if (kiegReliabilityArgs.variant === "before" && failedUrls.length) {
        const selected = failedUrls.slice(0, MAX_KIEG_DIAGNOSTIC_RETRY_TILES);
        const retryStart = Date.now();
        for (let index = 0; index < KIEG_DIAGNOSTIC_RETRY_DELAYS_MS.length; index += 1) {
          const delayMs = KIEG_DIAGNOSTIC_RETRY_DELAYS_MS[index];
          await sleep(Math.max(0, retryStart + delayMs - Date.now()));
          const name = "kieg-before-diagnostic-" + delayMs + "ms";
          currentScenario = name;
          const expression = "Promise.all(" + JSON.stringify(selected) + ".map((url) => new Promise((resolve) => {"
            + "const image = new Image(); const started = performance.now(); let settled = false;"
            + "const finish = (result) => { if (settled) return; settled = true; clearTimeout(timeout); resolve({ url, delayMs: " + delayMs
            + ", result, width: image.naturalWidth, height: image.naturalHeight, elapsedMs: Math.round(performance.now() - started) }); };"
            + "const timeout = setTimeout(() => finish('timeout'), 12000); image.onload = () => finish('loaded'); image.onerror = () => finish('error'); image.src = url;"
            + "})))";
          diagnosticRetries.push(...(await evaluate(expression, 16000)));
        }
      }
      const diagnosticRequests = externalRequests.filter((request) => request.scenario.startsWith("kieg-before-diagnostic-"));
      for (const run of runs) {
        const scenarioRequests = externalRequests.filter((request) => request.scenario === run.name);
        const kiegScenarioRequests = scenarioRequests.filter((request) => {
          try { return isKiegWmsHostRequest(new URL(request.url)); } catch { return false; }
        }).map((request) => ({
          requestSent: request.requestAllowedBySmoke === true,
          url: request.url,
          status: request.status,
          mimeType: request.mimeType,
          contentType: request.responseHeaders?.["content-type"] ?? "",
          errorText: request.errorText,
        }));
        const disposition = summarizeKiegRequestDisposition(kiegScenarioRequests);
        run.kiegRequestCount = disposition.sent;
        run.budgetBlockedRequests = disposition.blocked;
        run.unclassifiedRequests = disposition.unclassified;
      }
      const assertionPass = kiegReliabilityArgs.variant === "after"
        ? runs.length === KIEG_RELIABILITY_REPEATS && runs.every((run) => run.finalFraction !== null && run.finalFraction >= 0.9)
        : null;
      return {
        variant: kiegReliabilityArgs.variant,
        retryPolicy: kiegReliabilityArgs.variant === "before" ? "retry wyłączony (0 prób ponownych)" : "K0: 2 próby, 1500/4000 ms, równoległość 6",
        repeats: KIEG_RELIABILITY_REPEATS,
        settleMs: kiegReliabilityArgs.settleMs,
        maxRequests: kiegReliabilityArgs.maxRequests,
        requestsSent: kiegRequestCount - modeStartCount,
        budgetExceeded: kiegBudgetExceeded,
        cacheDisabled: true,
        runs,
        summary: summarizeKiegReliabilityRuns(runs),
        assertionPass,
        hostOutcomes: summarizeKiegHostOutcomes(runs.flatMap((run) => run.requests)
          .filter((request) => request.requestSent === true)),
        failedUrlsConsideredForRepeat: Math.min(failedUrls.length, MAX_KIEG_DIAGNOSTIC_RETRY_TILES),
        diagnosticRetryDelaysMs: kiegReliabilityArgs.variant === "before" ? KIEG_DIAGNOSTIC_RETRY_DELAYS_MS : [],
        diagnosticRetries,
        diagnosticRequests: diagnosticRequests.map((request) => ({
          url: request.url,
          host: request.host,
          redirectTargetHost: request.redirectTargetHost ?? null,
          status: request.status,
          mimeType: request.mimeType,
          contentType: request.responseHeaders?.["content-type"] ?? "",
          contentLength: request.responseHeaders?.["content-length"] ?? null,
          cacheControl: request.responseHeaders?.["cache-control"] ?? null,
          elapsedMs: request.elapsedMs,
          errorText: request.errorText,
          fromDiskCache: request.fromDiskCache === true,
          requestSent: request.requestAllowedBySmoke === true,
          budgetBlocked: request.requestAllowedBySmoke === false,
        })),
      };
    }

    async function runKiegExperiment(origin) {
      const variant = kiegExperimentArgs.id;
      const modeStartRequests = kiegBudgetRequestsReserved;
      const taskStartedAt = Date.now();
      let nextProbeAt = 60000;
      const runs = [];
      for (let index = 1; index <= M4D1C_EXPERIMENT_REPEATS; index += 1) {
        if (m4d1cBudgetExceeded) break;
        const name = "kieg-experiment-" + variant.toLowerCase() + "-run-" + index;
        currentScenario = name;
        v3PreferHost02 = false;
        const startedAt = Date.now();
        await pageCdp.command("Page.navigate", {
          url: origin + "/?browserSmoke=" + name + "#/dzialki?ctx=" + contextEncoded,
        });
        await waitForMap(origin);
        await setZoomForTest();
        let timeTo100Ms = null;
        let observed = { tiles: [], monitor: "", monitorLoaded: 0, monitorTotal: 0, stats: {} };
        while (Date.now() - startedAt < kiegExperimentArgs.settleMs) {
          if (variant === "V3" && Date.now() - taskStartedAt >= nextProbeAt) {
            await evaluate("(() => { const image = document.querySelector('.dzialki-egib-parcels-tile img.leaflet-tile'); if (!image) return false; const url = new URL(image.currentSrc || image.src); url.hostname = 'integracja01.gugik.gov.pl'; const probe = new Image(); probe.alt = ''; probe.src = url.toString(); return true; })()")
              .catch(() => false);
            v3LastHost01ProbeAt = Date.now();
            nextProbeAt += 60000;
          }
          observed = await evaluate(buildKiegExperimentStateExpression()).catch(() => observed);
          const visibleTiles = Array.isArray(observed?.tiles) ? observed.tiles : [];
          const loaded = visibleTiles.filter((tile) => tile.loaded === true).length;
          if (visibleTiles.length > 0 && loaded === visibleTiles.length && timeTo100Ms === null) {
            timeTo100Ms = Math.max(0, Date.now() - startedAt);
          }
          const remaining = kiegExperimentArgs.settleMs - (Date.now() - startedAt);
          if (remaining > 0) await sleep(Math.min(250, remaining));
        }
        observed = await evaluate(buildKiegExperimentStateExpression()).catch(() => observed);
        const tiles = Array.isArray(observed?.tiles) ? observed.tiles : [];
        const loadedTiles = tiles.filter((tile) => tile.loaded === true).length;
        const tileByQuery = new Map();
        for (const tile of tiles) {
          try {
            const url = new URL(tile.url);
            tileByQuery.set(url.pathname + url.search, tile.loaded === true);
          } catch {}
        }
        const requests = externalRequests.filter((request) => request.scenario === name
          && (() => { try { return isKiegWmsHostRequest(new URL(request.url)); } catch { return false; } })());
        const requestDetails = requests.map((request) => {
          let key = "";
          try { const url = new URL(request.url); key = url.pathname + url.search; } catch {}
          return {
            host: (() => { try { return new URL(request.url).hostname; } catch { return ""; } })(),
            redirectTargetHost: request.redirectTargetHost ?? null,
            status: request.status,
            mimeType: request.mimeType,
            contentType: request.responseHeaders?.["content-type"] ?? "",
            contentLength: request.responseHeaders?.["content-length"] ?? null,
            errorText: request.errorText,
            elapsedMs: request.elapsedMs,
            resourceType: request.resourceType,
            requestSent: request.requestAllowedBySmoke === true,
            budgetBlocked: request.budgetBlocked === true,
            routedDirectlyTo: request.routedDirectlyTo ?? null,
            tileRendered: tileByQuery.has(key) ? tileByQuery.get(key) : null,
          };
        });
        const sentRequests = requestDetails.filter((request) => request.requestSent);
        const host01Requests = sentRequests.filter((request) => request.host === "integracja01.gugik.gov.pl");
        const host02Requests = sentRequests.filter((request) => request.host === "integracja02.gugik.gov.pl");
        const orbErrors = sentRequests.filter((request) => /ERR_BLOCKED_BY_ORB/i.test(request.errorText)).length;
        const finalFraction = tiles.length ? loadedTiles / tiles.length : null;
        const monitorMatches = isKiegCompletenessMonitorConsistent(observed, loadedTiles, tiles.length);
        const screenshot = await pageCdp.command("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
        const screenshotPath = join(resultDir, name + ".png");
        await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
        const run = {
          name,
          variant,
          browserMode: headed ? "headed" : "headless",
          durationMs: Date.now() - startedAt,
          settleMs: kiegExperimentArgs.settleMs,
          totalTiles: tiles.length,
          loadedTiles,
          missingTiles: Math.max(0, tiles.length - loadedTiles),
          finalFraction,
          timeTo100Ms,
          retryStats: observed?.stats ?? {},
          monitor: observed?.monitor ?? "",
          monitorLoaded: Number(observed?.monitorLoaded) || 0,
          monitorTotal: Number(observed?.monitorTotal) || 0,
          monitorMatches,
          monitorAssertionPass: monitorMatches,
          assertionPass: finalFraction === 1 && monitorMatches,
          kiegRequestsSent: sentRequests.length,
          orbErrors,
          host01Requests: host01Requests.length,
          host01OrbErrors: host01Requests.filter((request) => /ERR_BLOCKED_BY_ORB/i.test(request.errorText)).length,
          host02Requests: host02Requests.length,
          redirect01Count: sentRequests.filter((request) => request.host === KIEG_WMS_HOST
            && request.status === 302 && request.redirectTargetHost === "integracja01.gugik.gov.pl").length,
          redirect02Count: sentRequests.filter((request) => request.host === KIEG_WMS_HOST
            && request.status === 302 && request.redirectTargetHost === "integracja02.gugik.gov.pl").length,
          requests: requestDetails,
          screenshot: screenshotPath,
        };
        runs.push(run);
        if (m4d1cBudgetExceeded) break;
      }
      const summary = summarizeM4d1cKiegRuns(runs, M4D1C_EXPERIMENT_REPEATS);
      return {
        variant,
        label: kiegExperimentArgs.label,
        browserMode: headed ? "headed" : "headless",
        browserUserAgent: browserIdentity.userAgent ?? "",
        expectedRuns: M4D1C_EXPERIMENT_REPEATS,
        runs,
        summary,
        budget: {
          requestsReservedThisInvocation: kiegBudgetRequestsReserved - modeStartRequests,
          requestsSentTaskTotal: kiegBudgetState?.requestsSent ?? 0,
          browserLaunchesTaskTotal: kiegBudgetState?.launches ?? 0,
          requestLimit: M4D1C_MAX_KIEG_REQUESTS,
          launchLimit: M4D1C_MAX_BROWSER_LAUNCHES,
          exceeded: m4d1cBudgetExceeded,
        },
        host01ErrorFraction: runs.reduce((sum, run) => sum + run.host01OrbErrors, 0)
          / Math.max(1, runs.reduce((sum, run) => sum + run.host01Requests, 0)),
        hostSplit: {
          redirect01: runs.reduce((sum, run) => sum + run.redirect01Count, 0),
          redirect02: runs.reduce((sum, run) => sum + run.redirect02Count, 0),
          finalHost01: runs.reduce((sum, run) => sum + run.host01Requests, 0),
          finalHost02: runs.reduce((sum, run) => sum + run.host02Requests, 0),
          directHost02: runs.flatMap((run) => run.requests).filter((request) => request.routedDirectlyTo === "integracja02.gugik.gov.pl").length,
        },
      };
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

    async function runTileExperiment(origin) {
      const runs = [];
      let overrideIdentifier = null;
      for (const configuration of TILE_EXPERIMENT_CONFIGS) {
        if (orthophotoBudgetExceeded) break;
        if (overrideIdentifier) {
          await pageCdp.command("Page.removeScriptToEvaluateOnNewDocument", { identifier: overrideIdentifier });
          overrideIdentifier = null;
        }
        if (configuration.config) {
          const source = "window.__DZIALKI_TILE_RETRY__ = " + JSON.stringify(configuration.config) + ";";
          const installed = await pageCdp.command("Page.addScriptToEvaluateOnNewDocument", { source });
          overrideIdentifier = installed.identifier;
        }

        for (let index = 1; index <= TILE_EXPERIMENT_REPEATS; index += 1) {
          if (orthophotoBudgetExceeded) break;
          const scenarioName = "experiment-" + configuration.id + "-run-" + index;
          currentScenario = scenarioName;
          const requestsBefore = orthophotoRequestCount;
          await pageCdp.command("Page.navigate", {
            url: origin + "/?browserSmoke=" + scenarioName + "#/dzialki?ctx=" + contextEncoded,
          });
          await waitForMap(origin);
          await setZoomForTest();
          await sleep(350);
          await setYear(2025);
          await selectBase("archive");
          const selectedAt = Date.now();

          let timeTo90Ms = null;
          let timeTo95Ms = null;
          let previousTotal = -1;
          let stableTotalSamples = 0;
          const deadline = selectedAt + tileExperimentArgs.settleMs;
          while (Date.now() < deadline && !orthophotoBudgetExceeded) {
            const state = await evaluate(buildTileExperimentStateExpression()).catch(() => null);
            if (state?.base === "archive" && state.year === "2025" && state.totalVisibleTiles > 0) {
              if (state.totalVisibleTiles === previousTotal) stableTotalSamples += 1;
              else stableTotalSamples = 0;
              previousTotal = state.totalVisibleTiles;
              if (stableTotalSamples >= 2) {
                const elapsedMs = Date.now() - selectedAt;
                const fraction = state.loaded / state.totalVisibleTiles;
                if (timeTo90Ms === null && fraction >= 0.9) timeTo90Ms = elapsedMs;
                if (timeTo95Ms === null && fraction >= 0.95) timeTo95Ms = elapsedMs;
              }
            }
            if (orthophotoBudgetExceeded) break;
            await sleep(Math.min(500, Math.max(0, deadline - Date.now())));
          }

          const finalState = await evaluate(buildTileExperimentStateExpression()).catch(() => null);
          const finalTotal = Number(finalState?.totalVisibleTiles) || 0;
          const finalLoaded = Number(finalState?.loaded) || 0;
          const finalFraction = finalTotal > 0 ? finalLoaded / finalTotal : null;
          const elapsedMs = Math.max(0, Date.now() - selectedAt);
          if (timeTo90Ms === null && finalFraction !== null && finalFraction >= 0.9) timeTo90Ms = elapsedMs;
          if (timeTo95Ms === null && finalFraction !== null && finalFraction >= 0.95) timeTo95Ms = elapsedMs;
          const screenshot = await pageCdp.command("Page.captureScreenshot", {
            format: "png",
            captureBeyondViewport: true,
          });
          const screenshotPath = join(resultDir, scenarioName + ".png");
          await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
          const scenarioRequests = tileRequests.filter((request) => request.scenario === scenarioName
            && isArchiveGetMapUrl(request.url) && request.method === "GET");
          const aggregate = aggregateRequests(scenarioRequests);
          const pendingOrthophotoRequests = scenarioRequests.filter((request) => request.status === null
            && !request.canceled && !request.errorText).length;
          runs.push({
            configuration: configuration.id,
            run: index,
            name: scenarioName,
            finalLoaded: finalLoaded,
            finalEmptyImages: Number(finalState?.emptyImages) || 0,
            finalNotLoaded: Number(finalState?.notLoaded) || 0,
            finalPendingImages: Number(finalState?.pendingImages) || 0,
            exhaustedAfterRetries: Number(finalState?.exhausted) || 0,
            pendingRetries: Number(finalState?.pendingRetries) || 0,
            totalVisible: finalTotal,
            finalFraction,
            retries: Number(finalState?.retries) || 0,
            errors: Number(finalState?.errors) || 0,
            timeTo90Ms,
            timeTo95Ms,
            settleMs: elapsedMs,
            orthophotoRequests: orthophotoRequestCount - requestsBefore,
            pendingOrthophotoRequests,
            requestCounts: {
              loaded: aggregate.loaded,
              empty: aggregate.empty,
              failed: aggregate.failed,
              canceled: aggregate.canceled,
              statuses: aggregate.statuses,
            },
            screenshot: screenshotPath,
          });
        }
      }
      if (overrideIdentifier) {
        await pageCdp.command("Page.removeScriptToEvaluateOnNewDocument", { identifier: overrideIdentifier })
          .catch(() => {});
      }
      return {
        runs,
        summary: summarizeTileExperiment(runs),
        maxOrthophotoRequests: tileExperimentArgs.maxOrthophotoRequests,
        orthophotoRequestsSent: orthophotoRequestCount,
        budgetExceeded: orthophotoBudgetExceeded,
        budgetBlockedCount: orthophotoBudgetBlockedCount,
        settleMs: tileExperimentArgs.settleMs,
        repeatsPerConfiguration: TILE_EXPERIMENT_REPEATS,
        viewport: { width: 833, height: 620, zoom: 17.6 },
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

    if(appearanceMode || mapToolsMode){
      currentScenario = mapToolsMode ? "m4e2-map-tools" : "m4e1-appearance";
      const offline = mapToolsMode ? offlineMapTools : offlineAppearance;
      const capture=async(filename)=>{const shot=await pageCdp.command("Page.captureScreenshot",{format:"png",captureBeyondViewport:true});await writeFile(join(resultDir,filename),Buffer.from(shot.data,"base64"));};
      const result=await (mapToolsMode ? runMapToolsSmoke : runAppearanceSmoke)({evaluate,command:(method,params)=>pageCdp.command(method,params),sleep,origin:appOrigin,context:contextEncoded,waitForMap,setZoom:setZoomForTest,offline,capture});
      result.assertions.push({name:"Brak wyjątków JavaScript",pass:pageExceptions.length===0});await Promise.all([...pendingFetchHandlers]);if(runError)throw runError;
      const passed=result.assertions.every(assertion=>assertion.pass)&&blockedRequests.length===0;
      runReport={scenario:currentScenario,browserMode:headed?"headed":"headless",offline,passed,...result,externalRequests,blockedRequests,consoleErrors,pageExceptions,budget:taskBudget.snapshot()};
      await writeFile(join(resultDir,"report.json"),JSON.stringify(runReport,null,2),"utf8");
      const summary=result.assertions.map(assertion=>(assertion.pass?"PASS":"FAIL")+" | "+assertion.name).join("\n")+"\nŻądania zablokowane: "+blockedRequests.length+"\nWyniki: "+resultDir+"\n";
      await writeFile(join(resultDir,"summary.txt"),summary,"utf8");process.stdout.write(summary);if(!passed)process.exitCode=1;return;
    }
    if (thematicLayersMode) {
      currentScenario = "m4d3-thematic";
      const capture = async (filename) => {
        const shot = await pageCdp.command("Page.captureScreenshot", {format:"png",captureBeyondViewport:true});
        await writeFile(join(resultDir,filename),Buffer.from(shot.data,"base64"));
      };
      const result = await runThematicSmoke({evaluate,command:(method,params)=>pageCdp.command(method,params),sleep,origin:appOrigin,
        context:contextEncoded,waitForMap,setZoom:setZoomForTest,offline:offlineThematic,capture});
      result.assertions.push({name:"Brak wyjątków JavaScript",pass:pageExceptions.length===0});
      await Promise.all([...pendingFetchHandlers]);
      if (runError) throw runError;
      const passed = result.assertions.every(assertion=>assertion.pass)&&blockedRequests.length===0;
      runReport = {scenario:currentScenario,browserMode:headed?"headed":"headless",offline:offlineThematic,passed,...result,
        externalRequests,blockedRequests,consoleErrors,pageExceptions,budget:taskBudget.snapshot()};
      await writeFile(join(resultDir,"report.json"),JSON.stringify(runReport,null,2),"utf8");
      const summary = result.assertions.map(assertion=>(assertion.pass?"PASS":"FAIL")+" | "+assertion.name).join("\n")
        +"\nŻądania zablokowane: "+blockedRequests.length+"\nWyniki: "+resultDir+"\n";
      await writeFile(join(resultDir,"summary.txt"),summary,"utf8"); process.stdout.write(summary);
      if (!passed) process.exitCode=1;
      return;
    }
    if (planningLayersMode) {
      currentScenario = "m4d2-planning";
      await pageCdp.command("Page.navigate", { url: appOrigin + "/#/dzialki?ctx=" + contextEncoded });
      await waitForMap(appOrigin);
      await setZoomForTest();
      if (offlinePlanning) await evaluate(`(() => {
        const note = document.createElement('p'); note.textContent = 'TEST OFFLINE — atrapy usług, dane fikcyjne.';
        note.style.cssText = 'padding:12px;background:#fff2ba;color:#263325;font-weight:bold';
        document.querySelector('.dzialki-header').append(note);
      })()`);
      const initial = await evaluate(`(() => ({
        count: document.querySelectorAll('[data-planning-layer]').length,
        allOff: [...document.querySelectorAll('[data-planning-layer]')].every(el => !el.checked),
        helpCount: document.querySelector('[data-layer-group="planning"]').querySelectorAll('.dzialki-layer-help-button').length
      }))()`);
      await evaluate(`(() => {
        document.querySelector('[data-layer-group="planning"]').open = true;
        for (const input of document.querySelectorAll('[data-planning-layer]')) {
          input.checked = true; input.dispatchEvent(new Event('change', { bubbles:true }));
        }
        for (const button of document.querySelector('[data-layer-group="planning"]').querySelectorAll('.dzialki-layer-help-button')) button.click();
      })()`);
      const monitorExpression = `(() => [...document.querySelectorAll('[data-planning-status]')].map(el => ({
        id: el.dataset.planningStatus, state: el.dataset.state, loaded: Number(el.dataset.loaded),
        total: Number(el.dataset.total), text: el.textContent
      })))()`;
      const deadline = Date.now() + 42000;
      let layers;
      do {
        await sleep(500);
        layers = await evaluate(monitorExpression);
      } while (Date.now() < deadline && layers.some(layer => layer.state === "loading"));
      // Inspect popup fields without requiring private owner test data.
      await evaluate(`(() => {
        const map = document.querySelector('.dzialki-map'); const r = map.getBoundingClientRect();
        map.dispatchEvent(new MouseEvent('click', { bubbles:true, cancelable:true, clientX:r.left+r.width/2, clientY:r.top+r.height/2 }));
      })()`);
      const popupDeadline = Date.now() + 145000;
      const popupExpression = `(() => ({
        text: document.querySelector('.dzialki-planning-popup')?.textContent || '',
        sections: [...document.querySelectorAll('.dzialki-planning-popup section')].map(el => ({state:el.dataset.state,title:el.querySelector('h4')?.textContent}))
      }))()`;
      let popup;
      do {
        await sleep(500);
        popup = await evaluate(popupExpression);
      } while (Date.now() < popupDeadline && (popup.sections.length !== 3 || popup.sections.some(section => section.state === "loading")));
      const assertions = [
        { name: "Pięć warstw domyślnie wyłączonych", pass: initial.count === 5 && initial.allOff },
        { name: "Trzy informacje o warstwach", pass: initial.helpCount === 3 },
        ...layers.map(layer => ({ name: "Kompletne kafelki: " + layer.id, pass: layer.state === "complete" && layer.total > 0 && layer.loaded === layer.total })),
        { name: "Trzy sekcje wspólnego popupu", pass: popup.sections.length === 3 },
        { name: "Popup zakończył żądania bez błędu lub niepełności", pass: popup.sections.length === 3 && popup.sections.every(section => ["ready", "empty"].includes(section.state)) },
        { name: "Brak wyjątków JavaScript", pass: pageExceptions.length === 0 },
      ];
      const screenshot = await pageCdp.command("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
      await writeFile(join(resultDir, "m4d2-planning.png"), Buffer.from(screenshot.data, "base64"));
      // Also verify persistence and disposal through the real router.
      await evaluate("location.hash = '#/rcn'");
      await sleep(250);
      const removed = await evaluate("!document.querySelector('.leaflet-container')");
      await evaluate("location.hash = '#/dzialki'");
      await waitForMap(appOrigin);
      const preserved = await evaluate("[...document.querySelectorAll('[data-planning-layer]')].every(el=>el.checked)");
      assertions.push({ name: "Cleanup mapy i zachowanie przełączników", pass: removed && preserved });
      let mobile = null;
      if (offlinePlanning) {
        await pageCdp.command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
        await sleep(300);
        mobile = await evaluate(`(() => ({width:innerWidth, scrollWidth:document.documentElement.scrollWidth,
          count:document.querySelectorAll('[data-planning-layer]').length}))()`);
        assertions.push({ name: "Widok 390 px bez poziomego przewijania", pass: mobile.scrollWidth <= mobile.width + 1 && mobile.count === 5 });
        const mobilePng = await pageCdp.command("Page.captureScreenshot", { format:"png", captureBeyondViewport:true });
        await writeFile(join(resultDir, "m4d2-mobile.png"), Buffer.from(mobilePng.data, "base64"));
      }
      await evaluate("location.hash = '#/rcn'");
      await sleep(200);
      await Promise.all([...pendingFetchHandlers]);
      if (runError) throw runError;
      const passed = assertions.every(assertion => assertion.pass) && blockedRequests.length === 0;
      runReport = { scenario: currentScenario, browserMode: headed ? "headed" : "headless", offline: offlinePlanning, passed,
        layers, popup, mobile, assertions, externalRequests, blockedRequests, consoleErrors, pageExceptions,
        budget: taskBudget.snapshot(), screenshot: "m4d2-planning.png" };
      await writeFile(join(resultDir, "report.json"), JSON.stringify(runReport, null, 2), "utf8");
      const summary = assertions.map(assertion => (assertion.pass ? "PASS" : "FAIL") + " | " + assertion.name).join("\n")
        + "\nŻądania zablokowane: " + blockedRequests.length + "\nWyniki: " + resultDir + "\n";
      await writeFile(join(resultDir, "summary.txt"), summary, "utf8");
      process.stdout.write(summary);
      if (!passed) process.exitCode = 1;
      return;
    }
    const egibScenario = egibLayersMode ? await runEgibLayersScenario(appOrigin) : null;
    const tileExperiment = !egibLayersMode && tileExperimentArgs ? await runTileExperiment(appOrigin) : null;
    const kiegReliability = kiegReliabilityMode ? await runKiegReliability(appOrigin) : null;
    const kiegExperiment = kiegExperimentMode ? await runKiegExperiment(appOrigin) : null;
    const standardScenarioMode = !egibLayersMode && !tileExperiment && !kiegReliabilityMode && !kiegExperimentMode;
    const beforeRun = standardScenarioMode && baselineOrigin ? await runScenarios("before", baselineOrigin) : null;
    const afterRun = standardScenarioMode ? await runScenarios("after", appOrigin) : null;
    const stability = standardScenarioMode ? await runArchiveStability(appOrigin) : null;
    const parcelSearch = standardScenarioMode && searchArgs ? await runParcelSearchScenario(appOrigin) : null;
    await Promise.all([...pendingFetchHandlers]);
    if (runError) throw runError;
    if (blockedRequests.some((request) => request.kind === "task-budget")) {
      throw new Error("Osiągnięto budżet żądań zadania; wynik smoke nie może zostać uznany za PASS.");
    }
    const scenarios = egibScenario ? [egibScenario] : tileExperiment ? tileExperiment.runs : kiegReliability ? kiegReliability.runs
      : kiegExperiment ? kiegExperiment.runs : [
      ...(beforeRun?.scenarios ?? []),
      ...afterRun.scenarios,
      ...stability.runs,
      ...(parcelSearch ? [parcelSearch] : []),
    ];
    const retryScenarios = egibLayersMode || tileExperiment || kiegReliabilityMode || kiegExperimentMode ? [] : [beforeRun?.retryScenario, afterRun.retryScenario,
      stability.repeat.skipped ? null : stability.repeat].filter(Boolean);
    const statePreserved = egibLayersMode || tileExperiment || kiegReliabilityMode || kiegExperimentMode
      ? null
      : (!beforeRun || beforeRun.statePreserved) && afterRun.statePreserved;

    const report = {
      createdAt: new Date().toISOString(),
      nodeVersion: process.version,
      browser: selectedBrowser,
      browserVersion: version.Browser ?? "",
      browserUserAgent: browserIdentity.userAgent ?? "",
      browserMode: headed ? "headed" : "headless",
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
        ...(stability ? stability.detail : {}),
        consistency: stability?.consistency ?? null,
      },
      archive2025EmptyTileRetry: stability?.repeat ?? null,
      parcelSearch,
      egibScenario,
      kiegReliability,
      kiegExperiment,
      kiegRequestCount,
      kiegBudgetExceeded: kiegBudgetExceeded || m4d1cBudgetExceeded,
      kiegBudget: kiegBudgetState ? {
        stateFile: M4D1C_BUDGET_STATE_FILENAME,
        launches: kiegBudgetState.launches,
        launchesMax: M4D1C_MAX_BROWSER_LAUNCHES,
        requestsReservedThisInvocation: kiegBudgetRequestsReserved,
        requestsSentTaskTotal: kiegBudgetState.requestsSent,
        requestsMax: M4D1C_MAX_KIEG_REQUESTS,
        requestsBlockedAtCap: kiegBudgetBlockedCount,
      } : null,
      egibBackendRequestCount,
      egibBackendRequestLimit,
      egibBackendBudgetExceeded,
      tileExperiment,
      orthophotoRequestsSent: orthophotoRequestCount,
      orthophotoRequestLimit: tileExperimentArgs?.maxOrthophotoRequests ?? null,
      orthophotoBudgetExceeded,
      orthophotoBudgetBlockedCount,
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

    const lines = kiegExperiment ? [
      "Wariant | tryb | końcowa frakcja min/mediana/maks | czas do 100% min/mediana/maks | żądania | ORB",
      "------- | ---- | ------------------------------- | ------------------------------- | -------- | ---",
    ] : kiegReliability ? [
      "Przebieg | kafelki KIEG załadowane/wszystkie | frakcja | GET wysłane/zablokowane | błędy ORB",
      "-------- | ------------------------------- | ------- | ---------------------- | ---------",
    ] : egibScenario ? [
      "Asercja EGiB | wynik | szczegół",
      "------------- | ----- | --------",
    ] : tileExperiment ? [
      "Konfiguracja | końcowa frakcja załadowanych min/mediana/maks | żądania ortofotomapy | GetMap bez statusu | czas do 90% | czas do 95%",
      "------------ | --------------------------------------------- | --------------------- | ------------------ | ----------- | -----------",
    ] : [
      "Scenariusz | kafelki załadowane/puste/błędne/anulowane | kody HTTP | przykładowe błędne adresy",
      "---------- | ----------------------------------------- | ---------- | -------------------------",
    ];
    if (kiegExperiment) {
      const percent = (value) => Number.isFinite(value) ? (value * 100).toFixed(1) + "%" : "brak";
      const rangeMs = (value, reached, expected) => (reached === expected ? "" : ` (${reached}/${expected} osiągnięto) `)
        + [value.min, value.median, value.max]
          .map((number) => Number.isFinite(number) ? Math.round(number) + " ms" : "—").join("/");
      const summary = kiegExperiment.summary;
      lines.push(kiegExperiment.variant + " | " + kiegExperiment.browserMode + " | "
        + [summary.finalFraction.min, summary.finalFraction.median, summary.finalFraction.max].map(percent).join("/")
        + " | " + rangeMs(summary.timeTo100Ms, summary.timeTo100ReachedRuns, summary.expectedRuns)
        + " | " + summary.requests + " | " + summary.orbErrors);
      lines.push("Uruchomienia zebrane: " + summary.completedRuns + "/" + kiegExperiment.expectedRuns
        + "; wszystkie 100% do 20 s: " + (summary.allRuns100Within20s ? "PASS" : "FAIL/nieosiągnięte"));
      lines.push("Host 302 → 01/02: " + kiegExperiment.hostSplit.redirect01 + "/" + kiegExperiment.hostSplit.redirect02
        + "; odpowiedzi końcowe 01/02: " + kiegExperiment.hostSplit.finalHost01 + "/" + kiegExperiment.hostSplit.finalHost02
        + "; ORB host01 w " + kiegExperiment.browserMode + ": " + kiegExperiment.host01ErrorFraction.toFixed(3));
      lines.push("Budżet KIEG: " + kiegExperiment.budget.requestsSentTaskTotal + "/" + kiegExperiment.budget.requestLimit
        + " żądań; uruchomienia " + kiegExperiment.budget.browserLaunchesTaskTotal + "/" + kiegExperiment.budget.launchLimit
        + "; zablokowane na limicie: " + kiegBudgetBlockedCount);
      for (const run of kiegExperiment.runs) {
        lines.push(run.name + " | " + run.loadedTiles + "/" + run.totalTiles + " ("
          + percent(run.finalFraction) + ") | 100%: " + (run.timeTo100Ms ?? "nieosiągnięto")
          + " ms | żądania: " + run.kiegRequestsSent + " | ORB: " + run.orbErrors
          + " | monitor: " + run.monitor + " (" + run.monitorLoaded + "/" + run.monitorTotal + ")"
          + " | zgodność monitora: " + (run.monitorMatches ? "PASS" : "FAIL")
          + " | frakcja 100%: " + (run.finalFraction === 1 ? "PASS" : "FAIL"));
      }
      lines.push("User-Agent: " + kiegExperiment.browserUserAgent);
      lines.push("Zrzuty: " + kiegExperiment.runs.map((run) => run.screenshot).join("; "));
    } else if (kiegReliability) {
      for (const run of kiegReliability.runs) {
        lines.push(run.name + " | " + run.loadedTiles + "/" + run.totalTiles + " | "
          + (Number.isFinite(run.finalFraction) ? (run.finalFraction * 100).toFixed(1) + "%" : "brak")
          + " | " + run.kiegRequestCount + "/" + (run.budgetBlockedRequests ?? 0) + " | " + run.orbErrors);
      }
      lines.push("Frakcja min/mediana/maks: "
        + [kiegReliability.summary.finalFraction.min, kiegReliability.summary.finalFraction.median,
          kiegReliability.summary.finalFraction.max]
          .map((value) => Number.isFinite(value) ? (value * 100).toFixed(1) + "%" : "brak").join("/") + ".");
      lines.push("Host | żądania | HTTP 200 | HTTP 302 | image/* | ORB | kafelek wyrenderowany/niewyrenderowany");
      for (const row of kiegReliability.hostOutcomes) {
        lines.push(row.host + " | " + row.requests + " | " + row.http200 + " | " + row.redirects302
          + " | " + row.imageResponses + " | " + row.orbErrors
          + " | " + row.renderedTiles + "/" + row.nonRenderedTiles);
      }
      lines.push("Diagnostyczne powtórzenia: " + kiegReliability.failedUrlsConsideredForRepeat
        + " kafelków, opóźnienia " + (kiegReliability.diagnosticRetryDelaysMs.join("/") || "brak") + " ms.");
      for (const result of kiegReliability.diagnosticRetries) {
        lines.push("Powtórzenie " + result.delayMs + " ms | " + result.result + " | "
          + result.width + "×" + result.height + " | " + result.elapsedMs + " ms");
      }
      lines.push("Limit KIEG: " + kiegReliability.requestsSent + "/" + kiegReliability.maxRequests
        + "; przekroczono: " + (kiegReliability.budgetExceeded ? "TAK" : "NIE")
        + "; cache przeglądarki wyłączony w narzędziu: TAK.");
      lines.push("Asercja końcowa ≥90%: " + (kiegReliability.assertionPass === null
        ? "nie dotyczy wariantu bazowego"
        : kiegReliability.assertionPass ? "PASS" : "FAIL"));
      lines.push("Zrzuty: " + kiegReliability.runs.map((run) => run.screenshot).join("; "));
    } else if (egibScenario) {
      for (const assertion of egibScenario.assertions) {
        lines.push(assertion.name + " | " + (assertion.pass ? "PASS" : "FAIL")
          + " | " + (assertion.observed === false ? "nie zaobserwowano (usługa była już gotowa)" : ""));
      }
      lines.push("Dane EGiB po " + (egibScenario.timeToDataMs ?? "brak") + " ms; popup po "
        + (egibScenario.timeToPopupMs ?? "brak") + " ms; widoczne kontury/etykiety: "
        + egibScenario.finalState.outlineCount + "/" + egibScenario.finalState.labelCount + ".");
      lines.push("Żądania EGiB | " + egibScenario.egibRequests.length
        + " (GET /api/wfs: " + egibScenario.backendRequestCount + "; backend łącznie: "
        + egibBackendRequestCount + "/" + egibBackendRequestLimit + ") | HTTP "
        + (egibScenario.httpStatuses.join(",") || "brak statusu"));
      lines.push("Zrzut ekranu: " + egibScenario.screenshot);
    } else if (tileExperiment) {
      const percent = (value) => Number.isFinite(value) ? (value * 100).toFixed(1) + "%" : "brak";
      const threshold = (value) => value.reached
        ? `${Math.round(value.medianMs)} ms (${value.reached}/${value.total})`
        : "nie osiągnięto";
      for (const summary of tileExperiment.summary) {
        lines.push(summary.configuration + " | "
          + percent(summary.finalFraction.min) + "/" + percent(summary.finalFraction.median) + "/" + percent(summary.finalFraction.max)
          + " | " + summary.orthophotoRequests
          + " | " + summary.pendingOrthophotoRequests
          + " | " + threshold(summary.timeTo90)
          + " | " + threshold(summary.timeTo95));
      }
      lines.push("Pomiar końcowy: po " + tileExperiment.settleMs + " ms; widok "
        + tileExperiment.viewport.width + "×" + tileExperiment.viewport.height + " px przy zoomie " + tileExperiment.viewport.zoom + ".");
      lines.push("Żądania ortofotomapy: " + tileExperiment.orthophotoRequestsSent + "/" + tileExperiment.maxOrthophotoRequests
        + "; przekroczono limit: " + (tileExperiment.budgetExceeded ? "TAK" : "NIE")
        + "; dodatkowe próby zablokowane przed wysłaniem: " + tileExperiment.budgetBlockedCount + ".");
      lines.push("Przebieg | config | załadowane/widoczne | puste obrazy | błędne | obrazy oczekujące | wyczerpane | retry oczekujące | błędy/próby | żądania WMS | WMS bez statusu | 90%/95%");
      for (const run of tileExperiment.runs) {
        lines.push(run.name + " | " + run.configuration + " | " + run.finalLoaded + "/" + run.totalVisible
          + " | " + run.finalEmptyImages + " | " + run.finalNotLoaded + " | " + run.finalPendingImages
          + " | " + run.exhaustedAfterRetries + " | " + run.pendingRetries + " | " + run.errors + "/" + run.retries
          + " | " + run.orthophotoRequests + " | " + run.pendingOrthophotoRequests
          + " | " + (run.timeTo90Ms ?? "—") + "/" + (run.timeTo95Ms ?? "—") + " ms");
      }
    } else {
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
    }
    if (parcelSearch?.search) {
      lines.push("M4c: czas do obrysu " + parcelSearch.search.resultTimeMs + " ms; czas do EGiB "
        + (parcelSearch.search.egibTimeMs ?? "brak") + " ms; stan EGiB " + parcelSearch.search.egibState
        + "; żądania EGiB " + parcelSearch.search.egibRequests.length
        + "; żądania backendu Działek poza /health " + parcelSearch.search.dzialkiBackendSearchRequests.length
        + "; teksty raportu/statusu "
        + Object.values(parcelSearch.search.reportTextPresent).every(Boolean));
      if (parcelSearch.search.assertions) {
        lines.push("Asercje | wynik | długość obserwowana/oczekiwana");
        for (const assertion of parcelSearch.search.assertions) {
          lines.push(assertion.name + " | " + (assertion.pass ? "PASS" : "FAIL") + " | "
            + assertion.observedLength + "/" + assertion.expectedLength
            + (Number.isFinite(assertion.valueLength) ? " (wartość: " + assertion.valueLength + " znaków)" : ""));
        }
      }
    }
    lines.push("Żądania zarejestrowane: " + externalRequests.length + " (szczegóły adresów w report.json)");
    const summary = lines.join("\n") + "\n";
    await writeFile(join(resultDir, "summary.txt"), summary, "utf8");
    process.stdout.write("Wyniki zapisano w .local-results/browser-smoke-" + timestamp + "/\n");
    process.stdout.write("Hosty: " + [...new Set(tileRequests.map((request) => request.host))].join(", ") + "\n");
    process.stdout.write(summary);
    if (!tileExperiment && !egibLayersMode && !kiegReliabilityMode) process.stdout.write("Zachowanie stanu po powrocie z RCN: " + (statePreserved ? "TAK" : "NIE") + "\n");
    process.stdout.write("Żądania zablokowane przez allowlistę: " + blockedRequests.length + "\n");
    const assertionFailed = parcelSearch?.search?.assertions?.some((assertion) => !assertion.pass) ?? false;
    const egibAssertionFailed = egibScenario ? !egibScenario.passed : false;
    const kiegAssertionFailed = kiegReliability?.assertionPass === false;
    const kiegExperimentAssertionFailed = kiegExperiment
      ? kiegExperiment.runs.some((run) => !run.assertionPass)
        || kiegExperiment.summary.completedRuns !== kiegExperiment.expectedRuns
      : false;
    if (blockedRequests.length > 0) process.exitCode = 3;
    else if (orthophotoBudgetExceeded) process.exitCode = 4;
    else if (egibBackendBudgetExceeded) process.exitCode = 5;
    else if (kiegBudgetExceeded) process.exitCode = 6;
    else if (egibAssertionFailed || kiegAssertionFailed || kiegExperimentAssertionFailed
        || (!tileExperiment && !egibLayersMode && !kiegReliabilityMode && !kiegExperimentMode && (!statePreserved || assertionFailed))) process.exitCode = 1;
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
    if (taskBudget) {
      await taskBudget.close().catch(() => { process.exitCode = 2; });
      await writeFile(join(resultDir, "network-budget.json"), JSON.stringify(taskBudget.snapshot(), null, 2), "utf8").catch(() => {});
    }
    try {
      if (dirname(resolve(profile)) !== resolve(tmpdir()) || !basename(profile).startsWith("m4b-browser-profile-")) {
        throw new Error("Profil nie znajduje się w oczekiwanym katalogu tymczasowym.");
      }
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
