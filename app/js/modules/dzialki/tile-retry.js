export const TILE_RETRY_CONFIG = Object.freeze({
  attempts: 2,
  delaysMs: Object.freeze([1500, 4000]),
  maxConcurrent: 6,
  jitterMs: 250,
});

const RETRY_CONFIG_LIMITS = Object.freeze({
  minAttempts: 0,
  maxAttempts: 8,
  minDelayMs: 200,
  maxDelayMs: 30000,
  minConcurrent: 1,
  maxConcurrent: 12,
  maxJitterMs: 5000,
});

export function validateTileRetryConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { attempts, delaysMs, maxConcurrent } = value;
  const jitterMs = value.jitterMs ?? TILE_RETRY_CONFIG.jitterMs;
  if (!Number.isInteger(attempts)
      || attempts < RETRY_CONFIG_LIMITS.minAttempts
      || attempts > RETRY_CONFIG_LIMITS.maxAttempts
      || !Array.isArray(delaysMs)
      || delaysMs.length !== attempts
      || !delaysMs.every((delay) => Number.isInteger(delay)
        && delay >= RETRY_CONFIG_LIMITS.minDelayMs
        && delay <= RETRY_CONFIG_LIMITS.maxDelayMs)
      || !Number.isInteger(maxConcurrent)
      || maxConcurrent < RETRY_CONFIG_LIMITS.minConcurrent
      || maxConcurrent > RETRY_CONFIG_LIMITS.maxConcurrent
      || !Number.isInteger(jitterMs)
      || jitterMs < 0
      || jitterMs > RETRY_CONFIG_LIMITS.maxJitterMs) {
    return null;
  }
  return Object.freeze({
    attempts,
    delaysMs: Object.freeze([...delaysMs]),
    maxConcurrent,
    jitterMs,
  });
}

export function resolveTileRetryConfig(value) {
  if (value === undefined || value === null) return TILE_RETRY_CONFIG;
  return validateTileRetryConfig(value) ?? TILE_RETRY_CONFIG;
}

function tileKey(event) {
  const coords = event?.coords;
  if (coords && Number.isFinite(coords.x) && Number.isFinite(coords.y) && Number.isFinite(coords.z)) {
    return String(coords.x) + ":" + String(coords.y) + ":" + String(coords.z);
  }
  const id = event?.tile?._leaflet_id;
  return id === undefined ? "unknown-tile" : "tile:" + String(id);
}

function isEmptyImageTile(event) {
  const image = event?.tile;
  return Number.isFinite(image?.naturalWidth) && Number.isFinite(image?.naturalHeight)
    && image.naturalWidth > 0 && image.naturalHeight > 0
    && (image.naturalWidth <= 1 || image.naturalHeight <= 1);
}

