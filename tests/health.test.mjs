import test from "node:test";
import assert from "node:assert/strict";
import { checkBackend, getBackendStatus, HEALTH_TIMEOUT_MS, WAKE_MESSAGE, resetHealthCache } from "../app/js/health.js";

test("checkBackend przechodzi idle → waking → ready i wysyła tylko GET", async () => {
  resetHealthCache();
  const states = [];
  assert.equal(getBackendStatus("RCN").state, "idle");
  let captured;
  const result = await checkBackend("RCN", {
    onState: (state) => states.push(state.state),
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return { ok: true, status: 200 };
    },
  });

  assert.deepEqual(states, ["waking", "ready"]);
  assert.equal(result.state, "ready");
  assert.equal(captured.url, "https://rcn-web-app.onrender.com/");
  assert.equal(captured.options.method, "GET");
  assert.equal(captured.options.redirect, "error");
  assert.equal(getBackendStatus("RCN").state, "ready");
  assert.equal(HEALTH_TIMEOUT_MS, 120000);
});

test("wynik jest buforowany w pamięci i można go odświeżyć", async () => {
  resetHealthCache();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { ok: true, status: 200 };
  };

  await checkBackend("Oferty", { fetchImpl });
  await checkBackend("Oferty", { fetchImpl });
  assert.equal(calls, 1);

  await checkBackend("Oferty", { fetchImpl, force: true });
  assert.equal(calls, 2);
});

test("błąd HTTP przechodzi do error bez ujawniania treści odpowiedzi", async () => {
  resetHealthCache();
  const result = await checkBackend("Dzialki", {
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });
  assert.equal(result.state, "error");
  assert.equal(result.errorCode, "http_503");
  assert.match(result.message, /Spróbuj ponownie/);
});

test("limit czasu przerywa oczekiwanie i zwraca error", async () => {
  resetHealthCache();
  let signal;
  const result = await checkBackend("Podobne", {
    timeoutMs: 15,
    fetchImpl: async (_url, options) => {
      signal = options.signal;
      return new Promise(() => {});
    },
  });

  assert.equal(result.state, "error");
  assert.equal(result.errorCode, "timeout");
  assert.equal(signal.aborted, true);
});

test("nieznana ścieżka i metoda są odrzucane przed fetch", async () => {
  resetHealthCache();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { ok: true, status: 200 };
  };

  await assert.rejects(
    checkBackend("RCN", { path: "/api/admin", fetchImpl }),
    /dozwoloną/,
  );
  await assert.rejects(
    checkBackend("RCN", { method: "POST", fetchImpl }),
    /dozwoloną/,
  );
  assert.equal(calls, 0);
});

test("stan waking pokazuje komunikat i aktualizuje licznik sekund", async () => {
  resetHealthCache();
  let current = 0;
  const states = [];
  const resultPromise = checkBackend("RCN", {
    timeoutMs: 200,
    intervalMs: 5,
    now: () => current,
    onState: (state) => states.push(state),
    fetchImpl: async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      return { ok: true, status: 200 };
    },
  });
  setTimeout(() => { current = 1000; }, 10);
  const result = await resultPromise;

  assert.equal(result.state, "ready");
  assert.ok(states.some((state) => state.state === "waking" && state.message === WAKE_MESSAGE));
  assert.ok(states.some((state) => state.state === "waking" && state.waitSeconds === 1));
});
