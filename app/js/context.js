const MAX_CONTEXT_BYTES = 2048;
const MAX_ENCODED_CHARS = Math.ceil(MAX_CONTEXT_BYTES * 4 / 3);
const SOURCE_IDS = new Set(["start", "dzialki", "rcn", "oferty", "podobne", "gminy"]);
const LOCATION_KINDS = new Set(["gmina", "miejscowosc", "dzialka", "punkt", "nieokreslona"]);
const MATCH_VALUES = new Set(["exact", "ambiguous", "unknown"]);

function invalid(reason) {
  return { context: null, reason };
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function readText(object, key, path, options = {}) {
  const required = options.required === true;
  const maxLength = options.maxLength ?? 512;
  if (!Object.hasOwn(object, key)) {
    return required ? { error: path + ": pole jest wymagane." } : { value: undefined };
  }
  if (typeof object[key] !== "string") return { error: path + ": wartość musi być tekstem." };
  const value = object[key].trim();
  if (!value) return { error: path + ": tekst nie może być pusty." };
  if (value.length > maxLength) return { error: path + ": tekst jest za długi." };
  return { value };
}

function readDigits(object, key, path, minLength, maxLength = minLength, required = false) {
  if (!Object.hasOwn(object, key)) {
    return required ? { error: path + ": pole jest wymagane." } : { value: undefined };
  }
  const value = object[key];
  if (typeof value !== "string") return { error: path + ": kod musi być tekstem." };
  if (value.length < minLength || value.length > maxLength || !/^[0-9]+$/.test(value)) {
    return { error: path + ": nieprawidłowa długość lub format kodu." };
  }
  return { value };
}

function copyAdministrativeUnit(input, field, codeField, codeLength) {
  if (!Object.hasOwn(input, field)) return { value: undefined };
  const raw = input[field];
  if (!isPlainObject(raw)) return { error: field + ": oczekiwano obiektu." };
  const code = readDigits(raw, codeField, field + "." + codeField, codeLength, codeLength, true);
  if (code.error) return code;
  const name = readText(raw, "name", field + ".name", { required: true });
  if (name.error) return name;
  return { value: { [codeField]: code.value, name: name.value } };
}

function copyGmina(input) {
  if (!Object.hasOwn(input, "gmina")) return { value: undefined };
  const raw = input.gmina;
  if (!isPlainObject(raw)) return { error: "gmina: oczekiwano obiektu." };
  const terc7 = readDigits(raw, "terc7", "gmina.terc7", 7, 7, true);
  if (terc7.error) return terc7;
  const name = readText(raw, "name", "gmina.name", { required: true });
  if (name.error) return name;
  if (!Object.hasOwn(raw, "kind")
      || !(raw.kind === null || raw.kind === 1 || raw.kind === 2 || raw.kind === 3)) {
    return { error: "gmina.kind: dozwolone wartości to 1, 2, 3 lub null." };
  }
  return { value: { terc7: terc7.value, name: name.value, kind: raw.kind } };
}

function copyPlace(input) {
  if (!Object.hasOwn(input, "place")) return { value: undefined };
  const raw = input.place;
  if (!isPlainObject(raw)) return { error: "place: oczekiwano obiektu." };
  const simc7 = readDigits(raw, "simc7", "place.simc7", 7, 7, true);
  if (simc7.error) return simc7;
  const name = readText(raw, "name", "place.name", { required: true });
  if (name.error) return name;
  return { value: { simc7: simc7.value, name: name.value } };
}

function copyParcel(input) {
  if (!Object.hasOwn(input, "parcel")) return { value: undefined };
  const raw = input.parcel;
  if (!isPlainObject(raw)) return { error: "parcel: oczekiwano obiektu." };
  const id = readText(raw, "id", "parcel.id", { required: true, maxLength: 128 });
  if (id.error) return id;
  const value = { id: id.value };
  if (Object.hasOwn(raw, "obrebTeryt")) {
    const code = readDigits(raw, "obrebTeryt", "parcel.obrebTeryt", 1, 20, true);
    if (code.error) return code;
    value.obrebTeryt = code.value;
  }
  return { value };
}

function copyPoint(input) {
  if (!Object.hasOwn(input, "point")) return { value: undefined };
  const raw = input.point;
  if (!isPlainObject(raw)) return { error: "point: oczekiwano obiektu." };
  if (typeof raw.lat !== "number" || !Number.isFinite(raw.lat)
      || raw.lat < 48.5 || raw.lat > 55.0) {
    return { error: "point.lat: współrzędna poza zakresem Polski." };
  }
  if (typeof raw.lon !== "number" || !Number.isFinite(raw.lon)
      || raw.lon < 13.5 || raw.lon > 24.5) {
    return { error: "point.lon: współrzędna poza zakresem Polski." };
  }
  if (raw.crs !== "EPSG:4326") return { error: "point.crs: wymagane EPSG:4326." };
  return { value: { lat: raw.lat, lon: raw.lon, crs: "EPSG:4326" } };
}

export function emptyContext() {
  return {
    version: "1",
    source: "start",
    kind: "nieokreslona",
    match: "unknown",
  };
}

export function validateContext(input) {
  if (!isPlainObject(input)) return invalid("Kontekst musi być obiektem.");

  if (input.version !== "1") return invalid("version: wymagana wartość tekstowa 1.");
  if (typeof input.source !== "string" || !SOURCE_IDS.has(input.source)) {
    return invalid("source: nieznany identyfikator modułu.");
  }
  if (typeof input.kind !== "string" || !LOCATION_KINDS.has(input.kind)) {
    return invalid("kind: nieznany rodzaj lokalizacji.");
  }
  if (typeof input.match !== "string" || !MATCH_VALUES.has(input.match)) {
    return invalid("match: nieznany poziom dopasowania.");
  }

  const context = {
    version: "1",
    source: input.source,
    kind: input.kind,
    match: input.match,
  };
  const rootName = readText(input, "name", "name");
  if (rootName.error) return invalid(rootName.error);
  if (rootName.value !== undefined) context.name = rootName.value;

  const fields = [
    copyAdministrativeUnit(input, "voivodeship", "code", 2),
    copyAdministrativeUnit(input, "powiat", "code", 4),
    copyGmina(input),
    copyPlace(input),
    copyParcel(input),
    copyPoint(input),
  ];
  const fieldNames = ["voivodeship", "powiat", "gmina", "place", "parcel", "point"];
  for (let index = 0; index < fields.length; index += 1) {
    if (fields[index].error) return invalid(fields[index].error);
    if (fields[index].value !== undefined) context[fieldNames[index]] = fields[index].value;
  }

  if (Object.hasOwn(input, "bdlUnitId")) {
    const bdlUnitId = readDigits(input, "bdlUnitId", "bdlUnitId", 12, 12, true);
    if (bdlUnitId.error) return invalid(bdlUnitId.error);
    context.bdlUnitId = bdlUnitId.value;
  }

  if (input.kind === "gmina" || input.kind === "miejscowosc") {
    if (!context.voivodeship || !context.powiat || !context.gmina) {
      return invalid("Dla gminy lub miejscowości wymagane są województwo, powiat i gmina.");
    }
  }
  if (input.kind === "miejscowosc" && !context.place) {
    return invalid("Dla miejscowości wymagane jest pole place.");
  }
  if (input.kind === "dzialka" && !context.parcel) {
    return invalid("Dla działki wymagane jest pole parcel.");
  }
  if (input.kind === "punkt" && !context.point) {
    return invalid("Dla punktu wymagane jest pole point.");
  }

  try {
    const byteLength = new TextEncoder().encode(JSON.stringify(context)).length;
    if (byteLength > MAX_CONTEXT_BYTES) {
      return invalid("Zserializowany kontekst przekracza limit 2048 B.");
    }
  } catch {
    return invalid("Kontekst nie może zostać zserializowany.");
  }

  return { context, reason: null };
}

function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function encodeContext(input) {
  const result = validateContext(input);
  if (!result.context) return { encoded: null, reason: result.reason };
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(result.context));
    if (bytes.length > MAX_CONTEXT_BYTES) {
      return { encoded: null, reason: "Zserializowany kontekst przekracza limit 2048 B." };
    }
    return { encoded: toBase64Url(bytes), reason: null };
  } catch {
    return { encoded: null, reason: "Kontekst nie może zostać zakodowany." };
  }
}

