import { normalizeQuery } from "../../location/normalize.js";
import { VOIVODESHIP_NAMES } from "../dzialki/search.js";

export const PROFILES = Object.freeze({
  dzialki: "Działki budowlane", domy: "Domy jednorodzinne", lokale: "Lokale mieszkalne",
});
export const TYPES = Object.freeze({ 1: "Miejska", 2: "Wiejska", 3: "Miejsko-wiejska" });

export const INDICATORS = [
  { id: "60559", title: "Gęstość zaludnienia", unit: "os./km²", weights: [15, 12, 22],
    description: "Liczba mieszkańców na kilometr kwadratowy. Pomaga odróżnić obszary zwarte od rozproszonych.",
    market: "Przy lokalach pomaga porównać stopień urbanizacji. Rozmieszczenie zabudowy wymaga analizy mapy." },
  { id: "458603", title: "Zmiana liczby ludności", unit: "os. na 1000 mieszk.", weights: [20, 20, 13],
    description: "Zmiana wobec poprzedniego roku na tysiąc mieszkańców. Wartość dodatnia oznacza wzrost, ujemna spadek.",
    market: "Zmiana liczby mieszkańców wpływa na potencjalny popyt wraz z dochodami, podażą i dostępnością pracy." },
  { id: "634067", title: "Obciążenie demograficzne osobami starszymi", unit: "os. 65+ na 100 os. w wieku 15–64", weights: [15, 18, 15],
    description: "Liczba osób w wieku co najmniej 65 lat przypadająca na 100 osób w wieku od 15 do 64 lat.",
    market: "Struktura wieku pomaga ocenić lokalne potrzeby mieszkaniowe." },
  { id: "747072", title: "Rozwój budownictwa", unit: "mieszkania na 1000 mieszk.", weights: [20, 20, 18],
    description: "Trzyletnia średnia mieszkań oddanych do użytkowania na tysiąc mieszkańców. Uśrednienie ogranicza wpływ pojedynczego roku.",
    market: "Wskaźnik pomaga ocenić tempo i skalę powstawania nowej podaży mieszkaniowej." },
  { id: "60530", title: "Przedsiębiorczość (REGON)", unit: "podmioty na 10 tys. mieszk.", weights: [12, 12, 12],
    description: "Liczba podmiotów wpisanych do rejestru REGON na dziesięć tysięcy mieszkańców.",
    market: "Opisuje lokalną bazę gospodarczą. Zatrudnienie i dochody wymagają osobnego sprawdzenia." },
  { id: "1548707", title: "Nowe podmioty REGON", unit: "podmioty na 1000 mieszk.", weights: [8, 6, 8],
    description: "Nowo zarejestrowane podmioty na tysiąc mieszkańców. Wskaźnik mierzy rejestracje i dynamikę ich powstawania.",
    market: "Pomaga porównać lokalną aktywność gospodarczą. Trwałość działalności wymaga dodatkowych informacji." },
  { id: "1728573", title: "Udział wydatków inwestycyjnych", unit: "% wydatków gminy", weights: [10, 12, 12],
    description: "Procent wydatków ogółem gminy przypadający na inwestycje w danym roku.",
    market: "Pomaga ocenić intensywność inwestycji. Wydatki bezwzględne i konkretne przedsięwzięcia warto sprawdzić osobno." },
];

const collator = new Intl.Collator("pl", { sensitivity: "base", numeric: true });
const numbers = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 });
const scores = new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const formatValue = (value) => numbers.format(value);
export const formatScore = (value) => scores.format(value) + "%";

