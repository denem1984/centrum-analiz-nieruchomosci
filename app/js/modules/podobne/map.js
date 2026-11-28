import { BASE_LAYER_OPTIONS } from "../dzialki/layers-base.js";
import { demoMapLayer } from "./demo.js";

export const STREET_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";
export const SATELLITE_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const number = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 });
const currency = new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", maximumFractionDigits: 2, minimumFractionDigits: 0 });
const infoOffsets = [[4, -60], [85, -45], [-80, 45]];
const distanceOffsets = [[-38, 0], [4, 14], [3, -11]];

export function distanceLabel(meters) {
  if (meters == null) return "—";
  return meters < 1000 ? Math.round(meters) + " m" : number.format(meters / 1000) + " km";
}

export function formatPrice(value) {
  const normalized = value.trim().replace(/\s+/g, "").replace(",", ".");
  if (!normalized) return "";
  const amount = Number(normalized);
  return /^\d+(?:\.\d{1,2})?$/.test(normalized) && amount >= 0 && Number.isFinite(amount)
    ? currency.format(amount) : "";
}

export function formatDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const [year, month, day] = value.split("-");
  return day + "." + month + "." + year;
}

function labelNode(document, className, lines) {
  const card = document.createElement("div");
  card.className = className;
  for (const line of lines) {
    const text = document.createElement("div");
    text.textContent = line;
    card.append(text);
  }
  return card;
}

export function createSimilarMap(L, element, { demo, onPick, onTileStatus }) {
  const document = element.ownerDocument;
  const map = L.map(element, { maxZoom: 19, scrollWheelZoom: false })
    .setView(demo ? [53.775, 20.48] : [52.0, 19.0], demo ? 12 : 6);
  L.control.scale({ imperial: false }).addTo(map);
  const content = L.layerGroup().addTo(map);
  const leaders = L.layerGroup().addTo(map);
  const positions = new Map();
  let connections = [];
  let satellite = false;
  let base;
  let lastProperties = [];
  let lastOptions = {};
  let currentBaseLoaded = false;

  function lineStyle() {
    return { color: satellite ? "#fff" : "#174856", interactive: false };
  }

  function selectBase(isSatellite) {
    if (base && satellite === isSatellite) return;
    if (base) base.remove();
    satellite = isSatellite;
    element.classList.toggle("similar-satellite", satellite);
    currentBaseLoaded = false;
    if (demo) {
      base = demoMapLayer(L, satellite);
    } else {
      base = L.tileLayer(satellite ? SATELLITE_TILES : STREET_TILES, {
        maxZoom: 19, attribution: satellite ? BASE_LAYER_OPTIONS.esri.attribution : "Tiles © Esri",
      });
      base.on("tileerror", () => {
        if (!currentBaseLoaded) onTileStatus("Podkład mapy jest chwilowo niedostępny.");
      });
      base.on("tileload", () => {
        if (currentBaseLoaded) return;
        currentBaseLoaded = true;
        onTileStatus("");
      });
    }
    base.addTo(map);
    render(lastProperties, lastOptions);
  }

  function connectLabels() {
    leaders.clearLayers();
    for (const { marker, target } of connections) {
      L.polyline([marker.getLatLng(), target], { ...lineStyle(), weight: 1, opacity: 0.68 }).addTo(leaders);
    }
  }

  function addLabel(property, kind, target, lines, offset) {
    const key = property.id + "/" + kind;
    const point = map.latLngToContainerPoint(target).add(offset);
    const size = map.getSize();
    const margin = kind === "info" ? Math.min(101, size.x / 3) : 35;
    const bounded = [Math.max(margin, Math.min(size.x - margin, point.x)),
      Math.max(36, Math.min(size.y - 36, point.y))];
    const hasAnchorInView = map.getBounds().contains(target);
    const position = positions.get(key) ?? map.containerPointToLatLng(hasAnchorInView ? bounded : point);
    const marker = L.marker(position, {
      icon: L.divIcon({ className: "similar-map-icon", html: labelNode(document, "similar-map-label " + kind, lines), iconSize: [0, 0] }),
      draggable: true, keyboard: false, zIndexOffset: kind === "distance" ? 600 : 500,
    }).addTo(content);
    marker.on("drag", () => {
      positions.set(key, marker.getLatLng());
      connectLabels();
    });
    connections.push({ marker, target });
  }

  function render(properties, options) {
    lastProperties = properties;
    lastOptions = options;
    const valid = properties.filter(({ location }) => location);
    const subject = properties[0]?.location;
    content.clearLayers();
    connections = [];
    for (const property of valid) {
      const { id, location, price, date, index } = property;
      const point = location.point;
      const subjectPoint = index === 0;
      const labelIndex = (index - 1) % infoOffsets.length;
      const icon = L.divIcon({
        className: "similar-map-icon", iconSize: [34, 34], iconAnchor: [17, 17],
        html: labelNode(document, "similar-pin" + (subjectPoint ? " subject" : ""), [subjectPoint ? "N" : index]),
      });
      const marker = L.marker(point, { icon, zIndexOffset: subjectPoint ? 300 : 200, title: location.title }).addTo(content);
      marker.on("click", () => {
        onPick(id);
        if (!subjectPoint) map.setView(point, Math.max(map.getZoom(), 14), { animate: false });
      });
      if (subjectPoint) marker.bindPopup(labelNode(document, "similar-subject-popup", [location.title, location.detail].filter(Boolean)), { autoPan: false });
      if (options.lines && subject && !subjectPoint) {
        L.polyline([subject.point, point], { ...lineStyle(), dashArray: "6 6", weight: 2 }).addTo(content);
        const middle = map.layerPointToLatLng(map.latLngToLayerPoint(subject.point).add(map.latLngToLayerPoint(point)).divideBy(2));
        addLabel(property, "distance", middle, [distanceLabel(map.distance(subject.point, point))], distanceOffsets[labelIndex]);
      }
      const info = [
        ...(options.labels && !subjectPoint ? [location.title, location.detail] : []),
        options.price && !subjectPoint && formatPrice(price),
        options.date && !subjectPoint && formatDate(date),
      ].filter(Boolean);
      if (info.length) addLabel(property, "info", point, info, infoOffsets[labelIndex]);
    }
    connectLabels();
  }

  selectBase(false);
  map.on("moveend", () => render(lastProperties, lastOptions));
  const resize = typeof ResizeObserver === "function" ? new ResizeObserver(() => map.invalidateSize({ pan: false })) : null;
  resize?.observe(element);

  return {
    render,
    selectBase,
    distance: (a, b) => map.distance(a, b),
    clearPositions(id) {
      positions.delete(id + "/info");
      positions.delete(id + "/distance");
    },
    fit() {
      const points = lastProperties.map(({ location }) => location?.point).filter(Boolean);
      if (points.length === 1) map.setView(points[0], 15);
      if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [50, 55], maxZoom: 15, animate: false });
    },
    destroy() {
      resize?.disconnect();
      map.remove();
    },
  };
}
