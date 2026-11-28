import test from "node:test";
import assert from "node:assert/strict";
import { prepareRcnRecords, recordKey } from "../app/js/modules/rcn/records.js";

const parcel = {
  transaction_id: "TX-U", local_id: "PARCEL-A", price: 20_000,
  price_source: "dzi_cena_brutto", area: 100, area_unit: "geometria_m2",
  price_m2: 200, analysis_included: true,
};

test("nie miesza cen działki z ceną aktu lub nieruchomości bez potwierdzonego zakresu", () => {
  const rows = prepareRcnRecords([
    parcel,
    { ...parcel, local_id: "PARCEL-B", price: 900_000, price_m2: 9_000, price_source: "tran_cena_brutto" },
    { ...parcel, local_id: "PARCEL-C", price: 300_000, price_m2: 3_000, price_source: "nier_cena_brutto" },
  ], "grunt_niezabudowany");
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((row) => row.price_m2), [200, null, null]);
  assert.deepEqual(rows.map((row) => row.price), [20_000, 900_000, 300_000]);
  assert.ok(rows.slice(1).every((row) => row.analysis_included === false));
  assert.equal(new Set(rows.map(recordKey)).size, 3);
  assert.equal(recordKey({ ...rows[0], distance_m: 150 }), recordKey(rows[0]));
  assert.notEqual(recordKey(prepareRcnRecords([parcel], "grunt_niezabudowany")[0]), recordKey(rows[0]));
  assert.ok(!JSON.stringify(rows[0]).includes("rcnRow"));
});

test("pomija udział, niepotwierdzoną jednostkę powierzchni i niespójny iloraz", () => {
  const rows = prepareRcnRecords([
    { ...parcel, raw_fields: { nier_udzial: " 1 / 2 " } },
    { ...parcel, area_raw: 82, area: 820_000, area_unit: "ha_przeliczone_na_m2", price_m2: 20_000 / 820_000 },
    { ...parcel, price_m2: 2_000, land_price_m2_aux: 2_000 },
  ], "grunt_niezabudowany");
  assert.deepEqual(rows.map((row) => row.price_m2), [null, null, null]);
  assert.equal(rows[1].area, null);
  assert.equal(rows[1].area_raw, 82);
  assert.equal(rows[2].land_price_m2_aux, null);
  assert.match(rows[0].analysis_note, /udziału/);
  assert.match(rows[1].analysis_note, /konturu/);
  assert.match(rows[2].analysis_note, /nie zgadza/);
});

const built = {
  transaction_id: "TX-B", price: 900_000, price_source: "tran_cena_brutto", analysis_included: true,
  parcel_area_complete: true, area: 1_000, building_count: 2, building_area_basis: "usable",
  building_area: 180, building_area_complete: true, building_area_count: 2, building_price_m2: 5_000,
};

test("pilnuje zakresu transakcji, kompletności powierzchni i podstawy stawki zabudowanej", () => {
  const cases = [
    built,
    { ...built, building_area_basis: "estimated_footprint_floors", building_estimated_area: 150,
      building_estimated_area_complete: true, building_estimated_area_count: 2, building_price_m2: 6_000 },
    { ...built, building_area_complete: false, building_area_count: 1 },
    { ...built, parcel_area_complete: false },
    { ...built, transaction_id: "" },
    { ...built, price_source: "nier_cena_brutto" },
    { ...built, ownership_share: "1/2" },
    { ...built, building_price_m2: null, price_m2: 900 },
  ];
  const rows = prepareRcnRecords(cases, "grunt_zabudowany");
  assert.deepEqual(rows.map((r) => r.price_m2), [5000, 6000, null, null, null, null, null, null]);
  assert.deepEqual(rows.map((r) => r.building_price_m2), rows.map((r) => r.price_m2));
  assert.deepEqual(rows.map((r) => r.price), Array(8).fill(900_000));
  assert.equal(rows[3].area, null);
  assert.ok(rows.slice(2).every((r) => r.analysis_included === false));
});

test("zachowuje prawidłową stawkę lokalu i nie zamienia pustej wartości na zero", () => {
  const rows = prepareRcnRecords([{ price_m2: "7400" }, { price_m2: " " }, { price_m2: 0 }, null], "lokale");
  assert.deepEqual(rows.map((r) => r.price_m2), [7400, null, null]);
});
