import test from "node:test";
import assert from "node:assert/strict";
import { createFakeDom } from "./helpers/fake-dom.mjs";
import { createFakeLeaflet } from "./helpers/fake-leaflet.mjs";
import {
  buildKiegGetMapUrl,
  buildMapClickFeatureInfoUrl,
  buildParcelWfsUrl,
  countVisibleKiegTiles,
  EGiB_MIN_ZOOM,
  isLoadedKiegTileImage,
  mountEgibLayers,
  PARCEL_WFS_URL,
} from "../app/js/modules/dzialki/egib-layers.js";
import { resetDzialkiState, getDzialkiState } from "../app/js/modules/dzialki/state.js";
import { contextStore } from "../app/js/context.js";

const idA = "998877_6.0001.1/2";
const idB = "998877_6.0001.1/3";
const feature = (id, offset = 0) => ({
  type: "Feature",
  properties: { id_dzialki: id },
  geometry: {
    type: "Polygon",
    coordinates: [[[16.9 + offset, 53.2], [16.91 + offset, 53.2], [16.91 + offset, 53.21], [16.9 + offset, 53.21], [16.9 + offset, 53.2]]],
  },
});
const kiegXml = (id) => `<FeatureInfoResponse><Attribute Name="Identyfikator działki">${id}</Attribute><Attribute Name="Pole pow. w ewidencji gruntów">0,1234 ha</Attribute><Attribute Name="Grupa rejestrowa">7</Attribute><Attribute Name="Oznaczenie użytku">RVI, B</Attribute></FeatureInfoResponse>`;
const bounds = {
  getSouth: () => 53,
  getWest: () => 16.5,
  getNorth: () => 53.2,
  getEast: () => 16.9,
};

test("monitor liczy tylko widoczne obrazy KIEG z poprawnym wymiarem", () => {
  const loaded = { complete: true, naturalWidth: 256, naturalHeight: 256 };
  const empty = { complete: true, naturalWidth: 1, naturalHeight: 1 };
  assert.equal(isLoadedKiegTileImage(loaded), true);
  assert.equal(isLoadedKiegTileImage(empty), false);
  const layer = { _tiles: {
    loaded: { current: true, el: loaded },
    empty: { current: true, el: empty },
    stale: { current: false, el: loaded },
  } };
  const state = countVisibleKiegTiles([layer], { hasLayer: () => true });
  assert.deepEqual(state, { active: true, total: 2, loaded: 1, missing: 1 });
  assert.deepEqual(countVisibleKiegTiles([], { hasLayer: () => true }), {
    active: false, total: 0, loaded: 0, missing: 0,
  });
});

