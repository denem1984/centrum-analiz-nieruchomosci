import { deriveCommuneFromUnitId, terc7ToTeryt } from "./teryt.js";
import { buildEgibGeometryUrl, buildKiegFeatureInfoUrl, parseEgibGeometryText, parseKiegFeatureInfo } from "./egib.js";

export const PRG_FEATURE_SERVICE =
  "https://mapy.geoportal.gov.pl/wss/ims/maps/PRG_gugik_wyszukiwarka/FeatureServer/";
export const ULDK_ENDPOINT = "https://uldk.gugik.gov.pl/";
export const SEARCH_TIMEOUT_MS = 120000;
export const SEARCH_AUTO_RETRIES = 1;

const REGION_RESULT_FIELDS = "id,teryt,region,commune,county";
const PARCEL_RESULT_FIELDS = "id,teryt,parcel,county,commune,region,geom_wkt";

export const VOIVODESHIP_NAMES = Object.freeze({
  "02": "dolnośląskie", "04": "kujawsko-pomorskie", "06": "lubelskie", "08": "lubuskie",
  "10": "łódzkie", "12": "małopolskie", "14": "mazowieckie", "16": "opolskie",
  "18": "podkarpackie", "20": "podlaskie", "22": "pomorskie", "24": "śląskie",
  "26": "świętokrzyskie", "28": "warmińsko-mazurskie", "30": "wielkopolskie", "32": "zachodniopomorskie",
});

function textName(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedCountyFallback(value) {
  return textName(value).replace(/^powiat\s+/i, "");
}

export function resolveParcelAdministrativeNames(parcel, selected = {}, voivodeshipNames = VOIVODESHIP_NAMES) {
  const idPrefix = typeof parcel?.id === "string" ? parcel.id.match(/^(\d{2})\d{4}_/)?.[1] : null;
  const countyCode = typeof selected.powiat?.code === "string" && /^\d{4}$/.test(selected.powiat.code)
    ? selected.powiat.code
    : null;
  const voivodeshipCode = countyCode?.slice(0, 2) ?? idPrefix;
  return {
    voivodeshipName: voivodeshipNames[voivodeshipCode] ?? "",
    countyName: textName(selected.powiat?.name) || normalizedCountyFallback(parcel?.county),
    communeName: textName(selected.gmina?.name) || textName(parcel?.commune),
    regionName: textName(selected.region?.name) || textName(parcel?.region),
  };
}
const PARCEL_NUMBER_PATTERN = /^[0-9]+(?:[/.\-][0-9A-Za-z]+)*$/;

function withParams(url, entries) {
  for (const [key, value] of entries) url.searchParams.set(key, value);
  return url.toString();
}

export function buildCountiesUrl() {
  return withParams(new URL("1/query", PRG_FEATURE_SERVICE), [
    ["where", "1=1"],
    ["outFields", "teryt,nazwa"],
    ["returnGeometry", "false"],
    ["orderByFields", "nazwa"],
    ["f", "json"],
  ]);
}

export function buildCommunesUrl(countyCode) {
  if (typeof countyCode !== "string" || !/^\d{4}$/.test(countyCode)) {
    throw new TypeError("Nieprawidłowy kod powiatu.");
  }
  const url = new URL("0/query", PRG_FEATURE_SERVICE);
  return withParams(url, [
    ["where", `teryt LIKE '${countyCode}%'`],
    ["outFields", "teryt,nazwa"],
    ["returnGeometry", "true"],
    ["outSR", "4326"],
    ["orderByFields", "nazwa"],
    ["f", "json"],
  ]);
}

export function uldkRegionIdFromTerc7(terc7) {
  if (typeof terc7 !== "string" || !/^\d{7}$/.test(terc7)) return null;
  return terc7.slice(0, 6) + "_" + terc7.slice(6);
}

export function buildRegionsUrl(terc7) {
  const id = uldkRegionIdFromTerc7(terc7);
  if (!id) throw new TypeError("Nieprawidłowy kod gminy TERC7.");
  return withParams(new URL(ULDK_ENDPOINT), [
    ["request", "GetRegionByNameOrId"],
    ["id", id],
    ["result", REGION_RESULT_FIELDS],
  ]);
}

export function isValidParcelNumber(value) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 32
    && PARCEL_NUMBER_PATTERN.test(value);
}

