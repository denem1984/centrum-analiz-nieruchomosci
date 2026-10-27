import { BACKENDS } from "./config.js";

export const HEALTH_TIMEOUT_MS = 120000;
export const WAKE_MESSAGE = "Usługa się budzi, pierwsze uruchomienie może potrwać do około minuty";

const completed = new Map();
const pending = new Map();

function freezeStatus(status) {
  return Object.freeze(status);
}

function publish(listener, status) {
  if (typeof listener !== "function") return;
  try {
    listener(status);
  } catch {
    // Błąd widoku nie powinien zmieniać wyniku żądania.
  }
}

export function getBackendStatus(id) {
  if (!BACKENDS[id]) throw new Error("Nieznany backend.");
  return completed.get(id) ?? freezeStatus({
    id,
    state: "idle",
    waitSeconds: 0,
    message: "Kontrola jeszcze się nie rozpoczęła.",
    errorCode: null,
  });
}

export function resetHealthCache() {
  completed.clear();
  pending.clear();
}

export async function checkBackend(id, options = {}) {
  const backend = BACKENDS[id];
  if (!backend) throw new Error("Nieznany backend.");

  const method = options.method ?? "GET";
  const path = options.path ?? backend.healthPath;
  if (method !== "GET" || path !== backend.healthPath) {
    throw new Error("Żądanie poza dozwoloną metodą lub ścieżką.");
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? HEALTH_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? 1000;
  const onState = options.onState;
  const now = options.now ?? Date.now;
  const force = options.force === true;

  if (typeof fetchImpl !== "function") throw new Error("Brak obsługi fetch.");
  if (typeof now !== "function") throw new Error("Nieprawidłowy zegar.");
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1) throw new Error("Nieprawidłowy limit czasu.");
  if (!Number.isFinite(intervalMs) || intervalMs < 1) throw new Error("Nieprawidłowy interwał.");

  if (pending.has(id)) return pending.get(id);
  if (!force && completed.has(id)) {
    const cached = completed.get(id);
    publish(onState, cached);
    return cached;
  }

  const request = (async () => {
    const startedAt = now();
    const controller = new AbortController();
    let timeoutHandle;
    let intervalHandle;
    let lastSecond = -1;

    const waking = freezeStatus({
      id,
      state: "waking",
      waitSeconds: 0,
      message: WAKE_MESSAGE,
      errorCode: null,
    });
    publish(onState, waking);

    const emitWaitingTime = () => {
      const waitSeconds = Math.floor((now() - startedAt) / 1000);
      if (waitSeconds === lastSecond) return;
      lastSecond = waitSeconds;
      publish(onState, freezeStatus({
        id,
        state: "waking",
        waitSeconds,
        message: WAKE_MESSAGE,
        errorCode: null,
      }));
    };

    intervalHandle = setInterval(emitWaitingTime, intervalMs);

    try {
      const timeout = new Promise((resolve, reject) => {
        timeoutHandle = setTimeout(() => {
          controller.abort();
          const error = new Error("Request timed out.");
          error.name = "TimeoutError";
          reject(error);
        }, timeoutMs);
      });

      const response = await Promise.race([
        Promise.resolve().then(() => fetchImpl(backend.baseUrl + backend.healthPath, {
          method: "GET",
          signal: controller.signal,
          redirect: "error",
        })),
        timeout,
      ]);

      if (!response || typeof response.ok !== "boolean") {
        throw new Error("Invalid response.");
      }
      if (!response.ok) {
        const failed = freezeStatus({
          id,
          state: "error",
          waitSeconds: Math.floor((now() - startedAt) / 1000),
          message: "Usługa nie odpowiedziała poprawnie. Spróbuj ponownie.",
          errorCode: "http_" + String(response.status ?? "error"),
        });
        completed.set(id, failed);
        publish(onState, failed);
        return failed;
      }

      const ready = freezeStatus({
        id,
        state: "ready",
        waitSeconds: Math.floor((now() - startedAt) / 1000),
        message: "Usługa odpowiada.",
        errorCode: null,
      });
      completed.set(id, ready);
      publish(onState, ready);
      return ready;
    } catch (error) {
      const timedOut = error?.name === "TimeoutError";
      const failed = freezeStatus({
        id,
        state: "error",
        waitSeconds: Math.floor((now() - startedAt) / 1000),
        message: timedOut
          ? "Przekroczono limit oczekiwania. Możesz sprawdzić ponownie."
          : "Nie udało się połączyć z usługą. Możesz sprawdzić ponownie.",
        errorCode: timedOut ? "timeout" : "network",
      });
      completed.set(id, failed);
      publish(onState, failed);
      return failed;
    } finally {
      clearTimeout(timeoutHandle);
      clearInterval(intervalHandle);
    }
  })();

  pending.set(id, request);
  try {
    return await request;
  } finally {
    pending.delete(id);
  }
}
