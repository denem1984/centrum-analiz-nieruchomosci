import test from "node:test";
import assert from "node:assert/strict";
import { decodeContextFromHash, formatLocationSummary, hashForRoute, resolveRoute } from "../app/js/main.js";

test("router rozpoznaje znane hashe zakładek", () => {
  for (const route of ["start", "dzialki", "rcn", "oferty", "podobne", "gminy"]) {
    assert.equal(resolveRoute("#/" + route), route);
    assert.equal(hashForRoute(route), "#/" + route);
  }
});

test("pusty i nieznany hash prowadzą do Start", () => {
  assert.equal(resolveRoute(""), "start");
  assert.equal(resolveRoute("#/nieznany"), "start");
  assert.equal(resolveRoute("#/gminy/extra"), "start");
  assert.equal(hashForRoute("nieznany"), "#/start");
  assert.equal(resolveRoute("#/gminy?ctx=abc123"), "gminy");
  assert.equal(hashForRoute("rcn", "abc123"), "#/rcn?ctx=abc123");
});

test("router odczytuje ctx z hash, ignoruje query przy trasie i pokazuje pasek lokalizacji", () => {
  const encoded = Buffer.from("{\"version\":\"1\",\"source\":\"start\",\"kind\":\"gmina\",\"match\":\"exact\",\"name\":\"Testowo\",\"voivodeship\":{\"code\":\"98\",\"name\":\"Drugie testowe województwo\"},\"powiat\":{\"code\":\"9898\",\"name\":\"Łąkowy powiat\"},\"gmina\":{\"terc7\":\"9898993\",\"name\":\"Testowo\",\"kind\":3}}", "utf8").toString("base64url");
  const result = decodeContextFromHash("#/gminy?ctx=" + encoded);
  assert.equal(result.present, true);
  assert.equal(result.context.gmina.terc7, "9898993");
  assert.equal(resolveRoute("#/gminy?ctx=" + encoded), "gminy");
  assert.match(formatLocationSummary(result.context), /Wybrana lokalizacja: Testowo/);
  assert.match(formatLocationSummary(result.context), /gmina: Testowo/);
  assert.match(formatLocationSummary(result.context), /powiat: Łąkowy powiat/);
  assert.match(formatLocationSummary(result.context), /województwo: Drugie testowe województwo/);
  assert.equal(decodeContextFromHash("#/gminy?ctx=%25%25").context, null);
});