test("monitor kompletnych konturów aktualizuje status, wyczerpuje okno i pokazuje ponowienie", () => {
  resetDzialkiState();
  const fake = createFakeDom();
  const leaflet = createFakeLeaflet();
  const container = fake.document.createElement("aside");
  const clock = createClock();
  const retries = [];
  let now = 0;
  const controller = mountEgibLayers(container, {
    ...readyOptions(async () => ({ ok: true, status: 200, json: async () => ({ features: [] }) })),
    onKiegTileStats: (stats) => retries.push(stats.parcels.retries),
    retryRandom: () => 0,
    setTimeoutFn: clock.setTimeout,
    clearTimeoutFn: clock.clearTimeout,
    nowFn: () => now,
    completenessSweepMs: 3000,
    completenessWindowMs: 9000,
  });
  const map = leaflet.L.map(container, {});
  map.setZoom(17);
  controller.attach(map, leaflet.L);
  const parcels = leaflet.layers.find((layer) => layer.isWms && layer.options.layers === "dzialki");
  const image = { complete: true, naturalWidth: 1, naturalHeight: 1 };
  parcels._tiles["1:2:17"] = { current: true, coords: { x: 1, y: 2, z: 17 }, el: image };
  parcels.fire("tileerror", { coords: { x: 1, y: 2, z: 17 }, tile: image });
  assert.equal(container.querySelector("#dzialki-egib-completeness").textContent,
    "Wczytywanie konturów: 0/1");
  now = 1500;
  clock.runDelay(1500);
  parcels.fire("tileerror", { coords: { x: 1, y: 2, z: 17 }, tile: image });
  now = 5500;
  clock.runDelay(4000);
  parcels.fire("tileerror", { coords: { x: 1, y: 2, z: 17 }, tile: image });
  now = 5500;
  clock.runDelay(3000);
  const retriesAfterFirstSweep = Math.max(...retries);
  assert.ok(retriesAfterFirstSweep > 0);
  now = 8500;
  clock.runDelay(3000);
  now = 9000;
  clock.runDelay(500);
  assert.equal(Math.max(...retries), retriesAfterFirstSweep, "po wyczerpaniu okna monitor nie inicjuje kolejnego sweepu");
  assert.equal(container.querySelector("#dzialki-egib-completeness").textContent,
    "Nie udało się wczytać części konturów (1 kafelków)");
  assert.equal(container.querySelector("#dzialki-egib-retry").hidden, false);
  image.naturalWidth = 256;
  image.naturalHeight = 256;
  parcels.fire("tileload", { coords: { x: 1, y: 2, z: 17 }, tile: image });
  assert.equal(container.querySelector("#dzialki-egib-completeness").textContent, "Kontury kompletne");
  controller.cleanup();
  assert.equal(parcels.listenerCount("tileload"), 0);
  assert.equal(parcels.listenerCount("tileerror"), 0);
  resetDzialkiState();
});

function readyOptions(fetchImpl) {
  return {
    fetchImpl,
    debounceMs: 0,
    retryDelayMs: 0,
    getBackendStatus: () => ({ state: "ready" }),
    checkBackend: async () => ({ state: "ready" }),
    subscribeBackendStatus: () => () => {},
  };
}

const wait = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));

