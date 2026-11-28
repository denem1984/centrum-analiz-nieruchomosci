import { normalizeQuery } from "../../location/normalize.js";

const region = "warmińsko-mazurskie";
const places = [
  { city: "Olsztyn", gmina: "Olsztyn", powiat: "Olsztyn", teryt: "286201", lat: 53.778, lon: 20.48 },
  { city: "Pisz", gmina: "Pisz", powiat: "piski", teryt: "281603", lat: 53.628, lon: 21.802 },
  { city: "Biała Piska", gmina: "Biała Piska", powiat: "piski", teryt: "281601", lat: 53.612, lon: 22.062 },
].map((place) => ({ ...place, voivodeship: region }));

function dateMonthsAgo(months) {
  const date = new Date();
  date.setUTCDate(15);
  date.setUTCMonth(date.getUTCMonth() - months);
  return date.toISOString().slice(0, 10);
}

function recordsForPlace(place, layer, built) {
  const land = layer === "dzialki";
  return Array.from({ length: 12 }, (_, index) => {
    const area = land ? 700 + index * 67 : 38 + index * 4;
    const price = land ? (built ? 590_000 : 128_000) + index * 21_000 : 280_000 + index * 29_000;
    const street = index % 2 ? "ul. Przykładowa" : "ul. Testowa";
    const priceM2 = Math.round(price / area);
    return {
      transaction_id: "DEMO-" + place.teryt + "-" + (built ? "z" : layer) + "-" + (index + 1),
      date: dateMonthsAgo(index + 1), city: place.city, street, address: place.city + ", " + street,
      lat: index === 11 ? null : place.lat + Math.sin(index * 1.8) * 0.004,
      lon: index === 11 ? null : place.lon + Math.cos(index * 1.8) * 0.006,
      layer, area, price, price_m2: built ? null : priceM2,
      price_m2_quality: land && !built ? "policzona" : null,
      price_source: "dane przykładowe", market: index % 3 ? "wtorny" : "pierwotny",
      right: "wlasnosc", function: land ? "" : "mieszkalna",
      land_use: land ? (index % 3 ? "gruntyZabudowaneIZurbanizowane" : "gruntyRolne") : "",
      tran_cena_brutto: price, nier_cena_brutto: price, lok_cena_brutto: land ? null : price,
      is_built_land: built, land_record_type_label: built ? "grunt zabudowany" : "grunt niezabudowany",
      parcel_count: land ? 1 : undefined, building_count: built ? 1 : undefined,
      building_types: built ? "mieszkalny" : undefined,
      building_area: built && index % 2 ? 115 + index : undefined,
      building_area_count: built && index % 2 ? 1 : 0,
      building_area_complete: built && Boolean(index % 2),
      building_footprint_area: built ? 74 + index : undefined, building_footprint_count: built ? 1 : 0,
      building_estimated_area: built ? 2 * (74 + index) : undefined,
      building_estimated_area_count: built ? 1 : 0, building_estimated_area_complete: built,
      building_area_basis: built ? (index % 2 ? "usable" : "estimated_footprint_floors") : undefined,
      building_price_m2: built ? Math.round(price / (index % 2 ? 115 + index : 2 * (74 + index))) : undefined,
    };
  });
}

function isWithin(value, query, field) {
  const min = query.get(field + "_min");
  const max = query.get(field + "_max");
  return (!min || value >= Number(min)) && (!max || value <= Number(max));
}

function search(query) {
  const layer = query.get("layer");
  const built = layer === "dzialki" && query.get("land_record_mode") === "built_land";
  const city = normalizeQuery(query.get("city"));
  const gmina = normalizeQuery(query.get("gmina"));
  const rows = places.filter((place) =>
    (!city || normalizeQuery(place.city) === city)
    && (!gmina || normalizeQuery(place.gmina) === gmina)
  ).flatMap((place) => recordsForPlace(place, layer, built));
  const records = rows.filter((row) => (
    (!query.get("street") || normalizeQuery(row.street).includes(normalizeQuery(query.get("street"))))
    && ["market", "right", "function", "land_use"].every((key) => !query.get(key) || row[key] === query.get(key))
    && (!query.get("building_type") || ["mieszkalny", "only:mieszkalny"].includes(query.get("building_type")))
    && (!query.get("date_from") || row.date >= query.get("date_from"))
    && (!query.get("date_to") || row.date <= query.get("date_to"))
    && isWithin(row.price, query, "price") && isWithin(row.area, query, "area")
  ));
  return {
    records, source: "Dane przykładowe",
    diagnostics: {
      layer, pobrano_zrodlo: rows.length, po_filtrach_ogolnych: records.length, po_iqr: records.length,
      source_label: "danych przykładowych",
      audit_stages: [{ stage: "Filtry danych przykładowych", before: rows.length, after: records.length, removed: rows.length - records.length }],
    },
  };
}

export function createRcnDemo({ signal } = {}) {
  return async (path, options = {}) => {
    signal?.throwIfAborted();
    options.signal?.throwIfAborted();
    const url = new URL(path, "http://localhost");
    const query = url.searchParams;
    switch (url.pathname) {
      case "/api/teryt/voivodeships":
        return Response.json([{ name: region }]);
      case "/api/teryt/powiaty":
        return Response.json([...new Set(places.map(({ powiat }) => powiat))].map((name) => ({ name })));
      case "/api/teryt/gminy":
        return Response.json(places.filter(({ powiat }) => powiat === query.get("powiat"))
          .map(({ gmina, teryt }) => ({ name: gmina, gmina_name: gmina, teryt6: teryt })));
      case "/api/teryt/miejscowosci":
        return Response.json(places.filter(({ teryt }) => teryt === query.get("gmina_teryt"))
          .map(({ city, teryt }) => ({ name: city, teryt })));
      case "/api/geocode":
        return Response.json(places.find(({ city }) => city === query.get("city")) ?? {});
      case "/api/place_suggest":
        return Response.json(places.filter(({ city }) => normalizeQuery(city).includes(normalizeQuery(query.get("q")))));
      case "/reverse":
        return Response.json({});
      case "/api/search":
        return Response.json(search(query));
      case "/api/export_current.xlsx":
      case "/api/export_current.docx":
        return new Response("Eksport jest dostępny w trybie danych RCN.", { status: 501 });
      default:
        throw new Error("Nieobsługiwana operacja podglądu RCN.");
    }
  };
}
