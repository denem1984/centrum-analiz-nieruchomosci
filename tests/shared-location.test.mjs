import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { decodeContext, encodeContext, validateContext } from "../app/js/context.js";
import { addressPoint, addressUrl, areaGeometry, areaUrl, createStartClient, displayStreetName } from "../app/js/location/start-client.js";
import { parcelParts, sharedSubject } from "../app/js/location/shared.js";

const base = {
  version: "2", source: "start", match: "exact",
  voivodeship: { code: "02", name: "dolnośląskie" },
  powiat: { code: "0201", name: "Powiat testowy" },
  gmina: { terc7: "0201015", name: "Gmina testowa", kind: null },
  canonicalGmina: { terc7: "0201013", name: "Gmina testowa" },
  bdlUnitId: "030210101031",
};
const place = { simc7: "0123450", name: "Miejscowość Testowa", terc7: "0201014" };
const street = { simc7: place.simc7, ulic5: "00002", name: "ul. Świerkowa", number: "1A" };
const address = { ...base, kind: "adres", place, street, point: { role: "address", crs: "EPSG:4326", lat: 51, lon: 17 } };

test("v2 zachowuje kody, powiązanie ulicy z SIMC i dokładność punktu w URL", () => {
  assert.deepEqual(decodeContext(encodeContext(address).encoded).context, address);
  assert.match(validateContext({ ...address, street: { ...street, simc7: "0123451" } }).reason, /zgodnego kodu/);
  assert.match(validateContext({ ...address, point: { ...address.point, role: "parcel" } }).reason, /dokładność/);
  assert.equal(sharedSubject({ ...address, point: { ...address.point, role: "area" } }), null);
  assert.deepEqual(sharedSubject(address).point, [51, 17]);
  assert.match(validateContext({ ...address, canonicalGmina: { ...base.canonicalGmina, terc7: "0201023" } }).reason, /nadrzędnej/);
});

test("działka i obręb muszą mieć zgodne identyfikatory, a arkusz zachowuje część AR", () => {
  const id = "020101_5.0001.AR_2.12/3";
  const parcel = { ...base, kind: "dzialka", district: { id: "020101_5.0001", name: "Testowy" }, parcel: { id } };
  assert.deepEqual(decodeContext(encodeContext(parcel).encoded).context, parcel);
  assert.deepEqual(parcelParts(id), { districtId: "020101_5.0001", number: "AR_2.12/3", terc: "0201015" });
  assert.equal(parcelParts("020101_5.0001.12/*"), null);
  assert.match(validateContext({ ...parcel, parcel: { id: "020101_5.0002.12/3" } }).reason, /nie odpowiada obrębowi/);
  assert.match(validateContext({ ...parcel, district: { id: "020101_4.0001", name: "Inny" } }).reason, /nie należy/);
});

test("przekazuje dokładne adresy PRG, UUG i istniejących zapytań ULDK", async () => {
  assert.equal(areaUrl("0201013"), "https://mapy.geoportal.gov.pl/wss/ims/maps/PRG_gugik_wyszukiwarka/FeatureServer/0/query?where=teryt%3D%270201013%27&outFields=teryt%2Cnazwa&returnGeometry=true&outSR=4326&f=json");
  assert.equal(addressUrl(place, street), "https://services.gugik.gov.pl/uug/?request=GetAddress&address=Miejscowo%C5%9B%C4%87+Testowa%2C+%C5%9Awierkowa+1A");
  assert.equal(displayStreetName("al. Aleja Warszawska"), "Aleja Warszawska");
  assert.equal(displayStreetName("ul. Świerkowa"), "ul. Świerkowa");
  const requests = [];
  const client = createStartClient({
    fetchImpl: async (url, { method }) => {
      assert.equal(method, "GET");
      requests.push(url);
      return new Response("0\n020101_4.0001.12/3|0201014|12/3|powiat|gmina|obręb|POLYGON((17 51,17.1 51,17 51.1,17 51))");
    },
  });
  await client.districts("0201015");
  assert.equal(await client.parcel("020101_5.0001", "12/3"), null);
  assert.deepEqual(requests, [
    "https://uldk.gugik.gov.pl/?request=GetRegionByNameOrId&id=020101_5&result=id%2Cteryt%2Cregion%2Ccommune%2Ccounty",
    "https://uldk.gugik.gov.pl/?request=GetParcelById&id=020101_5.0001.12%2F3&result=id%2Cteryt%2Cparcel%2Ccounty%2Ccommune%2Cregion%2Cgeom_wkt&srid=4326",
  ]);
});

test("wynik UUG wymaga dokładnego SIMC, ULIC i numeru oraz odrzuca dwuznaczne położenie", () => {
  const row = { simc: place.simc7, ulic: street.ulic5, number: "1a", x: "500100", y: "500000" };
  const project = ([x]) => [17 + (x - 500100) / 100_000, 51];
  assert.deepEqual(addressPoint({ results: { a: { ...row, simc: "0123451" }, b: row } }, place, street, project), address.point);
  assert.equal(addressPoint({ results: { a: row, b: { ...row, x: "500200" } } }, place, street, project), null);
  assert.equal(addressPoint({ results: { a: { ...row, number: null } } }, place, street, project), null);
  assert.equal(addressPoint({ results: { a: { ...row, ulic: "00003" } } }, place, street, project), null);
  const rings = [[[17, 51], [17.1, 51], [17, 51.1], [17, 51]]];
  assert.equal(areaGeometry({ spatialReference: { wkid: 2180 }, features: [] }, "0201013"), null);
  const payload = { spatialReference: { wkid: 4326 }, features: [{ attributes: { teryt: "0201013" }, geometry: { rings } }] };
  assert.deepEqual(areaGeometry(payload, "0201013").geometry.coordinates, rings);
  assert.equal(areaGeometry(payload, "0201012"), null);
});

test("opublikowane słowniki rozróżniają Olsztyn miejski i wiejski, zachowują polską pisownię i parę SIMC–ULIC", async () => {
  const get = async (name) => JSON.parse(await readFile(new URL("../app/data/location/" + name + ".json", import.meta.url), "utf8"));
  const [units, places, streets] = await Promise.all([get("units"), get("places-28"), get("streets-28")]);
  assert.equal(units.length, 4360);
  const matches = places.filter(([, name]) => name === "Olsztyn");
  assert.ok(matches.some(([simc, , terc]) => simc === "0964465" && terc === "2862011"));
  assert.ok(matches.every((row) => row[0].length === 7));
  const olsztyn = streets.find(([simc]) => simc === "0964465")[1];
  assert.ok(olsztyn.some(([ulic, name]) => ulic === "38564" && name.includes("Warszawska")));
  assert.ok(places.some(([, name]) => name.includes("Ł")));
});
