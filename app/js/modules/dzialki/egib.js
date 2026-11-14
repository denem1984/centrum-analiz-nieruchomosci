export const KIEG_ENDPOINT = "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow";
const ULDK_ENDPOINT = "https://uldk.gugik.gov.pl/";

export const REGISTRATION_GROUP_DESCRIPTIONS = Object.freeze({
  "1": "Skarb Państwa",
  "2": "Skarb Państwa w zbiegu z użytkowaniem wieczystym",
  "3": "jednoosobowe spółki Skarbu Państwa i przedsiębiorstwa państwowe",
  "4": "gminy i związki międzygminne",
  "5": "gminy i związki międzygminne w zbiegu z użytkowaniem wieczystym",
  "6": "jednoosobowe spółki jednostek samorządu terytorialnego",
  "7": "osoby fizyczne",
  "8": "spółdzielnie",
  "9": "kościoły i związki wyznaniowe",
  "10": "wspólnoty gruntowe",
  "11": "powiaty i związki powiatów",
  "12": "powiaty i związki powiatów w zbiegu z użytkowaniem wieczystym",
  "13": "województwa",
  "14": "województwa w zbiegu z użytkowaniem wieczystym",
  "15": "spółki prawa handlowego",
  "16": "inne podmioty ewidencyjne",
});

export const LAND_USE_DESCRIPTIONS = Object.freeze({
  R: "grunty orne", S: "sady", "Ł": "łąki trwałe", Ps: "pastwiska trwałe",
  Br: "grunty rolne zabudowane", Lzr: "grunty zadrzewione i zakrzewione na użytkach rolnych",
  Wsr: "grunty pod stawami", W: "grunty pod rowami", N: "nieużytki", Ls: "lasy",
  Lz: "grunty zadrzewione i zakrzewione", B: "tereny mieszkaniowe",
  Ba: "tereny przemysłowe", Bi: "inne tereny zabudowane",
  Bp: "zurbanizowane tereny niezabudowane lub w trakcie zabudowy",
  Bz: "tereny rekreacyjno-wypoczynkowe", K: "użytki kopalne", dr: "drogi",
  Tk: "tereny kolejowe", Ti: "inne tereny komunikacyjne",
  Tp: "grunty przeznaczone pod budowę dróg publicznych lub linii kolejowych",
  Wm: "grunty pod morskimi wodami wewnętrznymi",
  Wp: "grunty pod wodami powierzchniowymi płynącymi",
  Ws: "grunty pod wodami powierzchniowymi stojącymi", Tr: "tereny różne",
});

const SOIL_CLASS = /(IIIa|IIIb|IVa|IVb|VIz|I{1,3}|IV|V|VI)$/;

function withParams(url, entries) {
  for (const [key, value] of entries) url.searchParams.set(key, value);
  return url.toString();
}

export function buildEgibGeometryUrl(parcelId) {
  if (typeof parcelId !== "string" || !/^\d{6}_\d\.\d{4}\.[0-9A-Za-z./-]{1,32}$/.test(parcelId)) {
    throw new TypeError("Nieprawidłowy identyfikator działki dla zapytania EGiB.");
  }
  return withParams(new URL(ULDK_ENDPOINT), [
    ["request", "GetParcelById"], ["id", parcelId], ["result", "id,geom_wkt"], ["srid", "2180"],
  ]);
}

