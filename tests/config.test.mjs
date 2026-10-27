import test from "node:test";
import assert from "node:assert/strict";
import { BACKENDS } from "../app/js/config.js";
import { ALLOWLIST, ALLOWED_METHODS } from "../scripts/m1-probe.mjs";

test("trasy zdrowia i metody zgadzają się z allowlistą sond", () => {
  assert.deepEqual(ALLOWED_METHODS, ["GET", "OPTIONS"]);
  for (const [id, backend] of Object.entries(BACKENDS)) {
    assert.equal(backend.id, id);
    const allowed = ALLOWLIST[id]?.[backend.healthPath];
    assert.ok(allowed, "brak ścieżki w allowliście: " + id);
    assert.ok(allowed.methods.includes("GET"), "brak GET w allowliście: " + id);
    const getPaths = Object.entries(ALLOWLIST[id])
      .filter(([, rules]) => rules.methods.includes("GET"))
      .map(([path]) => path);
    assert.deepEqual(getPaths, [backend.healthPath]);
  }
});
