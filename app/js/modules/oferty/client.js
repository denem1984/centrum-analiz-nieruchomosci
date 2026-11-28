import { BACKENDS } from "../../config.js";

export const PROPERTY_TYPES = [
  ["mieszkanie", "Mieszkanie"], ["dom", "Dom"], ["działka", "Działka"],
  ["Nieruchomość komercyjna", "Nieruchomość komercyjna"],
];
export const RADII = [0, 1, 2, 5, 10, 20, 30];
export const TOLERANCES = [10, 20, 30, 40, 50];

export const numberFormat = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 });

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function searchValues({ location, propertyType, radius, mode, area, tolerance, min, max }) {
  const name = location.trim();
  if (name.length < 2) throw new Error("Wpisz pełną nazwę miejscowości lub wybierz ją z podpowiedzi.");
  const distance = Number(radius);
  if (!RADII.includes(distance) || !PROPERTY_TYPES.some(([id]) => id === propertyType)) {
    throw new Error("Wybierz poprawny promień i rodzaj nieruchomości.");
  }
  const basic = { location: name, propertyType, radius: distance };
  if (mode === "none") return { ...basic, area: 100, tolerance: 9999, filterLabel: "bez filtra powierzchni" };
  if (mode === "range") {
    const lower = positive(min);
    const upper = positive(max);
    const total = lower + upper;
    if (lower === null || upper === null || upper < lower || !Number.isFinite(total)) {
      throw new Error("Podaj dodatni zakres powierzchni. „Od” musi być mniejsze lub równe „Do”.");
    }
    return { ...basic, area: total / 2, tolerance: ((upper - lower) / total) * 100,
      filterLabel: `pow. ${numberFormat.format(lower)}–${numberFormat.format(upper)} m²` };
  }
  const target = positive(area);
  const percent = Number(tolerance);
  if (mode !== "percent" || target === null || !TOLERANCES.includes(percent)) {
    throw new Error("Podaj dodatnią powierzchnię i wybierz tolerancję.");
  }
  return { ...basic, area: target, tolerance: percent,
    filterLabel: `pow. ${numberFormat.format(target)} m² ±${percent}%` };
}

// The source wrapper builds these parameters with encodeURIComponent and keeps empty codes.
function offerUrl(path, params) {
  const query = Object.entries(params).map(([name, value]) => name + "=" + encodeURIComponent(value ?? "")).join("&");
  return new URL(path + "?" + query, BACKENDS.Oferty.baseUrl).href;
}

export function createOffersClient({ fetchImpl = globalThis.fetch, signal } = {}) {
  async function get(path, params, requestSignal) {
    const request = AbortSignal.any([signal, requestSignal, AbortSignal.timeout(120_000)].filter(Boolean));
    const response = await fetchImpl(offerUrl(path, params), {
      method: "GET", credentials: "omit", cache: "no-store", signal: request,
    });
    let data;
    try { data = await response.json(); }
    catch (error) {
      request.throwIfAborted();
      throw new Error("Usługa Oferty zwróciła nieczytelną odpowiedź.");
    }
    if (!response.ok || data?.error) {
      throw new Error(data?.error && typeof data.error === "string" ? data.error : "Usługa Oferty zwróciła HTTP " + response.status + ".");
    }
    return data;
  }
  return {
    async suggest(q, request) {
      const data = await get("/api/location-suggestions", { q }, request);
      return Array.isArray(data) ? data.filter((entry) => typeof entry?.name === "string" && entry.name.trim()) : [];
    },
    async resolve(location, chosen, request) {
      const resolved = await get("/api/resolve-location", { location, teryt: chosen?.teryt, simc: chosen?.simc }, request);
      if (typeof resolved?.name !== "string" || !resolved.name.trim()) throw new Error("Usługa nie potwierdziła miejscowości.");
      const teryt = resolved.teryt || chosen?.teryt || "";
      const simc = resolved.simc || chosen?.simc || "";
      if (chosen?.simc && simc !== chosen.simc) throw new Error("Usługa potwierdziła inną miejscowość. Wybierz ją ponownie z listy.");
      return { ...resolved, teryt, simc };
    },
    async search(query, resolved, request) {
      const { area, tolerance, radius, propertyType } = query;
      const data = await get("/api/live/combined", {
        location: resolved.name, teryt: resolved.teryt, simc: resolved.simc, area, tolerance, radius, propertyType,
      }, request);
      if (!Array.isArray(data?.offers)) throw new Error("W odpowiedzi zabrakło listy ofert.");
      return data;
    },
  };
}
