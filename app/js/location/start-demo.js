import { geometryExtent } from "../modules/dzialki/search.js";

export const demoParcelId = "286201_1.0001.12/3";
const center = { lat: 53.7745, lon: 20.4781 };
const point = (role) => ({ ...center, role, crs: "EPSG:4326" });

function rectangle(lon, lat, width, height) {
  return { type: "Polygon", coordinates: [[
    [lon, lat], [lon + width, lat], [lon + width, lat + height], [lon, lat + height], [lon, lat],
  ]] };
}

export function demoParcel(district, number) {
  const id = district + "." + number;
  if (id !== demoParcelId) return null;
  const geometry = rectangle(20.4778, 53.7742, 0.0006, 0.0005);
  return { id, number, region: "Obręb przykładowy", geometry, extent: geometryExtent(geometry) };
}

export function demoStartClient(catalog) {
  return {
    ...catalog,
    async districts(terc) { return terc === "2862011" ? [{ code: "286201_1.0001", name: "Obręb przykładowy" }] : []; },
    async parcel(district, number) { return demoParcel(district, number); },
    async area(terc) {
      if (terc !== "2862011") return null;
      return { geometry: rectangle(20.40, 53.72, 0.16, 0.11), point: point("area") };
    },
    async address(place, street) {
      if (place.simc7 !== "0964465") return null;
      if (!street) return point("place");
      if (street.ulic5 !== "38564") return null;
      if (!street.number) return point("street");
      return street.number === "1" ? point("address") : null;
    },
  };
}
