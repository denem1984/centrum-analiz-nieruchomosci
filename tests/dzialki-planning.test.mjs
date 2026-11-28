import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { createFakeDom } from "./helpers/fake-dom.mjs";
import { createFakeLeaflet, FakeTileLayer } from "./helpers/fake-leaflet.mjs";
import { resetDzialkiState, updateDzialkiState } from "../app/js/modules/dzialki/state.js";
import { mountPlanningLayers } from "../app/js/modules/dzialki/planning-layers.js";
import { buildMpzpInfoUrl, buildDzinfoUrl, buildEmapaCapabilitiesUrl, buildEmapaInfoUrl, buildDraftZoneInfoUrl,
  buildPlanningGetMapUrl, loadMpzp, safePlanningHref, parseDraftZoneInfo, NO_MPZP } from "../app/js/modules/dzialki/planning-services.js";
import { emapaTileRequest, createEmapaLayer, PROJ4_INTEGRITY } from "../app/js/modules/dzialki/planning-projection.js";
import { renderMpzp, renderAdoptedPog, renderDraftPog } from "../app/js/modules/dzialki/planning-popup.js";

const MPZP = "https://mapy.geoportal.gov.pl/wss/ext/KrajowaIntegracjaMiejscowychPlanowZagospodarowaniaPrzestrzennego";
const RU = "https://rejestr-urbanistyczny.gov.pl/uslugi-sieciowe/wms-pog/ows";
const GUGIK = "https://mapy.geoportal.gov.pl/wss/ext/ProjektowanePlanyOgolneGmin";
const flush = async () => { for (let i = 0; i < 8; i += 1) await new Promise((resolve) => setImmediate(resolve)); };

test("pięć WMS odtwarza pełne URL-e starego frontu, rozmiary, CRS i kolejność osi", () => {
  const defaults = "&format=image%2Fpng&transparent=true&version=";
  const cases = [
    ["mpzp", MPZP + "?service=WMS&request=GetMap&layers=plany%2Craster%2Cwektor-str%2Cwektor-lzb%2Cwektor-pow%2Cwektor-lin%2Cwektor-pkt%2Cgranice&styles=" + defaults + "1.1.1&width=1024&height=1024&srs=EPSG%3A3857&bbox=1,2,3,4"],
    ["buildingLines", MPZP + "?service=WMS&request=GetMap&layers=wektor-lzb&styles=default" + defaults + "1.3.0&width=256&height=256&crs=EPSG%3A3857&bbox=1,2,3,4"],
    ["pogAdopted", RU + "?service=WMS&request=GetMap&layers=APP.POG.PrawnieWiazacyLubRealizowany&styles=" + defaults + "1.3.0&width=256&height=256&crs=EPSG%3A4326&bbox=1,2,3,4"],
    ["pogDraftRu", RU + "?service=WMS&request=GetMap&layers=APP.POG.WOpracowaniu%2CAPP.POG.WTrakciePrzyjmowania&styles=%2C" + defaults + "1.3.0&width=256&height=256&crs=EPSG%3A4326&bbox=1,2,3,4"],
    ["pogDraftGugik", GUGIK + "?service=WMS&request=GetMap&layers=strefaPlanistyczna&styles=default" + defaults + "1.3.0&width=256&height=256&crs=EPSG%3A3857&bbox=1,2,3,4"],
  ];
  for (const [id, url] of cases) assert.equal(buildPlanningGetMapUrl(id, [1, 2, 3, 4]), url);
  assert.throws(() => buildPlanningGetMapUrl("missing", [1, 2, 3, 4]));
});