export function createTileRetryController(layer, options = {}) {
  const config = resolveTileRetryConfig({
    attempts: options.attempts ?? options.maxAttempts ?? TILE_RETRY_CONFIG.attempts,
    delaysMs: options.delaysMs ?? TILE_RETRY_CONFIG.delaysMs,
    maxConcurrent: options.maxConcurrent ?? TILE_RETRY_CONFIG.maxConcurrent,
    jitterMs: options.jitterMs ?? TILE_RETRY_CONFIG.jitterMs,
  });
  const attemptsLimit = config.attempts;
  const delays = config.delaysMs;
  const maxConcurrent = config.maxConcurrent;
  const jitterMs = config.jitterMs;
  const setTimer = options.setTimeoutImpl ?? setTimeout;
  const clearTimer = options.clearTimeoutImpl ?? clearTimeout;
  const random = options.random ?? Math.random;
  const isVisible = options.isVisible ?? (() => true);
  const onStats = options.onStats ?? (() => {});
  const retryTile = options.retryTile ?? ((event, target) => {
    const image = event?.tile;
    if (image && event?.coords && typeof target.getTileUrl === "function"
        && typeof image.removeAttribute === "function") {
      image.removeAttribute("src");
      image.src = target.getTileUrl(event.coords);
      return;
    }
    target.redraw();
  });
  const onCount = options.onCount ?? (() => {});

  const states = new Map();
  const scheduled = new Map();
  const active = new Set();
  const queue = [];
  const redrawing = new Set();
  const listeners = new Set();
  let disposed = false;
  let failedCount = 0;
  let errorCount = 0;
  let retryCount = 0;

  function getStats() {
    let pending = 0;
    for (const state of states.values()) {
      if (state.attempts > 0 && !state.failed) pending += 1;
    }
    return Object.freeze({ errors: errorCount, retries: retryCount, finalUnloaded: failedCount, pending });
  }

  function publishStats() {
    try { onStats(getStats()); } catch { /* Diagnostyka nie może zatrzymać warstwy. */ }
  }

  function publishCount() {
    onCount(failedCount);
    publishStats();
    for (const listener of listeners) {
      try { listener(failedCount); } catch { /* Widok nie może przerwać obsługi kafelka. */ }
    }
  }

  function clearState(key) {
    const state = states.get(key);
    if (!state) return;
    if (state.timer !== null) {
      clearTimer(state.timer);
      scheduled.delete(key);
    }
    active.delete(key);
    const queueIndex = queue.indexOf(key);
    if (queueIndex !== -1) queue.splice(queueIndex, 1);
    states.delete(key);
    if (state.failed) {
      state.failed = false;
      failedCount = Math.max(0, failedCount - 1);
      publishCount();
    } else {
      publishStats();
    }
  }

  function markFailed(key, state) {
    if (state.failed) return;
    state.failed = true;
    failedCount += 1;
    publishCount();
  }

  function drainQueue() {
    if (disposed) return;
    while (active.size + scheduled.size < maxConcurrent && queue.length > 0) {
      const key = queue.shift();
      const state = states.get(key);
      if (state && state.timer === null && !state.failed) scheduleTimer(key, state);
    }
  }

  function scheduleTimer(key, state) {
    if (disposed || state.timer !== null || active.has(key) || state.failed) return;
    const delayIndex = Math.min(Math.max(0, state.attempts - 1), delays.length - 1);
    const baseDelay = Number(delays[delayIndex] ?? delays.at(-1) ?? 0);
    const jitter = Math.max(0, Number(jitterMs) || 0) * Math.max(0, Math.min(1, random()));
    state.timer = setTimer(() => {
      state.timer = null;
      scheduled.delete(key);
      if (disposed || states.get(key) !== state) return;
      const event = state.lastEvent;
      if (!isVisible(event, layer)) {
        clearState(key);
        drainQueue();
        return;
      }
      active.add(key);
      redrawing.add(key);
      retryCount += 1;
      publishStats();
      try {
        retryTile(event, layer);
      } catch {
        redrawing.delete(key);
        active.delete(key);
        markFailed(key, state);
      }
      redrawing.delete(key);
      drainQueue();
    }, baseDelay + jitter);
    scheduled.set(key, state);
  }

  function onTileError(event) {
    if (disposed) return;
    errorCount += 1;
    publishStats();
    const key = tileKey(event);
    let state = states.get(key);
    if (!state) {
      state = { attempts: 0, timer: null, failed: false, lastEvent: event };
      states.set(key, state);
    }
    state.lastEvent = event;
    active.delete(key);
    if (!isVisible(event, layer)) {
      clearState(key);
      drainQueue();
      return;
    }
    if (state.attempts >= attemptsLimit) {
      markFailed(key, state);
      drainQueue();
      return;
    }
    state.attempts += 1;
    if (active.size + scheduled.size < maxConcurrent) scheduleTimer(key, state);
    else if (!queue.includes(key)) queue.push(key);
    drainQueue();
  }

  function onTileLoad(event) {
    if (isEmptyImageTile(event)) {
      onTileError(event);
      return;
    }
    clearState(tileKey(event));
    drainQueue();
  }

  function onTileUnload(event) {
    const key = tileKey(event);
    if (!redrawing.has(key)) clearState(key);
    drainQueue();
  }

  layer.on("tileerror", onTileError);
  layer.on("tileload", onTileLoad);
  layer.on("tileunload", onTileUnload);
  publishStats();

  return Object.freeze({
    getFailedCount() { return failedCount; },
    getStats,
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("Subskrybent musi być funkcją.");
      listeners.add(listener);
      listener(failedCount);
      return () => listeners.delete(listener);
    },
    retryVisible() {
      if (disposed || failedCount === 0) return false;
      for (const state of states.values()) {
        if (!state.failed) continue;
        state.failed = false;
        failedCount = Math.max(0, failedCount - 1);
        state.attempts = 0;
      }
      publishCount();
      if (typeof layer.redraw === "function") layer.redraw();
      return true;
    },
    cancel() {
      if (disposed) return;
      disposed = true;
      for (const state of states.values()) {
        if (state.timer !== null) clearTimer(state.timer);
      }
      states.clear();
      scheduled.clear();
      active.clear();
      queue.length = 0;
      failedCount = 0;
      layer.off("tileerror", onTileError);
      layer.off("tileload", onTileLoad);
      layer.off("tileunload", onTileUnload);
      publishCount();
      listeners.clear();
    },
  });
}

export function attachTileRetry(layer, options = {}) {
  return createTileRetryController(layer, options);
}
