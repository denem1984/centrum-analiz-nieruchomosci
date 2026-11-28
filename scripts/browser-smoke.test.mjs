import test from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  aggregateRequests,
  buildKiegRetryOverrideSource,
  buildKiegExperimentOverrideSource,
  buildKiegDirectUrl,
  buildEgibStateExpression,
  buildKiegReliabilityStateExpression,
  buildParcelSearchAssertions,
  buildSearchAssertionStateExpression,
  buildTileExperimentStateExpression,
  buildStateExpression,
  chooseBrowserPath,
  buildBrowserLaunchArgs,
  parseDevToolsActivePort,
  waitForDebugger,
  compareProblemCoordinateSets,
  DEFAULT_TILE_EXPERIMENT_SETTLE_MS,
  KIEG_EXPERIMENT_VARIANTS,
  EMPTY_TILE_BYTE_THRESHOLD,
  formatSearchOptionError,
  isAllowedArchiveRepeatRequest,
  isAllowedBrowserRequest,
  isAllowedDzialkiEgibRequest,
  isDzialkiBackendHostRequest,
  matchSearchOption,
  normalizeSearchLabel,
  parseSearchArguments,
  parseEgibBackendRequestLimit,
  parseKiegReliabilityArguments,
  parseKiegExperimentArguments,
  parseExpectedAssertionArguments,
  parseTileExperimentArguments,
  parseCdpLoadingFailed,
  parseCdpMessage,
  MAX_TILE_EXPERIMENT_ORTHO_REQUESTS,
  MAX_EGIB_BACKEND_REQUESTS,
  selectRelevantResponseHeaders,
  selectRepeatableArchiveRequests,
  shouldAllowOrthophotoRequest,
  shouldAllowEgibBackendRequest,
  shouldAllowKiegRequest,
  summarizeArchiveRetry,
  summarizeArchiveStability,
  summarizeKiegHostOutcomes,
  summarizeKiegRequestDisposition,
  summarizeKiegReliabilityRuns,
  summarizeTileExperiment,
  TILE_EXPERIMENT_CONFIGS,
  TILE_EXPERIMENT_REPEATS,
  tileCoordinateKey,
  readM4d1cKiegBudget,
  summarizeM4d1cKiegRuns,
  isKiegCompletenessMonitorConsistent,
  reserveM4d1cBrowserLaunch,
  reserveM4d1cKiegRequest,
  M4D1C_MAX_BROWSER_LAUNCHES,
  M4D1C_MAX_KIEG_REQUESTS,
} from "./browser-smoke.mjs";

test("osobny profil i port CDP wybierany przez Edge działają w obu trybach bez zmiany nagłówków", () => {
  for (const headed of [true, false]) {
    const args = buildBrowserLaunchArgs({ headed, profile: "C:\\test profile" });
    assert.ok(args.includes("--user-data-dir=C:\\test profile"));
    assert.ok(args.includes("--remote-debugging-port=0"));
    assert.ok(args.includes("--no-first-run"));
    assert.ok(args.includes("--disable-features=msEdgeStartupBoost"));
    assert.equal(args.includes("--headless=new"), !headed);
    assert.equal(args.some((arg) => /user-agent|origin=|referer/i.test(arg)), false);
  }
  assert.ok(buildBrowserLaunchArgs({ profile: "test", compact: true }).includes("--window-size=833,620"));
});

test("plik DevToolsActivePort musi zawierać lokalny port i ścieżkę przeglądarki", () => {
  assert.deepEqual(parseDevToolsActivePort("51234\r\n/devtools/browser/abc-123\r\n"), {
    port: 51234, webSocketDebuggerUrl: "ws://127.0.0.1:51234/devtools/browser/abc-123",
  });
  for (const source of ["", "51234", "0\n/devtools/browser/id", "65536\n/devtools/browser/id",
    "123\nhttps://example.org", "123\n/devtools/page/id", "abc\n/devtools/browser/id"]) {
    assert.equal(parseDevToolsActivePort(source), null);
  }
});

test("CDP czeka na pełny plik profilu i odpowiadającą instancję nawet po wyjściu launchera", async () => {
  let now = 0;
  let reads = 0;
  const calls = [];
  const version = { webSocketDebuggerUrl: "ws://127.0.0.1:51234/devtools/browser/test-id" };
  const result = await waitForDebugger("profile", { exitCode: 0, signalCode: null }, {
    nowFn: () => now,
    sleepImpl: async (ms) => { now += ms; },
    readFileImpl: async (path) => {
      assert.match(path, /profile[\\/]DevToolsActivePort$/);
      reads += 1;
      if (reads === 1) throw new Error("ENOENT");
      return reads === 2 ? "51234\n" : "51234\n/devtools/browser/test-id";
    },
    fetchImpl: async (url, options) => {
      calls.push(url);
      assert.equal(options.redirect, "error");
      return { ok: true, json: async () => version };
    },
  });
  assert.equal(now, 300);
  assert.deepEqual(calls, ["http://127.0.0.1:51234/json/version"]);
  assert.deepEqual(result, { port: 51234, version });
});

