import { numberFormat } from "./client.js";

function numberOrNull(value) {
  if (typeof value !== "number" && !(typeof value === "string" && value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveOrNull(value) {
  const number = numberOrNull(value);
  return number > 0 ? number : null;
}

function count(value) {
  const number = numberOrNull(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function externalLink(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}

export function normalizeResults(data, query, resolved) {
  const offers = data.offers.filter((offer) => offer && typeof offer === "object" && !Array.isArray(offer))
    .map((offer, id) => ({
      id,
      type: offer.type || data.propertyType || query.propertyType,
      location: [offer.locality, offer.street].filter(Boolean).join(", ") || offer.location || "",
      source: offer.source || offer.portal || "",
      url: externalLink(offer.url),
      price: positiveOrNull(offer.price),
      area: positiveOrNull(offer.area),
      priceM2: positiveOrNull(offer.priceM2),
    }));
  const sources = (Array.isArray(data.sources) ? data.sources : []).filter((source) => source && typeof source === "object").map((source) => {
    const filtered = count(source.filtered);
    const duplicates = count(source.crossPortalDuplicatesRemoved ?? source.internalDuplicatesRemoved);
    const accepted = count(source.acceptedAfterDedup ?? source.uniqueAfterCrossPortal)
      ?? (filtered === null ? null : Math.max(0, filtered - (duplicates ?? 0)));
    const status = count(source.httpStatus);
    const appliedRadius = numberOrNull(source.appliedRadius);
    const failed = Boolean(source.error) || source.fetched === false || status >= 400;
    return {
      name: source.portal || source.source || "Źródło",
      filtered, duplicates, accepted, failed,
      appliedRadius: appliedRadius >= 0 && appliedRadius !== null ? appliedRadius : null,
      radiusSupported: source.radiusSupported !== false,
    };
  });
  const totals = (key) => sources.some((source) => source[key] !== null)
    ? sources.reduce((sum, source) => sum + (source[key] ?? 0), 0)
    : null;
  return {
    offers, sources, location: data.location || resolved.name,
    propertyType: data.propertyType || query.propertyType,
    radius: numberOrNull(data.radius) ?? query.radius, filterLabel: query.filterLabel,
    filtered: count(data.beforeCrossDedup) ?? totals("filtered"),
    duplicates: count(data.duplicatesRemoved) ?? totals("duplicates"),
    accepted: count(data.unique) ?? totals("accepted") ?? offers.length,
  };
}

const collator = new Intl.Collator("pl", { numeric: true, sensitivity: "base" });

export function sortOffers(offers, key, direction) {
  if (!key) return offers;
  return [...offers].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    const aMissing = av == null || av === "";
    const bMissing = bv == null || bv === "";
    if (aMissing || bMissing) return Number(aMissing) - Number(bMissing);
    return direction * (typeof av === "number" && typeof bv === "number" ? av - bv : collator.compare(av, bv));
  });
}

export function comparison(offers, price, area) {
  const rates = offers.map((offer) => positiveOrNull(offer.priceM2)).filter((rate) => rate !== null);
  const mean = rates.length ? rates.reduce((sum, rate) => sum + rate, 0) / rates.length : null;
  const amount = positiveOrNull(price);
  const size = positiveOrNull(area);
  const rate = amount !== null && size !== null ? positiveOrNull(amount / size) : null;
  const difference = mean !== null && rate !== null ? (rate / mean - 1) * 100 : null;
  return { mean, count: rates.length, rate, difference: Number.isFinite(difference) ? difference : null };
}

export function formatOfferNumber(value, unit = "") {
  return value == null ? "—" : numberFormat.format(value) + unit;
}
