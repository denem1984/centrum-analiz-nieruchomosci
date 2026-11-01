export const TILE_RETRY_CONFIG = Object.freeze({
  attempts: 2,
  delaysMs: Object.freeze([1500, 4000]),
  maxConcurrent: 6,
  jitterMs: 250,
});

function tileKey(event) {
  const coords = event?.coords;
  if (coords && Number.isFinite(coords.x) && Number.isFinite(coords.y) && Number.isFinite(coords.z)) {
    return String(coords.x) + ":" + String(coords.y) + ":" + String(coords.z);
  }
  const id = event?.tile?._leaflet_id;
  return id === undefined ? "unknown-tile" : "tile:" + String(id);
}

export function createTileRetryController(layer, options = {}) {
  const attemptsLimit = options.attempts ?? options.maxAttempts ?? TILE_RETRY_CONFIG.attempts;
  const delays = options.delaysMs ?? TILE_RETRY_CONFIG.delaysMs;
  const maxConcurrent = options.maxConcurrent ?? TILE_RETRY_CONFIG.maxConcurrent;
  const jitterMs = options.jitterMs ?? TILE_RETRY_CONFIG.jitterMs;
  const setTimer = options.setTimeoutImpl ?? setTimeout;
  const clearTimer = options.clearTimeoutImpl ?? clearTimeout;
  const random = options.random ?? Math.random;
  const isVisible = options.isVisible ?? (() => true);
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

  function publishCount() {
    onCount(failedCount);
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

  return Object.freeze({
    getFailedCount() { return failedCount; },
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