function createClock() {
  let nextId = 0;
  const timers = new Map();
  return {
    timers,
    setTimeout(callback, delay) { const id = ++nextId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    runDelay(delay) {
      const entry = [...timers.entries()].find(([, value]) => value.delay === delay);
      assert.ok(entry, "timer „" + delay + " ms” powinien istnieć");
      timers.delete(entry[0]);
      entry[1].callback();
    },
  };
}

test("WFS GeoJSON odtwarza dokładny GET starego frontu: ścieżka i bbox południe,zachód,północ,wschód", () => {
  assert.equal(PARCEL_WFS_URL, "https://analizator-nieruchomosci.onrender.com/api/wfs");
  assert.equal(buildParcelWfsUrl(bounds),
    "https://analizator-nieruchomosci.onrender.com/api/wfs?bbox=52.97%2C16.44%2C53.230000000000004%2C16.959999999999997");
  assert.equal(EGiB_MIN_ZOOM, 13);
  assert.throws(() => buildParcelWfsUrl(null), /widok mapy/);
});

test("KIEG GetMap i kliknięcie GetFeatureInfo budują adresy ze wzorcem starego frontu", () => {
  const kieg = "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow";
  const tile = buildKiegGetMapUrl({ layer: "dzialki", bbox: [1800000, 6800000, 1800256, 6800256] });
  assert.equal(tile, kieg
    + "?service=WMS&request=GetMap&layers=dzialki&styles=&format=image%2Fpng&transparent=true"
    + "&version=1.1.1&width=256&height=256&srs=EPSG%3A3857&bbox=1800000%2C6800000%2C1800256%2C6800256");
  const info = buildMapClickFeatureInfoUrl({ lat: 53.2, lng: 16.9 });
  assert.equal(info, kieg
    + "?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetFeatureInfo&SRS=EPSG%3A4326"
    + "&BBOX=16.898799999999998%2C53.198800000000006%2C16.9012%2C53.2012&WIDTH=1000&HEIGHT=1000&X=500&Y=500"
    + "&LAYERS=dzialki&QUERY_LAYERS=dzialki&INFO_FORMAT=text%2Fxml&FORMAT=image%2Fpng&TRANSPARENT=TRUE");
  assert.throws(() => buildKiegGetMapUrl({ layer: "admin", bbox: [0, 0, 1, 1] }), /parametry/);
  assert.throws(() => buildMapClickFeatureInfoUrl({ lat: 100, lng: 0 }), /współrzędne/);
});

test("panel EGiB ma wymagane domyślne stany, wczytuje etykiety i kontury oraz zachowuje grupę w pamięci", async () => {
  resetDzialkiState();
  const fake = createFakeDom();
  const leaflet = createFakeLeaflet();
  const container = fake.document.createElement("aside");
  let unsubscribeCalls = 0;
  const requests = [];
  const controller = mountEgibLayers(container, {
    ...readyOptions(async (url, options) => {
      requests.push({ url: String(url), method: options.method });
      return { ok: true, status: 200, json: async () => ({ features: [feature(idA)] }), text: async () => kiegXml(idA) };
    }),
    subscribeBackendStatus: () => () => { unsubscribeCalls += 1; },
  });
  assert.equal(controller.inputs.get("numbers").checked, true);
  assert.equal(controller.inputs.get("parcels").checked, true);
  assert.equal(controller.inputs.get("buildings").checked, false);
  assert.equal(controller.group.open, true);

  const map = leaflet.L.map(container, {});
  map.setZoom(17);
  controller.attach(map, leaflet.L);
  await wait(25);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "GET");
  assert.match(requests[0].url, /\/api\/wfs\?bbox=/);
  const parcelWms = leaflet.layers.find((layer) => layer.isWms && layer.options.layers === "dzialki");
  assert.ok(parcelWms);
  assert.equal(parcelWms.url, "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow");
  assert.deepEqual({
    layers: parcelWms.options.layers,
    styles: parcelWms.options.styles,
    version: parcelWms.options.version,
    format: parcelWms.options.format,
    transparent: parcelWms.options.transparent,
    crs: parcelWms.options.crs,
  }, { layers: "dzialki", styles: "", version: "1.1.1", format: "image/png", transparent: true, crs: "EPSG:3857" });
  assert.ok(map.layers.size >= 3, "do mapy trafiają warstwa WMS, kontury i etykieta");

  controller.inputs.get("buildings").checked = true;
  controller.inputs.get("buildings").dispatch("change");
  assert.ok(map.layers.has(leaflet.layers.find((layer) => layer.isWms && layer.options.layers === "budynki")));
  assert.equal(getDzialkiState().egibLayers.buildings, true);
  controller.group.open = false;
  controller.group.dispatch("toggle");
  assert.equal(getDzialkiState().layerGroups.egib, false);

  controller.cleanup();
  assert.equal(map.listenerCount("click"), 0);
  assert.equal(map.listenerCount("moveend"), 0);
  assert.equal(map.listenerCount("zoomend"), 0);
  assert.equal(map.layers.size, 0);
  assert.equal(unsubscribeCalls, 1);
  resetDzialkiState();
});

