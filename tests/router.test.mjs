import test from "node:test";
import assert from "node:assert/strict";
import { hashForRoute, resolveRoute } from "../app/js/main.js";

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
});