test("zapytania popupów mają dokładne stare adresy i parametry", () => {
  assert.equal(buildMpzpInfoUrl({ lat: 53, lng: 17 }, "998877"), "https://analizator-nieruchomosci.onrender.com/api/mpzp-gmina-info?teryt=998877&lat=53&lon=17");
  assert.equal(buildMpzpInfoUrl({ lat: 53, lng: 17 }), "https://analizator-nieruchomosci.onrender.com/api/mpzp-info?lat=53&lon=17");
  assert.equal(buildDzinfoUrl("998877_2.0001.12/3"), "https://analizator-nieruchomosci.onrender.com/api/dzinfo?id=998877_2.0001.12%2F3");
  assert.equal(buildEmapaCapabilitiesUrl("998877"), "https://wms.e-mapa.net/cgi-bin/pog/998877?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0");
  assert.equal(buildEmapaInfoUrl("998877", [500000, 600000]), "https://wms.e-mapa.net/cgi-bin/pog/998877?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetFeatureInfo&LAYERS=app.StrefaPlanistyczna%2Capp.AktPlanowaniaPrzestrzennego.POG&QUERY_LAYERS=app.StrefaPlanistyczna%2Capp.AktPlanowaniaPrzestrzennego.POG&STYLES=%2C&SRS=EPSG:2180&BBOX=499980,599980,500020,600020&WIDTH=101&HEIGHT=101&X=50&Y=50&INFO_FORMAT=text%2Fxml&FEATURE_COUNT=5&FORMAT=image%2Fpng");
  assert.equal(buildDraftZoneInfoUrl({ bbox: [1, 2, 3, 4], size: { x: 1000, y: 800 }, pixel: { x: 1001, y: -1 } }), GUGIK + "?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&LAYERS=strefaPlanistyczna&QUERY_LAYERS=strefaPlanistyczna&STYLES=default&CRS=EPSG%3A3857&BBOX=1%2C2%2C3%2C4&WIDTH=1000&HEIGHT=800&FORMAT=image%2Fpng&INFO_FORMAT=text%2Fhtml&I=999&J=0");
  assert.throws(() => buildMpzpInfoUrl({ lat: 53, lng: 17 }, "9988772"));
});

test("MPZP zachowuje priorytet gminy, fallback RU i równoległe szczegóły działki; błędy są niepełnością", async () => {
  const calls = [];
  const read = async (url, options) => {
    calls.push(url);
    assert.equal(options.method, "GET");
    if (url.includes("mpzp-gmina")) return { ok: true, json: async () => ({ plans: [] }) };
    if (url.includes("/dzinfo")) return { ok: true, json: async () => ({ mpzp: { nazwaAktu: "Fikcyjny plan" } }) };
    return { ok: true, json: async () => ({ found: true, plany: [{ tytul: "Plan RU", wersjaOd: "2026-01-01" }] }) };
  };
  const result = await loadMpzp({ lat: 53, lng: 17 }, "998877_2.0001.12/3", { fetchImpl: read });
  assert.equal(result.plans[0].tytul, "Plan RU");
  assert.equal(result.mpzp.nazwaAktu, "Fikcyjny plan");
  assert.equal(result.incomplete, false);
  assert.equal(calls.length, 3);
  assert.ok(calls.findIndex((url) => url.includes("mpzp-gmina")) < calls.findIndex((url) => url.includes("/api/mpzp-info")));
  const partial = await loadMpzp({ lat: 53, lng: 17 }, null, { fetchImpl: async () => ({ ok: false, status: 503 }) });
  assert.equal(partial.incomplete, true);
  assert.deepEqual(partial.plans, []);
  const shortCalls = [];
  await loadMpzp({ lat: 53, lng: 17 }, "998877_2.0001.12/3", { fetchImpl: async (url) => {
    shortCalls.push(url);
    return { ok: true, json: async () => url.includes("gmina") ? { plans: [{ tytul: "Gminny" }] } : { mpzp: null } };
  } });
  assert.equal(shortCalls.some((url) => url.includes("/api/mpzp-info")), false);
});