test("kafelek KIEG ponawia się według K0, ma własne liczniki i reaguje na ręczne ponowienie", () => {
  resetDzialkiState();
  const fake = createFakeDom();
  const leaflet = createFakeLeaflet();
  const clock = createClock();
  const container = fake.document.createElement("aside");
  const statsSeen = [];
  const controller = mountEgibLayers(container, {
    ...readyOptions(async () => ({ ok: true, status: 200, json: async () => ({ features: [] }) })),
    setTimeoutFn: clock.setTimeout,
    clearTimeoutFn: clock.clearTimeout,
    retryRandom: () => 0,
    onKiegTileStats: (stats) => statsSeen.push(stats),
  });
  const map = leaflet.L.map(container, {});
  map.setZoom(17);
  controller.attach(map, leaflet.L);
  const parcels = leaflet.layers.find((layer) => layer.isWms && layer.options.layers === "dzialki");
  const buildings = leaflet.layers.find((layer) => layer.isWms && layer.options.layers === "budynki");
  parcels.getTileUrl = (coords) => "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow?tile=" + coords.x;
  const coords = { x: 8, y: 6, z: 17 };
  const image = { src: "tile-failed", removeAttribute(name) { if (name === "src") this.src = ""; } };

  parcels.fire("tileerror", { coords, tile: image });
  assert.equal(controller.getKiegTileStats().parcels.errors, 1);
  assert.equal(controller.getKiegTileStats().parcels.pending, 1);
  assert.equal(controller.getKiegTileStats().buildings.errors, 0);
  clock.runDelay(1500);
  assert.match(image.src, /[?&]tile=8$/);
  assert.equal(controller.getKiegTileStats().parcels.retries, 1);

  parcels.fire("tileerror", { coords, tile: image });
  clock.runDelay(4000);
  assert.equal(controller.getKiegTileStats().parcels.retries, 2);
  parcels.fire("tileerror", { coords, tile: image });
  assert.equal(controller.getKiegTileStats().parcels.finalUnloaded, 1);
  assert.equal(container.querySelectorAll("#dzialki-kieg-parcel-tile-status")[0].textContent,
    "Kontury działek: 1 kafelków niezaładowanych");
  assert.equal(container.querySelectorAll("#dzialki-kieg-building-tile-status")[0].textContent,
    "Kontury budynków: 0 kafelków niezaładowanych");
  assert.equal(controller.retryFailedTiles(), true);
  assert.equal(parcels.redrawCount, 1);
  assert.equal(controller.getKiegTileStats().parcels.finalUnloaded, 0);
  assert.ok(statsSeen.length > 0);
  controller.cleanup();
  assert.equal(parcels.listenerCount("tileerror"), 0);
  assert.equal(buildings.listenerCount("tileerror"), 0);
  resetDzialkiState();
});

test("zmiana widoku lub unmount anuluje zaplanowane retry KIEG", () => {
  resetDzialkiState();
  const fake = createFakeDom();
  const leaflet = createFakeLeaflet();
  const clock = createClock();
  const container = fake.document.createElement("aside");
  const controller = mountEgibLayers(container, {
    ...readyOptions(async () => ({ ok: true, status: 200, json: async () => ({ features: [] }) })),
    setTimeoutFn: clock.setTimeout,
    clearTimeoutFn: clock.clearTimeout,
    retryRandom: () => 0,
  });
  const map = leaflet.L.map(container, {});
  map.setZoom(17);
  controller.attach(map, leaflet.L);
  const parcels = leaflet.layers.find((layer) => layer.isWms && layer.options.layers === "dzialki");
  const coords = { x: 4, y: 3, z: 17 };
  parcels.fire("tileerror", { coords, tile: { _leaflet_id: 4 } });
  assert.ok([...clock.timers.values()].some((timer) => timer.delay === 1500));
  controller.inputs.get("parcels").checked = false;
  controller.inputs.get("parcels").dispatch("change");
  clock.runDelay(1500);
  assert.equal(controller.getKiegTileStats().parcels.retries, 0);
  assert.equal(controller.getKiegTileStats().parcels.pending, 0);
  parcels.fire("tileerror", { coords: { x: 5, y: 3, z: 17 }, tile: { _leaflet_id: 5 } });
  controller.cleanup();
  assert.equal(parcels.listenerCount("tileerror"), 0);
  assert.equal(clock.timers.size, 0);
  resetDzialkiState();
});

