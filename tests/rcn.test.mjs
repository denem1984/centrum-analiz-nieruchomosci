import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { BACKENDS } from "../app/js/config.js";
import { createRcnClient, rcnRequestUrl } from "../app/js/modules/rcn/client.js";
import { createRcnDemo } from "../app/js/modules/rcn/demo.js";

const base = BACKENDS.RCN.baseUrl;
const getPaths = [
  "/api/teryt/voivodeships",
  "/api/teryt/powiaty?voivodeship=warmi%C5%84sko-mazurskie",
  "/api/teryt/gminy?voivodeship=warmi%C5%84sko-mazurskie&powiat=piski",
  "/api/teryt/miejscowosci?voivodeship=warmi%C5%84sko-mazurskie&powiat=piski&gmina=Bia%C5%82a%20Piska&gmina_teryt=281601",
  "/api/geocode?city=Bia%C5%82a+Piska&gmina=Bia%C5%82a+Piska&powiat=piski&voivodeship=warmi%C5%84sko-mazurskie&teryt=281601",
  "/api/place_suggest?q=Bia%C5%82a%20Piska",
  "/api/search?layer=dzialki&land_record_mode=unbuilt_land&city=Pisz&only_with_price=true&use_radius=true&center_lat=53.63&center_lon=21.8&radius_m=500",
];

test("RCN używa dokładnych widocznych tras starego frontu na obecnym originie", () => {
  for (const path of getPaths) assert.equal(rcnRequestUrl(path), base + path);
  for (const path of ["/api/export_current.xlsx", "/api/export_current.docx"]) {
    assert.equal(rcnRequestUrl(path, "POST"), base + path);
    assert.throws(() => rcnRequestUrl(path));
  }
  const reverse = "https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=53.63&lon=21.8&zoom=10&addressdetails=1";
  assert.equal(rcnRequestUrl(reverse), reverse);
  assert.throws(() => rcnRequestUrl("/api/nieobslugiwana"));
  assert.throws(() => rcnRequestUrl("https://example.org/api/search"));
  assert.throws(() => rcnRequestUrl("/api/search", "POST"));
});

test("transport RCN zachowuje ciało eksportu, pomija poświadczenia i anuluje żądanie z widokiem", async () => {
  const lifecycle = new AbortController();
  const client = createRcnClient({
    signal: lifecycle.signal,
    fetchImpl: async (url, options) => {
      assert.equal(url, base + "/api/export_current.docx");
      assert.equal(options.method, "POST");
      assert.equal(options.credentials, "omit");
      assert.deepEqual(JSON.parse(options.body), { records: [{ address: "Przykładowa" }], params: { city: "Pisz" } });
      lifecycle.abort();
      options.signal.throwIfAborted();
    },
  });
  await assert.rejects(() => client("/api/export_current.docx", {
    method: "POST",
    body: JSON.stringify({ records: [{ address: "Przykładowa" }], params: { city: "Pisz" } }),
  }), { name: "AbortError" });
});

test("przykładowe wyszukiwanie RCN zwraca tylko wskazaną miejscowość i ulicę", async () => {
  const fetch = createRcnDemo();
  const { records } = await (await fetch("/api/search?layer=lokale&city=Olsztyn&street=przykladowa")).json();
  assert.equal(records.length, 6);
  assert.ok(records.every(({ address, city }) => city === "Olsztyn" && address.includes("Przykładowa")));
  const built = await (await fetch("/api/search?layer=dzialki&land_record_mode=built_land&gmina=Pisz")).json();
  assert.deepEqual(new Set(built.records.map(({ building_area_basis }) => building_area_basis)),
    new Set(["usable", "estimated_footprint_floors"]));
});

test("lokalny Chart.js odpowiada zweryfikowanej wersji użytej w RCN", async () => {
  const script = await readFile(new URL("../app/vendor/rcn/chartjs-4.5.1/chart.umd.min.js", import.meta.url));
  assert.equal(createHash("sha256").update(script).digest("base64"), "SERKgtTty1vsDxll+qzd4Y2cF9swY9BCq62i9wXJ9Uo=");
});