test("lokalny proj4 odpowiada blobowi oficjalnego 2.9.0, a reprojekcja odtwarza WMS gminny", async () => {
  const bytes = await readFile(new URL("../app/vendor/dzialki/proj4-2.9.0/proj4.js", import.meta.url));
  assert.equal(createHash("sha1").update("blob " + bytes.length + "\0").update(bytes).digest("hex"), "4d4a5b5cbab4242e124feb6680ad65822fcee1cb");
  assert.equal("sha256-" + createHash("sha256").update(bytes).digest("base64"), PROJ4_INTEGRITY);
  const proj4 = createRequire(import.meta.url)("../app/vendor/dzialki/proj4-2.9.0/proj4.js");
  proj4.defs("EPSG:2180", "+proj=tmerc +lat_0=0 +lon_0=19 +k=0.9993 +x_0=500000 +y_0=-5300000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");
  const tile = emapaTileRequest("998877", { x: 4476, y: 2668, z: 13 }, (ll) => proj4("EPSG:4326", "EPSG:2180", ll));
  assert.equal(tile.url, "https://wms.e-mapa.net/cgi-bin/pog/998877?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=app.StrefaPlanistyczna%2Capp.StrefaPlanistyczna-etykiety&STYLES=%2C&SRS=EPSG:2180&BBOX=345609.86,571593.31,348650.86,574627.37&WIDTH=265&HEIGHT=264&FORMAT=image/png&TRANSPARENT=TRUE");
  assert.ok(tile.matrix.every(Number.isFinite));
});

function setup(t, options = {}) {
  resetDzialkiState();
  const dom = createFakeDom(), leaflet = createFakeLeaflet();
  const map = leaflet.L.map(dom.document.createElement("div"), {});
  const timers = new Map();
  let clock = 0, nextId = 0;
  const controller = mountPlanningLayers(dom.document.body, { document: dom.document,
    getBackendStatus: () => ({ state: "ready" }), subscribeBackendStatus: () => () => {},
    setTimeoutFn: (fn, delay) => { const id = ++nextId; timers.set(id, { fn, at: clock + delay }); return id; },
    clearTimeoutFn: (id) => timers.delete(id), nowFn: () => clock, ...options,
  });
  t.after(() => { controller.cleanup(); resetDzialkiState(); });
  controller.attach(map, leaflet.L);
  const input = (id) => dom.document.getElementById("dzialki-planning-" + id);
  const change = (id, value) => { input(id).checked = value; input(id).dispatch("change"); };
  const status = (id) => dom.document.querySelectorAll("[data-planning-status]").find((el) => el.dataset.planningStatus === id);
  return { ...dom, ...leaflet, map, controller, timers, input, change, status, tick: (ms) => { clock += ms; for (const [id, timer] of [...timers]) if (timer.at <= clock) { timers.delete(id); timer.fn(); } } };
}

test("panel ma pięć wyłączonych opcji i trzy informacje; monitor nie uznaje 0/0 za kompletność i sprząta", (t) => {
  const fake = setup(t);
  assert.equal(fake.document.querySelectorAll("[data-planning-layer]").length, 5);
  assert.equal(fake.map.layers.size, 0);
  assert.equal(fake.document.querySelectorAll("button.dzialki-layer-help-button").length, 3);
  fake.change("mpzp", true);
  const layer = fake.layers[0];
  assert.equal(layer.options.tileSize, 1024);
  assert.equal(fake.status("mpzp").dataset.state, "loading");
  layer._tiles.a = { current: true, el: { complete: true, naturalWidth: 1024, naturalHeight: 1024 } };
  layer.fire("tileload", { tile: layer._tiles.a.el });
  assert.equal(fake.status("mpzp").dataset.state, "complete");
  layer._tiles.b = { current: true, el: { complete: false, naturalWidth: 0, naturalHeight: 0 } };
  layer.fire("tileerror", { tile: layer._tiles.b.el });
  fake.tick(40000);
  assert.equal(fake.status("mpzp").dataset.state, "incomplete");
  fake.change("mpzp", false);
  assert.equal(fake.map.layers.size, 0);
  assert.equal(layer.listenerCount("tileerror"), 0);
  assert.equal(fake.timers.size, 0);
  fake.change("buildingLines", true);
  assert.match(fake.status("buildingLines").textContent, /dużego zbliżenia.*1:5 000.*danych wektorowych/);
});

