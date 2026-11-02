import test from "node:test";
import assert from "node:assert/strict";
import { createTileRetryController, TILE_RETRY_CONFIG } from "../app/js/modules/dzialki/tile-retry.js";
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

test("kafelek otrzymuje dwie próby, licznik błędów i ręczne ponowienie", () => {
  const clock = createClock();
  const layer = new FakeTileLayer("tiles");
  const counts = [];
  const controller = createTileRetryController(layer, {
    setTimeoutImpl: clock.setTimeout,
    clearTimeoutImpl: clock.clearTimeout,
    random: () => 0,
    jitterMs: 200,
    onCount: (count) => counts.push(count),
  });
  layer.fire("tileerror", tile());
  assert.deepEqual([...clock.timers.values()].map((timer) => timer.delay), [1500]);
  clock.runNext();
  assert.equal(layer.redrawCount, 1);
  layer.fire("tileerror", tile());
  assert.deepEqual([...clock.timers.values()].map((timer) => timer.delay), [4000]);
  clock.runNext();
  assert.equal(layer.redrawCount, 2);
  layer.fire("tileerror", tile());
  assert.equal(controller.getFailedCount(), 1);
  assert.equal(counts.at(-1), 1);
  assert.equal(controller.retryVisible(), true);
  assert.equal(layer.redrawCount, 3);
  assert.equal(controller.getFailedCount(), 0);
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
