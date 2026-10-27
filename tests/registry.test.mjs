import test from "node:test";
import assert from "node:assert/strict";
import { BACKENDS } from "../app/js/config.js";
import { MODULES } from "../app/js/modules/registry.js";

test("rejestr ma komplet modułów i wymagane pola", () => {
  assert.deepEqual(MODULES.map((module) => module.id), [
    "start", "dzialki", "rcn", "oferty", "podobne", "gminy",
  ]);
  const ids = MODULES.map((module) => module.id);
  assert.equal(new Set(ids).size, ids.length);

  for (const module of MODULES) {
    assert.equal(typeof module.id, "string");
    assert.equal(typeof module.label, "string");
    assert.equal(typeof module.description, "string");
    assert.ok(module.backend === null || Object.hasOwn(BACKENDS, module.backend));
    assert.equal(typeof module.mount, "function");
  }

  assert.equal(MODULES.find((module) => module.id === "gminy").backend, null);
  assert.equal(MODULES.find((module) => module.id === "start").backend, null);
});
