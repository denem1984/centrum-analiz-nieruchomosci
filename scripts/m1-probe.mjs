#!/usr/bin/env node
/**
 * M1 read-only probe. This script sends only GET and OPTIONS to the fixed
 * allowlist below; it never follows redirects or reads response bodies.
 * First pass is followed by a 2-second pause and a second pass. A reliable
 * cold-start measurement requires at least 15 minutes of service inactivity;
 * the 2-second gap only provides a nearby second sample.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ALLOWED_METHODS = Object.freeze(["GET", "OPTIONS"]);
export const ALLOWLIST = Object.freeze({
  RCN: Object.freeze({ path: "/" }),
  Oferty: Object.freeze({ path: "/health" }),
  Dzialki: Object.freeze({ path: "/health" }),
  Podobne: Object.freeze({ path: "/api/health" }),
});

const CONFIG = Object.freeze([
  { key: "rcn", label: "RCN", env: "M1_RCN_BASE_URL" },
  { key: "oferty", label: "Oferty", env: "M1_OFERTY_BASE_URL" },
  { key: "dzialki", label: "Dzialki", env: "M1_DZIALKI_BASE_URL" },
  { key: "podobne", label: "Podobne", env: "M1_PODOBNE_BASE_URL" },
]);

const PREFLIGHT_HEADERS = Object.freeze({
  Origin: "https://example.org",
  "Access-Control-Request-Method": "GET",
  "Access-Control-Request-Headers": "authorization",
});
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
  const found = Object.entries(ALLOWLIST).find(([key]) =>
    key.toLowerCase() === String(service).toLowerCase()
      || (key === "Dzialki" && String(service).toLowerCase() === "działki")
  );
  if (!found) throw new Error("Request denied by allowlist");
  return found[0];
}

export function assertAllowedRequest(service, method, path) {
  const label = normalizedLabel(service);
  const verb = String(method).toUpperCase();
  if (!ALLOWED_METHODS.includes(verb) || path !== ALLOWLIST[label].path) {
    throw new Error("Request denied by allowlist");
  }
  return { service: label, method: verb, path };
}

export function buildProbeUrl(baseUrl, service, path) {
  const label = normalizedLabel(service);
  assertAllowedRequest(label, "GET", path);
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
  fetchImpl = globalThis.fetch,
  now = () => performance.now(),
  dateNow = () => new Date(),
}) {
  const allowed = assertAllowedRequest(service, method, path);
  const url = buildProbeUrl(baseUrl, allowed.service, allowed.path);
  const init = {
    method: allowed.method,
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  };
  if (allowed.method === "OPTIONS") init.headers = { ...PREFLIGHT_HEADERS };

  const started = now();
  const checkedAt = dateNow();
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
}

function readCliAddresses(argv, env) {
  const addresses = {};
  const optionToKey = new Map(CONFIG.map((entry) => ["--" + entry.key, entry.key]));
  for (let i = 0; i < argv.length; i += 1) {
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
  return addresses;
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

export function formatConfigSummary(results) {
  const lines = [
    "## M1 — wyniki pomiaru HTTP",
    "",
    "| API | Próba | Metoda | Data UTC | Czas (ms) | HTTP | Access-Control-* / Cache-Control |",
    "|---|---:|---|---|---:|---:|---|",
  ];
  for (const result of results) {
    const headerText = Object.entries(result.headers)
      .map(([name, value]) => name + ": " + value)
      .join("; ") || "brak";
    lines.push(
      "| " + result.service + " | " + result.sample + " | " + result.method + " | "
      + result.timestamp + " | " + (result.elapsedMs ?? "—") + " | "
      + (result.httpStatus ?? "błąd") + " | " + headerText + " |"
    );
  }
  lines.push("", "Uwaga: wiarygodny zimny start wymaga co najmniej 15 min bezczynności usługi.");
  return lines.join("\n");
}

async function main() {
  let addresses;
  try {
    addresses = readCliAddresses(process.argv.slice(2), process.env);
  } catch (error) {
    process.stderr.write((error?.message || "Invalid arguments") + "\n");
    process.exitCode = 2;
    return;
  }

  const results = [];
  for (const sample of ["pierwsze", "drugie"]) {
    if (sample === "drugie") await sleep(2000);
    for (const entry of CONFIG) {
      const path = ALLOWLIST[entry.label].path;
      for (const method of ALLOWED_METHODS) {
        try {
          const result = await requestProbe({
            service: entry.label,
            baseUrl: addresses[entry.key],
            method,
            path,
          });
          results.push({ sample, ...result });
        } catch (error) {
          results.push({
            service: entry.label,
            sample,
            method,
            path,
            timestamp: new Date().toISOString(),
            elapsedMs: null,
            httpStatus: null,
            headers: {},
            errorType: error?.name || "Error",
          });
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
