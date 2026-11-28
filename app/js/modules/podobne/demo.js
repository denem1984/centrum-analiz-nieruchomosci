import { normalizeQuery } from "../../location/normalize.js";

const county = { teryt: "2862", nazwa: "Olsztyn" };
const commune = { teryt: "2862011", nazwa: "Olsztyn" };
const region = { id: "286201_1.0001", code: "0001", name: "Przykładowy" };
const parcels = new Map([["12/3", [20.516, 53.785]], ["8/1", [20.463, 53.778]]]);
const streets = [
  { street: "Przykładowa", number: "1", x: "597303", y: "657823" },
  { street: "Testowa", number: "7", x: "597713", y: "660280" },
  { street: "Pokazowa", number: "2", x: "595618", y: "656453" },
];

export function demoSimilarFetch(value, { signal } = {}) {
  signal?.throwIfAborted();
  const url = new URL(value);
  if (url.pathname === "/api/prg/1/query") return Response.json({ features: [{ attributes: county }] });
  if (url.pathname === "/api/prg/0/query") return Response.json({ features: [{ attributes: commune }] });
  if (url.pathname === "/api/regions") return Response.json({ ok: true, regions: [region] });
  if (url.pathname === "/uug/") {
    const name = normalizeQuery(url.searchParams.get("address"));
    const matches = streets.filter(({ street, number }) => name.includes(normalizeQuery(street) + " " + number));
    return Response.json({
      results: matches.map((row) => ({ ...row, city: "Olsztyn", jednostka: "{Polska,warmińsko-mazurskie,Olsztyn}" })),
    });
  }
  if (url.pathname === "/api/uldk") {
    const id = url.searchParams.get("id");
    const number = id?.startsWith(region.id + ".") ? id.slice(region.id.length + 1) : null;
    const point = parcels.get(number);
    if (!point) return new Response("-1 Brak działki");
    const [x, y] = point;
    const ring = [[x, y], [x + 0.001, y], [x + 0.001, y + 0.001], [x, y + 0.001], [x, y]];
    const wkt = "SRID=4326;POLYGON((" + ring.map((pair) => pair.join(" ")).join(",") + "))";
    return new Response("0\n" + [id, number, region.name, commune.nazwa, county.nazwa, "warmińsko-mazurskie", wkt].join("|"));
  }
  return new Response("", { status: 404 });
}

export const demoFields = [
  { address: "Olsztyn, Przykładowa 1" },
  { address: "Olsztyn, Testowa 7", price: "525000", date: "2026-02-14" },
  { type: "parcel", county: county.teryt, commune: commune.teryt, region: region.id, number: "12/3", price: "488000", date: "2026-03-24" },
  { address: "Olsztyn, Pokazowa 2", price: "549000", date: "2026-06-08" },
];

export function demoMapLayer(L, satellite) {
  const terrain = satellite ? "#354b3c" : "#f2f0e5";
  const lake = satellite ? "#294b56" : "#b7dce7";
  const road = satellite ? "#a6a891" : "#fffefa";
  const area = L.rectangle([[53.70, 20.31], [53.86, 20.63]], { fillColor: terrain, fillOpacity: 1, stroke: false, interactive: false });
  const water = L.polygon([[53.757, 20.415], [53.735, 20.435], [53.754, 20.456], [53.782, 20.443], [53.801, 20.419], [53.79, 20.406]],
    { fillColor: lake, fillOpacity: 1, stroke: false, interactive: false });
  const streets = [
    [[53.755, 20.425], [53.768, 20.479], [53.787, 20.515], [53.811, 20.54]],
    [[53.808, 20.448], [53.793, 20.474], [53.77, 20.477], [53.722, 20.485]],
    [[53.743, 20.459], [53.762, 20.497], [53.773, 20.53], [53.788, 20.558]],
    [[53.795, 20.448], [53.795, 20.493], [53.792, 20.54], [53.787, 20.558]],
  ].map((points) => L.polyline(points, { color: road, weight: 5, interactive: false }));
  return L.layerGroup([area, water, ...streets]);
}
