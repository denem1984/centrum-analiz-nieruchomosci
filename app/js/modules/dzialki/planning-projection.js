import { EMAPA_POG_BASE } from "./planning-services.js";

export const PROJ4_INTEGRITY = "sha256-tsjlDiRXDSAsuQALr13ta74LzDw1fOf0yfPGMB2FmfU=";
const pending = new WeakMap();
export async function loadPlanningProjection(documentRef = globalThis.document, windowRef = globalThis.window, { inverse = false } = {}) {
  if (!windowRef.proj4) {
    if (!pending.has(windowRef)) {
      const task = new Promise((resolve, reject) => {
        const script = documentRef.createElement("script");
        script.src = new URL("../../../vendor/dzialki/proj4-2.9.0/proj4.js", import.meta.url).href;
        script.integrity = PROJ4_INTEGRITY;
        script.async = true;
        script.addEventListener("load", resolve, { once: true });
        script.addEventListener("error", () => reject(new Error("Nie udało się załadować lokalnej biblioteki projekcji.")), { once: true });
        documentRef.head.append(script);
      });
      pending.set(windowRef, task);
      task.catch(() => pending.delete(windowRef));
    }
    await pending.get(windowRef);
  }
  const proj = windowRef.proj4;
  if (typeof proj !== "function") throw new Error("Brak biblioteki projekcji.");
  proj.defs("EPSG:2180", "+proj=tmerc +lat_0=0 +lon_0=19 +k=0.9993 +x_0=500000 +y_0=-5300000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");
  return inverse
    ? (coordinates) => proj("EPSG:2180", "EPSG:4326", coordinates)
    : (coordinates) => proj("EPSG:4326", "EPSG:2180", coordinates);
}

export function emapaTileRequest(teryt, coords, project) {
  if (!/^\d{6}$/.test(teryt) || ![coords?.x, coords?.y, coords?.z].every(Number.isInteger)) throw new TypeError("Nieprawidłowy kafelek gminy.");
  const radius = 6378137, origin = 20037508.342789244;
  const size = 2 * origin / 2 ** coords.z;
  const minX = -origin + coords.x * size, maxY = origin - coords.y * size;
  const transform = (x, y) => project([x / radius * 180 / Math.PI, (2 * Math.atan(Math.exp(y / radius)) - Math.PI / 2) * 180 / Math.PI]);
  const nw = transform(minX, maxY), ne = transform(minX + size, maxY), sw = transform(minX, maxY - size), se = transform(minX + size, maxY - size);
  const minE = Math.min(nw[0], ne[0], sw[0], se[0]), maxE = Math.max(nw[0], ne[0], sw[0], se[0]);
  const minN = Math.min(nw[1], ne[1], sw[1], se[1]), maxN = Math.max(nw[1], ne[1], sw[1], se[1]);
  const gx = Math.hypot(ne[0] - nw[0], ne[1] - nw[1]) / 256;
  const width = Math.max(16, Math.min(1200, Math.ceil((maxE - minE) / gx))), height = Math.max(16, Math.min(1200, Math.ceil((maxN - minN) / gx)));
  const sx = (maxE - minE) / width, sy = (maxN - minN) / height;
  const a11 = (ne[0] - nw[0]) / 256, a12 = (sw[0] - nw[0]) / 256, a21 = (ne[1] - nw[1]) / 256, a22 = (sw[1] - nw[1]) / 256;
  const det = a11 * a22 - a12 * a21, dE = minE - nw[0], dN = maxN - nw[1];
  if (!Number.isFinite(det) || Math.abs(det) < 1e-10) throw new Error("Nieprawidłowa projekcja kafelka.");
  return {
    url: EMAPA_POG_BASE + teryt + "?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS="
      + encodeURIComponent("app.StrefaPlanistyczna,app.StrefaPlanistyczna-etykiety")
      + "&STYLES=%2C&SRS=EPSG:2180&BBOX=" + [minE, minN, maxE, maxN].map((v) => v.toFixed(2)).join(",")
      + "&WIDTH=" + width + "&HEIGHT=" + height + "&FORMAT=image/png&TRANSPARENT=TRUE",
    matrix: [a22 * sx / det, -a21 * sx / det, a12 * sy / det, -a11 * sy / det, (a22 * dE - a12 * dN) / det, (-a21 * dE + a11 * dN) / det],
  };
}

export function createEmapaLayer(L, { project, teryt, documentRef = document, ImageClass = Image }) {
  const Layer = L.GridLayer.extend({
    createTile(coords, done) {
      const tile = documentRef.createElement("canvas");
      tile.width = tile.height = 256;
      tile.dataset.tileState = "loading";
      const spec = emapaTileRequest(teryt, coords, project);
      const image = new ImageClass();
      image.crossOrigin = "anonymous";
      Object.defineProperties(tile, {
        complete: { get: () => tile.dataset.tileState === "loaded" },
        naturalWidth: { get: () => tile.complete ? 256 : 0 },
        naturalHeight: { get: () => tile.complete ? 256 : 0 },
      });
      let settled = false;
      let timeout;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        image.onload = image.onerror = null;
        if (error) image.removeAttribute("src");
        tile.dataset.tileState = error ? "error" : "loaded";
        done(error, tile);
      };
      const loaded = () => {
        try {
          if (image.naturalWidth <= 1 || image.naturalHeight <= 1) throw new Error("Pusty obraz POG.");
          const context = tile.getContext("2d");
          context.setTransform(...spec.matrix);
          context.drawImage(image, 0, 0);
          finish(null);
        } catch { finish(new Error("Nie udało się narysować kafelka POG.")); }
      };
      const start = () => {
        settled = false;
        tile.dataset.tileState = "loading";
        image.onload = loaded;
        image.onerror = () => finish(new Error("Nie udało się wczytać kafelka POG."));
        timeout = setTimeout(() => finish(new Error("Przekroczono czas kafelka POG.")), 20000);
        image.src = spec.url;
      };
      tile.retryPlanningTile = () => { if (tile.dataset.tileState === "error") start(); };
      tile.cancelPlanningTile = () => {
        clearTimeout(timeout); settled = true;
        image.onload = image.onerror = null; image.removeAttribute("src");
        tile.dataset.tileState = "cancelled";
      };
      start();
      return tile;
    },
  });
  const layer = new Layer({ pane: "overlayPane", minZoom: 13, maxZoom: 22, opacity: 0.6, keepBuffer: 1, updateWhenIdle: true, updateWhenZooming: false });
  layer.on("tileunload", (event) => event.tile?.cancelPlanningTile?.());
  return layer;
}
