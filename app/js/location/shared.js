import { PARCEL_ID } from "../context.js";

export function parcelParts(id) {
  const match = PARCEL_ID.exec(id);
  if (!match || match[2].length > 32) return null;
  const [, districtId, number] = match;
  return { districtId, number, terc: districtId.slice(0, 6) + districtId[7] };
}

export function streetName(street) {
  return street?.name?.replace(/^ul\.\s+/i, "") ?? "";
}

export function locationLine(location) {
  if (!location) return "Nie wybrano lokalizacji w Start.";
  const { place, street, district, parcel, gmina } = location;
  return [
    parcel && "Działka " + parcel.id,
    district && "obręb " + district.name,
    place?.name,
    street && [street.name, street.number].filter(Boolean).join(" "),
    gmina && "gmina " + gmina.name,
  ].filter(Boolean).join(" · ");
}

export function locationNotice(document, context, detail) {
  const element = document.createElement("p");
  element.className = "shared-location-notice";
  const link = document.createElement("a");
  link.href = context.startHref ?? "#/start";
  link.textContent = context.location ? "Zmień w Start" : "Wybierz w Start";
  element.textContent = (detail ?? locationLine(context.location)) + " ";
  element.append(link);
  return element;
}

export function sharedSubject(location) {
  const point = location?.point;
  if (!["parcel", "street", "address"].includes(point?.role)) return null;
  const title = point.role === "parcel"
    ? "Działka " + location.parcel.id
    : [location.place.name, [location.street.name, location.street.number].filter(Boolean).join(" ")].join(", ");
  return {
    title,
    point: [point.lat, point.lon],
    detail: point.role === "street" ? "Punkt orientacyjny ulicy ze Startu" : "Lokalizacja ze Startu",
  };
}
