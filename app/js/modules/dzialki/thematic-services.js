import { BACKENDS } from "../../config.js";
import { interiorPoint, parseKiegFeatureInfo } from "./egib.js";
import { buildMapClickFeatureInfoUrl } from "./egib-layers.js";
import { planningRequest } from "./planning-services.js";

export const RWDZ_WMS = "https://mapy.geoportal.gov.pl/wss/ext/GlownyUrzadNadzoruBudowlanego/RWDZ-WMS";
export const ISOK_WMS = "https://wody.isok.gov.pl/wss/INSPIRE/INSPIRE_NZ_HY_MZPMRP_WMS";
export const KIUT_WMS = "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu";
export const THEMATIC_LAYERS = Object.freeze({
  rwdz: { label: "Pozwolenia na budowę (GUNB RWDZ)", url: RWDZ_WMS, layers: "pozwolenia_pkt,pozwolenia_POLYGON", styles: "", version: "1.3.0", opacity: 0.8 },
  flood: { label: "Zagrożenie powodziowe – ISOK (Wody Polskie)", url: ISOK_WMS, layers: "NZ.Fluvial,NZ.SeaWater", styles: "NZ.HazardArea_r.Default,NZ.HazardArea_sea.Default", version: "1.3.0", opacity: 0.72 },
  kiut: { label: "Przyłącza i sieci – KIUT", url: KIUT_WMS, layers: "gesut,kgesut_dane,przewod_urzadzenia,przewod_specjalny,przewod_niezidentyfikowany,przewod_elektroenergetyczny,przewod_telekomunikacyjny,przewod_gazowy,przewod_cieplowniczy,przewod_kanalizacyjny,przewod_wodociagowy", styles: "", version: "1.1.1", opacity: 0.9 },
});
export const OWNERSHIP_COLORS = Object.freeze({ "1":"#ff7777", "2":"#b30000", "3":"#7f0000", "4":"#90ee90", "5":"#006400", "6":"#808000", "7":"#ffd92f", "8":"#ff9acb", "9":"#a66cff", "10":"#d8b4fe", "11":"#87cefa", "12":"#0047ab", "13":"#ffb366", "14":"#cc6600", "15":"#6ec6ff", "16":"#9ca3af" });
export const KIUT_LEGEND = Object.freeze([
  ["#0000ff","Wodociągowa"], ["#803300","Kanalizacyjna"], ["#bfbf00","Gazowa"], ["#d200d2","Ciepłownicza"],
  ["#ff0000","Elektroenergetyczna"], ["#ff9100","Telekomunikacyjna"], ["#000000","Specjalna"], ["#000000","Niezidentyfikowana"], ["#000000","Urządzenia towarzyszące"],
]);
export const THEMATIC_LEGENDS = Object.freeze({
  rwdz: ["pozwolenia_pkt", "pozwolenia_POLYGON"].map((layer) => RWDZ_WMS + "?version=1.3.0&service=WMS&request=GetLegendGraphic&sld_version=1.1.0&layer=" + layer + "&format=image/png&STYLE=default"),
  flood: [ISOK_WMS + "?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetLegendGraphic&LAYER=NZ.Fluvial&STYLE=NZ.HazardArea_r.Default&FORMAT=image/png&WIDTH=490&HEIGHT=80",
    ISOK_WMS + "?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetLegendGraphic&LAYER=NZ.SeaWater&STYLE=NZ.HazardArea_sea.Default&FORMAT=image/png&WIDTH=658&HEIGHT=60"],
});
function bboxValues(box) {
  if (!Array.isArray(box) || box.length !== 4 || !box.every(Number.isFinite) || box[0] >= box[2] || box[1] >= box[3]) throw new TypeError("Nieprawidłowy obszar mapy.");
  return box;
}
export function buildThematicGetMapUrl(id, bbox, width = 256, height = 256) {
  const def = THEMATIC_LAYERS[id];
  if (!def || ![width,height].every((value) => Number.isInteger(value) && value > 0)) throw new TypeError("Nieprawidłowa warstwa mapy.");
  const params = new URLSearchParams({ service:"WMS", request:"GetMap", layers:def.layers, styles:def.styles, format:"image/png", transparent:"true", version:def.version,
    width:String(width), height:String(height), [def.version === "1.3.0" ? "crs" : "srs"]:"EPSG:3857" });
  return def.url + "?" + params + "&bbox=" + bboxValues(bbox).join(",");
}
export function buildOwnershipUrl(bounds) {
  const box = [bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast()];
  bboxValues(box);
  return BACKENDS.Dzialki.baseUrl + "/api/ownership-national?" + new URLSearchParams({ bbox:box.join(",") });
}
export function buildRwdzInfoUrl({ bbox, size, pixel }) {
  bboxValues(bbox);
  if (![size?.x,size?.y,pixel?.x,pixel?.y].every(Number.isFinite) || size.x < 1 || size.y < 1) throw new TypeError("Nieprawidłowe kliknięcie mapy.");
  return BACKENDS.Dzialki.baseUrl + "/api/rwdz-feature-info?" + new URLSearchParams({ SERVICE:"WMS", VERSION:"1.3.0", REQUEST:"GetFeatureInfo",
    LAYERS:"pozwolenia_pkt,pozwolenia_POLYGON", QUERY_LAYERS:"pozwolenia_pkt,pozwolenia_POLYGON", STYLES:"default,default", CRS:"EPSG:3857", BBOX:bbox.join(","),
    WIDTH:String(size.x), HEIGHT:String(size.y), FORMAT:"image/png", INFO_FORMAT:"text/xml", I:String(Math.max(0, Math.min(size.x - 1, Math.floor(pixel.x)))),
    J:String(Math.max(0, Math.min(size.y - 1, Math.floor(pixel.y)))), FEATURE_COUNT:"5" });
}