export function readMunicipalities(data, { demo = false } = {}) {
  if (data?.version !== 1 || !Array.isArray(data.rows)
    || !Array.isArray(data.indicators) || data.indicators.join(",") !== INDICATORS.map(({ id }) => id).join(",")
    || !Number.isInteger(data.year) || data.year < 2000
    || (!demo && data.source !== "GUS BDL")) {
    throw new Error("Plik Gmin ma nieprawidłową strukturę.");
  }
  const municipalities = [];
  const ids = new Set();
  const codes = new Set();
  for (const [terc, id, name, county, values, referenceTerc = terc] of data.rows) {
    const voivodeshipCode = typeof terc === "string" ? terc.slice(0, 2) : "";
    const kind = typeof referenceTerc === "string" ? referenceTerc.at(-1) : "";
    if (typeof id !== "string" || typeof terc !== "string" || !/^\d{7}$/.test(terc) || !/^\d{12}$/.test(id)
      || typeof referenceTerc !== "string" || id.slice(2, 4) + id.slice(7) !== referenceTerc
      || referenceTerc.slice(0, 6) !== terc.slice(0, 6) || !Object.hasOwn(TYPES, terc.at(-1))
      || !Object.hasOwn(TYPES, kind) || !Object.hasOwn(VOIVODESHIP_NAMES, voivodeshipCode)
      || typeof name !== "string" || !name.trim() || typeof county !== "string" || ids.has(id) || codes.has(terc)
      || !Array.isArray(values) || values.length !== INDICATORS.length
      || values.some((value) => value !== null && !Number.isFinite(value))) {
      throw new Error("Plik Gmin zawiera niespójne jednostki TERC i BDL albo wartości wskaźników.");
    }
    ids.add(id);
    codes.add(terc);
    const voivodeship = VOIVODESHIP_NAMES[voivodeshipCode];
    municipalities.push({ id, terc, referenceTerc, name, county, kind, voivodeshipCode, voivodeship, values,
      complete: values.every(Number.isFinite), search: normalizeQuery([name, county, voivodeship, TYPES[kind]].join(" ")) });
  }
  const full = municipalities.filter(({ complete }) => complete);
  if (full.length < (demo ? 2 : 2400) || full.length !== data.complete
    || municipalities.length - full.length !== data.excluded) throw new Error("Plik Gmin ma niepełne dane.");
  return {
    municipalities: municipalities.sort((a, b) => collator.compare(a.name, b.name) || collator.compare(a.terc, b.terc)),
    full, year: data.year, source: data.source, collected: data.collected, excluded: data.excluded,
  };
}

export function findMunicipalities(municipalities, text) {
  const normalized = normalizeQuery(text);
  if (normalized.length < 2) return [];
  if (/^\d+$/.test(normalized)) return municipalities.filter((row) => (
    row.id.startsWith(normalized) || row.terc.startsWith(normalized) || row.referenceTerc.startsWith(normalized)
  ));
  const terms = normalized.split(/[ ,·]+/).filter((term) => term && term !== "pow." && term !== "woj.");
  if (!terms.length) return [];
  return municipalities.filter((row) => terms.every((term) => row.search.includes(term)))
    .sort((a, b) => Number(normalizeQuery(b.name).startsWith(normalized)) - Number(normalizeQuery(a.name).startsWith(normalized)));
}

export function percentile(values) {
  const sorted = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const result = Array(values.length);
  for (let start = 0; start < sorted.length;) {
    let end = start + 1;
    while (end < sorted.length && sorted[end].value === sorted[start].value) end += 1;
    const rank = sorted.length === 1 ? 50 : ((start + end - 1) / 2) / (sorted.length - 1) * 100;
    for (let i = start; i < end; i += 1) result[sorted[i].index] = rank;
    start = end;
  }
  return result;
}

export function rankMunicipalities(full, target, { profile, same, scope }) {
  const profileIndex = Object.keys(PROFILES).indexOf(profile);
  if (!target.complete || profileIndex === -1) throw new Error("Wybierz gminę z kompletem wskaźników i poprawny profil.");
  const weights = INDICATORS.map((indicator) => indicator.weights[profileIndex]);
  const pool = full.filter((row) => (!same || row.kind === target.kind)
    && (scope !== "voivodeship" || row.voivodeshipCode === target.voivodeshipCode));
  const targetIndex = pool.findIndex(({ terc }) => terc === target.terc);
  if (targetIndex === -1) throw new Error("Rejestr nie zawiera wybranej gminy.");
  const ranks = INDICATORS.map((_, index) => percentile(pool.map((row) => row.values[index])));
  const results = pool.flatMap((row, index) => {
    if (index === targetIndex) return [];
    const scores = ranks.map((column) => Math.max(0, 100 - 2 * Math.abs(column[targetIndex] - column[index])));
    const score = scores.reduce((sum, value, i) => sum + value * weights[i], 0) / 100;
    return [{ ...row, score, scores }];
  }).sort((a, b) => b.score - a.score || collator.compare(a.name, b.name) || collator.compare(a.terc, b.terc));
  return { target, results, profile, weights, same, scope, scopeLabel: scope === "voivodeship" ? target.voivodeship : "Cały kraj" };
}
