import { createSearchApi, geometryExtent, PRG_FEATURE_SERVICE } from "../modules/dzialki/search.js";
import { ADDRESS_URL } from "../modules/podobne/client.js";
import { streetName } from "./shared.js";

export const catalogUrl = (name) => new URL("../../data/location/" + name + ".json", import.meta.url).href;
export const provinceCodes = Array.from({ length: 16 }, (_, index) => String(2 + index * 2).padStart(2, "0"));
export const normalizedName = (name) => name.toLocaleLowerCase("pl").replaceAll("ł", "l")
  .normalize("NFD").replace(/\p{M}/gu, "").trim();
const streetTypes = new Map([
  ["al.", "aleja"], ["pl.", "plac"], ["os.", "osiedle"], ["bulw.", "bulwar"], ["wyb.", "wybrzeze"],
]);
export function displayStreetName(value) {
  const words = value.split(" ");
  const type = normalizedName(words[0]);
  const firstName = words[1] && normalizedName(words[1]);
  return firstName && (streetTypes.get(type) ?? type) === firstName ? words.slice(1).join(" ") : value;
}
export function compareChoices(a, b) {
  return a.label.localeCompare(b.label, "pl") || a.value.localeCompare(b.value);
}

export function areaUrl(terc) {
  if (!/^\d{7}$/.test(terc)) throw new TypeError("Nieprawidłowy TERC gminy.");
  const url = new URL("0/query", PRG_FEATURE_SERVICE);
  url.search = new URLSearchParams({
    where: "teryt='" + terc + "'", outFields: "teryt,nazwa", returnGeometry: "true", outSR: "4326", f: "json",
  });
  return url.href;
}

export function addressUrl(place, street) {
  const url = new URL(ADDRESS_URL);
  url.search = new URLSearchParams({
    request: "GetAddress",
    address: [place.name, [streetName(street), street?.number].filter(Boolean).join(" ")].filter(Boolean).join(", "),
  });
  return url.href;
}

export function addressPoint(data, place, street, project) {
  const role = street?.number ? "address" : street ? "street" : "place";
  const matches = new Map();
  for (const row of Object.values(data?.results ?? {})) {
    if (row?.simc !== place.simc7 || (street ? row.ulic !== street.ulic5 : row.street)
        || (street?.number ? normalizedName(String(row.number ?? "")) !== normalizedName(street.number) : row.number)) continue;
    const x = Number(row.x);
    const y = Number(row.y);
    if (row.x == null || row.y == null || !(x > 0 && x < 1e6 && y > 0 && y < 1e6)) continue;
    const [lon, lat] = project([x, y]);
    if (!(lon >= 13.5 && lon <= 24.5 && lat >= 48.5 && lat <= 55)) continue;
    matches.set([lat.toFixed(7), lon.toFixed(7)].join(","), { lat, lon, role, crs: "EPSG:4326" });
  }
  return matches.size === 1 ? matches.values().next().value : null;
}

export function areaGeometry(payload, terc) {
  const features = payload?.features?.filter((row) => row.attributes?.teryt === terc);
  if (payload?.spatialReference?.wkid !== 4326 || features?.length !== 1) return null;
  const rings = features[0].geometry?.rings;
  if (!Array.isArray(rings) || !rings.length || rings.some((ring) => !Array.isArray(ring) || ring.length < 4)) return null;
  const geometry = { type: "Polygon", coordinates: rings };
  const extent = geometryExtent(geometry);
  if (!extent) return null;
  const { east, west, north, south } = extent;
  return { geometry, point: { lon: (east + west) / 2, lat: (north + south) / 2, role: "area", crs: "EPSG:4326" } };
}

export function createStartClient({ fetchImpl = globalThis.fetch, signal, project }) {
  const cache = new Map();
  const searchApi = createSearchApi({ fetchImpl, timeoutMs: 15_000, retries: 0 });
  async function json(url, requestSignal) {
    const response = await fetchImpl(url, {
      method: "GET", signal: AbortSignal.any([signal, requestSignal, AbortSignal.timeout(15_000)].filter(Boolean)),
    });
    if (!response.ok) throw new Error("Nie udało się pobrać danych (HTTP " + response.status + ").");
    return response.json();
  }

  function catalog(name) {
    if (!cache.has(name)) cache.set(name, json(catalogUrl(name)).catch((error) => { cache.delete(name); throw error; }));
    return cache.get(name);
  }
  return {
    units: async () => new Map((await catalog("units")).map(([code, name, type, bdl, canonical]) => [
      code, { name, type, bdl, canonical },
    ])),
    places: (province) => catalog("places-" + province),
    async streets(province, simc) {
      const rows = (await catalog("streets-" + province)).find(([code]) => code === simc)?.[1] ?? [];
      return rows.map(([code, name]) => [code, displayStreetName(name)]);
    },
    districts: (terc, requestSignal) => searchApi.regions(terc, { signal: requestSignal }),
    parcel: (districtId, number, requestSignal) => searchApi.parcel(districtId, number, { signal: requestSignal, requireExactId: true }),
    area: async (terc, requestSignal) => areaGeometry(await json(areaUrl(terc), requestSignal), terc),
    address: async (place, street, requestSignal) => addressPoint(
      await json(addressUrl(place, street), requestSignal), place, street, await project(),
    ),
  };
}