test("CDP odrzuca obcy socket, błąd HTTP i kończy czekanie w wyznaczonym czasie", async () => {
  for (const socket of ["ws://example.org:51234/devtools/browser/test-id",
    "ws://127.0.0.1:51235/devtools/browser/test-id", "ws://127.0.0.1:51234/devtools/browser/other"]) {
    let now = 0;
    await assert.rejects(waitForDebugger("profile", { exitCode: 1, signalCode: null }, {
      timeoutMs: 300, nowFn: () => now, sleepImpl: async (ms) => { now += ms; },
      readFileImpl: async () => "51234\n/devtools/browser/test-id",
      fetchImpl: async () => ({ ok: true, json: async () => ({ webSocketDebuggerUrl: socket }) }),
    }), /nie uruchomiła CDP/);
    assert.equal(now, 300);
  }
  let now = 0;
  await assert.rejects(waitForDebugger("profile", { exitCode: null }, {
    timeoutMs: 300, nowFn: () => now, sleepImpl: async (ms) => { now += ms; },
    readFileImpl: async () => "51234\n/devtools/browser/test-id",
    fetchImpl: async () => ({ ok: false }),
  }), /nie uruchomiła CDP/);
});
import {
  buildCommunesUrl,
  buildCountiesUrl,
  buildParcelUrl,
  buildRegionsUrl,
} from "../app/js/modules/dzialki/search.js";
import { buildEgibGeometryUrl, buildKiegFeatureInfoUrl } from "../app/js/modules/dzialki/egib.js";
import { buildKiegGetMapUrl, buildMapClickFeatureInfoUrl, buildParcelWfsUrl } from "../app/js/modules/dzialki/egib-layers.js";

const healthRoutes = [
  { origin: "https://rcn-web-app.onrender.com", path: "/", method: "GET" },
  { origin: "https://analizator-cen-ofertowych.onrender.com", path: "/health", method: "GET" },
  { origin: "https://analizator-nieruchomosci.onrender.com", path: "/health", method: "GET" },
  { origin: "https://rozklad-nieruchomosci-podobnych2.onrender.com", path: "/api/health", method: "GET" },
];

test("parsuje zdarzenia CDP i zwraca null dla niepoprawnego JSON", () => {
  assert.deepEqual(parseCdpMessage('{"method":"Network.loadingFinished","params":{"requestId":"7"}}'), {
    method: "Network.loadingFinished",
    params: { requestId: "7" },
  });
  assert.equal(parseCdpMessage("nie json"), null);
  assert.deepEqual(parseCdpLoadingFailed({
    requestId: "7",
    errorText: "net::ERR_FAILED",
    canceled: false,
    blockedReason: "inspector",
    timestamp: 12.5,
  }), {
    requestId: "7",
    errorText: "net::ERR_FAILED",
    canceled: false,
    blockedReason: "inspector",
    timestamp: 12.5,
  });
});

test("wyrażenie odczytu stanu kafelków ma poprawną składnię JavaScript", () => {
  assert.doesNotThrow(() => new Script(buildStateExpression()));
  assert.doesNotThrow(() => new Script(buildSearchAssertionStateExpression()));
  assert.doesNotThrow(() => new Script(buildTileExperimentStateExpression()));
  assert.doesNotThrow(() => new Script(buildEgibStateExpression()));
  const kiegExpression = buildKiegReliabilityStateExpression();
  assert.doesNotThrow(() => new Script(kiegExpression));
  assert.match(kiegExpression, /\.dzialki-egib-parcels-tile/);
  assert.match(kiegExpression, /img\.leaflet-tile/);
});

test("tryb pomiaru KIEG wymaga wariantu i twardego limitu do 500 żądań", () => {
  assert.equal(parseKiegReliabilityArguments([]), null);
  assert.deepEqual(parseKiegReliabilityArguments([
    "--kieg-reliability", "--kieg-variant", "before", "--max-kieg-requests", "240",
  ]), { variant: "before", maxRequests: 240, settleMs: 25000 });
  assert.deepEqual(parseKiegReliabilityArguments([
    "--kieg-reliability", "--kieg-variant=after", "--max-kieg-requests=500", "--kieg-settle-ms=12000",
  ]), { variant: "after", maxRequests: 500, settleMs: 12000 });
  assert.throws(() => parseKiegReliabilityArguments(["--kieg-reliability"]), /--kieg-variant/);
  assert.throws(() => parseKiegReliabilityArguments([
    "--kieg-reliability", "--kieg-variant", "before", "--max-kieg-requests", "501",
  ]), /1–500/);
  assert.throws(() => parseKiegReliabilityArguments([
    "--kieg-reliability", "--kieg-variant", "after", "--max-kieg-requests", "100", "--kieg-settle-ms", "25001",
  ]), /1000–25000/);
  assert.equal(shouldAllowKiegRequest(0, 500), true);
  assert.equal(shouldAllowKiegRequest(499, 500), true);
  assert.equal(shouldAllowKiegRequest(500, 500), false);
  assert.equal(shouldAllowKiegRequest(0, 501), false);
});

test("wariant przed wyłącza retry przed nawigacją, a wariant po zachowuje K0", () => {
  assert.equal(buildKiegRetryOverrideSource("before"),
    "window.__DZIALKI_TILE_RETRY__ = { attempts: 0, delaysMs: [], maxConcurrent: 1, jitterMs: 0 };");
  assert.equal(buildKiegRetryOverrideSource("after"), null);
});

test("warianty M4d.1c wybierają tryb i czas ustalenia bez przypadkowego łączenia scenariuszy", () => {
  assert.deepEqual(KIEG_EXPERIMENT_VARIANTS.map(({ id }) => id), ["V0", "V1", "V2", "V3"]);
  assert.deepEqual(parseKiegExperimentArguments(["--kieg-experiment", "V0"]), {
    id: "V0", label: "obecny kod, headless", mode: "headless", retry: "default", sweep: false, settleMs: 40000,
  });
  assert.equal(parseKiegExperimentArguments(["--kieg-experiment=V1"]).mode, "headed");
  assert.equal(parseKiegExperimentArguments(["--kieg-experiment", "V3", "--kieg-experiment-settle-ms", "60000"]).settleMs, 60000);
  assert.throws(() => parseKiegExperimentArguments(["--kieg-experiment", "V0", "--headed"]), /tylko wariant V1/);
  assert.throws(() => parseKiegExperimentArguments(["--kieg-experiment", "V9"]), /V0, V1, V2 albo V3/);
  assert.throws(() => parseKiegExperimentArguments(["--kieg-experiment", "V2", "--kieg-experiment-settle-ms", "999"]), /1000–120000/);
});

