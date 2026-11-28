import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { demoMunicipalities } from "../app/js/modules/gminy/demo.js";
import { findMunicipalities, INDICATORS, percentile, rankMunicipalities, readMunicipalities } from "../app/js/modules/gminy/model.js";
import { createGminyPdf } from "../app/js/modules/gminy/pdf.js";

const data = readMunicipalities(demoMunicipalities, { demo: true });
const subject = data.municipalities.find(({ name }) => name === "Żurawin");

test("percentyle zachowują średnią dla remisów oraz 50 dla pojedynczej gminy", () => {
  assert.deepEqual(percentile([4, 4, 10, 0, 6]), [37.5, 37.5, 100, 0, 75]);
  assert.deepEqual(percentile([4]), [50]);
  assert.deepEqual(percentile([]), []);
});

test("ranking liczy percentyle od nowa w wybranym zakresie i zachowuje profile źródłowe", () => {
  const a = rankMunicipalities(data.full, subject, { profile: "dzialki", same: false, scope: "country" });
  const b = rankMunicipalities(data.full, subject, { profile: "domy", same: true, scope: "voivodeship" });
  const c = rankMunicipalities(data.full, subject, { profile: "lokale", same: false, scope: "country" });
  assert.deepEqual(b.weights, [12, 20, 18, 20, 12, 6, 12]);
  assert.deepEqual(a.weights, [15, 20, 15, 20, 12, 8, 10]);
  assert.deepEqual(c.weights, [22, 13, 15, 18, 12, 8, 12]);
  assert.equal(a.results.length, 23);
  assert.equal(b.results.length, 4);
  assert.ok(b.results.every((row) => row.terc !== subject.terc && row.kind === subject.kind && row.voivodeshipCode === "28"));
  const candidate = b.results[0];
  assert.notDeepEqual(candidate.scores, a.results.find((row) => row.terc === candidate.terc).scores);
  assert.ok(a.results.every((row, index) => index === 0 || row.score <= a.results[index - 1].score));
  assert.equal(candidate.score, candidate.scores.reduce((sum, value, i) => sum + value * b.weights[i], 0) / 100);
});

test("identyfikatory BDL i TERC zachowują zera, a niekompletna gmina pozostaje dostępna w słowniku", () => {
  const snapshot = structuredClone(demoMunicipalities);
  snapshot.rows[0][4][2] = null;
  snapshot.complete -= 1;
  snapshot.excluded += 1;
  const parsed = readMunicipalities(snapshot, { demo: true });
  const [missing] = findMunicipalities(parsed.municipalities, "przykladowo 01");
  assert.equal(missing.name, "Przykładowo");
  assert.equal(missing.complete, false);
  assert.equal(findMunicipalities(parsed.municipalities, missing.id)[0].terc, missing.terc);
  assert.equal(findMunicipalities(parsed.municipalities, "zurawin")[0].id.startsWith("01"), true);
  assert.ok(parsed.full.every(({ terc }) => terc !== missing.terc));
  assert.throws(() => readMunicipalities(snapshot), /strukturę/);
  snapshot.rows[1][1] = snapshot.rows[0][1];
  assert.throws(() => readMunicipalities(snapshot, { demo: true }), /niespójne/);
});

test("zmiana typu gminy zachowuje kod bieżący i klasyfikację z roku wskaźników", () => {
  const snapshot = structuredClone(demoMunicipalities);
  const row = snapshot.rows[0];
  row[0] = "0601053";
  row[1] = "060610901052";
  row[5] = "0601052";
  const parsed = readMunicipalities(snapshot, { demo: true });
  const [current] = findMunicipalities(parsed.municipalities, "0601053");
  assert.equal(findMunicipalities(parsed.municipalities, "0601052")[0], current);
  assert.equal(current.referenceTerc, "0601052");
  assert.equal(current.kind, "2");
});

test("PDF porównania tworzy po jednej stronie na gminę i rozróżnia wartości oraz wagi", async () => {
  const JsPDF = createRequire(import.meta.url)("../app/vendor/dzialki/pdf/jspdf.umd.min.js").jsPDF;
  const fontUrl = new URL("../app/vendor/dzialki/pdf/NotoSans-Regular.ttf", import.meta.url);
  const font = (await readFile(fontUrl)).toString("base64");
  const analysis = rankMunicipalities(data.full, subject, { profile: "dzialki", same: false, scope: "country" });
  const doc = createGminyPdf(JsPDF, font, { analysis, rows: analysis.results.slice(0, 2), source: data.source, year: data.year });
  assert.equal(doc.getNumberOfPages(), 2);
  assert.match(doc.output(), /^%PDF/);
  assert.ok(doc.output().length > 10_000);
  assert.equal(INDICATORS.length, 7);
});
