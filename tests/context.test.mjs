import test from "node:test";
import assert from "node:assert/strict";
import {
  createContextStore,
  decodeContext,
  emptyContext,
  encodeContext,
  validateContext,
} from "../app/js/context.js";

function validGmina(overrides = {}) {
  return {
    version: "1",
    source: "start",
    kind: "gmina",
    match: "exact",
    name: "Przykładowice",
    voivodeship: { code: "01", name: "Testowe województwo" },
    powiat: { code: "0101", name: "Powiat testowy" },
    gmina: { terc7: "0101202", name: "Przykładowice", kind: 2 },
    ...overrides,
  };
}

test("walidator zachowuje kody jako tekst, w tym zera wiodące", () => {
  const result = validateContext(validGmina({ bdlUnitId: "000000000001" }));
  assert.equal(result.context.voivodeship.code, "01");
  assert.equal(result.context.powiat.code, "0101");
  assert.equal(result.context.gmina.terc7, "0101202");
  assert.equal(result.context.bdlUnitId, "000000000001");
});

test("walidator odrzuca kody liczbowe, błędne długości i typ gmina.kind", () => {
  assert.match(validateContext(validGmina({ voivodeship: { code: 1, name: "Test" } })).reason, /tekst/);
  assert.match(validateContext(validGmina({ powiat: { code: "012", name: "Test" } })).reason, /długość/);
  assert.match(validateContext(validGmina({ gmina: { terc7: "0101202", name: "Test", kind: "2" } })).reason, /kind/);
  assert.match(validateContext(validGmina({ bdlUnitId: "123" })).reason, /długość/);
});

test("nieznane pola są ignorowane, a wynik zawiera tylko rozpoznany kształt", () => {
  const result = validateContext({
    ...validGmina(),
    extension: "ignored",
    gmina: { ...validGmina().gmina, newCode: "ignored" },
  });
  assert.equal(result.context.extension, undefined);
  assert.equal(result.context.gmina.newCode, undefined);
});

test("brak wymaganych pól dla rodzaju lokalizacji unieważnia kontekst", () => {
  const missingGmina = validGmina();
  delete missingGmina.gmina;
  assert.match(validateContext(missingGmina).reason, /wymagane/);
  assert.match(validateContext({
    version: "1", source: "start", kind: "miejscowosc", match: "exact",
    voivodeship: { code: "01", name: "Test" },
    powiat: { code: "0101", name: "Test" },
    gmina: { terc7: "0101202", name: "Test", kind: null },
  }).reason, /place/);
  assert.match(validateContext({ version: "1", source: "start", kind: "dzialka", match: "exact" }).reason, /parcel/);
  assert.match(validateContext({ version: "1", source: "start", kind: "punkt", match: "exact" }).reason, /point/);
});

test("JSON kontekstu ma limit 2048 bajtów po UTF-8", () => {
  const long = "Ż".repeat(500);
  const result = validateContext(validGmina({
    name: long,
    voivodeship: { code: "01", name: long },
    powiat: { code: "0101", name: long },
    gmina: { terc7: "0101202", name: long, kind: 2 },
    place: { simc7: "0000001", name: long },
    kind: "miejscowosc",
  }));
  assert.equal(result.context, null);
  assert.match(result.reason, /2048/);
});

test("punkt wymaga WGS84 i współrzędnych w zakresie Polski", () => {
  const point = {
    version: "1", source: "start", kind: "punkt", match: "exact",
    point: { lat: 52.1, lon: 21.0, crs: "EPSG:4326" },
  };
  assert.ok(validateContext(point).context);
  assert.match(validateContext({ ...point, point: { ...point.point, lat: 48.4 } }).reason, /zakresem Polski/);
  assert.match(validateContext({ ...point, point: { ...point.point, lon: 24.6 } }).reason, /zakresem Polski/);
  assert.match(validateContext({ ...point, point: { ...point.point, crs: "EPSG:3857" } }).reason, /EPSG:4326/);
});

test("encode → decode round-trip zachowuje kody i pola kontekstu", () => {
  const source = validGmina({ place: { simc7: "0000456", name: "Łódków" } });
  const encoded = encodeContext(source);
  assert.ok(encoded.encoded);
  const decoded = decodeContext(encoded.encoded);
  assert.equal(decoded.reason, null);
  assert.equal(decoded.context.gmina.terc7, "0101202");
  assert.equal(decoded.context.place.simc7, "0000456");
  assert.equal(decoded.context.place.name, "Łódków");
});

test("dekoder odrzuca błędny base64url, JSON oraz zbyt długi input bez wyjątku", () => {
  assert.equal(decodeContext("!").context, null);
  assert.ok(decodeContext("bm90IGpzb24").reason);
  assert.ok(decodeContext("A".repeat(3000)).reason);
  assert.doesNotThrow(() => decodeContext("%%%"));
});

test("pusty kontekst i magazyn obsługują subscribe, set i clear", () => {
  const store = createContextStore();
  const seen = [];
  const unsubscribe = store.subscribe((value) => seen.push(value));
  assert.equal(emptyContext().kind, "nieokreslona");
  assert.equal(store.set(validGmina()).reason, null);
  assert.equal(store.get().gmina.terc7, "0101202");
  store.clear();
  assert.equal(store.get().kind, "nieokreslona");
  assert.equal(seen.length, 2);
  unsubscribe();
  store.clear();
  assert.equal(seen.length, 2);
});



test("walidator odrzuca niespójne prefiksy województwa, powiatu i gminy", () => {
  assert.ok(validateContext(validGmina()).context);

  const mismatchedPowiat = validGmina({
    powiat: { code: "0201", name: "Powiat testowy" },
  });
  assert.match(validateContext(mismatchedPowiat).reason, /prefiksu kodu województwa/);

  const mismatchedGmina = validGmina({
    gmina: { terc7: "0201202", name: "Przykładowice", kind: 2 },
  });
  assert.match(validateContext(mismatchedGmina).reason, /prefiksu kodu powiatu/);
});

test("hipoteza rodzaju gminy wiąże nie-null kind z ostatnią cyfrą TERC7", () => {
  const mismatch = validGmina({
    gmina: { terc7: "0101203", name: "Przykładowice", kind: 2 },
  });
  assert.match(validateContext(mismatch).reason, /^\[HIP\]/);

  for (const ending of ["4", "5", "8", "9"]) {
    const context = validGmina({
      gmina: { terc7: "010120" + ending, name: "Przykładowice", kind: null },
    });
    assert.ok(validateContext(context).context, "końcówka " + ending + " z kind=null");
  }
});

