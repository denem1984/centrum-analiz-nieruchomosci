import test from "node:test";
import assert from "node:assert/strict";
import { FakeElement, createFakeDom } from "./helpers/fake-dom.mjs";
import { mountRcnFrontend } from "../app/js/modules/rcn/frontend.js";

test("RCN startuje z atrapą mapy i zamyka poligon po kliknięciu pierwszego wierzchołka", async (t) => {
  const { document, window } = createFakeDom();
  Object.assign(window, { setTimeout, clearTimeout });
  document.defaultView = window;
  const createNode = (tag) => {
    const node = new FakeElement(tag, document);
    node.appendChild = (child) => node.append(child);
    node.closest = () => null;
    node.classList = { add() {}, remove() {}, toggle() {} };
    node.style.setProperty = () => {};
    node.options = [{ value: "" }];
    return node;
  };
  document.createElement = createNode;
  const root = createNode("section");
  const elements = new Map();
  root.getElementById = (id) => {
    if (!elements.has(id)) {
      const element = createNode("div");
      element.id = id;
      if (id.endsWith("Table")) element.append(createNode("thead"), createNode("tbody"));
      elements.set(id, element);
    }
    return elements.get(id);
  };
  const el = root.getElementById;
  el("layer").value = "lokale";
  el("subject_area_filter_mode").value = "all";
  let closeVertex;
  const shape = (options = {}) => ({
    addTo() { return this; },
    bindTooltip() { return this; },
    on(event, callback) {
      if (event === "click" && options.className === "rcn-polygon-close") closeVertex = callback;
      return this;
    },
    clearLayers() {},
  });
  const mapEvents = new Map();
  let removed = false;
  const map = {
    on(type, callback) { mapEvents.set(type, callback); },
    setView() { return this; },
    getContainer: () => el("map"),
    remove() { removed = true; },
  };
  const L = {
    map: () => map,
    tileLayer: () => shape(),
    layerGroup: () => shape(),
    polyline: () => shape(),
    polygon: () => shape(),
    circleMarker: (_point, options) => shape(options),
    marker: () => shape(),
    divIcon: () => ({}),
    DomEvent: { disableClickPropagation() {}, disableScrollPropagation() {} },
  };
  const controller = new AbortController();
  t.after(() => controller.abort());
  let searchPath;
  mountRcnFrontend(root, {
    L, Chart: class { destroy() {} },
    signal: controller.signal,
    demo: true,
    fetch: async (path) => {
      if (path.startsWith("/api/search?")) {
        searchPath = path;
        return Response.json({ records: [] });
      }
      return Response.json(path.startsWith("/api/teryt/") ? [] : {});
    },
  });
  assert.match(el("status").textContent, /Wybrano moduł: Lokale/);
  el("area_mode").value = "polygon";
  el("area_mode").dispatch("change");
  for (const [lat, lng] of [[53.7, 20.4], [53.7, 20.5], [53.8, 20.5]]) {
    mapEvents.get("click")({ latlng: { lat, lng } });
  }
  assert.match(el("polygonStatus").textContent, /Dodano 3 pkt/);
  assert.equal(typeof closeVertex, "function");
  closeVertex();
  assert.match(el("polygonStatus").textContent, /Obszar zamknięty\. Liczba punktów 3/);
  el("searchBtn").click();
  await new Promise((resolve) => setImmediate(resolve));
  const query = new URL(searchPath, "http://localhost").searchParams;
  assert.equal(query.get("polygon"), "53.7000000,20.4000000|53.7000000,20.5000000|53.8000000,20.5000000");
  el("clearPolygon").click();
  assert.equal(el("areaModeLabel").textContent, "0 pkt");
  controller.abort();
  assert.equal(removed, true);
});