export function rwdzFieldLabel(raw) {
  const original = String(raw ?? "").trim().replace(/[_-]+/g," ").replace(/([a-ząćęłńóśźż])([A-ZĄĆĘŁŃÓŚŹŻ])/g,"$1 $2");
  const key = original.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  const rules = [
    [/nazwa.*(zamierzen|zam\.?\s*budowlan)|zamierzen.*nazwa/, "Nazwa zamierzenia budowlanego"], [/rodzaj.*(zamierzen|zam\.?\s*budowlan)|zamierzen.*rodzaj/, "Rodzaj zamierzenia budowlanego"],
    [/kategori/, "Kategoria obiektu budowlanego"], [/stan|status/, "Status sprawy"], [/numer ewidencyjny urzad/, "Numer sprawy w urzędzie"], [/numer ewidencyjny system/, "Numer w systemie RWDZ"],
    [/numer.*decyz|nr.*decyz/, "Numer decyzji"], [/data.*decyz|data.*wydan/, "Data wydania decyzji"], [/data.*(wnios|zlozen|wplyw)/, "Data wpływu wniosku"],
    [/numer.*wnios|nr.*wnios|identyfikator.*wnios/, "Numer wniosku"], [/numer.*jednostki/, "Jednostka ewidencyjna"], [/numer.*obreb/, "Obręb ewidencyjny"],
    [/identyfikator.*dzialk|numer.*dzialk|nr.*dzialk/, "Numer działki ewidencyjnej"], [/wojewodztwo/, "Województwo"], [/miasto|miejscow/, "Miejscowość"], [/ulic/, "Ulica"],
    [/numer domu|nr domu/, "Numer domu"], [/kod pocztowy/, "Kod pocztowy"], [/organ/, "Organ administracji"], [/kubatura/, "Kubatura obiektu"],
    [/projektant.*uprawnien/, "Uprawnienia projektanta"], [/nazwisko projektanta/, "Projektant"], [/imie projektanta/, "Imię projektanta"], [/informacje dodatkowe/, ""],
  ];
  return rules.find(([pattern]) => pattern.test(key))?.[1] ?? original;
}
export function parseRwdz(xml, Parser = globalThis.DOMParser) {
  const doc = new Parser().parseFromString(xml,"text/xml");
  if (doc.querySelector("parsererror") || doc.querySelector("ServiceException, ExceptionText")) throw new Error("Nieprawidłowa odpowiedź RWDZ.");
  const local = (node) => (node.localName || node.nodeName || "").replace(/^.*:/, "").toLowerCase();
  const all = [...doc.getElementsByTagName("*")];
  const members = all.filter((node) => local(node) === "featuremember");
  const isFeature = (node) => local(node) === "feature" || /_(polygon|pkt)$/.test(local(node));
  const candidates = members.length ? members : all.filter((node) => {
    if (!isFeature(node)) return false;
    for (let parent = node.parentElement; parent; parent = parent.parentElement) if (isFeature(parent)) return false;
    return true;
  });
  const records = [];
  for (const feature of candidates) {
    const fields = new Map();
    const add = (name,value) => {
      const label = rwdzFieldLabel(name), content = String(value ?? "").trim();
      if (!label || !content || content === "-" || /^(geom|geometry|the[ _]?geom|shape|wkt|bbox|coordinates|pos|poslist)$/i.test(label)) return;
      if (!fields.has(label)) fields.set(label,content);
    };
    const nodes = [...feature.getElementsByTagName("*")], attributes = nodes.filter((node) => local(node) === "attribute");
    if (attributes.length) for (const node of attributes) add(node.getAttribute("Name") || node.getAttribute("name"),node.textContent);
    else for (const node of nodes) {
      const name = node.getAttribute?.("name"), value = node.getAttribute?.("value");
      if (name && value) add(name,value);
      else if (!node.children.length && local(node) !== "feature") add(local(node),node.textContent);
    }
    if (fields.size) records.push([...fields]);
  }
  const rank = (label) => /nazwa zamierzenia|rodzaj zamierzenia|kategoria obiektu|status sprawy|numer sprawy|data wplywu|numer decyzji|numer dzialki|miejscowosc|ulica|organ administracji/i.test(label.normalize("NFD").replace(/[\u0300-\u036f]/g,"")) ? 0 : 1;
  return records.slice(0,5).map((record) => record.sort((a,b) => rank(a[0]) - rank(b[0])).slice(0,16));
}

