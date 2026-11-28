import { BACKENDS } from "../../config.js";

const READ_ROUTES = new Set([
  "/api/search", "/api/geocode", "/api/place_suggest",
  "/api/teryt/voivodeships", "/api/teryt/powiaty",
  "/api/teryt/gminy", "/api/teryt/miejscowosci",
]);
const EXPORT_ROUTES = new Set(["/api/export_current.xlsx", "/api/export_current.docx"]);
const REVERSE_URL = "https://nominatim.openstreetmap.org/reverse";
const REQUEST_TIMEOUT_MS = 120_000;

export function rcnRequestUrl(path, method = "GET") {
  if (path.startsWith(REVERSE_URL + "?") && method === "GET") return path;
  if (!path.startsWith("/api/")) throw new Error("Nieprawidłowy adres RCN.");
  const url = new URL(path, BACKENDS.RCN.baseUrl);
  const routes = method === "GET" ? READ_ROUTES : method === "POST" ? EXPORT_ROUTES : null;
  if (!routes?.has(url.pathname) || url.hash) throw new Error("Nieobsługiwana operacja RCN.");
  return url.href;
}

export function createRcnClient({ signal, fetchImpl = globalThis.fetch } = {}) {
  return (path, options = {}) => {
    const url = rcnRequestUrl(path, options.method);
    const signals = [signal, options.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)].filter(Boolean);
    return fetchImpl(url, { ...options, credentials: "omit", signal: AbortSignal.any(signals) });
  };
}