test("pomiar blokuje popup planowania, zakończenie przywraca obsługę", t => {
  let blocked = true, opened = 0;
  const fake = setup(t, { isMapInteractionBlocked: () => blocked, hasAdditionalPopup: () => true,
    onPopupOpen: () => opened++, extendStandalonePopup: content => content,
  });
  fake.map.fire("click", { latlng: { lat: 53, lng: 17 } });
  assert.equal(opened, 0); assert.equal(fake.map.popup, undefined);
  blocked = false;
  fake.map.fire("click", { latlng: { lat: 53, lng: 17 } });
  assert.equal(opened, 1); assert.ok(fake.map.popup);
});

test("odmontowanie blokuje spóźnione odpowiedzi popupu", async (t) => {
  const releases = [];
  const fake = setup(t, { fetchImpl: async () => {
    return { ok: true, json: () => new Promise((resolve) => { releases.push(resolve); }) };
  } });
  fake.change("mpzp", true);
  const popup = fake.controller.extendPopup("Działka testowa", { latlng: { lat: 53, lng: 17 } }, { parcel: { id: "998877_2.0001.12/3" } });
  await flush();
  fake.controller.cleanup();
  for (const release of releases) release({ plans: [], mpzp: null });
  await flush();
  assert.doesNotMatch(popup.textContent, /Wczytano\./);
  assert.match(popup.textContent, /Anulowano/);
});

test("popup odróżnia poprawny brak danych od niepełnego sprawdzenia źródeł", async (t) => {
  let fail = false;
  const fake = setup(t, { fetchImpl: async (url) => fail ? { ok: false, status: 503 }
    : { ok: true, json: async () => url.includes("gmina") ? { plans: [] } : url.includes("/dzinfo") ? { mpzp: null } : { found: false, plany: [] } } });
  fake.change("mpzp", true);
  const event = { latlng: { lat: 53, lng: 17 } }, selection = { parcel: { id: "998877_2.0001.12/3" } };
  const empty = fake.controller.extendPopup("Działka testowa", event, selection);
  await flush();
  assert.equal(empty.querySelector("section").dataset.state, "empty");
  assert.match(empty.textContent, /brak w Rejestrze Urbanistycznym i w usłudze gminnej/);
  fail = true;
  const partial = fake.controller.extendPopup("Działka testowa", event, selection);
  await flush();
  assert.equal(partial.querySelector("section").dataset.state, "incomplete");
  assert.doesNotMatch(partial.textContent, /brak w Rejestrze Urbanistycznym i w usłudze gminnej/);
});

test("zimny backend pokazuje sekundy i nie otrzymuje żądań planu przed gotowością", async (t) => {
  let release, subscriber;
  const calls = [];
  const fake = setup(t, {
    getBackendStatus: () => ({ state: "waking" }),
    subscribeBackendStatus: (_id, listener) => { subscriber = listener; return () => {}; },
    checkBackend: () => new Promise((resolve) => { release = resolve; }),
    fetchImpl: async (url) => { calls.push(url); return { ok: true, json: async () => url.includes("gmina") ? { plans: [{ tytul: "Plan fikcyjny" }] } : { mpzp: null } }; },
  });
  fake.change("mpzp", true);
  const popup = fake.controller.extendPopup("Działka testowa", { latlng: { lat: 53, lng: 17 } }, { parcel: { id: "998877_2.0001.12/3" } });
  await flush();
  subscriber({ state: "waking", waitSeconds: 17 });
  assert.match(popup.textContent, /oczekiwanie: 17 s/);
  assert.equal(calls.length, 0);
  release({ state: "ready" });
  await flush();
  assert.equal(calls.length, 2);
  assert.equal(popup.querySelector("section").dataset.state, "ready");
});