export async function enrichOwnership(features, { signal, fetchImpl, cache = new Map(), onProgress = () => {} } = {}) {
  let index = 0, completed = 0, failures = 0;
  for (const feature of features) {
    const properties = feature.properties ??= {};
    const cached = cache.get(properties.id_dzialki);
    if (!properties.GRUPA_REJESTROWA && cached) properties.GRUPA_REJESTROWA = cached;
  }
  const missing = () => features.filter((feature) => !OWNERSHIP_COLORS[String(feature.properties?.GRUPA_REJESTROWA ?? "").trim()]);
  const candidates = missing().filter((feature) => feature.geometry).slice(0,60);
  const worker = async () => {
    while (index < candidates.length) {
      signal?.throwIfAborted();
      const feature = candidates[index++], id = feature.properties.id_dzialki;
      try {
        const point = feature.geometry.type === "Point" ? feature.geometry.coordinates : interiorPoint(feature.geometry);
        if (!point) throw new Error("Brak punktu wewnątrz działki.");
        const xml = await planningRequest(buildMapClickFeatureInfoUrl({lng:point[0],lat:point[1]}), { signal,fetchImpl,format:"text" });
        signal?.throwIfAborted();
        const group = parseKiegFeatureInfo(xml,id).group;
        if (OWNERSHIP_COLORS[group]) { feature.properties.GRUPA_REJESTROWA = group; if (id) cache.set(id,group); }
        else failures += 1;
      } catch (error) { if (signal?.aborted) throw error; failures += 1; }
      completed += 1;
      onProgress({ completed,total:candidates.length,missing:missing().length,failures });
    }
  };
  await Promise.all(Array.from({length:Math.min(4,candidates.length)},worker));
  return { completed,missing:missing().length,failures,total:features.length };
}
