import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { BACKENDS } from "../app/js/config.js";
import { createOffersClient, searchValues } from "../app/js/modules/oferty/client.js";
import { createOffersDemoFetch } from "../app/js/modules/oferty/demo.js";
import { offersWorkbook } from "../app/js/modules/oferty/export.js";
import { comparison, normalizeResults, sortOffers } from "../app/js/modules/oferty/results.js";

const fields = { location: "Nowa Wieś", radius: "5", propertyType: "działka", mode: "range", min: "80", max: "120" };
const place = { name: "Nowa Wieś", teryt: "020101", simc: "0123020" };

test("arkusz ofert zachowuje zakres i kodowanie dokładnych tras wrappera", async () => {
  const requests = [];
  const client = createOffersClient({ fetchImpl: async (url, options) => {
    requests.push(url);
    assert.equal(options.method, "GET");
    assert.equal(options.credentials, "omit");
    const path = new URL(url).pathname;
    return Response.json(path.endsWith("suggestions") ? [place] : path.endsWith("combined") ? { offers: [] } : place);
  } });
  assert.deepEqual(await client.suggest("Nowa Wieś"), [place]);
  const resolved = await client.resolve(fields.location, place);
  await client.search(searchValues(fields), resolved);
  const origin = BACKENDS.Oferty.baseUrl;
  assert.deepEqual(requests, [
    origin + "/api/location-suggestions?q=Nowa%20Wie%C5%9B",
    origin + "/api/resolve-location?location=Nowa%20Wie%C5%9B&teryt=020101&simc=0123020",
    origin + "/api/live/combined?location=Nowa%20Wie%C5%9B&teryt=020101&simc=0123020&area=100&tolerance=20&radius=5&propertyType=dzia%C5%82ka",
  ]);
});

test("zachowuje kontrakt trybu bez filtra, tolerancji i dokładnego zakresu", () => {
  assert.equal(searchValues({ ...fields, mode: "none" }).tolerance, 9999);
  assert.equal(searchValues({ ...fields, mode: "percent", area: "83.5", tolerance: "10" }).area, 83.5);
  assert.equal(searchValues({ ...fields, min: "82.5", max: "82.5" }).tolerance, 0);
  assert.throws(() => searchValues({ ...fields, min: "150" }), /Od/);
  assert.throws(() => searchValues({ ...fields, min: "" }), /Od/);
});

test("nie podmienia wybranego SIMC i rozpoznaje błędne odpowiedzi", async () => {
  const client = createOffersClient({ fetchImpl: async () => Response.json({ ...place, simc: "0230112" }) });
  await assert.rejects(client.resolve(place.name, place), /inną miejscowość/);
  await assert.rejects(client.search(searchValues(fields), place), /listy ofert/);
  const broken = createOffersClient({ fetchImpl: async () => new Response("HTML", { status: 502 }) });
  await assert.rejects(broken.suggest("Olsztyn"), /nieczytelną/);
});

test("przyjmuje liczniki backendu, oznacza awarię portalu i sortuje braki na końcu", () => {
  const result = normalizeResults({
    beforeCrossDedup: 7, duplicatesRemoved: 2, unique: 5,
    sources: [{ portal: "Przykład", fetched: false, httpStatus: 503 }],
    offers: [{ price: null, priceM2: 0, url: "javascript:void(0)" }, { price: "200", url: "https://example.com/1" }, { price: 100 }],
  }, searchValues(fields), place);
  assert.deepEqual([result.filtered, result.duplicates, result.accepted], [7, 2, 5]);
  assert.equal(result.sources[0].failed, true);
  assert.equal(result.offers[0].url, "");
  assert.deepEqual(sortOffers(result.offers, "price", -1).map((offer) => offer.price), [200, 100, null]);
  assert.deepEqual(sortOffers(result.offers, "price", 1).map((offer) => offer.price), [100, 200, null]);
});

test("kalkulator uwzględnia tylko dodatnie stawki, zachowuje znak odchylenia", () => {
  const result = comparison([{ priceM2: 6000 }, { priceM2: 8000 }, { priceM2: 0 }], 630000, 100);
  assert.deepEqual({ ...result, difference: Math.round(result.difference) }, { mean: 7000, count: 2, rate: 6300, difference: -10 });
  assert.equal(comparison([{ priceM2: null }], 500000, 50).difference, null);
});

test("zapis i ponowny odczyt XLSX zachowuje polski adres, liczby i tekstowe pola", () => {
  const require = createRequire(import.meta.url);
  const xlsx = require("../app/vendor/oferty/sheetjs-0.20.3/xlsx.mini.min.js");
  assert.equal(xlsx.version, "0.20.3");
  const offers = [{ type: "Działka", location: "Zażółć, Łąkowa 2", source: "=test", url: "https://example.com/a", price: 230000, area: 550.25, priceM2: null }];
  const buffer = xlsx.write(offersWorkbook(xlsx, offers), { type: "buffer", bookType: "xlsx" });
  const actual = xlsx.read(buffer, { type: "buffer" }).Sheets["Wybrane oferty"];
  assert.equal(actual.C2.v, offers[0].location);
  assert.equal(actual.D2.t, "s");
  assert.equal(actual.D2.f, undefined);
  assert.equal(actual.F2.v, 230000);
  assert.equal(actual.G2.v, 550.25);
  assert.equal(actual.H2, undefined);
});

test("fikstury Ofert rozróżniają miejscowości o tej samej nazwie", async () => {
  const client = createOffersClient({ fetchImpl: createOffersDemoFetch() });
  const items = await client.suggest("Testowo");
  assert.equal(items.length, 2);
  assert.notEqual(items[0].simc, items[1].simc);
  assert.equal((await client.resolve("Testowo", items[1])).simc, "0102001");
});
