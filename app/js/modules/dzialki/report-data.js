import { buildMapClickFeatureInfoUrl } from "./egib-layers.js";
import { parseKiegFeatureInfo, readKiegParcelId, interiorPoint } from "./egib.js";
import { createSearchApi, resolveParcelAdministrativeNames } from "./search.js";
import { loadMpzp, planningRequest, PLANNING_LAYERS } from "./planning-services.js";
import { BASE_LAYER_OPTIONS } from "./layers-base.js";
import { KIUT_LEGEND, OWNERSHIP_LEGEND, THEMATIC_LAYERS } from "./thematic-services.js";
import { measureGeometry } from "./map-tools.js";

const EGiB_LABELS = { numbers: "Numery działek (EGiB)", parcels: "Kontury działek (EGiB)", buildings: "Kontury budynków (EGiB)" };
const POG_SYMBOLS = [
  ["SW", "wielofunkcyjna z zabudową mieszkaniową wielorodzinną"],
  ["SJ", "wielofunkcyjna z zabudową mieszkaniową jednorodzinną"],
  ["SZ", "wielofunkcyjna z zabudową zagrodową"],
  ["SU", "usługowa"],
  ["SH", "handlu wielkopowierzchniowego"],
  ["SP", "gospodarcza"],
  ["SR", "produkcji rolniczej"],
  ["SI", "infrastrukturalna"],
  ["SN", "zieleni i rekreacji"],
  ["SC", "cmentarzy"],
  ["SG", "górnictwa"],
  ["SO", "otwarta"],
  ["SK", "komunikacyjna"],
];

export async function collectReportParcel({ selection, point, signal, fetchImpl = globalThis.fetch }) {
  const api = createSearchApi({ fetchImpl, timeoutMs: 20000, retries: 0 });
  let id = selection?.parcel?.id;
  let xml;
  if (!id) {
    xml = await planningRequest(buildMapClickFeatureInfoUrl(point), { signal, fetchImpl, format: "text" });
    id = readKiegParcelId(xml);
    if (!id) return null;
  }
  const match = /^(\d{6}_\d\.\d{4})\.([\dA-Za-z/.-]{1,32})$/.exec(id);
  if (!match) throw new Error("Nieprawidłowy identyfikator działki.");

  const record = selection?.geometry ? null : await api.parcel(match[1], match[2], { signal }).catch(() => null);
  signal?.throwIfAborted();
  const found = record?.id === id ? record : null;
  const geometry = selection?.geometry ?? found?.geometry;
  const names = resolveParcelAdministrativeNames(found ?? { id }, {});
  const center = geometry ? interiorPoint(geometry) : null;
  const position = point ?? (center ? { lat: center[1], lng: center[0] } : null);
  const [egib, planning] = await Promise.all([
    selection?.egib ?? (xml ? parseKiegFeatureInfo(xml, id)
      : api.egib(id, { signal }).catch(() => null)),
    position ? loadMpzp(position, id, { signal, fetchImpl }).catch(() => ({ incomplete: true }))
      : { incomplete: true },
  ]);
  signal?.throwIfAborted();
  const plan = (planning.plans ?? []).filter(Boolean).map(item => [item.tytul, item.status, item.obowiazujeOd || item.data].filter(Boolean).join(" · "));
  if (planning.mpzp?.nazwaAktu && !plan.includes(planning.mpzp.nazwaAktu)) plan.push(planning.mpzp.nazwaAktu);
  const zones = planning.mpzp?.strefy;
  for (const zone of Array.isArray(zones) ? zones : []) {
    if (!zone) continue;
    const description = [zone.etykieta, zone.opis].filter(Boolean).join(" - ");
    if (description) plan.push(description);
  }
  if (planning.incomplete) plan.push("Wynik niepełny. Część informacji planistycznych jest niedostępna.");
  const polygons = geometry?.type === "Polygon" ? [geometry.coordinates] : geometry?.coordinates ?? [];
  const recordedArea = egib?.area && egib.area !== "brak danych" ? egib.area : "";
  const approximateArea = recordedArea ? 0 : polygons.reduce((total, polygon) => total + polygon.reduce((area, ring, i) => {
    const ringArea = measureGeometry(ring.map(([lng, lat]) => ({ lat, lng }))).area;
    return area + (i === 0 ? ringArea : -ringArea);
  }, 0), 0);
  const area = recordedArea || (approximateArea > 0 ? "ok. " + Math.round(approximateArea).toLocaleString("pl-PL") + " m² (z geometrii)" : "");
  return {
    id,
    fields: [
      ["Województwo", selection?.voivodeshipName || names.voivodeshipName],
      ["Powiat", selection?.countyName || names.countyName],
      ["Gmina", selection?.communeName || names.communeName],
      ["Obręb", selection?.region?.name || names.regionName],
      ["Numer działki", selection?.parcel.number || match[2]],
      ["Powierzchnia", area],
      ["Grupa rejestrowa", [egib?.group, egib?.groupDescription].filter(Boolean).join(" - ")],
      ["Klasoużytki", egib?.classUse?.map(item => [item.code, item.description].filter(Boolean).join(" - ")).join(", ")],
      ["Zagospodarowanie (MPZP)", plan.filter(Boolean).join("\n") || "Sprawdzone źródła nie zwróciły szczegółów. Rysunek MPZP może nadal pokazywać plan."],
    ],
  };
}

export function reportMapLayers(state) {
  const base = BASE_LAYER_OPTIONS[state.baseLayer].label;
  return [
    state.baseLayer === "archive" ? base + " (" + state.year + ")" : base,
    ...Object.keys(EGiB_LABELS).filter(id => state.egibLayers[id]).map(id => EGiB_LABELS[id]),
    ...Object.entries(PLANNING_LAYERS).filter(([id]) => state.planningLayers[id]).map(([, item]) => item.label),
    ...Object.entries(THEMATIC_LAYERS).filter(([id]) => state.thematicLayers[id]).map(([, item]) => item.label),
    ...(state.thematicLayers.ownership ? ["Mapa własności"] : []),
  ];
}

export function reportMapLegends(state, planningHelp) {
  const legends = [];
  if (state.thematicLayers.ownership) legends.push({
    label: "Mapa własności - grupy rejestrowe",
    rows: OWNERSHIP_LEGEND,
  });
  if (state.thematicLayers.kiut) legends.push({ label: "Sieci uzbrojenia terenu (KIUT)", rows: KIUT_LEGEND });
  if (state.planningLayers.mpzp) {
    legends.push({ label: "Orientacyjne oznaczenia MPZP", rows: [[null, planningHelp]] });
  }
  const pog = ["pogAdopted", "pogDraftRu", "pogDraftGugik"]
    .filter(id => state.planningLayers[id]).map(id => PLANNING_LAYERS[id].label);
  if (pog.length) {
    legends.push({
      label: "Oznaczenia stref planu ogólnego (POG)",
      rows: [[null, "Włączone warstwy POG: " + pog.join(", ")],
        ...POG_SYMBOLS.map(([code, description]) => [null, code + " - strefa " + description])],
    });
  }
  return legends;
}
