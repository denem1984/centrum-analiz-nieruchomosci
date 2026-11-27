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

export class FakeGeoJsonLayer extends FakeEventTarget {
  constructor(data, options = {}) {
    super();
    this.data = data;
    this.options = { ...options };
  }

  addTo(map) {
    map.addLayer(this);
    return this;
  }

  getBounds() {
    const points = [];
    const visit = (value) => {
      if (!Array.isArray(value)) return;
      if (value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])) {
        points.push(value);
        return;
      }
      for (const child of value) visit(child);
    };
    visit(this.data?.coordinates);
    const longitudes = points.map(([longitude]) => longitude);
    const latitudes = points.map(([, latitude]) => latitude);
    const center = {
      lat: (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
      lng: (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
    };
    return { getCenter: () => center };
  }
  clearLayers() { this.data = { type: "FeatureCollection", features: [] }; return this; }
  addData(data) { this.data = data; return this; }
  eachLayer(callback) { callback(this); return this; }

  bindPopup(content) {
    this.popup = content;
    this.popupLayer = { setContent: (next) => { this.popup = next; } };
    return this;
  }
  getPopup() { return this.popupLayer; }
  bindTooltip(content, options) { this.tooltip = content; this.tooltipOptions = options; return this; }
  setStyle(style) { this.options.style = { ...this.options.style, ...style }; return this; }
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
  getBounds() {
    const span = this.zoom >= 13 ? 0.02 : 1;
    return {
      getSouth: () => this.center.lat - span / 2,
      getWest: () => this.center.lng - span / 2,
      getNorth: () => this.center.lat + span / 2,
      getEast: () => this.center.lng + span / 2,
    };
  }

  setZoom(zoom) {
    this.zoom = Number(zoom);
    this.fire("zoomend");
    return this;
  }

  fitBounds(bounds, options = {}) {
    this.fitBoundsOptions = options;
    const center = bounds?.getCenter?.();
    if (center) this.setView(center, options.maxZoom ?? this.zoom, { animate: false });
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
  openPopup(popup) { this.popup = popup; return this; }
}

class FakeMarker extends FakeEventTarget {
  constructor(latlng, options = {}) { super(); this.latlng = latlng; this.options = options; }
  addTo(map) { map.addLayer(this); return this; }
}

class FakePopup {
  constructor(options = {}) { this.options = options; }
  setLatLng(latlng) { this.latlng = latlng; return this; }
  setContent(content) { this.content = content; return this; }
  openOn(map) { map.openPopup(this); return this; }
}

export function createFakeLeaflet() {
  const maps = [];
  const layers = [];
  const geoJsonLayers = [];
  const fake = {
    CRS: { EPSG3857: "EPSG:3857", EPSG4326: "EPSG:4326" },
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
    geoJSON(data, options) {
      const layer = new FakeGeoJsonLayer(data, options);
      geoJsonLayers.push(layer);
      return layer;
    },
    marker(latlng, options) {
      const marker = new FakeMarker(latlng, options);
      layers.push(marker);
      return marker;
    },
    divIcon(options) { return { ...options }; },
    popup(options) { return new FakePopup(options); },
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
  return { L: fake, maps, layers, geoJsonLayers };
}