test("lewy klik pokazuje EGiB, a osobne akcje zmieniają wielokrotne zaznaczenie", async (t) => {
  resetDzialkiState();
  contextStore.clear();
  const originalContext = contextStore.get();
  const fake = createFakeDom();
  const leaflet = createFakeLeaflet();
  const container = fake.document.createElement("aside");
  let measuring = true;
  const clickRequests = [];
  const fetchImpl = async (url, options) => {
    if (String(url).includes("/api/wfs?")) {
      return { ok: true, status: 200, json: async () => ({ features: [feature(idA), feature(idB, 0.02)] }) };
    }
    assert.equal(options.method, "GET");
    clickRequests.push(String(url));
    return { ok: true, status: 200, text: async () => kiegXml(String(url) === buildMapClickFeatureInfoUrl({ lat: 53.201, lng: 16.921 }) ? idB : idA) };
  };
  const controller = mountEgibLayers(container, { ...readyOptions(fetchImpl), isMapInteractionBlocked: () => measuring });
  const map = leaflet.L.map(container, {});
  map.setZoom(17);
  controller.attach(map, leaflet.L);
  t.after(() => { controller.cleanup(); resetDzialkiState(); });
  await wait(25);
  map.fire("click", { latlng: { lat: 53.2, lng: 16.9 } });
  await wait();
  assert.equal(clickRequests.length, 0, "pomiar nie pobiera ani nie zaznacza działki");
  measuring = false;
  map.fire("click", { latlng: { lat: 53.2, lng: 16.9 } });
  await wait();
  assert.ok(map.popup, controller.status.textContent);
  assert.equal(clickRequests[0], buildMapClickFeatureInfoUrl({ lat: 53.2, lng: 16.9 }));
  assert.equal(map.popup.content.textContent.includes("Powierzchnia: 0,1234 ha"), true);
  assert.equal(map.popup.content.textContent.includes("Grupa rejestrowa: 7 – osoby fizyczne"), true);
  assert.match(map.popup.content.textContent, /Klasoużytki: RVI, B/);
  assert.equal(getDzialkiState().selectedMapParcels.length, 0);
  controller.addSearchSelection({ parcel: { id: idA }, geometry: feature(idA).geometry });
  await controller.setSelectionAt({ lat: 53.201, lng: 16.921 }, true);
  assert.equal(map.layers.size, 6, "dwie różne działki mogą pozostać zaznaczone");
  assert.deepEqual(getDzialkiState().selectedMapParcels.map((item) => item.parcel.id), [idA, idB]);
  map.fire("click", { latlng: { lat: 53.2, lng: 16.9 } });
  await wait();
  assert.match(map.popup.content.textContent, /Działka zaznaczona/);
  assert.equal(getDzialkiState().selectedMapParcels.length, 2);
  const requestCount = clickRequests.length;
  await controller.setSelectionAt({ lat: 53.203, lng: 16.904 }, false);
  assert.equal(clickRequests.length, requestCount, "wyszukaną działkę można odznaczyć na podstawie jej geometrii");
  assert.equal(map.layers.size, 5, "odznaczanie usuwa tylko wskazaną działkę");
  assert.deepEqual(getDzialkiState().selectedMapParcels.map((item) => item.parcel.id), [idB]);
  assert.deepEqual(contextStore.get(), originalContext, "kliknięcie mapy nie zmienia DenemContext");
});

test("zmiana widoku anuluje poprzedni WFS i nie nakłada żądań; cleanup przerywa pracę", async () => {
  resetDzialkiState();
  const fake = createFakeDom();
  const leaflet = createFakeLeaflet();
  const container = fake.document.createElement("aside");
  let active = 0;
  let peak = 0;
  let calls = 0;
  const fetchImpl = (url, options) => {
    if (!String(url).includes("/api/wfs?")) return Promise.resolve({ ok: true, text: async () => kiegXml(idA) });
    calls += 1;
    active += 1;
    peak = Math.max(peak, active);
    return new Promise((resolve, reject) => {
      const finish = () => { active -= 1; resolve({ ok: true, json: async () => ({ features: [feature(idA)] }) }); };
      const timer = setTimeout(finish, 30);
      options.signal.addEventListener("abort", () => {
        clearTimeout(timer);
        active -= 1;
        const error = new Error("aborted"); error.name = "AbortError"; reject(error);
      }, { once: true });
    });
  };
  const controller = mountEgibLayers(container, readyOptions(fetchImpl));
  const map = leaflet.L.map(container, {});
  map.setZoom(17);
  controller.attach(map, leaflet.L);
  await wait(5);
  map.fire("moveend");
  map.fire("moveend");
  await wait(60);
  assert.ok(calls >= 2);
  assert.equal(peak, 1);
  map.fire("moveend");
  await wait(5);
  const inFlight = active;
  controller.cleanup();
  await wait(5);
  assert.equal(inFlight > 0, true);
  assert.equal(active, 0);
  assert.equal(map.listenerCount("click"), 0);
  resetDzialkiState();
});

