export class FakeEventTarget {
  constructor() {
    this.events = new Map();
  }

  on(name, listener) {
    const listeners = this.events.get(name) ?? new Set();
    listeners.add(listener);
    this.events.set(name, listeners);
    return this;
  }

  off(name, listener) {
    if (listener) this.events.get(name)?.delete(listener);
    else this.events.delete(name);
    return this;
  }

  fire(name, event = {}) {
    for (const listener of this.events.get(name) ?? []) listener({ type: name, target: this, ...event });
    return this;
  }

  listenerCount(name) {
    return this.events.get(name)?.size ?? 0;
  }
}

export class FakeTileLayer extends FakeEventTarget {
  constructor(url, options = {}) {
    super();
    this.url = url;
    this.options = { ...options };
    this._tiles = Object.create(null);
    this.redrawCount = 0;
    this._tileCoordsToKey = (coords) => String(coords.x) + ":" + String(coords.y) + ":" + String(coords.z);
  }

  addTo(map) {
    map.addLayer(this);
    return this;
  }

  setParams(params) {
    this.options = { ...this.options, ...params };
    this.redraw();
    return this;
  }

  redraw() {
    this.redrawCount += 1;
    return this;
  }
}

export class FakeMap extends FakeEventTarget {
  constructor(container, options) {
    super();
    this.container = container;
    this.options = { ...options };
    this.layers = new Set();
    this.controls = [];
    this.removed = false;
    this.center = { lat: 52.07, lng: 19.48 };
    this.zoom = 6;
  }

  setView(center, zoom) {
    this.center = Array.isArray(center)
      ? { lat: Number(center[0]), lng: Number(center[1]) }
      : { lat: Number(center.lat), lng: Number(center.lng) };
    this.zoom = Number(zoom);
    this.fire("moveend");
    this.fire("zoomend");
    return this;
  }

  getCenter() { return { ...this.center }; }
  getZoom() { return this.zoom; }

  setZoom(zoom) {
    this.zoom = Number(zoom);
    this.fire("zoomend");
    return this;
  }

  zoomIn(delta = 1) { return this.setZoom(this.zoom + delta); }
  zoomOut(delta = 1) { return this.setZoom(this.zoom - delta); }

  addLayer(layer) {
    this.layers.add(layer);
    layer._map = this;
    return this;
  }

  removeLayer(layer) {
    this.layers.delete(layer);
    if (layer._map === this) delete layer._map;
    return this;
  }

  hasLayer(layer) { return this.layers.has(layer); }
  invalidateSize() { this.invalidateCount = (this.invalidateCount ?? 0) + 1; return this; }

  remove() {
    this.removed = true;
    for (const layer of this.layers) delete layer._map;
    this.layers.clear();
    this.events.clear();
    return this;
  }
}

export function createFakeLeaflet() {
  const maps = [];
  const layers = [];
  const fake = {
    CRS: { EPSG3857: "EPSG:3857" },
    map(container, options) {
      const map = new FakeMap(container, options);
      maps.push(map);
      return map;
    },
    tileLayer(url, options) {
      const layer = new FakeTileLayer(url, options);
      layers.push(layer);
      return layer;
    },
    control: {
      scale(options) {
        return {
          options,
          addTo(map) {
            map.controls.push({ type: "scale", options });
            return this;
          },
        };
      },
    },
  };
  fake.tileLayer.wms = (url, options) => {
    const layer = new FakeTileLayer(url, options);
    layer.isWms = true;
    layers.push(layer);
    return layer;
  };
  return { L: fake, maps, layers };
}