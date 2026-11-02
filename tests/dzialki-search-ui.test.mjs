import test from "node:test";
import assert from "node:assert/strict";
import { createFakeDom } from "./helpers/fake-dom.mjs";
import { createFakeLeaflet } from "./helpers/fake-leaflet.mjs";
import { contextStore } from "../app/js/context.js";
import { mountDzialki } from "../app/js/modules/dzialki/index.js";
import { mountParcelSearch } from "../app/js/modules/dzialki/search-ui.js";
import { resetDzialkiState, getDzialkiState } from "../app/js/modules/dzialki/state.js";

const parcelRow = "998877_6.0001.12/3|9988776|12/3|Fikcyjny powiat|Fikcyjna gmina|Fikcyjne województwo|POLYGON ((20.00 52.00, 20.10 52.00, 20.10 52.10, 20.00 52.10, 20.00 52.00))";

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("formularz szuka działki, rysuje obrys, ustawia kontekst i zachowuje wybór po odmontowaniu", async (t) => {
  resetDzialkiState();
  contextStore.clear();
  const fake = createFakeDom();
  const leaflet = createFakeLeaflet();
  fake.window.L = leaflet.L;
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    fetch: globalThis.fetch,
    getComputedStyle: globalThis.getComputedStyle,
  };
  const requests = [];
  const countyPayload = { features: [{ attributes: { teryt: "9988", nazwa: "Fikcyjny powiat" } }] };
  const communePayload = { features: [{ attributes: { teryt: "9988776", nazwa: "Fikcyjna gmina" } }] };
  globalThis.document = fake.document;
  globalThis.window = fake.window;
  globalThis.fetch = async (rawUrl, options = {}) => {
    const url = new URL(String(rawUrl));
    requests.push({ url: url.toString(), method: options.method ?? "GET" });
    if (url.hostname === "mapy.geoportal.gov.pl" && url.pathname.endsWith("/1/query")) {
      return { ok: true, status: 200, json: async () => countyPayload };
    }
    if (url.hostname === "mapy.geoportal.gov.pl" && url.pathname.endsWith("/0/query")) {
      return { ok: true, status: 200, json: async () => communePayload };
    }
    if (url.hostname === "uldk.gugik.gov.pl") {
      if (url.searchParams.get("request") === "GetRegionByNameOrId") {
        return { ok: true, status: 200, text: async () => "0\n998877_6.0001|9988776|Fikcyjny obręb|Fikcyjna gmina|Fikcyjny powiat" };
      }
      if (url.searchParams.get("request") === "GetParcelById") {
        return { ok: true, status: 200, text: async () => "0\n" + parcelRow };
      }
    }
    throw new Error("Unexpected synthetic request");
  };
  t.after(() => {
    if (previous.document === undefined) delete globalThis.document;
    else globalThis.document = previous.document;
    if (previous.window === undefined) delete globalThis.window;
    else globalThis.window = previous.window;
    if (previous.fetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = previous.fetch;
    if (previous.getComputedStyle === undefined) delete globalThis.getComputedStyle;
    else globalThis.getComputedStyle = previous.getComputedStyle;
    resetDzialkiState();
    contextStore.clear();
  });

  const contexts = [];
  const ctx = {
    getBackendStatus: () => ({ state: "ready", waitSeconds: 0 }),
    setContext(value) {
      contexts.push(value);
      return contextStore.set(value);
    },
  };
  const mountTarget = fake.document.createElement("main");
  fake.document.body.append(mountTarget);
  let cleanup = mountDzialki(mountTarget, ctx);
  await flush();

  const county = fake.document.getElementById("dzialki-search-powiat");
  const commune = fake.document.getElementById("dzialki-search-gmina");
  const precinct = fake.document.getElementById("dzialki-search-obreb");
  const number = fake.document.getElementById("dzialki-search-numer");
  assert.equal(county.disabled, false);
  county.value = "9988";
  county.dispatch("change");
  await flush();
  commune.value = "9988776";
  commune.dispatch("change");
  await flush();
  precinct.value = "998877_6.0001";
  precinct.dispatch("change");
  number.value = "12/3";
  number.dispatch("input");
  fake.document.getElementById("dzialki-search-submit").click();
  await flush();

  assert.equal(requests.length, 4);
  assert.ok(requests.every((request) => request.method === "GET"));
  assert.ok(requests[0].url.includes("/FeatureServer/1/query"));
  assert.ok(requests[1].url.includes("/FeatureServer/0/query"));
  assert.equal(new URL(requests[2].url).searchParams.get("request"), "GetRegionByNameOrId");
  assert.equal(new URL(requests[3].url).searchParams.get("request"), "GetParcelById");
  assert.equal(leaflet.geoJsonLayers.length, 1);
  assert.equal(leaflet.geoJsonLayers[0].options.style.className, "dzialki-selected-parcel");
  assert.match(leaflet.geoJsonLayers[0].popup.textContent, /Identyfikator działki/);
  assert.match(leaflet.geoJsonLayers[0].popup.textContent, /Fikcyjny powiat/);
  assert.match(leaflet.geoJsonLayers[0].tooltip.textContent, /12\/3/);
  assert.equal(contexts.length, 1);
  assert.equal(contexts[0].source, "dzialki");
  assert.equal(contexts[0].parcel.id, "998877_6.0001.12/3");
  assert.equal(contexts[0].parcel.obrebTeryt, undefined);
  assert.equal(contexts[0].gmina.terc7, "9988776");
  assert.ok(Math.abs(contexts[0].point.lat - 52.05) < 1e-8);
  assert.ok(Math.abs(contexts[0].point.lon - 20.05) < 1e-8);
  assert.equal(contexts[0].point.crs, "EPSG:4326");
  assert.equal(getDzialkiState().selectedParcel.parcel.id, contexts[0].parcel.id);
  assert.deepEqual(getDzialkiState().center, [52.05, 20.05]);

  cleanup();
  cleanup = mountDzialki(mountTarget, ctx);
  await flush();
  assert.equal(leaflet.maps.length, 2);
  assert.equal(leaflet.geoJsonLayers.length, 2);
  assert.equal(fake.document.getElementById("dzialki-search-powiat").value, "9988");
  assert.equal(fake.document.getElementById("dzialki-search-numer").value, "12/3");
  assert.equal(requests.length, 4, "zapamiętane listy nie są pobierane ponownie po zmianie zakładki");
  cleanup();
});

