import test from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import {
  aggregateRequests,
  buildStateExpression,
  chooseBrowserPath,
  compareProblemCoordinateSets,
  EMPTY_TILE_BYTE_THRESHOLD,
  isAllowedBrowserRequest,
  normalizeSearchLabel,
  parseSearchArguments,
  parseCdpLoadingFailed,
  parseCdpMessage,
  tileCoordinateKey,
} from "./browser-smoke.mjs";
import {
  buildCommunesUrl,
  buildCountiesUrl,
  buildParcelUrl,
  buildRegionsUrl,
} from "../app/js/modules/dzialki/search.js";

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