export function decodeContext(encoded) {
  if (typeof encoded !== "string" || !encoded) {
    return { context: null, reason: "Brak zakodowanego kontekstu." };
  }
  if (encoded.length > MAX_ENCODED_CHARS) {
    return { context: null, reason: "Zakodowany kontekst przekracza limit rozmiaru." };
  }
  if (!/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length % 4 === 1) {
    return { context: null, reason: "Nieprawidłowy format base64url." };
  }

  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/")
      + "=".repeat((4 - (encoded.length % 4)) % 4);
    const binary = atob(base64);
    if (binary.length > MAX_CONTEXT_BYTES) {
      return { context: null, reason: "Zdekodowany kontekst przekracza limit 2048 B." };
    }
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const parsed = JSON.parse(json);
    return validateContext(parsed);
  } catch {
    return { context: null, reason: "Nieprawidłowe dane kontekstu." };
  }
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function createContextStore() {
  let current = deepFreeze(emptyContext());
  const listeners = new Set();

  function notify() {
    for (const listener of listeners) {
      try {
        listener(current);
      } catch {
        // Błąd widoku nie może przerwać aktualizacji magazynu.
      }
    }
  }

  return Object.freeze({
    get() {
      return current;
    },
    set(value) {
      const result = validateContext(value);
      if (!result.context) return result;
      current = deepFreeze(result.context);
      notify();
      return { context: current, reason: null };
    },
    clear() {
      current = deepFreeze(emptyContext());
      notify();
      return current;
    },
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("Subskrybent musi być funkcją.");
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
}

export const contextStore = createContextStore();

