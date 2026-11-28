import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createFakeDom } from "./helpers/fake-dom.mjs";
import { createFakeLeaflet } from "./helpers/fake-leaflet.mjs";
import { contextStore } from "../app/js/context.js";
import { mountDzialki } from "../app/js/modules/dzialki/index.js";
import { mountParcelSearch } from "../app/js/modules/dzialki/search-ui.js";
import { resetDzialkiState, getDzialkiState } from "../app/js/modules/dzialki/state.js";

const parcelRow = "289977_6.0001.12/3|2899776|12/3|Powiat surowy ULDK|Gmina surowa ULDK|Region surowy ULDK|POLYGON ((20.00 52.00, 20.10 52.00, 20.10 52.10, 20.00 52.10, 20.00 52.00))";

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
  const countyPayload = { features: [{ attributes: { teryt: "2899", nazwa: "Fikcyjny powiat" } }] };
  const communePayload = { features: [{ attributes: { teryt: "2899776", nazwa: "Fikcyjna gmina" } }] };
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
        return { ok: true, status: 200, text: async () => "0\n289977_6.0001|2899776|Fikcyjny obręb|Fikcyjna gmina|Fikcyjny powiat" };
      }
      if (url.searchParams.get("request") === "GetParcelById") {
        if (url.searchParams.get("srid") === "2180") {
          return { ok: true, status: 200, text: async () => "0\n289977_6.0001.12/3|POLYGON ((300000 500000, 300100 500000, 300100 500100, 300000 500100, 300000 500000))" };
        }
        return { ok: true, status: 200, text: async () => "0\n" + parcelRow };
      }
    }
    if (url.hostname === "integracja.gugik.gov.pl") {
      return { ok: true, status: 200, text: async () => "<Feature>"
        + "<Attribute Name=\"Identyfikator działki\">289977_6.0001.12/3</Attribute>"
        + "<Attribute Name=\"Pole pow. w ewidencji gruntów\">0.4449</Attribute>"
        + "<Attribute Name=\"Grupa rejestrowa\">7</Attribute>"
        + "<Attribute Name=\"Oznaczenie użytku\">RVI, B</Attribute></Feature>" };
    }
    if (url.hostname === "analizator-nieruchomosci.onrender.com" && url.pathname === "/api/wfs") {
      return { ok: true, status: 200, json: async () => ({ features: [{
        type: "Feature",
        properties: { id_dzialki: "289977_6.0001.12/3" },
        geometry: { type: "Polygon", coordinates: [[[20, 52], [20.1, 52], [20.1, 52.1], [20, 52.1], [20, 52]]] },
      }] }) };
    }
    throw new Error("Unexpected synthetic request");
  };
  let cleanup=()=>{};
  t.after(() => {
    cleanup();
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
  cleanup = mountDzialki(mountTarget, ctx);
  await flush();
  assert.match(fake.document.getElementById("dzialki-parcel-report").textContent, /Nie wybrano działki/);

  const county = fake.document.getElementById("dzialki-search-powiat");
  const commune = fake.document.getElementById("dzialki-search-gmina");
  const precinct = fake.document.getElementById("dzialki-search-obreb");
  const number = fake.document.getElementById("dzialki-search-numer");
  assert.equal(county.disabled, false);
  county.value = "2899";
  county.dispatch("change");
  await flush();
  commune.value = "2899776";
  commune.dispatch("change");
  await flush();
  precinct.value = "289977_6.0001";
  precinct.dispatch("change");
  number.value = "12/3";
  number.dispatch("input");
  fake.document.getElementById("dzialki-search-submit").click();
  await flush();

  assert.ok(requests.length >= 6);
  assert.ok(requests.every((request) => request.method === "GET"));
  assert.ok(requests[0].url.includes("/FeatureServer/1/query"));
  assert.ok(requests[1].url.includes("/FeatureServer/0/query"));
  assert.equal(new URL(requests[2].url).searchParams.get("request"), "GetRegionByNameOrId");
  assert.equal(new URL(requests[3].url).searchParams.get("request"), "GetParcelById");
  assert.equal(new URL(requests[4].url).searchParams.get("srid"), "2180");
  assert.equal(new URL(requests[5].url).hostname, "integracja.gugik.gov.pl");
  const selectedLayer = leaflet.geoJsonLayers.find((layer) =>
    layer.options.style?.().className === "dzialki-selected-parcel");
  assert.ok(selectedLayer);
  assert.equal(selectedLayer.options.style().fillOpacity, 0.42);
  assert.equal(selectedLayer.options.style().weight, 5);
  assert.match(selectedLayer.popup.textContent, /Działka 289977_6\.0001\.12\/3/);
  assert.match(selectedLayer.popup.textContent, /Grupa rejestrowa: 7 – osoby fizyczne/);
  assert.match(selectedLayer.popup.textContent, /Klasoużytki: RVI, B/);
  assert.equal(contexts.length, 1);
  assert.equal(contexts[0].source, "dzialki");
  assert.equal(contexts[0].parcel.id, "289977_6.0001.12/3");
  assert.deepEqual(contexts[0].voivodeship, { code: "28", name: "warmińsko-mazurskie" });
  assert.deepEqual(contexts[0].powiat, { code: "2899", name: "Fikcyjny powiat" });
  assert.equal(contexts[0].parcel.obrebTeryt, undefined);
  assert.equal(contexts[0].gmina, undefined, "rodzaj jednostki 6 nie mapuje się do kontekstu gminy");
  assert.ok(Math.abs(contexts[0].point.lat - 52.05) < 1e-8);
  assert.ok(Math.abs(contexts[0].point.lon - 20.05) < 1e-8);
  assert.equal(contexts[0].point.crs, "EPSG:4326");
  assert.equal(getDzialkiState().selectedParcel.parcel.id, contexts[0].parcel.id);
  assert.equal(getDzialkiState().mapSelectionInitialized, true);
  assert.deepEqual(getDzialkiState().selectedMapParcels.map((item) => item.parcel.id), [contexts[0].parcel.id]);
  assert.equal(getDzialkiState().selectedParcel.egib.area, "0,4449 ha");
  assert.equal(fake.document.getElementById("dzialki-parcel-report").dataset.egibState, "ready");
  assert.match(fake.document.getElementById("dzialki-parcel-report").textContent, /0,4449 ha/);
  const report = fake.document.getElementById("dzialki-parcel-report");
  assert.match(report.textContent, /Województwowarmińsko-mazurskie/);
  assert.match(report.textContent, /PowiatFikcyjny powiat/);
  assert.match(report.textContent, /GminaFikcyjna gmina/);
  assert.match(report.textContent, /ObrębFikcyjny obręb/);
  assert.doesNotMatch(report.textContent, /Powiat surowy ULDK|Gmina surowa ULDK|Region surowy ULDK/);
  const identifier = report.querySelector("dd.dzialki-report-identifier-value");
  assert.equal(identifier?.textContent, "289977_6.0001.12/3");
  const css = await readFile(new URL("../app/css/modules/dzialki.css", import.meta.url), "utf8");
  assert.match(css, /\.dzialki-report-identifier-value[\s\S]*?white-space:\s*nowrap/);
  assert.match(css, /@media\s*\(max-width:\s*28rem\)[\s\S]*?\.dzialki-report-identifier-label,[\s\S]*?grid-column:\s*1\s*\/\s*-1/);
  assert.match(fake.document.getElementById("dzialki-search-status").textContent, /Powierzchnia i klasoużytki pobrane z EGiB/);
  assert.deepEqual(getDzialkiState().center, [52.05, 20.05]);
  fake.document.querySelectorAll("[data-selection-color]")[1].click();
  assert.equal(selectedLayer.options.style.fillColor,"#f97316","kolor aktualizuje istniejącą geometrię");
  fake.document.getElementById("dzialki-clear-selection").click();
  assert.equal(leaflet.maps[0].hasLayer(selectedLayer),false);
  assert.equal(getDzialkiState().selectedMapParcels.length,0);
  assert.equal(getDzialkiState().selectedParcel.parcel.id,contexts[0].parcel.id,"czyszczenie nie usuwa wyniku wyszukiwania");
  assert.match(report.textContent,/0,4449 ha/);

  cleanup();
  cleanup = mountDzialki(mountTarget, ctx);
  await flush();
  assert.equal(leaflet.maps.length, 2);
  assert.equal(leaflet.geoJsonLayers.length, 1,"powrót nie przywraca wyczyszczonego zaznaczenia");
  assert.equal(getDzialkiState().selectedMapParcels.length,0);
  assert.equal(fake.document.getElementById("dzialki-search-powiat").value, "2899");
  assert.equal(fake.document.getElementById("dzialki-search-numer").value, "12/3");
  assert.equal(requests.filter((request) => {
    const url = new URL(request.url);
    return url.pathname !== "/api/wfs" && url.hostname !== "integracja.gugik.gov.pl";
  }).length, 5,
    "zapamiętane listy i raport nie są pobierane ponownie po zmianie zakładki");
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
    async egib() { throw new Error("EGiB nie jest wywoływane bez działki."); },
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

test("raport EGiB po błędzie pozostawia formularz aktywny i pozwala ponowić pobranie", async (t) => {
  resetDzialkiState();
  contextStore.clear();
  const fake = createFakeDom();
  const previousDocument = globalThis.document;
  globalThis.document = fake.document;
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    resetDzialkiState();
    contextStore.clear();
  });
  let egibCalls = 0;
  const api = {
    async counties() { return [{ code: "9988", name: "Fikcyjny powiat" }]; },
    async communes() { return [{ code: "9988771", name: "Fikcyjna gmina" }]; },
    async regions() { return [{ code: "998877_1.0001", name: "Fikcyjny obręb" }]; },
    async parcel() {
      return {
        id: "998877_1.0001.12/3", number: "12/3", county: "Fikcyjny powiat",
        commune: "Fikcyjna gmina", region: "Fikcyjne województwo",
        geometry: { type: "Polygon", coordinates: [[[20, 52], [20.1, 52], [20.1, 52.1], [20, 52.1], [20, 52]]] },
        extent: { center: { lat: 52.05, lon: 20.05 } },
      };
    },
    async egib() {
      egibCalls += 1;
      if (egibCalls === 1) throw new Error("Nie udało się połączyć z usługą danych.");
      return { area: "0,1000 ha", group: "7", groupDescription: "osoby fizyczne", classUse: [] };
    },
  };
  const target = fake.document.createElement("main");
  fake.document.body.append(target);
  const unmount = mountParcelSearch(target, { api });
  t.after(unmount);
  await flush();
  fake.document.getElementById("dzialki-search-powiat").value = "9988";
  fake.document.getElementById("dzialki-search-powiat").dispatch("change");
  await flush();
  fake.document.getElementById("dzialki-search-gmina").value = "9988771";
  fake.document.getElementById("dzialki-search-gmina").dispatch("change");
  await flush();
  fake.document.getElementById("dzialki-search-obreb").value = "998877_1.0001";
  fake.document.getElementById("dzialki-search-obreb").dispatch("change");
  fake.document.getElementById("dzialki-search-numer").value = "12/3";
  fake.document.getElementById("dzialki-search-submit").click();
  await flush();
  assert.equal(fake.document.getElementById("dzialki-parcel-report").dataset.egibState, "error");
  assert.match(fake.document.getElementById("dzialki-search-status").textContent, /Nie udało się połączyć/);
  assert.match(fake.document.getElementById("dzialki-parcel-report").textContent, /Nie udało się pobrać danych ewidencyjnych/);
  assert.equal(fake.document.getElementById("dzialki-search-retry").hidden, false);
  fake.document.getElementById("dzialki-search-retry").click();
  await flush();
  assert.equal(egibCalls, 2);
  assert.equal(fake.document.getElementById("dzialki-parcel-report").dataset.egibState, "ready");
  assert.match(fake.document.getElementById("dzialki-search-status").textContent, /Powierzchnia i klasoużytki pobrane z EGiB/);
});
