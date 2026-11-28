import { normalizeQuery } from "../../location/normalize.js";

const locations = [
  { name: "Olsztyn", powiat: "Olsztyn", wojewodztwo: "warmińsko-mazurskie", teryt: "286201", simc: "0964465" },
  { name: "Pisz", powiat: "piski", wojewodztwo: "warmińsko-mazurskie", teryt: "281603", simc: "0979277" },
  { name: "Testowo", powiat: "Północny (przykład)", wojewodztwo: "przykładowe", teryt: "010101", simc: "0101001" },
  { name: "Testowo", powiat: "Południowy (przykład)", wojewodztwo: "przykładowe", teryt: "010201", simc: "0102001" },
];
const portals = ["Nieruchomości-online", "Otodom", "Morizon", "Domiporta", "Gratka", "Adresowo"];

export function createOffersDemoFetch() {
  return async (input, { signal } = {}) => {
    signal?.throwIfAborted();
    const url = new URL(input);
    const query = url.searchParams;
    if (url.pathname === "/api/location-suggestions") {
      const q = normalizeQuery(query.get("q"));
      return Response.json(locations.filter(({ name }) => normalizeQuery(name).includes(q)));
    }
    const place = locations.find((row) => normalizeQuery(row.name) === normalizeQuery(query.get("location"))
      && (!query.get("simc") || query.get("simc") === row.simc));
    if (!place) return Response.json({ error: "Brak tej miejscowości w danych przykładowych." }, { status: 400 });
    if (url.pathname === "/api/resolve-location") return Response.json(place);
    if (url.pathname !== "/api/live/combined") return Response.json({ error: "Nieznana operacja." }, { status: 404 });

    const propertyType = query.get("propertyType");
    const radius = Number(query.get("radius"));
    const target = Number(query.get("area"));
    const tolerance = Number(query.get("tolerance"));
    const centerArea = tolerance === 9999 ? ({ mieszkanie: 62, dom: 120, działka: 900 })[propertyType] ?? 80 : target;
    const areas = [.92, .97, 1, 1.03, 1.08].map((ratio) => Math.round(centerArea * ratio * 100) / 100);
    const offers = areas.flatMap((area, index) => {
      if (Math.abs(area - centerArea) > (centerArea * tolerance / 100) + 1e-6) return [];
      const priceM2 = (propertyType === "działka" ? 180 : 7400) + index * 250;
      return [{
        type: propertyType, locality: index === 4 && radius > 0 ? "Okolice " + place.name : place.name,
        street: "ul. Przykładowa " + (index + 1), source: portals[index],
        price: Math.round(priceM2 * area), area, priceM2,
        url: "https://example.com/oferty/przyklad-" + (index + 1),
      }];
    });
    const duplicates = offers.some(({ source }) => source === "Morizon") ? 1 : 0;
    const sources = portals.map((portal, index) => ({
      portal, filtered: offers.filter(({ source }) => source === portal).length + (portal === "Morizon" ? duplicates : 0),
      crossPortalDuplicatesRemoved: portal === "Morizon" ? duplicates : 0,
      acceptedAfterDedup: offers.filter(({ source }) => source === portal).length,
      fetched: index !== 5, httpStatus: index === 5 ? 503 : 200,
      appliedRadius: index >= 4 ? 0 : radius, radiusSupported: index < 4,
    }));
    return Response.json({
      location: place.name, propertyType, radius, offers, sources, beforeCrossDedup: offers.length + duplicates,
      duplicatesRemoved: duplicates, unique: offers.length,
    });
  };
}
