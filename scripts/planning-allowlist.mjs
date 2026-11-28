import { PLANNING_LAYERS, EMAPA_POG_BASE, buildPlanningGetMapUrl, buildMpzpInfoUrl, buildDzinfoUrl,
  buildEmapaCapabilitiesUrl, buildEmapaInfoUrl, buildDraftZoneInfoUrl } from "../app/js/modules/dzialki/planning-services.js";
import { PLANNING_LEGEND_URLS } from "../app/js/modules/dzialki/planning-layers.js";

function sameParameters(left, right) {
  const a = [...left.searchParams.entries()].sort(), b = [...right.searchParams.entries()].sort();
  return left.origin === right.origin && left.pathname === right.pathname && JSON.stringify(a) === JSON.stringify(b);
}
export function isAllowedPlanningRequest(raw, method) {
  let url;
  try { url = new URL(raw); } catch { return false; }
  if (method !== "GET" || url.protocol !== "https:" || url.port || url.username || url.password || url.hash) return false;
  if (Object.values(PLANNING_LEGEND_URLS).includes(url.href)) return true;
  const params = url.searchParams;
  try {
    if (url.origin === "https://analizator-nieruchomosci.onrender.com") {
      if (url.pathname === "/api/dzinfo") return url.href === buildDzinfoUrl(params.get("id"));
      if (["/api/mpzp-info", "/api/mpzp-gmina-info"].includes(url.pathname)) {
        if (!params.has("lat") || !params.has("lon")) return false;
        return url.href === buildMpzpInfoUrl({ lat: Number(params.get("lat")), lng: Number(params.get("lon")) },
          url.pathname.includes("gmina") ? params.get("teryt") : null);
      }
    }
    for (const [id, def] of Object.entries(PLANNING_LAYERS)) {
      if (url.origin + url.pathname !== def.url || params.get("request") !== "GetMap" || params.get("layers") !== def.layers) continue;
      const bbox = (params.get("bbox") ?? "").split(",").map(Number);
      if (bbox.length !== 4 || !bbox.every(Number.isFinite) || bbox[0] >= bbox[2] || bbox[1] >= bbox[3]) return false;
      return url.href === buildPlanningGetMapUrl(id, bbox, Number(params.get("width")), Number(params.get("height")));
    }
    if (url.origin + url.pathname === PLANNING_LAYERS.pogDraftGugik.url && params.get("REQUEST") === "GetFeatureInfo") {
      const expected = new URL(buildDraftZoneInfoUrl({ bbox: (params.get("BBOX") ?? "").split(",").map(Number),
        size: { x: Number(params.get("WIDTH")), y: Number(params.get("HEIGHT")) },
        pixel: { x: Number(params.get("I")), y: Number(params.get("J")) } }));
      return url.href === expected.href;
    }
    if (url.origin === "https://wms.e-mapa.net" && /^\/cgi-bin\/pog\/\d{6}$/.test(url.pathname)) {
      const teryt = url.pathname.slice(-6);
      if (url.href === buildEmapaCapabilitiesUrl(teryt)) return true;
      const boxText = (params.get("BBOX") ?? "").split(","), box = boxText.map(Number);
      if (box.length !== 4 || !box.every(Number.isFinite) || box[0] >= box[2] || box[1] >= box[3]) return false;
      if (params.get("REQUEST") === "GetFeatureInfo") {
        if (Math.abs(box[2] - box[0] - 40) > 1e-7 || Math.abs(box[3] - box[1] - 40) > 1e-7) return false;
        const expected = new URL(buildEmapaInfoUrl(teryt, [box[0] + 20, box[1] + 20]));
        expected.searchParams.set("BBOX", params.get("BBOX"));
        return sameParameters(url, expected);
      }
      if (params.get("REQUEST") === "GetMap") {
        const width = Number(params.get("WIDTH")), height = Number(params.get("HEIGHT"));
        if (![width, height].every((n) => Number.isInteger(n) && n >= 16 && n <= 1200)
            || !boxText.every((n) => /^-?\d+\.\d{2}$/.test(n))) return false;
        const expected = EMAPA_POG_BASE + teryt + "?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=app.StrefaPlanistyczna%2Capp.StrefaPlanistyczna-etykiety&STYLES=%2C&SRS=EPSG:2180&BBOX="
          + boxText.join(",") + "&WIDTH=" + width + "&HEIGHT=" + height + "&FORMAT=image/png&TRANSPARENT=TRUE";
        return url.href === expected;
      }
    }
  } catch { return false; }
  return false;
}