function ringContains([px, py], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (((yi > py) !== (yj > py)) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function contains(point, polygon) {
  return ringContains(point, polygon[0]) && !polygon.slice(1).some((ring) => ringContains(point, ring));
}

function interiorPoint(geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  for (const polygon of polygons) {
    const ring = polygon?.[0];
    if (!Array.isArray(ring) || ring.length < 4) continue;
    const xs = ring.map(([x]) => x), ys = ring.map(([, y]) => y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const center = [(minX + maxX) / 2, (minY + maxY) / 2];
    if (contains(center, polygon)) return center;
    const offsets = [0.01, 0.03, 0.1, 0.25, 0.5];
    for (let edge = 0; edge < ring.length; edge += 1) {
      const start = ring[edge], end = ring[(edge + 1) % ring.length];
      const midpoint = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
      for (const offset of offsets) {
        const candidate = [
          midpoint[0] + (center[0] - midpoint[0]) * offset,
          midpoint[1] + (center[1] - midpoint[1]) * offset,
        ];
        if (contains(candidate, polygon)) return candidate;
      }
    }
    for (let row = 0; row <= 30; row += 1) {
      for (let column = 0; column <= 30; column += 1) {
        const candidate = [minX + ((maxX - minX) * column) / 30, minY + ((maxY - minY) * row) / 30];
        if (contains(candidate, polygon)) return candidate;
      }
    }
  }
  return null;
}

export function buildKiegFeatureInfoUrl(geometry) {
  if (!geometry || !["Polygon", "MultiPolygon"].includes(geometry.type)) {
    throw new TypeError("Brak geometrii działki dla zapytania EGiB.");
  }
  const point = interiorPoint(geometry);
  if (!point) throw new TypeError("Nie udało się wyznaczyć punktu wewnątrz geometrii działki.");
  const span = 100;
  const bbox = [point[0] - span, point[1] - span, point[0] + span, point[1] + span].join(",");
  return withParams(new URL(KIEG_ENDPOINT), [
    ["SERVICE", "WMS"], ["VERSION", "1.1.1"], ["REQUEST", "GetFeatureInfo"], ["SRS", "EPSG:2180"],
    ["BBOX", bbox], ["WIDTH", "1000"], ["HEIGHT", "1000"], ["X", "500"], ["Y", "500"],
    ["LAYERS", "dzialki"], ["QUERY_LAYERS", "dzialki"], ["INFO_FORMAT", "text/xml"],
    ["FORMAT", "image/png"], ["TRANSPARENT", "TRUE"],
  ]);
}

function xmlField(xml, label, partial = false) {
  if (typeof xml !== "string") return "";
  const pattern = /<Attribute\b[^>]*\bName\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/Attribute\s*>/gi;
  for (const match of xml.matchAll(pattern)) {
    const name = match[1].trim().toLocaleLowerCase("pl-PL");
    if (partial ? name.includes(label.toLocaleLowerCase("pl-PL")) : name === label.toLocaleLowerCase("pl-PL")) {
      return match[2].replace(/^<!\[CDATA\[|\]\]>$/g, "").trim()
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    }
  }
  return "";
}

function formatLandUses(raw) {
  if (typeof raw !== "string" || !raw.trim()) return [];
  return [...new Set(raw.split(/\s*[,;]\s*/).map((value) => value.trim()).filter(Boolean))].map((code) => {
    const match = code.match(SOIL_CLASS);
    const base = match ? code.slice(0, -match[1].length) : code;
    const description = LAND_USE_DESCRIPTIONS[base];
    return { code, description: description ? description + (match ? ", klasa " + match[1] : "") : null };
  });
}

function formatArea(raw) {
  const value = String(raw ?? "").trim().replace(/\s*ha$/i, "").replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(value)) return "";
  const [whole, decimal = ""] = value.split(".");
  return whole + "," + decimal.padEnd(4, "0") + " ha";
}

function geometryArea(geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let result = 0;
  for (const polygon of polygons) {
    for (const [index, ring] of polygon.entries()) {
      let twiceArea = 0;
      for (let point = 0; point < ring.length - 1; point += 1) {
        twiceArea += ring[point][0] * ring[point + 1][1] - ring[point + 1][0] * ring[point][1];
      }
      result += (index === 0 ? 1 : -1) * Math.abs(twiceArea / 2);
    }
  }
  return result > 0 ? result : null;
}

export function parseKiegFeatureInfo(xml, expectedParcelId, geometry) {
  if (typeof xml !== "string") throw new Error("Nieprawidłowa odpowiedź EGiB/KIEG.");
  const returnedId = xmlField(xml, "Identyfikator działki");
  if (returnedId && expectedParcelId && returnedId !== expectedParcelId) {
    throw new Error("Usługa EGiB zwróciła inną działkę.");
  }
  const rawArea = xmlField(xml, "Pole pow. w ewidencji gruntów", true);
  const group = xmlField(xml, "Grupa rejestrowa", true);
  const rawClasses = xmlField(xml, "Oznaczenie użytku", true)
    || xmlField(xml, "Oznaczenie konturu", true) || xmlField(xml, "Klasoużyt", true);
  const exactArea = formatArea(rawArea);
  const calculated = exactArea || !geometry || !["Polygon", "MultiPolygon"].includes(geometry.type)
    ? null
    : geometryArea(geometry);
  return {
    area: exactArea || (calculated
      ? `ok. ${Math.round(calculated)} m² (${(calculated / 10000).toFixed(4).replace(".", ",")} ha), obliczona z geometrii`
      : "brak danych"),
    group,
    groupDescription: REGISTRATION_GROUP_DESCRIPTIONS[group] ?? "",
    classUse: formatLandUses(rawClasses),
  };
}

export function parseEgibGeometryText(value, parseWktGeometry) {
  if (typeof value !== "string" || typeof parseWktGeometry !== "function") {
    throw new Error("Nieprawidłowa odpowiedź geometrii EGiB.");
  }
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const status = lines.shift();
  if (status !== "0" && status && /^-?\d+$/.test(status)) throw new Error("Usługa ULDK nie zwróciła geometrii EGiB.");
  const line = lines.find((item) => /(?:MULTI)?POLYGON\s*\(/i.test(item));
  if (!line) throw new Error("ULDK nie zwrócił geometrii do zapytania EGiB.");
  const wkt = line.split("|").map((field) => field.trim())
    .find((field) => /^(?:SRID=\d+;)?(?:MULTI)?POLYGON\s*\(/i.test(field));
  const geometry = parseWktGeometry(wkt);
  if (!geometry) throw new Error("Odpowiedź ULDK zawiera nieprawidłową geometrię EGiB.");
  return geometry;
}
