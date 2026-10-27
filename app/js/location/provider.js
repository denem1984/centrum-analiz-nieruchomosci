import { validateContext } from "../context.js";
import { FIXTURE_CANDIDATES } from "./fixtures.js";
import { normalizeQuery } from "./normalize.js";

function normalizeLimit(value) {
  if (!Number.isInteger(value) || value < 1) return 10;
  return Math.min(value, 30);
}

export const fixtureProvider = Object.freeze({
  id: "fixture",
  isFixture: true,
  async search(query, options = {}) {
    const normalized = normalizeQuery(query);
    if (!normalized) return [];

    const matches = FIXTURE_CANDIDATES.filter((candidate) =>
      normalizeQuery(candidate.name).includes(normalized)
    );
    const counts = new Map();
    for (const candidate of matches) {
      const name = normalizeQuery(candidate.name);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }

    return matches.slice(0, normalizeLimit(options.limit)).map((candidate) => ({
      ...candidate,
      match: counts.get(normalizeQuery(candidate.name)) > 1 ? "ambiguous" : "unknown",
    }));
  },
});

export function createProvider(config = {}) {
  const configured = config.provider;
  if (configured === undefined || configured === "fixture") return fixtureProvider;
  if (configured && typeof configured.search === "function") return configured;
  throw new Error("Konfiguracja dostawcy musi udostępniać search(query, options).");
}

export function selectedCandidateContext(candidate) {
  if (!candidate || typeof candidate !== "object") {
    return { context: null, reason: "Brak kandydata lokalizacji." };
  }
  return validateContext({ ...candidate, source: "start", match: "exact" });
}

