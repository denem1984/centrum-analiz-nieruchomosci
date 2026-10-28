import test from "node:test";
import assert from "node:assert/strict";
import { validateContext } from "../app/js/context.js";
import { FIXTURE_CANDIDATES } from "../app/js/location/fixtures.js";
import { normalizeQuery } from "../app/js/location/normalize.js";
import { fixtureProvider, selectedCandidateContext } from "../app/js/location/provider.js";

test("normalizacja usuwa polskie znaki diakrytyczne i zwija spacje", () => {
  assert.equal(normalizeQuery("  Łódź  "), "lodz");
  assert.equal(normalizeQuery("  GMINA   ŻÓŁĆ "), "gmina zolc");
});

test("fikstury rozróżniają tę samą nazwę, rodzaj i powiat", async () => {
  const results = await fixtureProvider.search("Przykładowice");
  assert.equal(results.length, 3);
  assert.ok(results.every((candidate) => candidate.test === true));
  assert.ok(results.every((candidate) => candidate.match === "ambiguous"));
  assert.equal(new Set(results.map((candidate) => candidate.label)).size, 3);
  assert.ok(results.some((candidate) => candidate.gmina.kind === 1));
  assert.ok(results.some((candidate) => candidate.gmina.kind === 2));
  assert.ok(results.some((candidate) => candidate.powiat.code === "9998"));
});

test("wyszukiwanie fikstury obsługuje polskie znaki, brak wyników i limit", async () => {
  const diacritics = await fixtureProvider.search("lodkow");
  assert.equal(diacritics[0].place.name, "Łódków");
  assert.deepEqual(await fixtureProvider.search("nie-ma-takiej-lokalizacji"), []);
  assert.equal((await fixtureProvider.search("Przykładowice", { limit: 2 })).length, 2);
});

test("wybór kandydata zmienia match na exact i tworzy ważny kontekst", async () => {
  const [candidate] = await fixtureProvider.search("Testowo");
  const selected = selectedCandidateContext(candidate);
  assert.equal(selected.reason, null);
  assert.equal(selected.context.match, "exact");
  assert.equal(selected.context.source, "start");
  assert.equal(selected.context.gmina.terc7, candidate.gmina.terc7);
});




test("wszystkie fikstury spełniają walidację spójności kodów", () => {
  assert.ok(FIXTURE_CANDIDATES.length <= 30);
  for (const candidate of FIXTURE_CANDIDATES) {
    assert.equal(candidate.test, true);
    assert.ok(validateContext(candidate).context, candidate.label);
  }
});


