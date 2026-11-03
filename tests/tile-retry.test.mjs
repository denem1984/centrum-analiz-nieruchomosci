import test from "node:test";
import assert from "node:assert/strict";
import {
  createTileRetryController,
  resolveTileRetryConfig,
  TILE_RETRY_CONFIG,
  validateTileRetryConfig,
} from "../app/js/modules/dzialki/tile-retry.js";
import { FakeTileLayer } from "./helpers/fake-leaflet.mjs";

function createClock() {
  let currentId = 0;
  const timers = new Map();
  return {
    timers,
    setTimeout(callback, delay) {
      const id = ++currentId;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    run(id) {
      const timer = timers.get(id);
      assert.ok(timer, "timer powinien istnieć");
      timers.delete(id);
      timer.callback();
      return timer.delay;
    },
    runNext() {
      const entry = [...timers.entries()][0];
      assert.ok(entry, "powinien istnieć timer");
      return this.run(entry[0]);
    },
  };
}

const tile = (x = 1) => ({ coords: { x, y: 2, z: 8 }, tile: { _leaflet_id: x } });

test("polityka ponawiania ma limit dwóch prób, opóźnienia, jitter i limit współbieżności", () => {
  assert.equal(TILE_RETRY_CONFIG.attempts, 2);
  assert.deepEqual(TILE_RETRY_CONFIG.delaysMs, [1500, 4000]);
  assert.equal(TILE_RETRY_CONFIG.maxConcurrent, 6);
  assert.ok(TILE_RETRY_CONFIG.jitterMs > 0);
  assert.strictEqual(resolveTileRetryConfig(), TILE_RETRY_CONFIG);
  assert.deepEqual(resolveTileRetryConfig({
    attempts: 2,
    delaysMs: [1500, 4000],
    maxConcurrent: 6,
  }), TILE_RETRY_CONFIG);
});

test("waliduje zakresy konfiguracji retry i ignoruje niepoprawny override", () => {
  const valid = { attempts: 8, delaysMs: Array(8).fill(30000), maxConcurrent: 12, jitterMs: 0 };
  assert.deepEqual(validateTileRetryConfig(valid), valid);
  assert.deepEqual(validateTileRetryConfig({ attempts: 0, delaysMs: [], maxConcurrent: 1 }), {
    attempts: 0,
    delaysMs: [],
    maxConcurrent: 1,
    jitterMs: TILE_RETRY_CONFIG.jitterMs,
  });
  for (const invalid of [
    { ...valid, attempts: 9 },
    { ...valid, attempts: 5 },
    { ...valid, delaysMs: [199, ...valid.delaysMs.slice(1)] },
    { ...valid, delaysMs: [30001, ...valid.delaysMs.slice(1)] },
    { ...valid, maxConcurrent: 0 },
    { ...valid, maxConcurrent: 13 },
    { ...valid, jitterMs: -1 },
  ]) {
    assert.equal(validateTileRetryConfig(invalid), null);
    assert.strictEqual(resolveTileRetryConfig(invalid), TILE_RETRY_CONFIG);
  }
});

test("retry pobiera ponownie tylko obraz błędnego kafelka", () => {
  const clock = createClock();
  const layer = new FakeTileLayer("tiles");
  layer.getTileUrl = (coords) => "tile://" + coords.z + "/" + coords.x + "/" + coords.y;
  const image = {
    src: "tile://failed",
    removeAttribute(name) { if (name === "src") this.src = ""; },
  };
  const controller = createTileRetryController(layer, {
    setTimeoutImpl: clock.setTimeout,
    clearTimeoutImpl: clock.clearTimeout,
    random: () => 0,
    jitterMs: 0,
  });
  layer.fire("tileerror", { ...tile(5), tile: image });
  clock.runNext();
  assert.equal(image.src, "tile://8/5/2");
  assert.equal(layer.redrawCount, 0);
  controller.cancel();
});

test("pusty obraz 1×1 też ponawia się, a poprawny obraz kończy stan kafelka", () => {
  const clock = createClock();
  const layer = new FakeTileLayer("tiles");
  let retryCount = 0;
  const controller = createTileRetryController(layer, {
    setTimeoutImpl: clock.setTimeout,
    clearTimeoutImpl: clock.clearTimeout,
    random: () => 0,
    retryTile: () => { retryCount += 1; },
  });
  const coords = { x: 4, y: 7, z: 9 };
  layer.fire("tileload", { coords, tile: { naturalWidth: 1, naturalHeight: 1 } });
  assert.equal(controller.getStats().errors, 1);
  assert.equal(controller.getStats().pending, 1);
  clock.runNext();
  assert.equal(retryCount, 1);
  assert.equal(controller.getStats().retries, 1);
  layer.fire("tileload", { coords, tile: { naturalWidth: 256, naturalHeight: 256 } });
  assert.deepEqual(controller.getStats(), { errors: 1, retries: 1, finalUnloaded: 0, pending: 0 });
  controller.cancel();
});

test("kafelek otrzymuje dwie próby, licznik błędów i ręczne ponowienie", () => {
  const clock = createClock();
  const layer = new FakeTileLayer("tiles");
  const counts = [];
  const stats = [];
  const controller = createTileRetryController(layer, {
    setTimeoutImpl: clock.setTimeout,
    clearTimeoutImpl: clock.clearTimeout,
    random: () => 0,
    jitterMs: 200,
    onCount: (count) => counts.push(count),
    onStats: (value) => stats.push(value),
  });
  layer.fire("tileerror", tile());
  assert.deepEqual(controller.getStats(), { errors: 1, retries: 0, finalUnloaded: 0, pending: 1 });
  assert.deepEqual([...clock.timers.values()].map((timer) => timer.delay), [1500]);
  clock.runNext();
  assert.equal(controller.getStats().retries, 1);
  assert.equal(layer.redrawCount, 1);
  layer.fire("tileerror", tile());
  assert.deepEqual([...clock.timers.values()].map((timer) => timer.delay), [4000]);
  clock.runNext();
  assert.equal(controller.getStats().retries, 2);
  assert.equal(layer.redrawCount, 2);
  layer.fire("tileerror", tile());
  assert.equal(controller.getFailedCount(), 1);
  assert.deepEqual(controller.getStats(), { errors: 3, retries: 2, finalUnloaded: 1, pending: 0 });
  assert.equal(counts.at(-1), 1);
  assert.equal(controller.retryVisible(), true);
  assert.equal(layer.redrawCount, 3);
  assert.equal(controller.getFailedCount(), 0);
  assert.equal(controller.getStats().finalUnloaded, 0);
  assert.ok(stats.length > 0);
  layer.fire("tileload", tile());
  assert.equal(controller.getFailedCount(), 0);
  controller.cancel();
  assert.equal(layer.listenerCount("tileerror"), 0);
});

test("retry poza widocznym obszarem i timer odłączonego kafelka są anulowane", () => {
  const clock = createClock();
  const layer = new FakeTileLayer("tiles");
  let visible = false;
  const controller = createTileRetryController(layer, {
    setTimeoutImpl: clock.setTimeout,
    clearTimeoutImpl: clock.clearTimeout,
    isVisible: () => visible,
    random: () => 0,
  });
  layer.fire("tileerror", tile(3));
  assert.equal(clock.timers.size, 0);
  visible = true;
  layer.fire("tileerror", tile(4));
  assert.equal(clock.timers.size, 1);
  layer.fire("tileunload", tile(4));
  assert.equal(clock.timers.size, 0);
  controller.cancel();
});

test("kolejka nie przekracza sześciu jednoczesnych prób na warstwie", () => {
  const clock = createClock();
  const layer = new FakeTileLayer("tiles");
  const controller = createTileRetryController(layer, {
    setTimeoutImpl: clock.setTimeout,
    clearTimeoutImpl: clock.clearTimeout,
    random: () => 0,
  });
  for (let x = 0; x < 9; x += 1) layer.fire("tileerror", tile(x));
  assert.equal(clock.timers.size, 6);
  const first = [...clock.timers.keys()][0];
  clock.run(first);
  layer.fire("tileload", tile(0));
  assert.equal(clock.timers.size, 6);
  controller.cancel();
  assert.equal(clock.timers.size, 0);
});
