import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { BACKENDS } from "../app/js/config.js";
import { addressCandidates, createSimilarClient, parcelFromResponse, similarUrls } from "../app/js/modules/podobne/client.js";
import { demoSimilarFetch } from "../app/js/modules/podobne/demo.js";
import { distanceLabel, formatDate, formatPrice, SATELLITE_TILES, STREET_TILES } from "../app/js/modules/podobne/map.js";

test("Podobne zachowuje pełne URL-e PRG, obrębów i ULDK", async () => {
  const requests = [];
  const client = createSimilarClient({ fetchImpl: (url, options) => {
    assert.equal(options.method, "GET");
    requests.push(url);
    return demoSimilarFetch(url, options);
  } });
  assert.deepEqual(await client.counties(), [{ code: "2862", name: "Olsztyn" }]);
  await client.counties();
  await client.communes("2862");
  await client.regions("2862011");
  const parcel = await client.parcel("286201_1.0001", "12/3", "Przykładowy");
  assert.equal(parcel.id, "286201_1.0001.12/3");
  assert.ok(Math.abs(parcel.point[0] - 53.7855) < 0.00001);
  assert.deepEqual(requests.map((url) => url.replace(BACKENDS.Podobne.baseUrl, "")), [
    "/api/prg/1/query?where=1%3D1&outFields=teryt%2Cnazwa&returnGeometry=false&f=json",
    "/api/prg/0/query?where=teryt+LIKE+%272862%25%27&outFields=teryt%2Cnazwa&returnGeometry=false&f=json",
    "/api/regions?teryt=2862011",
    "/api/uldk?request=GetParcelByIdOrNr&id=286201_1.0001.12%2F3&result=id%2Cparcel%2Cregion%2Ccommune%2Ccounty%2Cvoivodeship%2Cgeom_wkt&srid=4326",
  ]);
  assert.throws(() => similarUrls().communes("28'81"), /Wybierz powiat/);
});

test("wyszukiwanie awaryjne ULDK odrzuca działkę z innego obrębu", async () => {
  const polygon = "POLYGON((20 53,20.1 53,20.1 53.1,20 53.1,20 53))";
  const requests = [];
  const client = createSimilarClient({ fetchImpl: (url) => {
    requests.push(new URL(url).searchParams.get("id"));
    return new Response("0\n286201_1.0002.12/3|12/3|Przykładowy|Olsztyn|||SRID=4326;" + polygon);
  } });
  assert.equal(parcelFromResponse("0\n286201_1.0001.12/3|12/3|||||SRID=2180;" + polygon, "286201_1.0001.12/3"), null);
  await assert.rejects(client.parcel("286201_1.0001", "12/3", "Przykładowy"), /wybranym obrębie/);
  assert.deepEqual(requests, ["286201_1.0001.12/3", "Przykładowy 12/3"]);
});

test("adres GUGiK jest kodowany oraz przeliczany z EPSG:2180; kilka wyników zachowuje się do wyboru", async () => {
  const proj4 = createRequire(import.meta.url)("../app/vendor/dzialki/proj4-2.9.0/proj4.js");
  const { loadPlanningProjection } = await import("../app/js/modules/dzialki/planning-projection.js");
  const project = () => loadPlanningProjection({}, { proj4 }, { inverse: true });
  const rows = [
    { city: "Marki", street: "Andersa", number: "1", x: "644234.29", y: "499514.03" },
    { city: "Marki", street: "Andersa", x: "644240", y: "499525" },
    { city: "Brak geometrii", x: null },
  ];
  const client = createSimilarClient({ project, fetchImpl(url) {
    assert.equal(url, "https://services.gugik.gov.pl/uug/?request=GetAddress&address=Marki%2C+Andersa+1");
    return Response.json({ results: Object.fromEntries(rows.map((row, index) => [index + 1, row])) });
  } });
  const locations = await client.address("Marki, Andersa 1");
  assert.deepEqual(locations.map((location) => location.title), ["Marki, Andersa 1", "Marki, Andersa"]);
  const [lat, lon] = locations[0].point;
  assert.ok(lat > 52.31 && lat < 52.35 && lon > 21.1 && lon < 21.15);
  assert.match(locations[1].detail, /orientacyjny ulicy/);
  assert.deepEqual(addressCandidates({ results: [] }, () => []), []);
});

test("etykiety pokazują cenę, datę i zaokrągloną odległość; zachowano oba podkłady", () => {
  assert.match(formatPrice("565 000,25"), /565\s000,25\s*zł/);
  assert.equal(formatPrice("123abc"), "");
  assert.equal(formatDate("2026-03-24"), "24.03.2026");
  assert.equal(distanceLabel(125.2), "125 m");
  assert.equal(distanceLabel(1250), "1,3 km");
  assert.match(STREET_TILES, /\/World_Street_Map\/MapServer\/tile\/\{z\}\/\{y\}\/\{x\}$/);
  assert.match(SATELLITE_TILES, /\/World_Imagery\/MapServer\/tile\/\{z\}\/\{y\}\/\{x\}$/);
});