export function buildParcelId(regionId, parcelNumber) {
  if (typeof regionId !== "string" || !/^\d{6}_\d\.\d{4}$/.test(regionId)) {
    throw new TypeError("Nieprawidłowy identyfikator obrębu.");
  }
  const number = typeof parcelNumber === "string" ? parcelNumber.trim() : "";
  if (!isValidParcelNumber(number)) throw new TypeError("Nieprawidłowy numer działki.");
  return regionId + "." + number;
}

export function buildParcelUrl(regionId, parcelNumber) {
  const id = buildParcelId(regionId, parcelNumber);
  return withParams(new URL(ULDK_ENDPOINT), [
    ["request", "GetParcelById"],
    ["id", id],
    ["result", PARCEL_RESULT_FIELDS],
    ["srid", "4326"],
  ]);
}

function readFeatureRows(payload) {
  if (!payload || !Array.isArray(payload.features)) {
    throw new Error("Nieprawidłowa odpowiedź listy jednostek administracyjnych.");
  }
  return payload.features.map((feature) => {
    const attributes = feature?.attributes;
    if (!attributes || typeof attributes.teryt !== "string"
        || typeof attributes.nazwa !== "string") {
      throw new Error("Odpowiedź listy zawiera kod lub nazwę w nieprawidłowym formacie.");
    }
    const code = attributes.teryt.trim();
    const name = attributes.nazwa.trim();
    if (!code || !name) throw new Error("Odpowiedź listy zawiera pusty kod lub nazwę.");
    return { code, name };
  });
}

export function parseCounties(payload) {
  const rows = readFeatureRows(payload);
  if (rows.some((item) => !/^\d{4}$/.test(item.code))) {
    throw new Error("Lista powiatów zawiera nieprawidłowy kod TERYT.");
  }
  return rows;
}

export function parseCommunes(payload) {
  const rows = readFeatureRows(payload);
  if (rows.some((item) => !/^\d{7}$/.test(item.code))) {
    throw new Error("Lista gmin zawiera nieprawidłowy kod TERC7.");
  }
  return rows;
}

export function normalizeCommuneCode(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (/^\d{7}$/.test(text)) return text.slice(0, 6) + "_" + text.slice(6);
  return null;
}

export function parseRegionsText(value) {
  if (typeof value !== "string") throw new Error("Nieprawidłowa odpowiedź listy obrębów.");
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const status = lines.shift();
  if (status !== "0" && status && /^\d+$/.test(status)) {
    throw new Error("Usługa danych zwróciła błąd podczas pobierania listy obrębów.");
  }
  const unique = new Map();
  for (const line of lines) {
    const fields = line.split("|").map((field) => field.trim());
    const id = fields[0];
    if (!/^\d{6}_\d\.\d{4}$/.test(id ?? "")) continue;
    const name = fields[2] || fields[1] || id;
    if (name) unique.set(id, { code: id, name });
  }
  return [...unique.values()].sort((left, right) => left.name.localeCompare(right.name, "pl"));
}

function splitTopLevel(value) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    else if (character === "," && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts;
}

function parseRing(value) {
  const points = value.split(",").map((pair) => {
    const coordinates = pair.trim().split(/\s+/).map(Number);
    if (coordinates.length < 2 || !coordinates.slice(0, 2).every(Number.isFinite)) return null;
    return coordinates.slice(0, 2);
  });
  return points.length >= 4 && points.every(Boolean) ? points : null;
}

function stripOuterParentheses(value) {
  const text = value.trim();
  if (!text.startsWith("(") || !text.endsWith(")")) return text;
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "(") depth += 1;
    else if (text[index] === ")") depth -= 1;
    if (depth === 0 && index < text.length - 1) return text;
  }
  return text.slice(1, -1).trim();
}

function parsePolygonBody(value, wrapped = false) {
  const body = wrapped ? stripOuterParentheses(value) : value.trim();
  const rings = splitTopLevel(body).map((ring) => parseRing(stripOuterParentheses(ring)));
  return rings.length && rings.every(Boolean) ? rings : null;
}

