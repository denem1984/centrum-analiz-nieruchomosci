import test from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWED_METHODS,
  ALLOWLIST,
  assertAllowedRequest,
  buildProbeUrl,
  parseProbeResponse,
  requestProbe,
} from "./m1-probe.mjs";

test("allowlist contains only approved methods and fixed lightweight paths", () => {
  assert.deepEqual(ALLOWED_METHODS, ["GET", "OPTIONS"]);
  assert.deepEqual(Object.fromEntries(Object.entries(ALLOWLIST).map(([name, entry]) => [name, entry.path])), {
    RCN: "/",
    Oferty: "/health",
    Dzialki: "/health",
    Podobne: "/api/health",
  });
});

test("response parser keeps only approved CORS and cache headers", () => {
  const headers = new Headers({
    "Access-Control-Allow-Origin": "https://example.org",
    "Access-Control-Allow-Methods": "GET",
    "Cache-Control": "no-store",
    "Set-Cookie": "session=should-not-appear",
    "X-Api-Key": "must-not-appear",
  });
  const parsed = parseProbeResponse(204, headers, 12.345, "2026-10-26T12:00:00Z");
  assert.equal(parsed.httpStatus, 204);
  assert.equal(parsed.elapsedMs, 12.35);
  assert.deepEqual(parsed.headers, {
    "access-control-allow-origin": "https://example.org",
    "access-control-allow-methods": "GET",
    "cache-control": "no-store",
  });
  assert.ok(!JSON.stringify(parsed).includes("should-not-appear"));
  assert.ok(!JSON.stringify(parsed).includes("must-not-appear"));
});

test("OPTIONS sends the exact preflight headers using a mocked fetch", async () => {
  let called = false;
  const result = await requestProbe({
    service: "RCN",
    baseUrl: "https://api.example.invalid",
    method: "OPTIONS",
    path: "/",
    fetchImpl: async (url, init) => {
      called = true;
      assert.equal(url.href, "https://api.example.invalid/");
      assert.equal(init.method, "OPTIONS");
      assert.equal(init.redirect, "manual");
      assert.deepEqual(init.headers, {
        Origin: "https://example.org",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization",
      });
      return { status: 204, headers: new Headers(), body: { cancel: async () => {} } };
    },
    now: (() => { let value = 0; return () => (value += 3); })(),
    dateNow: () => new Date("2026-10-26T12:00:00Z"),
  });
  assert.equal(called, true);
  assert.equal(result.httpStatus, 204);
});

test("prohibited method and path are rejected before fetch", async () => {
  let called = false;
  assert.throws(() => assertAllowedRequest("Oferty", "POST", "/health"), /allowlist/);
  await assert.rejects(
    requestProbe({
      service: "Oferty",
      baseUrl: "https://api.example.invalid",
      method: "GET",
      path: "/api/live/combined",
      fetchImpl: async () => { called = true; throw new Error("must not run"); },
    }),
    /allowlist/
  );
  assert.equal(called, false);
});

test("base URL cannot smuggle a path, credentials, query, or fragment", () => {
  assert.throws(() => buildProbeUrl("https://api.example.invalid/nested", "RCN", "/"), /base URL/);
  assert.throws(() => buildProbeUrl("https://user:pass@api.example.invalid", "RCN", "/"), /base URL/);
  assert.throws(() => buildProbeUrl("https://api.example.invalid/?token=x", "RCN", "/"), /base URL/);
});
