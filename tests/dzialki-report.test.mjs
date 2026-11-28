import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { collectReportParcel, reportMapLegends } from "../app/js/modules/dzialki/report-data.js";
import { getDzialkiState } from "../app/js/modules/dzialki/state.js";
import { buildMapClickFeatureInfoUrl } from "../app/js/modules/dzialki/egib-layers.js";
import { buildParcelUrl } from "../app/js/modules/dzialki/search.js";
import { buildMpzpInfoUrl, buildDzinfoUrl } from "../app/js/modules/dzialki/planning-services.js";

test("raport mapowy korzysta ze sprawdzonych URL-i i jawnie oznacza niepełny MPZP", async () => {
  const point = { lat: 53.15, lng: 16.74 };
  const id = "998877_2.0001.12/3";
  const responses = new Map([
    [buildMapClickFeatureInfoUrl(point), { text: async () =>
      '<FeatureInfoResponse><Attribute Name="Identyfikator działki">' + id + '</Attribute><Attribute Name="Pole pow. w ewidencji gruntów">0,1234 ha</Attribute></FeatureInfoResponse>' }],
    [buildParcelUrl("998877_2.0001", "12/3"), { text: async () =>
      "0\n" + id + "|998877_2|12/3|Powiat Łącki|Łąki Żółte|Śródmieście|POLYGON((16 53,17 53,17 54,16 53))" }],
    [buildMpzpInfoUrl(point, "998877"), { json: async () => ({ plans: [{ tytul: "Fikcyjny plan" }] }) }],
    [buildDzinfoUrl(id), { ok: false, status: 503 }],
  ]);
  const visited = [];
  const fetchImpl = async (url, options) => {
    assert.equal(options.method, "GET");
    assert.ok(responses.has(url), url);
    visited.push(url);
    return { ok: true, ...responses.get(url) };
  };
  const parcel = await collectReportParcel({ point, signal: new AbortController().signal, fetchImpl });
  assert.equal(parcel.id, id);
  const fields = Object.fromEntries(parcel.fields);
  assert.equal(fields.Gmina, "Łąki Żółte");
  assert.equal(fields.Powierzchnia, "0,1234 ha");
  assert.match(fields["Zagospodarowanie (MPZP)"], /Fikcyjny plan\nWynik niepełny/);
  assert.deepEqual(new Set(visited), new Set(responses.keys()));
  assert.equal(await collectReportParcel({ point, fetchImpl: async () => ({ ok: true, text: async () => "<FeatureInfoResponse/>" }) }), null);
  await assert.rejects(() => collectReportParcel({ point, fetchImpl: async () => ({ ok: true, text: async () => "<ServiceExceptionReport/>" }) }));
});

test("lokalna czcionka i biblioteka PDF zachowują zgodność z przypiętymi zasobami", async () => {
  for (const [name, hash] of [
    ["jspdf.umd.min.js", "e6551fcdc32f09d6853b2c5126d18d01d9447e0da618a41a11ebeee0f6c20d54"],
    ["NotoSans-Regular.ttf", "f5f552c8c5edb61fe6efb824baf4d4de47b1a8689ab4925ff43f7bd6a4ebece5"],
  ]) {
    const bytes = await readFile(new URL("../app/vendor/dzialki/pdf/" + name, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), hash);
  }
});

test("raport odróżnia legendy MPZP od POG dla każdego zapisanego widoku", () => {
  const state = getDzialkiState();
  assert.deepEqual(reportMapLegends(state, "MN - test"), []);
  for (const key of ["pogAdopted", "pogDraftRu", "pogDraftGugik"]) {
    const pog = { ...state, planningLayers: { [key]: true } };
    const legends = reportMapLegends(pog, "MN - test");
    assert.equal(legends.length, 1);
    assert.match(legends[0].label, /POG/);
    assert.match(legends[0].rows[2][1], /^SJ - strefa/);
    assert.equal(legends[0].rows.length, 14);
  }
  assert.match(reportMapLegends({ ...state, planningLayers: { mpzp: true } }, "MN - test")[0].label, /MPZP/);
  assert.deepEqual(reportMapLegends({ ...state, planningLayers: { mpzp: true, pogAdopted: true, pogDraftGugik: true } }, "MN")
    .map(legend => legend.label), ["Orientacyjne oznaczenia MPZP", "Oznaczenia stref planu ogólnego (POG)"]);
});