test("kafelek gminnego POG jawnie zgłasza timeout, ponawia ten sam URL i anuluje pracę po usunięciu", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  class Grid extends FakeTileLayer { constructor(options) { super("", options); } }
  Grid.extend = (methods) => { class Layer extends Grid {} Object.assign(Layer.prototype, methods); return Layer; };
  const images = [], requests = [], outcomes = [];
  class ImageClass {
    constructor() { images.push(this); this.naturalWidth = this.naturalHeight = 256; }
    set src(value) { requests.push(value); }
    removeAttribute() {}
  }
  const { document } = createFakeDom();
  const layer = createEmapaLayer({ GridLayer: Grid }, { project: ([x,y]) => [x * 1000, y * 1000], teryt: "998877", documentRef: document, ImageClass });
  const tile = layer.createTile({x:4476,y:2668,z:13}, (error) => outcomes.push(error));
  tile.getContext = () => ({ setTransform() {}, drawImage() {} });
  t.mock.timers.tick(20000);
  assert.equal(tile.dataset.tileState, "error");
  assert.equal(tile.complete, false);
  assert.equal(outcomes.length, 1);
  tile.retryPlanningTile();
  assert.equal(requests.length, 2);
  assert.equal(requests[0], requests[1]);
  images[0].onload();
  assert.equal(tile.complete, true);
  assert.equal(outcomes[1], null);
  const cancelled = layer.createTile({x:4476,y:2669,z:13}, () => outcomes.push("unexpected"));
  layer.fire("tileunload", { tile: cancelled });
  t.mock.timers.tick(20000);
  assert.equal(cancelled.dataset.tileState, "cancelled");
  assert.equal(outcomes.length, 2);
});

test("renderer nie montuje HTML i przepuszcza tylko bezpieczne linki HTTPS; zachowuje pola stref", () => {
  const { document } = createFakeDom();
  const root = document.createElement("div");
  assert.equal(renderMpzp(document, root, { plans: [{ tytul: "<script>fikcyjne</script>", links: [{ href: "javascript:alert(1)" }, { label: "Uchwała", href: "https://example.org/plan" }] }], mpzp: { strefy: [{ etykieta: "MN", opis: "Testowa" }] } }), true);
  assert.equal(root.querySelectorAll("script").length, 0);
  assert.equal(root.querySelectorAll("a").length, 1);
  assert.match(root.textContent, /<script>fikcyjne<\/script>/);
  assert.match(root.textContent, /MN – Testowa/);
  assert.equal(safePlanningHref("https://user:password@example.org/"), null);
  assert.equal(renderAdoptedPog(document, root, { zones: [{ oznaczenie: "SJ", profilPodstawowy: "Testowy", maksWysokoscZabudowy: "12" }], plan: { tytul: "Plan", obowiazujeOd: "2026-01-01" } }), true);
  assert.match(root.textContent, /Maks\. wysokość zabudowy: 12/);
  assert.equal(renderDraftPog(document, root, [{ Oznaczenie: "SU", "Profil dodatkowy": "Test" }]), true);
  assert.match(root.textContent, /Projektowany POG – strefa: SU/);
  assert.equal(renderMpzp(document, root, { plans: [], mpzp: null }), false);
  assert.equal(NO_MPZP, "Szczegóły planu miejscowego niedostępne (brak w Rejestrze Urbanistycznym i w usłudze gminnej).");
});

test("parser HTML usuwa zasoby przed parsowaniem i odrzuca wyjątek WMS", () => {
  let parsed;
  class Parser { parseFromString(source) { parsed = source; return { querySelectorAll: () => [] }; } }
  assert.deepEqual(parseDraftZoneInfo('<img src="https://example.org/x"><script>bad()</script><p>bez danych</p>', Parser), []);
  assert.doesNotMatch(parsed, /img|script|https/);
  assert.throws(() => parseDraftZoneInfo("<ServiceException>error</ServiceException>", Parser));
});
