#!/usr/bin/env node
/**
 * M1 read-only probe for owner-run measurements only.
 * This script sends only GET and OPTIONS requests to the fixed method/path
 * allowlist below. It never follows redirects or reads response bodies.
 * Each pass is followed by a 2-second pause before the next pass. A reliable
 * cold-start measurement requires at least 15 minutes of service inactivity.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ALLOWED_METHODS = Object.freeze(["GET", "OPTIONS"]);
export const DEFAULT_TIMEOUT_MS = 120000;
export const MIN_TIMEOUT_MS = 5000;
export const MAX_TIMEOUT_MS = 300000;
const ORIGIN = "https://example.org";

const GET_PREFLIGHT_HEADERS = Object.freeze({
  Origin: ORIGIN,
  "Access-Control-Request-Method": "GET",
  "Access-Control-Request-Headers": "authorization",
});
const EXPORT_PREFLIGHT_HEADERS = Object.freeze({
  Origin: ORIGIN,
  "Access-Control-Request-Method": "POST",
  "Access-Control-Request-Headers": "content-type",
});
const STANDARD_METHODS = Object.freeze(["GET", "OPTIONS"]);
const OPTIONS_ONLY = Object.freeze(["OPTIONS"]);

function pathRule(methods, preflightHeaders = GET_PREFLIGHT_HEADERS) {
  return Object.freeze({ methods, preflightHeaders });
}

export const ALLOWLIST = Object.freeze({
  RCN: Object.freeze({
    "/": pathRule(STANDARD_METHODS),
    "/api/export_current.xlsx": pathRule(OPTIONS_ONLY, EXPORT_PREFLIGHT_HEADERS),
    "/api/export_current.docx": pathRule(OPTIONS_ONLY, EXPORT_PREFLIGHT_HEADERS),
  }),
  Oferty: Object.freeze({ "/health": pathRule(STANDARD_METHODS) }),
  Dzialki: Object.freeze({ "/health": pathRule(STANDARD_METHODS) }),
  Podobne: Object.freeze({ "/api/health": pathRule(STANDARD_METHODS) }),
});

const CONFIG = Object.freeze([
  { key: "rcn", label: "RCN", env: "M1_RCN_BASE_URL" },
  { key: "oferty", label: "Oferty", env: "M1_OFERTY_BASE_URL" },
  { key: "dzialki", label: "Dzialki", env: "M1_DZIALKI_BASE_URL" },
  { key: "podobne", label: "Podobne", env: "M1_PODOBNE_BASE_URL" },
]);

const SAFE_RESPONSE_HEADERS = Object.freeze([
  "access-control-allow-origin",
  "access-control-allow-methods",
  "access-control-allow-headers",
  "access-control-allow-credentials",
  "access-control-max-age",
  "access-control-expose-headers",
  "cache-control",
]);

function normalizedLabel(service) {
  const found = Object.keys(ALLOWLIST).find((key) =>
    key.toLowerCase() === String(service).toLowerCase()
      || (key === "Dzialki" && String(service).toLowerCase() === "działki")
  );
  if (!found) throw new Error("Request denied by allowlist");
  return found;
}

function getPathRule(service, path) {
  const label = normalizedLabel(service);
  const rules = ALLOWLIST[label][path];
  if (!rules) throw new Error("Request denied by allowlist");
  return { service: label, rules };
}

export function assertAllowedRequest(service, method, path) {
  const { service: label, rules } = getPathRule(service, path);
  const verb = String(method).toUpperCase();
  if (!ALLOWED_METHODS.includes(verb) || !rules.methods.includes(verb)) {
    throw new Error("Request denied by allowlist");
  }
  return {
    service: label,
    method: verb,
    path,
    preflightHeaders: rules.preflightHeaders,
  };
}

export function buildProbeUrl(baseUrl, service, path) {
  getPathRule(service, path);
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("Invalid base URL");
  }
  if (!["http:", "https:"].includes(url.protocol)
      || url.username || url.password || url.pathname !== "/"
      || url.search || url.hash) {
    throw new Error("Invalid base URL");
  }
  url.pathname = path;
  return url;
}

export function parseTimeoutMs(value = DEFAULT_TIMEOUT_MS) {
  const timeoutMs = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(timeoutMs) || timeoutMs < MIN_TIMEOUT_MS || timeoutMs > MAX_TIMEOUT_MS) {
    throw new Error("Timeout must be an integer from 5000 to 300000 milliseconds");
  }
  return timeoutMs;
}

export function readCliOptions(argv, env) {
  const addresses = {};
  const optionToKey = new Map(CONFIG.map((entry) => ["--" + entry.key, entry.key]));
  let cliTimeout;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--timeout-ms") {
      if (cliTimeout !== undefined || i + 1 >= argv.length || argv[i + 1].startsWith("--")) {
        throw new Error("Use --timeout-ms with an integer from 5000 to 300000.");
      }
      cliTimeout = argv[i + 1];
      i += 1;
      continue;
    }
    const key = optionToKey.get(argv[i]);
    if (!key || i + 1 >= argv.length || argv[i + 1].startsWith("--")) {
      throw new Error("Use --rcn, --oferty, --dzialki and --podobne with base URLs.");
    }
    addresses[key] = argv[i + 1];
    i += 1;
  }
  for (const entry of CONFIG) {
    addresses[entry.key] ||= env[entry.env] || "";
  }
  const missing = CONFIG.filter((entry) => !addresses[entry.key]).map((entry) => entry.label);
  if (missing.length) throw new Error("Missing base URL for: " + missing.join(", "));
  for (const entry of CONFIG) {
    const path = Object.keys(ALLOWLIST[entry.label])[0];
    buildProbeUrl(addresses[entry.key], entry.label, path);
  }
  return {
    addresses,
    timeoutMs: parseTimeoutMs(cliTimeout ?? env.M1_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
  };
}

export function parseProbeResponse(status, headers, elapsedMs, timestamp) {
  const safeHeaders = {};
  if (headers && typeof headers.forEach === "function") {
    headers.forEach((value, name) => {
      const key = String(name).toLowerCase();
      if (SAFE_RESPONSE_HEADERS.includes(key)) safeHeaders[key] = String(value);
    });
  }
  return {
    timestamp: new Date(timestamp).toISOString(),
    elapsedMs: Math.max(0, Math.round(elapsedMs * 100) / 100),
    httpStatus: Number(status),
    headers: safeHeaders,
  };
}

export async function requestProbe({
  service,
  baseUrl,
  method,
  path,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
  now = () => performance.now(),
  dateNow = () => new Date(),
}) {
  const allowed = assertAllowedRequest(service, method, path);
  const timeout = parseTimeoutMs(timeoutMs);
  const url = buildProbeUrl(baseUrl, allowed.service, allowed.path);
  const signal = AbortSignal.timeout(timeout);
  const init = {
    method: allowed.method,
    redirect: "manual",
    cache: "no-store",
    signal,
    headers: allowed.method === "GET"
      ? { Origin: ORIGIN }
      : { ...allowed.preflightHeaders },
  };

  const started = now();
  const checkedAt = dateNow();
  try {
    const response = await fetchImpl(url, init);
    const elapsedMs = now() - started;
    try {
      await response.body?.cancel?.();
    } catch {
      // The response body is intentionally ignored; cancellation is best effort.
    }
    return {
      service: allowed.service,
      method: allowed.method,
      path: allowed.path,
      ...parseProbeResponse(response.status, response.headers, elapsedMs, checkedAt),
    };
  } catch (error) {
    const elapsedMs = Math.max(0, now() - started);
    return {
      service: allowed.service,
      method: allowed.method,
      path: allowed.path,
      timestamp: new Date(checkedAt).toISOString(),
      elapsedMs: Math.round(elapsedMs * 100) / 100,
      httpStatus: null,
      headers: {},
      errorType: signal.aborted || error?.name === "TimeoutError" ? "timeout" : "network",
    };
  }
}

export function formatConfigSummary(results) {
  const lines = [
    "## M1 — wyniki pomiaru HTTP",
    "",
    "| API | Ścieżka | Próba | Metoda | Data UTC | Czas (ms) | HTTP | Błąd | Access-Control-* / Cache-Control |",
    "|---|---|---:|---|---|---:|---:|---|---|",
  ];
  for (const result of results) {
    const headerText = Object.entries(result.headers || {})
      .map(([name, value]) => name + ": " + value)
      .join("; ") || "brak";
    lines.push(
      "| " + result.service + " | " + result.path + " | " + result.sample + " | "
      + result.method + " | " + result.timestamp + " | " + (result.elapsedMs ?? "—") + " | "
      + (result.httpStatus ?? "błąd") + " | " + (result.errorType || "—") + " | " + headerText + " |"
    );
  }
  lines.push("", "Uwaga: wiarygodny zimny start wymaga co najmniej 15 min bezczynności usługi.");
  return lines.join("\n");
}

async function main() {
  let options;
  try {
    options = readCliOptions(process.argv.slice(2), process.env);
  } catch (error) {
    process.stderr.write((error?.message || "Invalid arguments") + "\n");
    process.exitCode = 2;
    return;
  }

  const results = [];
  for (const sample of ["pierwsze", "drugie"]) {
    if (sample === "drugie") await new Promise((resolvePromise) => setTimeout(resolvePromise, 2000));
    for (const entry of CONFIG) {
      for (const [path, rules] of Object.entries(ALLOWLIST[entry.label])) {
        for (const method of rules.methods) {
          const result = await requestProbe({
            service: entry.label,
            baseUrl: options.addresses[entry.key],
            method,
            path,
            timeoutMs: options.timeoutMs,
          });
          results.push({ sample, ...result });
        }
      }
    }
  }

  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const outputDir = resolve(repoRoot, ".local-results");
  await mkdir(outputDir, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const fileName = "m1-probe-" + stamp + ".json";
  const outputFile = resolve(outputDir, fileName);
  await writeFile(outputFile, JSON.stringify(results, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });

  process.stdout.write(formatConfigSummary(results) + "\n\n");
  process.stdout.write("Wyniki zapisano lokalnie: .local-results/" + fileName + "\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
