import test from "node:test";
import assert from "node:assert/strict";
import { mountMapTools, measureGeometry, pointDistance, streetViewUrl } from "../app/js/modules/dzialki/map-tools.js";
import { createFakeDom } from "./helpers/fake-dom.mjs";
import { createFakeLeaflet } from "./helpers/fake-leaflet.mjs";
import { getDzialkiState, updateDzialkiState, resetDzialkiState } from "../app/js/modules/dzialki/state.js";

test("metry: odległość geodezyjna, zamknięty obwód i pole, także przy południku 180°", () => {
  assert.equal(measureGeometry([]).area, 0);
  const a = { lat: 0, lng: 0 }, b = { lat: 0, lng: 1 };
  assert.ok(Math.abs(pointDistance(a, b) - 111194.9266) < 0.01);
  const square = [a, b, { lat: 1, lng: 1 }, { lat: 1, lng: 0 }];
  const result = measureGeometry(square);
  assert.ok(Math.abs(result.area - 12363683990.26) < 1);
  assert.ok(result.perimeter > 444700 && result.perimeter < 444800);
  assert.ok(Math.abs(result.perimeter - result.length - pointDistance(square.at(-1), a)) < 1e-8);
  assert.ok(Math.abs(measureGeometry([...square].reverse()).area - result.area) < 1);
  const crossing = square.map(p => ({ ...p, lng: p.lng === 0 ? 179.5 : -179.5 }));
  assert.ok(Math.abs(measureGeometry(crossing).area - result.area) < 1);
});

test("Street View zachowuje dokładny URL starego frontu i waliduje współrzędne", () => {
  assert.equal(streetViewUrl({ lat: 52.1, lng: 19.2 }), "https://www.google.com/maps?layer=c&cbll=52.1,19.2");
  for (const point of [null, { lat: NaN, lng: 1 }, { lat: 91, lng: 0 }, { lat: 0, lng: Infinity }]) assert.throws(() => streetViewUrl(point));
});

function setup(t) {
  resetDzialkiState();
  const { document, window } = createFakeDom();
  const { L } = createFakeLeaflet();
  const mapNode = document.createElement("div"); document.body.append(mapNode);
  const map = L.map(mapNode, {});
  const frames = new Map(); let nextFrame = 0, starts = 0;
  const controller = mountMapTools(document.body, { window,
    requestFrame: fn => { frames.set(++nextFrame, fn); return nextFrame; },
    cancelFrame: id => frames.delete(id),
    onChange: measurement => updateDzialkiState({ measurement }), onStart: () => starts++,
  });
  controller.attach(map, L);
  t.after(() => { controller.cleanup(); resetDzialkiState(); });
  return { document, window, L, map, controller, frames, starts: () => starts,
    click: (lat, lng, detail = 1) => map.fire("click", { latlng: { lat, lng }, originalEvent: { detail } }),
    button: id => document.getElementById("dzialki-" + id),
  };
}

test("minimalna liczba punktów, eliminacja dubli, preview nie zapisuje wierzchołka, cleanup", t => {
  const f = setup(t);
  f.button("measure-area").click(); assert.equal(f.starts(), 1);
  assert.equal(f.controller.isMeasuring(), true); assert.equal(f.map.doubleClickZoom.enabled(), false);
  f.click(52, 19); f.click(52, 19); f.click(52, 19.000001);
  f.click(52.001, 19, 2);
  assert.equal(getDzialkiState().measurement.points.length, 2);
  f.button("measure-finish").click(); assert.equal(f.controller.isMeasuring(), true);
  assert.match(f.button("measure-hint").textContent, /co najmniej 3/);
  f.map.fire("mousemove", { latlng: { lat: 52.001, lng: 19 } });
  f.map.fire("mousemove", { latlng: { lat: 52.002, lng: 19 } });
  assert.equal(f.frames.size, 1);
  [...f.frames.values()][0](); f.frames.clear();
  assert.equal(getDzialkiState().measurement.points.length, 2);
  f.click(52.001, 19);
  f.map.fire("dblclick"); assert.equal(f.controller.isMeasuring(), false);
  assert.equal(f.map.doubleClickZoom.enabled(), true);
  assert.match(f.button("measure-values").textContent, /Powierzchnia:.*Obwód/);
  const shapes = [...[...f.map.layers][0].layers];
  assert.equal(shapes.filter(s => s.options.kind === "polygon").length, 1);
  assert.ok(shapes.every(s => s.options.interactive === false));
  const copy = getDzialkiState().measurement; copy.points[0].lat = 0;
  assert.equal(getDzialkiState().measurement.points[0].lat, 52);
  f.button("measure-distance").click();
  f.map.fire("mousemove", { latlng: { lat: 52, lng: 19 } });
  f.controller.cleanup(); assert.equal(f.frames.size, 0);
  assert.equal(f.map.doubleClickZoom.enabled(), true); assert.equal(f.map.layers.size, 0);
  assert.equal(f.map.listenerCount("click"), 0);
  assert.equal(f.window.listeners.get("keydown").length, 0);
});

test("menu: punkt, klawiatura, fokus, zamknięcie i pomiar od wskazanego miejsca", t => {
  const f = setup(t);
  f.map.fire("contextmenu", { latlng: { lat: 52.1, lng: 19.2 }, originalEvent: { clientX: 990, clientY: 790 } });
  assert.equal(f.button("map-menu").hidden, false);
  assert.equal(f.button("map-menu").style.left, "734px");
  const link = f.button("street-view");
  assert.equal(link.href, streetViewUrl({ lat: 52.1, lng: 19.2 }));
  assert.equal(link.rel, "noopener noreferrer"); assert.equal(link.target, "_blank");
  f.window.dispatch("keydown", { key: "End", preventDefault() {} }); assert.equal(f.document.activeElement, link);
  f.window.dispatch("keydown", { key: "Escape", preventDefault() {} });
  assert.equal(f.button("map-menu").hidden, true); assert.equal(f.document.activeElement, f.map.getContainer());
  f.button("map-options").click(); f.button("menu-distance").click();
  assert.deepEqual(getDzialkiState().measurement.points, [f.map.getCenter()]);
  f.click(52.08, 19.48); f.map.fire("contextmenu");
  assert.equal(getDzialkiState().measurement.active, false);
  assert.equal(f.button("map-menu").hidden, true);
  f.window.dispatch("keydown", { key: "Escape", preventDefault() {} });
  assert.equal(getDzialkiState().measurement, null);
  f.button("map-options").click(); f.map.fire("movestart"); assert.equal(f.button("map-menu").hidden, true);
});

test("odtworzenie pomiaru i zachowanie wcześniejszego wyłączenia doubleClickZoom", t => {
  const f = setup(t);
  f.map.doubleClickZoom.disable();
  f.button("measure-distance").click(); f.click(52, 19); f.click(52.001, 19);
  f.button("measure-finish").click(); assert.equal(f.map.doubleClickZoom.enabled(), false);
  const saved = getDzialkiState().measurement;
  f.controller.cleanup();
  const secondMap = f.L.map(f.document.createElement("div"), {});
  const next = mountMapTools(f.document.body, { window: f.window });
  t.after(() => next.cleanup());
  next.attach(secondMap, f.L, saved);
  assert.match(f.button("measure-values").textContent, /111,19 m/);
  assert.equal(f.button("measure-panel").hidden, false); assert.equal(next.isMeasuring(), false);
});
