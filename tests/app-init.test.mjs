import test from "node:test";
import assert from "node:assert/strict";
import { createFakeDom } from "./helpers/fake-dom.mjs";

test("aplikacja startuje, renderuje zakładki i obsługuje kontekst bez sieci", async (t) => {
  const fake = createFakeDom();
  const appVersion = fake.document.createElement("p");
  appVersion.id = "app-version";
  fake.document.body.append(appVersion);
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    fetch: globalThis.fetch,
  };
  const requests = [];
  globalThis.document = fake.document;
  globalThis.window = fake.window;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).endsWith("/data/location/units.json")) {
      return { ok: true, json: async () => [
        ["28", "WARMIŃSKO-MAZURSKIE", "województwo", null, null],
        ["2862", "Olsztyn", "miasto na prawach powiatu", null, null],
        ["2862011", "Olsztyn", "gmina miejska", "032862011011", "2862011"],
      ] };
    }
    if (String(url).includes("FeatureServer/0/query")) {
      return { ok: true, json: async () => ({
        spatialReference: { wkid: 4326 },
        features: [{ attributes: { teryt: "2862011" }, geometry: { rings: [[[20, 53], [21, 53], [21, 54], [20, 53]]] } }],
      }) };
    }
    requests.push({ url: String(url), method: options.method });
    return { ok: true, status: 200 };
  };
  t.after(() => {
    if (previous.document === undefined) delete globalThis.document;
    else globalThis.document = previous.document;
    if (previous.window === undefined) delete globalThis.window;
    else globalThis.window = previous.window;
    if (previous.fetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = previous.fetch;
  });

  await assert.doesNotReject(() => import("../app/js/main.js?app-init=" + Date.now()));

  const { BACKENDS, BACKEND_IDS } = await import("../app/js/config.js");
  await new Promise((resolve) => setImmediate(resolve));

  const links = fake.document.getElementById("module-nav")
    .children.filter((element) => element.tagName === "a");
  assert.equal(links.length, 6);
  assert.equal(appVersion.textContent, "Centrum Analiz Nieruchomości · wersja M3c");
  assert.equal(fake.document.getElementById("location-summary").textContent, "Nie wybrano lokalizacji");
  assert.equal(fake.document.getElementById("clear-location").listeners.get("click")?.length, 1);

  const expectedRequests = BACKEND_IDS.map((id) => ({
    url: BACKENDS[id].baseUrl + BACKENDS[id].healthPath,
    method: "GET",
  })).sort((a, b) => a.url.localeCompare(b.url));
  const actualRequests = requests.map(({ url, method }) => ({ url, method }))
    .sort((a, b) => a.url.localeCompare(b.url));
  assert.deepEqual(actualRequests, expectedRequests);

  for (const [id, code] of [["voiv", "28"], ["county", "2862"], ["commune", "2862011"]]) {
    const select = fake.document.getElementById("start-" + id);
    select.value = code;
    select.dispatch("change");
  }
  fake.document.getElementById("start-form").dispatch("submit");
  await new Promise((resolve) => setImmediate(resolve));

  assert.match(fake.document.getElementById("location-summary").textContent, /Wybrana lokalizacja: Olsztyn/,
    fake.document.getElementById("start-status").textContent);
  assert.match(fake.document.getElementById("start-map-caption").textContent, /Granica gminy/);
  assert.match(fake.window.location.hash, /\?ctx=/);

  fake.document.getElementById("clear-location").click();
  assert.equal(fake.document.getElementById("location-summary").textContent, "Nie wybrano lokalizacji");
  assert.doesNotMatch(fake.window.location.hash, /\?ctx=/);

  fake.window.location.hash = "#/rcn";
  fake.window.dispatch("hashchange");
  assert.ok(fake.document.querySelector("[data-rcn]"));
  assert.match(fake.document.getElementById("module-view").textContent, /Wczytywanie modułu RCN/);
  fake.window.location.hash = "#/gminy?ctx=%%%";
  fake.window.dispatch("hashchange");
  assert.equal(
    fake.document.getElementById("context-load-status").textContent,
    "Nie udało się wczytać lokalizacji z adresu",
  );
  assert.equal(requests.length, 4, "po inicjalizacji nie powinny wystąpić dodatkowe żądania");
});