test("zimny start wstrzymuje WFS do gotowości backendu i pokazuje licznik oczekiwania", async () => {
  resetDzialkiState();
  const fake = createFakeDom();
  const leaflet = createFakeLeaflet();
  const container = fake.document.createElement("aside");
  let releaseHealth;
  let intervalCallback;
  let wfsCalls = 0;
  const controller = mountEgibLayers(container, {
    debounceMs: 0,
    getBackendStatus: () => ({ state: "idle" }),
    checkBackend: async (_id, options) => {
      options.onState({ state: "waking", waitSeconds: 7 });
      return new Promise((resolve) => { releaseHealth = resolve; });
    },
    setIntervalFn: (callback) => { intervalCallback = callback; return 1; },
    clearIntervalFn: () => {},
    fetchImpl: async (url, options) => {
      assert.equal(options.method, "GET");
      wfsCalls += 1;
      return { ok: true, status: 200, json: async () => ({ features: [feature(idA)] }) };
    },
  });
  const map = leaflet.L.map(container, {});
  map.setZoom(17);
  controller.attach(map, leaflet.L);
  await wait(5);
  assert.match(controller.status.textContent, /Usługa się budzi/);
  assert.match(controller.status.textContent, /7 s/);
  intervalCallback?.();
  assert.equal(wfsCalls, 0, "WFS czeka na gotowość health-checku");
  releaseHealth({ state: "ready" });
  await wait(20);
  assert.equal(wfsCalls, 1);
  assert.equal(controller.status.dataset.state, "ready");
  controller.cleanup();
  resetDzialkiState();
});

test("WFS ponawia jeden raz po błędzie sieci, a debounce łączy szybkie ruchy mapy", async () => {
  resetDzialkiState();
  const fake = createFakeDom();
  const leaflet = createFakeLeaflet();
  const container = fake.document.createElement("aside");
  let calls = 0;
  const controller = mountEgibLayers(container, {
    ...readyOptions(async (url, options) => {
      assert.equal(options.method, "GET");
      calls += 1;
      if (calls === 1) throw new Error("synthetic network failure");
      return { ok: true, status: 200, json: async () => ({ features: [feature(idA)] }) };
    }),
    debounceMs: 15,
    retryDelayMs: 0,
  });
  const map = leaflet.L.map(container, {});
  map.setZoom(17);
  controller.attach(map, leaflet.L);
  map.fire("moveend");
  map.fire("moveend");
  await wait(7);
  assert.equal(calls, 0, "debounce nie wysyła żądania przed upływem okna");
  await wait(55);
  assert.equal(calls, 2, "jeden debounced refresh oraz jedna próba ponowna");
  assert.equal(controller.status.dataset.state, "ready");
  controller.cleanup();
  resetDzialkiState();
});

test("cleanup anuluje zaplanowaną próbę ponowną WFS", async () => {
  resetDzialkiState();
  const fake = createFakeDom();
  const leaflet = createFakeLeaflet();
  const container = fake.document.createElement("aside");
  let calls = 0;
  const controller = mountEgibLayers(container, {
    ...readyOptions(async () => {
      calls += 1;
      throw new Error("synthetic network failure");
    }),
    retryDelayMs: 80,
  });
  const map = leaflet.L.map(container, {});
  map.setZoom(17);
  controller.attach(map, leaflet.L);
  await wait(20);
  assert.equal(calls, 1);
  controller.cleanup();
  await wait(100);
  assert.equal(calls, 1, "cleanup usuwa timer i nie wysyła drugiego GET-u");
  resetDzialkiState();
});