export function parseWktGeometry(value) {
  if (typeof value !== "string") return null;
  const wkt = value.trim().replace(/^SRID=\d+;/i, "");
  let match = wkt.match(/^POLYGON\s*\((.*)\)$/i);
  if (match) {
    const rings = parsePolygonBody(match[1]);
    return rings ? { type: "Polygon", coordinates: rings } : null;
  }
  match = wkt.match(/^MULTIPOLYGON\s*\((.*)\)$/i);
  if (!match) return null;
  const polygons = splitTopLevel(match[1]).map((polygon) => parsePolygonBody(polygon, true));
  return polygons.length && polygons.every(Boolean)
    ? { type: "MultiPolygon", coordinates: polygons }
    : null;
}

function ringCentroid(ring) {
  let twiceArea = 0;
  let longitudeSum = 0;
  let latitudeSum = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[index + 1];
    const cross = x1 * y2 - x2 * y1;
    twiceArea += cross;
    longitudeSum += (x1 + x2) * cross;
    latitudeSum += (y1 + y2) * cross;
  }
  if (Math.abs(twiceArea) < 1e-12) return null;
  return {
    area: Math.abs(twiceArea / 2),
    lon: longitudeSum / (3 * twiceArea),
    lat: latitudeSum / (3 * twiceArea),
  };
}

function geometryCenter(geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let totalArea = 0;
  let longitudeSum = 0;
  let latitudeSum = 0;
  for (const polygon of polygons) {
    for (let index = 0; index < polygon.length; index += 1) {
      const centroid = ringCentroid(polygon[index]);
      if (!centroid) continue;
      const weight = centroid.area * (index === 0 ? 1 : -1);
      totalArea += weight;
      longitudeSum += centroid.lon * weight;
      latitudeSum += centroid.lat * weight;
    }
  }
  if (totalArea <= 0) return null;
  return { lat: latitudeSum / totalArea, lon: longitudeSum / totalArea };
}

function geometryExtent(geometry) {
  const positions = [];
  const visit = (value) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])) {
      positions.push(value);
      return;
    }
    for (const child of value) visit(child);
  };
  visit(geometry.coordinates);
  if (!positions.length) return null;
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  for (const [longitude, latitude] of positions) {
    west = Math.min(west, longitude);
    east = Math.max(east, longitude);
    south = Math.min(south, latitude);
    north = Math.max(north, latitude);
  }
  if (positions.some(([lon, lat]) => lon < 13.5 || lon > 24.5 || lat < 48.5 || lat > 55)) return null;
  const center = geometryCenter(geometry) ?? { lat: (south + north) / 2, lon: (west + east) / 2 };
  return { west, south, east, north, center };
}

