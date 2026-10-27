import test from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWED_METHODS,
  ALLOWLIST,
  DEFAULT_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  assertAllowedRequest,
  buildProbeUrl,
  parseProbeResponse,
  parseTimeoutMs,
  readCliOptions,
  requestProbe,
} from "./m1-probe.mjs";

test("allowlist has only GET and OPTIONS with fixed endpoints", () => {
  assert.deepEqual(ALLOWED_METHODS, ["GET", "OPTIONS"]);
  assert.deepEqual(Object.keys(ALLOWLIST.RCN), [
    "/",
    "/api/export_current.xlsx",
    "/api/export_current.docx",
  ]);
  assert.deepEqual(ALLOWLIST.RCN["/"].methods, ["GET", "OPTIONS"]);
  assert.deepEqual(ALLOWLIST.RCN["/api/export_current.xlsx"].methods, ["OPTIONS"]);
  assert.deepEqual(ALLOWLIST.RCN["/api/export_current.docx"].methods, ["OPTIONS"]);
  assert.deepEqual(Object.keys(ALLOWLIST.Oferty), ["/health"]);
  assert.deepEqual(Object.keys(ALLOWLIST.Dzialki), ["/health"]);
  assert.deepEqual(Object.keys(ALLOWLIST.Podobne), ["/api/health"]);
});

test("response parser keeps only approved CORS and cache headers", () => {
  const headers = new Headers({
    "Access-Control-Allow-Origin": "https://example.org",
    "Access-Control-Allow-Methods": "GET, POST",
    "Cache-Control": "no-store",
    "Set-Cookie": "session=should-not-appear",
    "X-Api-Key": "must-not-appear",
  });
  const parsed = parseProbeResponse(204, headers, 12.345, "2026-10-26T12:00:00Z");
  assert.equal(parsed.httpStatus, 204);
  assert.equal(parsed.elapsedMs, 12.35);
  assert.deepEqual(parsed.headers, {
    "access-control-allow-origin": "https://example.org",
    "access-control-allow-methods": "GET, POST",
    "cache-control": "no-store",
  });
  assert.ok(!JSON.stringify(parsed).includes("should-not-appear"));
  assert.ok(!JSON.stringify(parsed).includes("must-not-appear"));
});

test("GET sends the fixed Origin header and a bounded timeout signal", async () => {
  const result = await requestProbe({
    service: "Oferty",
    baseUrl: "https://api.example.invalid",
    method: "GET",
    path: "/health",
    timeoutMs: 5000,
    fetchImpl: async (url, init) => {
      assert.equal(url.href, "https://api.example.invalid/health");
      assert.equal(init.method, "GET");
      assert.equal(init.redirect, "manual");
      assert.deepEqual(init.headers, { Origin: "https://example.org" });
      assert.ok(init.signal instanceof AbortSignal);
      return { status: 200, headers: new Headers(), body: { cancel: async () => {} } };
    },
    now: (() => { let value = 0; return () => (value += 3); })(),
    dateNow: () => new Date("2026-10-26T12:00:00Z"),
  });
  assert.equal(result.httpStatus, 200);
  assert.equal(result.elapsedMs, 3);
});

test("standard OPTIONS sends the GET and authorization preflight", async () => {
  const result = await requestProbe({
    service: "RCN",
    baseUrl: "https://api.example.invalid",
    method: "OPTIONS",
    path: "/",
    fetchImpl: async (url, init) => {
      assert.equal(url.href, "https://api.example.invalid/");
      assert.equal(init.method, "OPTIONS");
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
  assert.equal(result.httpStatus, 204);
});

test("RCN export preflights use OPTIONS with POST and content-type only", async () => {
  for (const path of ["/api/export_current.xlsx", "/api/export_current.docx"]) {
    const result = await requestProbe({
      service: "RCN",
      baseUrl: "https://api.example.invalid",
      method: "OPTIONS",
      path,
      fetchImpl: async (url, init) => {
        assert.equal(url.pathname, path);
        assert.equal(init.method, "OPTIONS");
        assert.deepEqual(init.headers, {
          Origin: "https://example.org",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type",
        });
        return { status: 204, headers: new Headers(), body: { cancel: async () => {} } };
      },
    });
    assert.equal(result.httpStatus, 204);
  }
});

test("timeout failures report errorType and measured elapsedMs without error text", async () => {
  let clock = 10;
  const result = await requestProbe({
    service: "RCN",
    baseUrl: "https://api.example.invalid",
    method: "GET",
    path: "/",
    timeoutMs: 5000,
    fetchImpl: async () => {
      clock += 23.456;
      const error = new Error("private network detail");
      error.name = "TimeoutError";
      throw error;
    },
    now: () => clock,
    dateNow: () => new Date("2026-10-26T12:00:00Z"),
  });
  assert.equal(result.errorType, "timeout");
  assert.equal(result.elapsedMs, 23.46);
  assert.equal(result.httpStatus, null);
  assert.ok(!JSON.stringify(result).includes("private network detail"));
});

test("timeout defaults and accepted boundaries are explicit", () => {
  assert.equal(parseTimeoutMs(), DEFAULT_TIMEOUT_MS);
  assert.equal(DEFAULT_TIMEOUT_MS, 120000);
  assert.equal(parseTimeoutMs(MIN_TIMEOUT_MS), 5000);
  assert.equal(parseTimeoutMs(MAX_TIMEOUT_MS), 300000);
  assert.throws(() => parseTimeoutMs(4999), /5000 to 300000/);
  assert.throws(() => parseTimeoutMs(300001), /5000 to 300000/);
  assert.throws(() => parseTimeoutMs("5000.5"), /5000 to 300000/);
  assert.throws(() => parseTimeoutMs("NaN"), /5000 to 300000/);
});

test("CLI accepts timeout from environment or argument with argument precedence", () => {
  const env = {
    M1_RCN_BASE_URL: "https://rcn.example.invalid",
    M1_OFERTY_BASE_URL: "https://oferty.example.invalid",
    M1_DZIALKI_BASE_URL: "https://dzialki.example.invalid",
    M1_PODOBNE_BASE_URL: "https://podobne.example.invalid",
    M1_TIMEOUT_MS: "45000",
  };
  assert.equal(readCliOptions([], env).timeoutMs, 45000);
  assert.equal(readCliOptions(["--timeout-ms", "60000"], env).timeoutMs, 60000);
  assert.throws(() => readCliOptions(["--timeout-ms", "300001"], env), /5000 to 300000/);
});

test("prohibited methods and paths are rejected before fetch", async () => {
  let called = false;
  assert.throws(() => assertAllowedRequest("Oferty", "POST", "/health"), /allowlist/);
  assert.throws(() => assertAllowedRequest("RCN", "GET", "/api/export_current.xlsx"), /allowlist/);
  assert.throws(() => assertAllowedRequest("RCN", "GET", "/api/admin/users"), /allowlist/);
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
  await assert.rejects(
    requestProbe({
      service: "RCN",
      baseUrl: "https://api.example.invalid",
      method: "GET",
      path: "/api/export_current.xlsx",
      fetchImpl: async () => { called = true; throw new Error("must not run"); },
    }),
    /allowlist/
  );
  await assert.rejects(
    requestProbe({
      service: "RCN",
      baseUrl: "https://api.example.invalid",
      method: "POST",
      path: "/api/export_current.docx",
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
