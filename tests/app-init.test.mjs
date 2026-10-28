import test from "node:test";
import assert from "node:assert/strict";
import { createFakeDom } from "./helpers/fake-dom.mjs";

test("aplikacja startuje, renderuje zakładki i obsługuje kontekst bez sieci", async (t) => {
  const fake = createFakeDom();
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    fetch: globalThis.fetch,
  };
  const requests = [];
  globalThis.document = fake.document;
  globalThis.window = fake.window;
  globalThis.fetch = async (url, options = {}) => {
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
  assert.equal(fake.document.getElementById("location-summary").textContent, "Nie wybrano lokalizacji");
  assert.equal(fake.document.getElementById("clear-location").listeners.get("click")?.length, 1);

  const expectedRequests = BACKEND_IDS.map((id) => ({
    url: BACKENDS[id].baseUrl + BACKENDS[id].healthPath,
    method: "GET",
  })).sort((a, b) => a.url.localeCompare(b.url));
  const actualRequests = requests.map(({ url, method }) => ({ url, method }))
    .sort((a, b) => a.url.localeCompare(b.url));
  assert.deepEqual(actualRequests, expectedRequests);

  const locationSearch = fake.document.getElementById("location-query");
  locationSearch.value = "Testowo";
  locationSearch.dispatch("input");
  await new Promise((resolve) => setTimeout(resolve, 275));
  const option = fake.document.getElementById("location-results").querySelector('[role="option"]');
  assert.ok(option, "wyszukiwanie fikstury powinno narysować wynik");
  option.click();

  assert.match(fake.document.getElementById("location-summary").textContent, /Wybrana lokalizacja: Testowo/);
  assert.match(fake.window.location.hash, /\?ctx=/);

  fake.document.getElementById("clear-location").click();
  assert.equal(fake.document.getElementById("location-summary").textContent, "Nie wybrano lokalizacji");
  assert.doesNotMatch(fake.window.location.hash, /\?ctx=/);

  fake.window.location.hash = "#/gminy?ctx=%%%";
  fake.window.dispatch("hashchange");
  assert.equal(
    fake.document.getElementById("context-load-status").textContent,
    "Nie udało się wczytać lokalizacji z adresu",
  );
  assert.equal(requests.length, 4, "po inicjalizacji nie powinny wystąpić dodatkowe żądania");
});