test("formularz komunikuje błędny numer, błąd sieci i brak wyniku oraz pozwala ponowić ręcznie", async (t) => {
  resetDzialkiState();
  const fake = createFakeDom();
  const previousDocument = globalThis.document;
  globalThis.document = fake.document;
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    resetDzialkiState();
  });

  let parcelCalls = 0;
  const api = {
    async counties() { return [{ code: "9988", name: "Fikcyjny powiat" }]; },
    async communes() { return [{ code: "9988776", name: "Fikcyjna gmina" }]; },
    async regions() { return [{ code: "998877_6.0001", name: "Fikcyjny obręb" }]; },
    async parcel() {
      parcelCalls += 1;
      if (parcelCalls === 1) throw new Error("Nie udało się połączyć z usługą danych.");
      return null;
    },
  };
  const target = fake.document.createElement("main");
  fake.document.body.append(target);
  const unmount = mountParcelSearch(target, { api });
  t.after(unmount);
  await flush();

  const county = fake.document.getElementById("dzialki-search-powiat");
  const commune = fake.document.getElementById("dzialki-search-gmina");
  const precinct = fake.document.getElementById("dzialki-search-obreb");
  const number = fake.document.getElementById("dzialki-search-numer");
  county.value = "9988";
  county.dispatch("change");
  await flush();
  commune.value = "9988776";
  commune.dispatch("change");
  await flush();
  precinct.value = "998877_6.0001";
  precinct.dispatch("change");
  number.value = "12&debug";
  fake.document.getElementById("dzialki-search-submit").click();
  assert.match(fake.document.getElementById("dzialki-search-status").textContent, /prawidłowy numer działki/);
  assert.equal(parcelCalls, 0);

  number.value = "12/3";
  fake.document.getElementById("dzialki-search-submit").click();
  await flush();
  assert.match(fake.document.getElementById("dzialki-search-status").textContent, /Nie udało się połączyć/);
  const retry = fake.document.getElementById("dzialki-search-retry");
  assert.equal(retry.hidden, false);
  retry.click();
  await flush();
  assert.equal(parcelCalls, 2);
  assert.match(fake.document.getElementById("dzialki-search-status").textContent, /Nie znaleziono działki/);
  assert.equal(retry.hidden, true);
});
