import test from "node:test";
import assert from "node:assert/strict";
import { createFakeDom } from "./helpers/fake-dom.mjs";
import { createFakeLeaflet } from "./helpers/fake-leaflet.mjs";
import { resetHealthCache } from "../app/js/health.js";
import { contextStore } from "../app/js/context.js";
import { encodeContext } from "../app/js/context.js";
import { resetDzialkiState } from "../app/js/modules/dzialki/state.js";

test("powłoka uruchamia mapę Działki, kontrolki i cykl życia bez ruchu poza atrapą", async (t) => {
  resetHealthCache();
  resetDzialkiState();
  contextStore.clear();
  const fake = createFakeDom();
  const leaflet = createFakeLeaflet();
  fake.window.L = leaflet.L;
  fake.window.__DZIALKI_TILE_RETRY__ = {
    attempts: 0,
    delaysMs: [],
    maxConcurrent: 1,
    jitterMs: 0,
  };
  fake.window.location.hash = "#/dzialki";
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    fetch: globalThis.fetch,
    L: globalThis.L,
  };
  const requests = [];
  globalThis.document = fake.document;
  globalThis.window = fake.window;
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), method: options.method });
    return {
      ok: true,
      status: 200,
      json: async () => ({ features: [{ attributes: { teryt: "9988", nazwa: "Fikcyjny powiat" } }] }),
      text: async () => "0",
    };
  };
  t.after(() => {
    if (previous.document === undefined) delete globalThis.document;
    else globalThis.document = previous.document;
    if (previous.window === undefined) delete globalThis.window;
    else globalThis.window = previous.window;
    if (previous.fetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = previous.fetch;
    if (previous.L === undefined) delete globalThis.L;
    else globalThis.L = previous.L;
  });

  await assert.doesNotReject(() => import("../app/js/main.js?dzialki-start=" + Date.now()));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(leaflet.maps.length, 1);
  const firstMap = leaflet.maps[0];
  assert.equal(firstMap.options.zoomSnap, 0.1);
  assert.equal(firstMap.options.zoomDelta, 0.1);
  assert.deepEqual(firstMap.getCenter(), { lat: 52.07, lng: 19.48 });
  assert.equal(firstMap.getZoom(), 6);
  assert.equal(firstMap.layers.size, 2, "podkład oraz domyślna warstwa konturów EGiB są aktywne");
  assert.equal([...firstMap.layers][0].options.attribution,
    '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>');
  assert.equal(firstMap.controls[0].type, "scale");

  const view = fake.document.getElementById("module-view");
  assert.match(view.textContent, /Działki/);
  assert.match(view.textContent, /OpenStreetMap/);
  assert.match(view.textContent, /Satelita – Esri World Imagery/);
  assert.match(view.textContent, /Ortofotomapa archiwalna – GUGiK/);
  assert.match(view.textContent, /Dostępne lata: 1995–2025\. W danym miejscu może brakować zdjęcia z wybranego roku\./);
  assert.match(view.textContent, /Niezaładowane kafelki: 0/);
  assert.match(view.textContent, /Stan usługi Działki: Dostępna/);
  assert.match(view.textContent, /w kolejnych etapach/);
  assert.match(view.children[0].attributes.get("aria-labelledby"), /dzialki-title/);

  const esriRadio = fake.document.querySelectorAll("[data-base-layer]")
    .find((input) => input.dataset.baseLayer === "esri");
  const baseLayer = (map) => [...map.layers].find((layer) =>
    layer.options?.attribution?.includes("OpenStreetMap")
    || layer.options?.attribution?.includes("Esri — Source")
    || layer.options?.time,
  );
  const osmLayer = baseLayer(firstMap);
  const kiegParcelLayer = leaflet.layers.find((layer) => layer.isWms && layer.options.layers === "dzialki");
  kiegParcelLayer.fire("tileerror", {
    coords: { x: 3, y: 4, z: 8 },
    tile: { _leaflet_id: 303 },
  });
  const retryButton = fake.document.querySelectorAll("button.dzialki-retry-button")[0];
  assert.equal(retryButton.disabled, false, "wspólny przycisk jest dostępny dla błędów KIEG");
  assert.equal(fake.window.__DZIALKI_KIEG_TILE_STATS__.parcels.finalUnloaded, 1);
  retryButton.click();
  assert.equal(fake.window.__DZIALKI_KIEG_TILE_STATS__.parcels.finalUnloaded, 0);
  assert.equal(kiegParcelLayer.redrawCount, 1, "wspólny przycisk ponawia warstwę KIEG");
  assert.equal(fake.window.__DZIALKI_TILE_STATS__.finalUnloaded, 0, "licznik podkładu pozostaje osobny");
  esriRadio.checked = true;
  esriRadio.dispatch("change");
  assert.equal(osmLayer.listenerCount("tileerror"), 0, "zmiana podkładu odłącza retry poprzedniej warstwy");
  assert.equal(firstMap.layers.size, 2);
  assert.match(baseLayer(firstMap).url, /server\.arcgisonline\.com/);

  const archiveRadio = fake.document.querySelectorAll("[data-base-layer]")
    .find((input) => input.dataset.baseLayer === "archive");
  const esriLayer = baseLayer(firstMap);
  archiveRadio.checked = true;
  archiveRadio.dispatch("change");
  assert.equal(esriLayer.listenerCount("tileerror"), 0);
  let archiveLayer = baseLayer(firstMap);
  assert.equal(archiveLayer.isWms, true);
  assert.equal(archiveLayer.options.time, "2025-11-01");
  archiveLayer.fire("tileload", {
    coords: { x: 1, y: 2, z: 8 },
    tile: { _leaflet_id: 1, naturalWidth: 1, naturalHeight: 1 },
  });
  const exhaustedMessage = fake.document.querySelectorAll("p.dzialki-tile-exhausted-status")[0];
  assert.equal(exhaustedMessage.attributes.get("aria-live"), "polite");
  assert.equal(exhaustedMessage.hidden, false);
  assert.equal(exhaustedMessage.textContent,
    "Usługa GUGiK nie zwróciła obrazu dla 1 kafelków mimo ponowień. Spróbuj ponownie później lub zmień rok.");
  assert.deepEqual(fake.window.__DZIALKI_TILE_STATS__, {
    errors: 1,
    retries: 0,
    finalUnloaded: 1,
    pending: 0,
  });
  fake.document.querySelectorAll("button.dzialki-retry-button")[0].click();
  assert.equal(exhaustedMessage.hidden, true, "ręczne ponowienie usuwa komunikat wyczerpanych kafelków");
  const yearInput = fake.document.getElementById("dzialki-year");
  yearInput.value = "2023";
  yearInput.dispatch("input");
  yearInput.dispatch("change");
  assert.equal(archiveLayer.listenerCount("tileerror"), 0, "zmiana roku odłącza retry poprzedniej warstwy");
  archiveLayer = baseLayer(firstMap);
  assert.equal(archiveLayer.options.time, "2023-12-01");
  assert.match(fake.document.getElementById("module-view").textContent, /2023/);

  const zoomInput = view.querySelectorAll("input").find((input) => input.type === "range" && input.id !== "dzialki-year");
  zoomInput.value = "8.4";
  zoomInput.dispatch("input");
  assert.equal(firstMap.getZoom(), 8.4);

  assert.equal(requests.length, 5, "mapa wykonuje wyłącznie cztery health-checki i listę powiatów");
  assert.ok(requests.every((request) => request.method === "GET"));
  assert.ok(requests.every((request) => !/api\/(admin|debug|live|search|data_source_refresh)/i.test(request.url)));
  assert.ok(requests.some((request) => request.url.includes("/FeatureServer/1/query")));

  fake.window.location.hash = "#/start";
  fake.window.dispatch("hashchange");
  assert.equal(firstMap.removed, true);
  assert.equal(archiveLayer.listenerCount("tileerror"), 0);

  fake.window.location.hash = "#/dzialki";
  fake.window.dispatch("hashchange");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(leaflet.maps.length, 2);
  const secondMap = leaflet.maps[1];
  assert.equal(baseLayer(secondMap).isWms, true);
  assert.equal(baseLayer(secondMap).options.time, "2023-12-01");
  assert.deepEqual(secondMap.getCenter(), { lat: 52.07, lng: 19.48 });
  assert.equal(secondMap.getZoom(), 8.4);

  const pointContext = {
    version: "1",
    source: "start",
    kind: "punkt",
    match: "exact",
    point: { lat: 52.4, lon: 21.0, crs: "EPSG:4326" },
  };
  const encoded = encodeContext(pointContext).encoded;
  fake.window.location.hash = "#/dzialki?ctx=" + encoded;
  fake.window.dispatch("hashchange");
  await new Promise((resolve) => setImmediate(resolve));
  const pointMap = leaflet.maps[2];
  assert.deepEqual(pointMap.getCenter(), { lat: 52.4, lng: 21 });
  assert.ok(pointMap.getZoom() >= 16);
  assert.deepEqual(contextStore.get().point, pointContext.point, "mapa nie modyfikuje wspólnego kontekstu");
  assert.equal(requests.length, 5);
});