test("podsumowanie M4d.1c pokazuje liczbę prób osiągnięcia 100%", () => {
  const summary = summarizeM4d1cKiegRuns([
    { finalFraction: 0, timeTo100Ms: null, kiegRequestsSent: 51, orbErrors: 24 },
    { finalFraction: 11 / 12, timeTo100Ms: null, kiegRequestsSent: 28, orbErrors: 1 },
    { finalFraction: 1, timeTo100Ms: 8256, kiegRequestsSent: 33, orbErrors: 4 },
  ]);
  assert.equal(summary.timeTo100ReachedRuns, 1);
  assert.equal(summary.expectedRuns, 3);
  assert.deepEqual(summary.timeTo100Ms, { min: 8256, median: 8256, max: 8256 });
  assert.equal(summary.requests, 112);
  assert.equal(summary.allRuns100Within20s, false);
});

test("asercja monitora KIEG porównuje liczniki i wymaga komunikatu kompletności przy 100%", () => {
  assert.equal(isKiegCompletenessMonitorConsistent({ monitorLoaded: 2, monitorTotal: 3, monitor: "Wczytywanie konturów: 2/3" }, 2, 3), true);
  assert.equal(isKiegCompletenessMonitorConsistent({ monitorLoaded: 3, monitorTotal: 3, monitor: "Kontury kompletne" }, 3, 3), true);
  assert.equal(isKiegCompletenessMonitorConsistent({ monitorLoaded: 3, monitorTotal: 3, monitor: "Wczytywanie konturów: 3/3" }, 3, 3), false);
  assert.equal(isKiegCompletenessMonitorConsistent({ monitorLoaded: 1, monitorTotal: 3 }, 2, 3), false);
});