export function parseParcelText(value, requestedId) {
  if (typeof value !== "string") throw new Error("Nieprawidłowa odpowiedź wyszukiwania działki.");
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const status = lines.shift();
  if (status !== "0" && status && /^\d+$/.test(status)) {
    throw new Error("Usługa danych zwróciła błąd podczas wyszukiwania działki.");
  }
  const line = lines.find((candidate) => /(?:MULTI)?POLYGON\s*\(/i.test(candidate));
  if (!line) return null;
  const fields = line.split("|").map((field) => field.trim());
  const wkt = fields.find((field) => /^(?:SRID=\d+;)?(?:MULTI)?POLYGON\s*\(/i.test(field));
  const geometry = parseWktGeometry(wkt);
  const extent = geometry && geometryExtent(geometry);
  if (!geometry || !extent) throw new Error("Odpowiedź działki zawiera nieprawidłową geometrię.");
  return {
    id: fields[0] || requestedId,
    teryt: fields[1] || "",
    number: fields[2] || "",
    county: fields[3] || "",
    commune: fields[4] || "",
    region: fields[5] || "",
    geometry,
    extent,
  };
}

export function createSearchContext(selection) {
  const parcel = selection?.parcel;
  if (!parcel?.id || !selection?.extent?.center) return null;
  const context = {
    version: "1",
    source: "dzialki",
    kind: "dzialka",
    match: "exact",
    name: "Działka " + parcel.id,
    parcel: { id: parcel.id },
    point: { ...selection.extent.center, crs: "EPSG:4326" },
  };
  const unitPrefix = typeof parcel.id === "string" ? parcel.id.match(/^(\d{6})_/)?.[1] : null;
  const powiatCode = unitPrefix?.slice(0, 4);
  if (typeof powiatCode === "string" && /^\d{4}$/.test(powiatCode)
      && selection.powiat?.code === powiatCode) {
    if (typeof selection.powiat.name === "string" && selection.powiat.name.trim()) {
      context.powiat = { code: powiatCode, name: selection.powiat.name };
    }
    if (context.powiat && typeof selection.voivodeshipName === "string"
        && selection.voivodeshipName.trim()) {
      context.voivodeship = {
        code: powiatCode.slice(0, 2),
        name: selection.voivodeshipName,
      };
    }
  }
  const gmina = deriveCommuneFromUnitId(parcel.id, selection.communes ?? (selection.gmina ? [selection.gmina] : []));
  if (gmina) {
    context.gmina = { terc7: gmina.code, name: gmina.name, kind: gmina.kind };
  }
  return context;
}

export function createSearchApi(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? SEARCH_TIMEOUT_MS;
  const retries = options.retries ?? SEARCH_AUTO_RETRIES;
  const now = options.now ?? Date.now;
  const setTimeoutFn = options.setTimeoutFn ?? globalThis.setTimeout;
  const clearTimeoutFn = options.clearTimeoutFn ?? globalThis.clearTimeout;
  const setIntervalFn = options.setIntervalFn ?? globalThis.setInterval;
  const clearIntervalFn = options.clearIntervalFn ?? globalThis.clearInterval;

  async function request(url, responseKind, { onWait = () => {}, signal, startedAt: sharedStartedAt } = {}) {
    if (typeof fetchImpl !== "function") throw new Error("Brak obsługi żądań HTTP w przeglądarce.");
    const startedAt = Number.isFinite(sharedStartedAt) ? sharedStartedAt : now();
    let attempt = 0;
    while (attempt <= retries) {
      const remaining = timeoutMs - (now() - startedAt);
      if (remaining <= 0) throw new Error("Upłynął limit czasu oczekiwania na dane.");
      const controller = new AbortController();
      const relayAbort = () => controller.abort();
      if (signal?.aborted) controller.abort();
      else signal?.addEventListener("abort", relayAbort, { once: true });
      const timeout = setTimeoutFn(() => controller.abort(), remaining);
      const ticker = setIntervalFn(() => onWait(Math.floor((now() - startedAt) / 1000)), 1000);
      try {
        const response = await fetchImpl(url, { method: "GET", signal: controller.signal });
        if (!response?.ok) {
          const error = new Error("Usługa zwróciła błąd HTTP " + (response?.status ?? "?") + ".");
          error.name = "HttpResponseError";
          throw error;
        }
        return responseKind === "json" ? await response.json() : await response.text();
      } catch (error) {
        if (error?.name === "HttpResponseError") throw error;
        if (signal?.aborted) throw new DOMException("Żądanie anulowane.", "AbortError");
        attempt += 1;
        if (attempt > retries || now() - startedAt >= timeoutMs) {
          throw new Error(error?.name === "AbortError"
            ? "Upłynął limit czasu oczekiwania na dane."
            : "Nie udało się połączyć z usługą danych.");
        }
      } finally {
        clearTimeoutFn(timeout);
        clearIntervalFn(ticker);
        signal?.removeEventListener("abort", relayAbort);
      }
    }
    throw new Error("Nie udało się pobrać danych.");
  }

  return Object.freeze({
    async counties(options) { return parseCounties(await request(buildCountiesUrl(), "json", options)); },
    async communes(code, options) { return parseCommunes(await request(buildCommunesUrl(code), "json", options)); },
    async regions(terc7, options) { return parseRegionsText(await request(buildRegionsUrl(terc7), "text", options)); },
    async parcel(regionId, parcelNumber, options) {
      const id = buildParcelId(regionId, parcelNumber);
      const response = await request(buildParcelUrl(regionId, parcelNumber), "text", options);
      return parseParcelText(response, id);
    },
    async egib(parcelId, options) {
      const startedAt = now();
      const scopedOptions = { ...options, startedAt };
      const geometryText = await request(buildEgibGeometryUrl(parcelId), "text", scopedOptions);
      const geometry = parseEgibGeometryText(geometryText, parseWktGeometry);
      const infoText = await request(buildKiegFeatureInfoUrl(geometry), "text", scopedOptions);
      return parseKiegFeatureInfo(infoText, parcelId, geometry);
    },
  });
}

export { terc7ToTeryt };
