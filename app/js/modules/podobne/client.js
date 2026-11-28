import { BACKENDS } from "../../config.js";
import { geometryExtent, parseCommunes, parseCounties, parseWktGeometry } from "../dzialki/search.js";

export const ADDRESS_URL = "https://services.gugik.gov.pl/uug/";
export const REGION_ID = /^\d{6,7}_\d\.\d{4}$/;
const parcelNumberPattern = /^(?:AR_\d+\.)?\d+(?:\/\d+)?$/i;
const resultFields = "id,parcel,region,commune,county,voivodeship,geom_wkt";
const byCode = (a, b) => a.code.localeCompare(b.code, "pl");
const communePrefix = (code) => code.slice(0, 6);

export function similarUrls(base = BACKENDS.Podobne.baseUrl) {
  function url(path, params) {
    return new URL(path + "?" + new URLSearchParams(params), base).href;
  }
  function units(layer, where) {
    return url("/api/prg/" + layer + "/query", { where, outFields: "teryt,nazwa", returnGeometry: "false", f: "json" });
  }
  return {
    counties: () => units(1, "1=1"),
    communes(county) {
      if (!/^\d{4}$/.test(county)) throw new Error("Wybierz powiat.");
      return units(0, "teryt LIKE '" + county + "%'");
    },
    regions(commune) {
      if (!/^\d{7}$/.test(commune)) throw new Error("Wybierz gminę.");
      return url("/api/regions", { teryt: commune });
    },
    parcel: (id) => url("/api/uldk", { request: "GetParcelByIdOrNr", id, result: resultFields, srid: "4326" }),
    address: (address) => url(ADDRESS_URL, { request: "GetAddress", address }),
  };
}

export function parcelFromResponse(text, expectedId) {
  const rows = text.trim().split(/\r?\n/);
  if (/^-\d+(?:\s|$)/.test(rows[0])) return null;
  for (const line of rows) {
    const [id, number, region, commune, county, province, wkt] =
      line.split(line.includes("|") ? "|" : "\t").map((part) => part.trim());
    if (id !== expectedId) continue;
    if (!wkt || (/^SRID=/i.test(wkt) && !/^SRID=4326;/i.test(wkt))) continue;
    const geometry = parseWktGeometry(wkt);
    const center = geometry && geometryExtent(geometry)?.center;
    if (center) return {
      id, point: [center.lat, center.lon], title: "Działka " + (number || expectedId),
      detail: [region && "obręb " + region, commune, county, province].filter(Boolean).join(" · "),
    };
  }
  return null;
}

export function addressCandidates(data, project) {
  if (!data || typeof data !== "object") throw new Error("Nieprawidłowa odpowiedź usługi adresowej.");
  const points = new Set();
  const results = [];
  for (const row of Object.values(data.results ?? {})) {
    const easting = Number(row?.x);
    const northing = Number(row?.y);
    if (!(easting >= 0 && easting < 1e6 && northing >= 0 && northing < 1e6) || row.x == null || row.y == null) continue;
    const [lon, lat] = project([easting, northing]);
    if (!(lon >= 13.5 && lon <= 24.5 && lat >= 48.5 && lat <= 55)) continue;
    const title = [row.city, [row.street, row.number].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    const key = lat.toFixed(7) + "/" + lon.toFixed(7) + "/" + title;
    if (!title || points.has(key)) continue;
    points.add(key);
    const area = typeof row.jednostka === "string" ? row.jednostka.replace(/[{}]/g, "").split(",").slice(1).join(" · ") : "";
    const precision = row.number ? "" : row.street ? "Punkt orientacyjny ulicy" : "Punkt orientacyjny miejscowości";
    results.push({ point: [lat, lon], title, detail: [area, precision].filter(Boolean).join(" · ") });
  }
  return results;
}

export function createSimilarClient({ fetchImpl = globalThis.fetch, signal, project } = {}) {
  const urls = similarUrls();
  const cache = new Map();

  async function get(url, requestSignal, format = "json") {
    const request = AbortSignal.any([signal, requestSignal, AbortSignal.timeout(35_000)].filter(Boolean));
    let response;
    try { response = await fetchImpl(url, { method: "GET", credentials: "omit", signal: request }); }
    catch {
      request.throwIfAborted();
      throw new Error("Nie udało się połączyć z usługą lokalizacji.");
    }
    if (!response.ok) throw new Error("Usługa lokalizacji zwróciła HTTP " + response.status + ".");
    return response[format]();
  }

  async function units(url, read) {
    if (!cache.has(url)) {
      const request = get(url).then(read).catch((error) => {
        cache.delete(url);
        throw error;
      });
      cache.set(url, request);
    }
    return cache.get(url);
  }

  return {
    counties: () => units(urls.counties(), (data) => parseCounties(data).sort(byCode)),
    communes: (county) => units(urls.communes(county), (data) => parseCommunes(data)
      .filter(({ code }) => code.startsWith(county)).sort(byCode)),
    regions(commune) {
      return units(urls.regions(commune), (data) => {
        if (data?.ok !== true || !Array.isArray(data.regions)) throw new Error("Nie udało się pobrać obrębów.");
        return data.regions.filter((row) => typeof row?.id === "string" && REGION_ID.test(row.id)
          && communePrefix(row.id) === communePrefix(commune))
          .map(({ id, name }) => ({ code: id, name: name || id.split(".")[1] })).sort(byCode);
      });
    },
    async parcel(region, number, name, request) {
      const normalizedNumber = number.trim().replace(/\s+/g, "").toUpperCase();
      if (!REGION_ID.test(region) || !parcelNumberPattern.test(normalizedNumber) || normalizedNumber.length > 32) {
        throw new Error("Wybierz obręb i wpisz numer działki, np. 1867/2.");
      }
      const id = region + "." + normalizedNumber;
      const exact = parcelFromResponse(await get(urls.parcel(id), request, "text"), id);
      const fallback = !exact && name && name !== region.split(".")[1]
        ? parcelFromResponse(await get(urls.parcel(name + " " + normalizedNumber), request, "text"), id)
        : null;
      if (!exact && !fallback) throw new Error("Nie znaleziono działki w wybranym obrębie.");
      return exact ?? fallback;
    },
    async address(value, request) {
      const address = value.trim();
      if (!address) throw new Error("Wpisz miejscowość, ulicę i numer.");
      const data = await get(urls.address(address), request);
      const candidates = addressCandidates(data, await project());
      if (!candidates.length) throw new Error("Brak dopasowania. Sprawdź miejscowość, ulicę i numer.");
      return candidates;
    },
  };
}