test("V2 ustawia wyłącznie walidowalną politykę retry, a pozostałe warianty zachowują K0", () => {
  assert.equal(buildKiegExperimentOverrideSource("V0"), "window.__DZIALKI_KIEG_SWEEP__ = false;");
  assert.equal(buildKiegExperimentOverrideSource("V1"), "window.__DZIALKI_KIEG_SWEEP__ = false;");
  const v2 = buildKiegExperimentOverrideSource("V2");
  assert.match(v2, /attempts":8/);
  assert.match(v2, /300,600,1200,2000,3000,4000,5000,6000/);
  assert.equal(buildKiegExperimentOverrideSource("V3"), "window.__DZIALKI_KIEG_SWEEP__ = false;");
  assert.throws(() => buildKiegExperimentOverrideSource("V9"), /Nieznany wariant/);
});

test("bezpośrednie węzły KIEG są dozwolone wyłącznie w wariancie V3 i zachowują parametry GetMap", () => {
  const base = buildKiegGetMapUrl({ layer: "dzialki", bbox: [1800000, 6800000, 1800256, 6800256] });
  const direct = buildKiegDirectUrl(base, "integracja02.gugik.gov.pl");
  assert.equal(isAllowedBrowserRequest(direct, "GET", { appOrigin: "http://127.0.0.1:8080" }), false);
  assert.equal(isAllowedBrowserRequest(direct, "GET", { allowDirectKiegHosts: true }), true);
  const before = new URL(base);
  const after = new URL(direct);
  assert.equal(after.pathname, before.pathname);
  assert.equal(after.search, before.search);
  assert.equal(after.hostname, "integracja02.gugik.gov.pl");
  assert.throws(() => buildKiegDirectUrl(base, "integracja03.gugik.gov.pl"), /Niedozwolony węzeł/);
});

test("licznik budżetu M4d.1c zachowuje stan po wznowieniu i blokuje limit globalny", async () => {
  const directory = await mkdtemp(join(tmpdir(), "m4d1c-budget-test-"));
  const statePath = join(directory, "budget.json");
  try {
    const first = await reserveM4d1cBrowserLaunch(statePath, () => "t1");
    assert.equal(first.launches, 1);
    const resumed = await readM4d1cKiegBudget(statePath);
    assert.equal(resumed.launches, 1, "odczyt po wznowieniu widzi zapisany licznik");
    const seeded = { ...resumed, launches: M4D1C_MAX_BROWSER_LAUNCHES, requestsSent: M4D1C_MAX_KIEG_REQUESTS - 1 };
    await writeFile(statePath, JSON.stringify(seeded), "utf8");
    const last = await reserveM4d1cKiegRequest(statePath, () => "t2");
    assert.equal(last.allowed, true);
    const blocked = await reserveM4d1cKiegRequest(statePath, () => "t3");
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.state.requestsSent, M4D1C_MAX_KIEG_REQUESTS);
    const launchCapPath = join(directory, "launch-cap.json");
    await writeFile(launchCapPath, JSON.stringify({ ...blocked.state, requestsSent: 0 }), "utf8");
    await assert.rejects(reserveM4d1cBrowserLaunch(launchCapPath), /limit 5 uruchomień/);
    const final = await readM4d1cKiegBudget(statePath);
    assert.equal(final.launches, M4D1C_MAX_BROWSER_LAUNCHES);
    assert.equal(final.requestsSent, M4D1C_MAX_KIEG_REQUESTS);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("frakcja kafelków KIEG i agregacja hostów rozróżniają odpowiedzi, ORB i render", () => {
  assert.deepEqual(summarizeKiegReliabilityRuns([
    { totalTiles: 10, loadedTiles: 7, kiegRequestCount: 12, orbErrors: 2 },
    { totalTiles: 10, loadedTiles: 9, kiegRequestCount: 10, orbErrors: 1 },
    { totalTiles: 10, loadedTiles: 8, kiegRequestCount: 11, orbErrors: 0 },
  ]), {
    runCount: 3,
    finalFraction: { min: 0.7, median: 0.8, max: 0.9 },
    requests: 33,
    orbErrors: 3,
  });
  assert.deepEqual(summarizeKiegHostOutcomes([
    { url: "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow?x=1", status: 302, contentType: "text/html", tileRendered: false },
    { url: "https://integracja01.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow?x=1", status: null, errorText: "net::ERR_BLOCKED_BY_ORB", tileRendered: false },
    { url: "https://integracja02.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow?x=1", status: 200, contentType: "image/png", tileRendered: true },
  ]), [
    { host: "integracja.gugik.gov.pl", requests: 1, http200: 0, redirects302: 1, imageResponses: 0, otherContentTypes: 1, orbErrors: 0, otherErrors: 0, renderedTiles: 0, nonRenderedTiles: 1 },
    { host: "integracja01.gugik.gov.pl", requests: 1, http200: 0, redirects302: 0, imageResponses: 0, otherContentTypes: 0, orbErrors: 1, otherErrors: 0, renderedTiles: 0, nonRenderedTiles: 1 },
    { host: "integracja02.gugik.gov.pl", requests: 1, http200: 1, redirects302: 0, imageResponses: 1, otherContentTypes: 0, orbErrors: 0, otherErrors: 0, renderedTiles: 1, nonRenderedTiles: 0 },
  ]);
});

test("rozliczenie KIEG oddziela GET-y wysłane od zablokowanych limitem", () => {
  assert.deepEqual(summarizeKiegRequestDisposition([
    { requestSent: true, url: "https://integracja02.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow", status: 200, mimeType: "image/png" },
    { requestSent: false, url: "https://integracja01.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow", status: null },
    { url: "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow", status: 302 },
  ]), {
    sent: 1,
    blocked: 1,
    unclassified: 1,
    hostOutcomes: [{ host: "integracja02.gugik.gov.pl", requests: 1, http200: 1, redirects302: 0,
      imageResponses: 1, otherContentTypes: 0, orbErrors: 0, otherErrors: 0, renderedTiles: 0, nonRenderedTiles: 0 }],
  });
});

test("tryb eksperymentu wymaga jawnego limitu i waliduje czas ustalenia", () => {
  assert.equal(parseTileExperimentArguments([]), null);
  assert.deepEqual(parseTileExperimentArguments([
    "--experiment-tiles", "--max-ortho-requests", "800",
  ]), {
    maxOrthophotoRequests: MAX_TILE_EXPERIMENT_ORTHO_REQUESTS,
    settleMs: DEFAULT_TILE_EXPERIMENT_SETTLE_MS,
  });
  assert.deepEqual(parseTileExperimentArguments([
    "--experiment-tiles", "--max-ortho-requests=500", "--settle-ms", "35000",
  ]), { maxOrthophotoRequests: 500, settleMs: 35000 });
  assert.throws(() => parseTileExperimentArguments(["--experiment-tiles"]), /wymaga/);
  assert.throws(() => parseTileExperimentArguments(["--experiment-tiles", "--max-ortho-requests", "801"]), /1–800/);
  assert.throws(() => parseTileExperimentArguments([
    "--experiment-tiles", "--max-ortho-requests", "400", "--settle-ms", "999",
  ]), /1000–300000/);
  assert.equal(shouldAllowOrthophotoRequest(0, 800), true);
  assert.equal(shouldAllowOrthophotoRequest(799, 800), true);
  assert.equal(shouldAllowOrthophotoRequest(800, 800), false);
  assert.equal(shouldAllowOrthophotoRequest(0, 801), false);
});

test("limit żądań backendu EGiB można obniżyć, ale nigdy przekroczyć 400", () => {
  assert.equal(parseEgibBackendRequestLimit([]), 400);
  assert.equal(parseEgibBackendRequestLimit(["--max-egib-backend-requests", "397"]), 397);
  assert.equal(parseEgibBackendRequestLimit(["--max-egib-backend-requests=1"]), 1);
  for (const args of [
    ["--max-egib-backend-requests"],
    ["--max-egib-backend-requests", "0"],
    ["--max-egib-backend-requests", "401"],
    ["--max-egib-backend-requests", "1.5"],
  ]) assert.throws(() => parseEgibBackendRequestLimit(args), /1–400/);
});

test("macierz K0–K3 i agregacja eksperymentu liczą frakcje oraz czasy", () => {
  assert.deepEqual(TILE_EXPERIMENT_CONFIGS.map(({ id }) => id), ["K0", "K1", "K2", "K3"]);
  assert.deepEqual(TILE_EXPERIMENT_CONFIGS[0].config, null);
  assert.deepEqual(TILE_EXPERIMENT_CONFIGS[1].config.delaysMs, [1500, 3000, 6000, 12000, 20000]);
  assert.equal(TILE_EXPERIMENT_CONFIGS[1].config.maxConcurrent, 3);
  assert.equal(TILE_EXPERIMENT_CONFIGS[2].config.maxConcurrent, 6);
  assert.equal(TILE_EXPERIMENT_CONFIGS[3].config.attempts, 8);
  assert.equal(TILE_EXPERIMENT_CONFIGS[3].config.delaysMs.at(-1), 30000);
  assert.equal(TILE_EXPERIMENT_REPEATS, 3);
  const summary = summarizeTileExperiment([
    { configuration: "K0", finalFraction: 0.5, orthophotoRequests: 1, pendingOrthophotoRequests: 1, timeTo90Ms: 1000, timeTo95Ms: null },
    { configuration: "K0", finalFraction: 0.75, orthophotoRequests: 2, pendingOrthophotoRequests: 2, timeTo90Ms: null, timeTo95Ms: null },
    { configuration: "K0", finalFraction: 1, orthophotoRequests: 3, pendingOrthophotoRequests: 0, timeTo90Ms: 3000, timeTo95Ms: 3500 },
  ])[0];
  assert.deepEqual(summary.finalFraction, { min: 0.5, median: 0.75, max: 1 });
  assert.equal(summary.orthophotoRequests, 6);
  assert.equal(summary.pendingOrthophotoRequests, 3);
  assert.deepEqual(summary.timeTo90, { reached: 2, total: 3, minMs: 1000, medianMs: 2000, maxMs: 3000 });
  assert.deepEqual(summary.timeTo95, { reached: 1, total: 3, minMs: 3500, medianMs: 3500, maxMs: 3500 });
});

test("argumenty oczekiwań są opcjonalną, wymaganą parą i nie są częścią wyniku", () => {
  assert.equal(parseExpectedAssertionArguments([]), null);
  assert.deepEqual(parseExpectedAssertionArguments([
    "--expect-voivodeship", "Testowe województwo",
    "--expect-county=Testowy powiat",
  ]), {
    voivodeship: "Testowe województwo",
    county: "Testowy powiat",
  });
  assert.throws(() => parseExpectedAssertionArguments(["--expect-county", "Testowy powiat"]), /wymagają/);
  assert.throws(() => parseExpectedAssertionArguments([
    "--expect-voivodeship", "", "--expect-county", "Testowy powiat",
  ]), /niepustych/);
});

test("asercje działki zwracają wyłącznie PASS/FAIL i długości", () => {
  const expected = { voivodeship: "Testowe województwo", county: "Testowy powiat" };
  const observed = {
    voivodeship: "Testowe województwo",
    county: "Testowy powiat",
    locationSummary: "Wybrana lokalizacja · województwo: Testowe województwo",
    identifierLength: 18,
    identifierLineCount: 1,
    footer: "Centrum Analiz Nieruchomości · wersja M4c",
    reportText: "Województwo Powiat Identyfikator działki Powierzchnia ewidencyjna Grupa rejestrowa Klasoużytki",
    searchStatus: "Działka została znaleziona. Powierzchnia i klasoużytki pobrane z EGiB.",
  };
  const results = buildParcelSearchAssertions(observed, expected);
  assert.equal(results.length, 6);
  assert.ok(results.every((result) => result.pass));
  assert.ok(results.every((result) => Object.keys(result).every((key) =>
    ["name", "pass", "observedLength", "expectedLength", "valueLength"].includes(key))));
  assert.equal(JSON.stringify(results).includes(expected.voivodeship), false);
  assert.equal(JSON.stringify(results).includes(expected.county), false);
  assert.ok(Number.isInteger(results[0].observedLength));
  assert.ok(Number.isInteger(results[3].valueLength));
});

test("asercje wykrywają błędne nazwy, prefiks powiatu, łamanie identyfikatora i brak pól", () => {
  const results = buildParcelSearchAssertions({
    voivodeship: "Inna nazwa",
    county: "powiat Testowy powiat",
    locationSummary: "brak województwa",
    identifierLength: 18,
    identifierLineCount: 2,
    footer: "wersja M4b",
    reportText: "Powierzchnia ewidencyjna",
    searchStatus: "błąd",
  }, { voivodeship: "Testowe województwo", county: "Testowy powiat" });
  assert.deepEqual(results.map((result) => result.pass), [false, false, false, false, false, false]);
});

test("agreguje kafelki załadowane, błędne, anulowane i statusy", () => {
  const summary = aggregateRequests([
    { url: "https://tile.openstreetmap.org/17/1/2.png", status: 200, mimeType: "image/png", encodedDataLength: 500 },
    { url: "https://mapy.geoportal.gov.pl/wms?request=GetMap", status: 200, mimeType: "text/xml" },
    { url: "https://server.arcgisonline.com/tile", status: 503, mimeType: "text/plain" },
    { url: "https://tile.openstreetmap.org/17/3/4.png", status: null, errorText: "net::ERR_FAILED" },
    { url: "https://tile.openstreetmap.org/17/5/6.png", canceled: true },
    { url: "https://tile.openstreetmap.org/17/7/8.png", status: 200, mimeType: "image/png", encodedDataLength: 68 },
  ]);
  assert.equal(summary.total, 6);
  assert.equal(summary.loaded, 1);
  assert.equal(summary.empty, 1);
  assert.equal(summary.failed, 3);
  assert.equal(summary.canceled, 1);
  assert.deepEqual(summary.statuses, [200, 503]);
  assert.equal(summary.examples.length, 3);
  assert.deepEqual(summary.emptyCoordinates, ["z=17/x=7/y=8"]);
  assert.deepEqual(summary.failedCoordinates, ["/tile", "/wms", "z=17/x=3/y=4"]);
  assert.equal(EMPTY_TILE_BYTE_THRESHOLD, 128);
});

test("rozmiar pustego obrazu używa długości ładunku, a nie transferu z narzutem nagłówków", () => {
  const summary = aggregateRequests([{
    url: "https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolutionTime?BBOX=1,2,3,4",
    method: "GET",
    status: 200,
    mimeType: "image/png",
    encodedDataLength: 520,
    encodedBodyLength: 68,
    responseHeaders: { "Content-Type": "image/png", "Content-Length": "68" },
  }]);
  assert.equal(summary.empty, 1);
  assert.equal(summary.loaded, 0);
});

test("stabilność porównuje zbiory współrzędnych pustych i błędnych", () => {
  const runs = [
    { aggregate: { emptyCoordinates: ["bbox=a"], failedCoordinates: [] } },
    { aggregate: { emptyCoordinates: ["bbox=a"], failedCoordinates: [] } },
    { aggregate: { emptyCoordinates: [], failedCoordinates: ["bbox=b"] } },
  ];
  const result = compareProblemCoordinateSets(runs);
  assert.equal(result.same, false);
  assert.equal(result.status, "różne");
  assert.deepEqual(result.sets, [["bbox=a"], ["bbox=a"], ["bbox=b"]]);
  assert.equal(tileCoordinateKey("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/17/8/7"),
    "z=17/x=7/y=8");
});

test("metryki stabilności liczą przecięcie, sumę, zmienne współrzędne i wskaźnik", () => {
  const result = summarizeArchiveStability([
    { aggregate: { emptyCoordinates: ["bbox=A", "bbox=B"], loadedCoordinates: ["bbox=C"] } },
    { aggregate: { emptyCoordinates: ["bbox=B", "bbox=C"], loadedCoordinates: ["bbox=A"] } },
    { aggregate: { emptyCoordinates: ["bbox=A", "bbox=C"], loadedCoordinates: ["bbox=B"] } },
  ]);
  assert.deepEqual(result.emptyIntersection, []);
  assert.deepEqual(result.emptyUnion, ["bbox=A", "bbox=B", "bbox=C"]);
  assert.deepEqual(result.variableCoordinates, ["bbox=A", "bbox=B", "bbox=C"]);
  assert.equal(result.variableCount, 3);
  assert.equal(result.emptyCountSum, 6);
  assert.equal(result.variableRatio, 0.5);
});

test("nagłówki diagnostyczne są ograniczone do dozwolonej listy", () => {
  assert.deepEqual(selectRelevantResponseHeaders({
    "access-control-allow-origin": "*",
    "TIMING-ALLOW-ORIGIN": "https://example.org",
    "content-type": "image/png",
    "content-length": "68",
    "cache-control": "public, max-age=60",
    age: "3",
    via: "edge",
    "x-cache": "HIT",
    "set-cookie": "must-not-be-recorded",
    authorization: "must-not-be-recorded",
  }), {
    "Access-Control-Allow-Origin": "*",
    "Timing-Allow-Origin": "https://example.org",
    "Content-Type": "image/png",
    "Content-Length": "68",
    "Cache-Control": "public, max-age=60",
    Age: "3",
    Via: "edge",
    "X-Cache": "HIT",
  });
});

test("dopasowuje etykiety opcji po exact, prefix i contains wyłącznie jednoznacznie", () => {
  const options = [
    { value: "9901", label: "Testowy powiat (Testowe województwo)" },
    { value: "9902", label: "Fikcyjny powiat" },
  ];
  assert.equal(matchSearchOption(options, "testowy powiat").match, "prefix");
  assert.equal(matchSearchOption(options, "TESTOWY POWIAT (TESTOWE WOJEWÓDZTWO)").match, "exact");
  assert.equal(matchSearchOption(options, "cyjny pow").option.value, "9902");
  const ambiguous = matchSearchOption([
    { value: "1", label: "Testowo północ" },
    { value: "2", label: "Testowo południe" },
  ], "testowo");
  assert.equal(ambiguous.reason, "ambiguous");
  assert.deepEqual(ambiguous.labels, ["Testowo północ", "Testowo południe"]);
  assert.match(formatSearchOptionError(ambiguous), /Testowo północ \| Testowo południe/);
  assert.equal(matchSearchOption(options, "brak").reason, "missing");
  assert.match(formatSearchOptionError({ reason: "missing", labels: ["jeden"] }), /jeden/);
});

test("ponowne GET-y archiwalne wybierają do sześciu pustych adresów i odrzucają inne żądania", () => {
  const emptyUrl = "https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolutionTime"
    + "?service=WMS&request=GetMap&layers=Raster&bbox=1%2C2%2C3%2C4";
  const requests = Array.from({ length: 8 }, (_, index) => ({
    url: emptyUrl.replace("bbox=1%2C2%2C3%2C4", `bbox=${index}%2C2%2C3%2C4`),
    method: "GET",
    status: 200,
    mimeType: "image/png",
    encodedDataLength: 68,
  }));
  requests.push({ ...requests[0] });
  requests.push({ ...requests[0], url: "https://example.org/tile.png" });
  requests.push({ ...requests[0], method: "POST" });
  requests.push({ ...requests[0], status: 503 });
  requests.push({ ...requests[0], encodedDataLength: EMPTY_TILE_BYTE_THRESHOLD });
  const selected = selectRepeatableArchiveRequests(requests);
  assert.equal(selected.length, 6);
  const originalUrls = selected.map(({ url }) => url);
  assert.equal(isAllowedArchiveRepeatRequest(originalUrls[0], "GET", originalUrls), true);
  assert.equal(isAllowedArchiveRepeatRequest(originalUrls[0], "POST", originalUrls), false);
  assert.equal(isAllowedArchiveRepeatRequest(originalUrls[0] + "&extra=1", "GET", originalUrls), false);
  assert.equal(isAllowedArchiveRepeatRequest("https://example.org/tile.png", "GET", originalUrls), false);
  assert.equal(isAllowedArchiveRepeatRequest(
    "https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolutionTime"
      + "?service=WMS&request=GetMap&layers=Raster&bbox=8%2C2%2C3%2C4",
    "GET", originalUrls,
  ), false);
});

test("ocenia wynik dwóch powtórnych GET-ów na tych samych kafelkach", () => {
  const selected = [
    { url: "https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolutionTime?service=WMS&request=GetMap&layers=Raster&bbox=A", coordinate: "bbox=A" },
    { url: "https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolutionTime?service=WMS&request=GetMap&layers=Raster&bbox=B", coordinate: "bbox=B" },
  ];
  const result = summarizeArchiveRetry(selected, [
    { url: selected[0].url, status: 200, mimeType: "image/png", encodedDataLength: 400 },
    { url: selected[0].url, status: 200, mimeType: "image/png", encodedDataLength: 400 },
    { url: selected[1].url, status: 200, mimeType: "image/png", encodedDataLength: 68 },
    { url: selected[1].url, status: 200, mimeType: "image/png", encodedDataLength: 68 },
  ]);
  assert.equal(result.selectedTiles, 2);
  assert.equal(result.retryRequests, 4);
  assert.equal(result.filledTiles, 1);
  assert.equal(result.conclusion, "niejednoznaczne");
  assert.deepEqual(result.perTile.map(({ filled, remainedEmpty }) => [filled, remainedEmpty]), [[true, false], [false, true]]);
});

test("wniosek o ponawianiu jest liczbowy i rozróżnia pomaga od nie pomaga", () => {
  const tileUrl = "https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolutionTime"
    + "?service=WMS&request=GetMap&layers=Raster&bbox=A";
  const tiles = [{ url: tileUrl, coordinate: "bbox=A" }];
  const filled = summarizeArchiveRetry(tiles, [
    { url: tileUrl, status: 200, mimeType: "image/png", encodedDataLength: 256 },
    { url: tileUrl, status: 200, mimeType: "image/png", encodedDataLength: 256 },
  ]);
  assert.equal(filled.conclusion, "pomaga");
  assert.match(filled.reason, /1\/1/);
  const empty = summarizeArchiveRetry(tiles, [
    { url: tileUrl, status: 200, mimeType: "image/png", encodedDataLength: 68 },
    { url: tileUrl, status: 200, mimeType: "image/png", encodedDataLength: 68 },
  ]);
  assert.equal(empty.conclusion, "nie pomaga");
  assert.match(empty.reason, /0\/1/);
});

test("wybiera ścieżkę przeglądarki według jawnego argumentu, EDGE_PATH, następnie kandydatów", () => {
  const exists = (path) => ["edge.exe", "chrome.exe"].includes(path);
  assert.equal(chooseBrowserPath({ explicitPath: "edge.exe", envPath: "chrome.exe", exists }), "edge.exe");
  assert.equal(chooseBrowserPath({ envPath: "chrome.exe", candidates: ["edge.exe"], exists }), "chrome.exe");
  assert.equal(chooseBrowserPath({ candidates: ["missing.exe", "edge.exe"], exists }), "edge.exe");
  assert.equal(chooseBrowserPath({ explicitPath: "missing.exe", candidates: ["edge.exe"], exists }), null);
});

test("allowlista przeglądarki ogranicza metody, health-checki i ścieżki kafelków/GetMap", () => {
  const options = { appOrigin: "http://127.0.0.1:8080", healthRoutes };
  assert.equal(isAllowedBrowserRequest("http://127.0.0.1:8080/index.html", "GET", options), true);
  assert.equal(isAllowedBrowserRequest("http://127.0.0.1:8081/index.html", "GET", {
    appOrigins: ["http://127.0.0.1:8080", "http://127.0.0.1:8081"], healthRoutes,
  }), true);
  assert.equal(isAllowedBrowserRequest("https://rcn-web-app.onrender.com/", "GET", options), true);
  assert.equal(isAllowedBrowserRequest("https://rcn-web-app.onrender.com/api/debug", "GET", options), false);
  assert.equal(isAllowedBrowserRequest("https://rcn-web-app.onrender.com/", "POST", options), false);
  assert.equal(isAllowedBrowserRequest("https://a.tile.openstreetmap.org/17/1/2.png", "GET", options), true);
  assert.equal(isAllowedBrowserRequest("http://a.tile.openstreetmap.org/17/1/2.png", "GET", options), false);
  assert.equal(isAllowedBrowserRequest("https://a.tile.openstreetmap.org:444/17/1/2.png", "GET", options), false);
  assert.equal(isAllowedBrowserRequest("https://a.tile.openstreetmap.org/", "GET", options), false);
  assert.equal(isAllowedBrowserRequest("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/17/1/2", "GET", options), true);
  assert.equal(isAllowedBrowserRequest("https://server.arcgisonline.com/ArcGIS/rest/services/Other/MapServer/tile/17/1/2", "GET", options), false);
  assert.equal(isAllowedBrowserRequest("https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolutionTime?service=WMS&request=GetMap&layers=Raster", "GET", options), true);
  assert.equal(isAllowedBrowserRequest("https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolutionTime?service=WMS&request=GetCapabilities&layers=Raster", "GET", options), false);
  assert.equal(isAllowedBrowserRequest("https://mapy.geoportal.gov.pl/wss/service/other?service=WMS&request=GetMap&layers=Raster", "GET", options), false);
  assert.equal(isAllowedBrowserRequest("https://example.org/", "GET", options), false);
});

test("allowlista M4c dopuszcza tylko dokładne trasy wyszukiwania przez GET", () => {
  const options = { appOrigin: "http://127.0.0.1:8080", healthRoutes };
  for (const url of [
    buildCountiesUrl(),
    buildCommunesUrl("9988"),
    buildRegionsUrl("9988776"),
    buildParcelUrl("998877_6.0001", "12/3"),
    buildEgibGeometryUrl("998877_6.0001.12/3"),
    buildKiegFeatureInfoUrl({ type: "Polygon", coordinates: [[
      [300000, 500000], [300100, 500000], [300100, 500100], [300000, 500100], [300000, 500000],
    ]] }),
  ]) {
    assert.equal(isAllowedBrowserRequest(url, "GET", options), true, url);
    assert.equal(isAllowedBrowserRequest(url, "POST", options), false, url);
  }
  assert.equal(isAllowedBrowserRequest(
    "https://mapy.geoportal.gov.pl/wss/ims/maps/PRG_gugik_wyszukiwarka/FeatureServer/2/query?f=json",
    "GET",
    options,
  ), false);
  assert.equal(isAllowedBrowserRequest(
    "https://uldk.gugik.gov.pl/?request=GetCapabilities",
    "GET",
    options,
  ), false);
  assert.equal(isAllowedBrowserRequest(
    "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow?service=WMS&request=GetMap&layers=Raster",
    "GET",
    options,
  ), false);
  assert.equal(isAllowedBrowserRequest(
    "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetFeatureInfo&SRS=EPSG%3A2180&BBOX=1%2C1%2C201%2C201&WIDTH=1000&HEIGHT=1000&X=500&Y=500&LAYERS=dzialki&QUERY_LAYERS=dzialki&INFO_FORMAT=text%2Fxml&FORMAT=image%2Fpng&TRANSPARENT=TRUE",
    "POST", options,
  ), false);
  assert.equal(isAllowedBrowserRequest(
    "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetFeatureInfo&SRS=EPSG%3A2180&BBOX=1%2C1%2C201%2C201&WIDTH=1000&HEIGHT=1000&X=500&Y=500&LAYERS=dzialki&QUERY_LAYERS=dzialki&INFO_FORMAT=text%2Fxml&FORMAT=image%2Fpng&TRANSPARENT=TRUE&EXTRA=1",
    "GET", options,
  ), false);
});

test("allowlista M4d.1 dopuszcza wyłącznie WFS i KIEG EGiB starego frontu oraz limituje backend", () => {
  const options = { appOrigin: "http://127.0.0.1:8080", healthRoutes };
  const bounds = { getSouth: () => 53, getWest: () => 16.5, getNorth: () => 53.2, getEast: () => 16.9 };
  const wfs = buildParcelWfsUrl(bounds);
  const parcelMap = buildKiegGetMapUrl({ layer: "dzialki", bbox: [1800000, 6800000, 1800256, 6800256] });
  const buildingMap = buildKiegGetMapUrl({ layer: "budynki", bbox: [1800000, 6800000, 1800256, 6800256] });
  const clickInfo = buildMapClickFeatureInfoUrl({ lat: 53.2, lng: 16.9 });
  const redirectOptions = { ...options, allowRedirectKiegHosts: true };
  for (const url of [wfs, parcelMap, buildingMap, clickInfo]) {
    assert.equal(isAllowedBrowserRequest(url, "GET", options), true, url);
    assert.equal(isAllowedBrowserRequest(url, "POST", options), false, url);
  }
  assert.equal(isAllowedDzialkiEgibRequest(new URL(wfs), "GET"), true);
  assert.equal(isAllowedBrowserRequest(wfs + "&extra=1", "GET", options), false);
  assert.equal(isAllowedBrowserRequest(wfs.replace("/api/wfs", "/api/debug"), "GET", options), false);
  assert.equal(isAllowedBrowserRequest(parcelMap.replace("layers=dzialki", "layers=admin"), "GET", options), false);
  assert.equal(isAllowedBrowserRequest(clickInfo + "&EXTRA=1", "GET", options), false);
  for (const host of ["integracja01.gugik.gov.pl", "integracja02.gugik.gov.pl"]) {
    const redirect = parcelMap.replace("integracja.gugik.gov.pl", host);
    assert.equal(isAllowedBrowserRequest(redirect, "GET", redirectOptions), true);
    assert.equal(isAllowedBrowserRequest(redirect, "GET", options), false, "bez potwierdzenia 302 host przekierowania jest odrzucony");
    assert.equal(isAllowedBrowserRequest(redirect.replace("layers=dzialki", "layers=admin"), "GET", redirectOptions), false);
    assert.equal(isAllowedBrowserRequest(redirect + "&EXTRA=1", "GET", redirectOptions), false);
    assert.equal(isAllowedBrowserRequest("https://" + host + "/cgi-bin/KrajowaIntegracjaEwidencjiGruntow", "GET", redirectOptions), false);
    assert.equal(isAllowedBrowserRequest(redirect + "/other", "GET", redirectOptions), false);
    assert.equal(isAllowedBrowserRequest(redirect, "POST", redirectOptions), false);
  }
  assert.equal(isAllowedBrowserRequest(
    "https://integracja03.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow", "GET", options,
  ), false);
  assert.equal(isAllowedBrowserRequest("http://analizator-nieruchomosci.onrender.com/api/wfs?bbox=53,16,54,17", "GET", options), false);
  assert.equal(shouldAllowEgibBackendRequest(0), true);
  assert.equal(shouldAllowEgibBackendRequest(MAX_EGIB_BACKEND_REQUESTS - 1), true);
  assert.equal(shouldAllowEgibBackendRequest(MAX_EGIB_BACKEND_REQUESTS), false);
  assert.equal(shouldAllowEgibBackendRequest(0, MAX_EGIB_BACKEND_REQUESTS + 1), false);
  assert.equal(isDzialkiBackendHostRequest(new URL("https://analizator-nieruchomosci.onrender.com/health")), true,
    "health-check także zużywa budżet requestów backendu Działek");
  assert.equal(isDzialkiBackendHostRequest(new URL("https://analizator-nieruchomosci.onrender.com/api/wfs?bbox=1,2,3,4")), true);
  assert.equal(isDzialkiBackendHostRequest(new URL("https://example.org/health")), false);
});

test("parsuje argumenty scenariusza i normalizuje polskie nazwy", () => {
  assert.equal(normalizeSearchLabel("  Łódź  "), "lodz");
  assert.deepEqual(parseSearchArguments([
    "--powiat", "Fikcyjny powiat", "--gmina", "Testowo", "--obreb", "Przykładowy obręb", "--numer", "12/3",
  ]), {
    powiat: "Fikcyjny powiat",
    gmina: "Testowo",
    obreb: "Przykładowy obręb",
    numer: "12/3",
  });
  assert.equal(parseSearchArguments([]), null);
  assert.throws(() => parseSearchArguments(["--powiat", "Fikcyjny powiat"]), /wymaga argumentów/);
});
