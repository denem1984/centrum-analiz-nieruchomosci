import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const SMOKE_LIMITS = Object.freeze({ launches: 4, dzialki: 400, service: 300 });

export function smokeServiceKey(address) {
  const url = new URL(address);
  if (["integracja.gugik.gov.pl", "integracja01.gugik.gov.pl", "integracja02.gugik.gov.pl"].includes(url.hostname)) {
    return "gugik:" + url.pathname; // Redirect nodes consume the same service budget.
  }
  if (url.hostname === "mapy.geoportal.gov.pl" || url.hostname === "wms.e-mapa.net") {
    return url.hostname + ":" + (url.hostname === "wms.e-mapa.net" ? "/cgi-bin/pog/" : url.pathname);
  }
  return url.hostname.replace(/^[abc]\.(?=tile\.openstreetmap\.org$)/, "");
}

export function validateSmokeTask(task) {
  if (typeof task !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(task)) {
    throw new Error("Pełny smoke wymaga --task <identyfikator-zadania>, np. --task m4d2. Używaj tego samego identyfikatora przy ponowieniu.");
  }
  return task;
}

function validState(value, task) {
  return value?.version === 1 && value.task === task
    && Number.isSafeInteger(value.launches) && value.launches >= 0 && value.launches <= SMOKE_LIMITS.launches
    && value.requests && typeof value.requests === "object" && !Array.isArray(value.requests)
    && Object.entries(value.requests).every(([key, count]) => key !== "__proto__"
      && Number.isSafeInteger(count) && count >= 0 && count <= (key === "analizator-nieruchomosci.onrender.com" ? SMOKE_LIMITS.dzialki : SMOKE_LIMITS.service));
}

export async function openSmokeBudget(statePath, task) {
  validateSmokeTask(task);
  await mkdir(dirname(statePath), { recursive: true });
  const lockPath = statePath + ".lock";
  let lock;
  try { lock = await open(lockPath, "wx"); }
  catch { throw new Error("Licznik zadania jest zablokowany przez inny smoke lub pozostałą blokadę. Nie uruchomiono przeglądarki."); }
  let state;
  let queue = Promise.resolve();
  let closed = false;
  async function release() {
    await lock.close();
    await rm(lockPath, { force: true });
  }
  try {
    await lock.writeFile(String(process.pid), "utf8");
    try { state = JSON.parse(await readFile(statePath, "utf8")); }
    catch (error) {
      if (error.code !== "ENOENT") throw new Error("Nieczytelny licznik zadania; żądania są zablokowane.");
      state = { version: 1, task, launches: 0, requests: {} };
    }
    if (!validState(state, task)) throw new Error("Nieprawidłowy licznik zadania; żądania są zablokowane.");
  } catch (error) { await release(); throw error; }

  function mutate(operation) {
    if (closed) return Promise.reject(new Error("Licznik zadania został zamknięty."));
    const next = queue.then(async () => {
      const copy = structuredClone(state);
      const allowed = operation(copy);
      if (!allowed) return false;
      const temporary = statePath + ".tmp";
      await writeFile(temporary, JSON.stringify(copy, null, 2) + "\n", "utf8");
      await rename(temporary, statePath);
      state = copy;
      return true;
    });
    // After a write failure, subsequent reservations remain rejected.
    queue = next;
    return next;
  }
  return {
    reserveLaunch: () => mutate((next) => {
      if (next.launches >= SMOKE_LIMITS.launches) return false;
      next.launches += 1;
      return true;
    }),
    reserveRequest: (address) => mutate((next) => {
      const key = smokeServiceKey(address);
      const limit = key === "analizator-nieruchomosci.onrender.com" ? SMOKE_LIMITS.dzialki : SMOKE_LIMITS.service;
      const count = next.requests[key] ?? 0;
      if (count >= limit) return false;
      Object.defineProperty(next.requests, key, { value: count + 1, enumerable: true, writable: true, configurable: true });
      return true;
    }),
    snapshot: () => structuredClone(state),
    async close() {
      if (closed) return;
      closed = true;
      try { await queue; } finally { await release(); }
    },
  };
}
