const rowId = Symbol("rcnRow");
let nextRowId = 0;
const numericFields = [
  "price", "area", "price_m2", "building_price_m2", "land_price_m2_aux",
  "lat", "lon", "distance_m", "similarity_score",
  "tran_cena_brutto", "nier_cena_brutto", "lok_cena_brutto",
];

export function asFiniteNumber(value) {
  if (typeof value !== "number" && !(typeof value === "string" && value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function recordKey(record) {
  return record[rowId];
}

function hasPartialShare(record) {
  const share = String(record.ownership_share || record.raw_fields?.nier_udzial || "").replace(/\s/g, "");
  return share !== "" && share !== "1/1";
}

function consistentRate(price, area, rate) {
  const expected = price / area;
  return price > 0 && area > 0 && rate > 0
    && Number.isFinite(expected) && Math.abs(expected - rate) <= 0.51;
}

function unbuiltRateIssue(record) {
  if (hasPartialShare(record)) return "Cena dotyczy udziału. Powierzchnia opisuje całą działkę.";
  if (record.price_source === "tran_cena_brutto" || record.price_source === "nier_cena_brutto") {
    return "Cena z aktu lub nieruchomości. Brak potwierdzenia, że obejmuje wyłącznie powierzchnię tej działki.";
  }
  if (record.analysis_included === false) return record.analysis_note || "Źródło nie zakwalifikowało ceny do analizy.";
  if (record.price_source !== "dzi_cena_brutto") return "Brak ceny przypisanej do działki.";
  if (record.area_unit !== "geometria_m2") return "Brak powierzchni z konturu w m². Jednostka pola opisowego wymaga potwierdzenia.";
  if (!consistentRate(record.price, record.area, record.price_m2)) return "Cena/m² nie zgadza się z ceną działki i jej powierzchnią.";
  return "";
}

function builtRateIssue(record) {
  if (hasPartialShare(record)) return "Cena dotyczy udziału. Powierzchnie budynków opisują całość.";
  if (!String(record.transaction_id || "").trim()) return "Brak identyfikatora transakcji łączącego grunt z budynkami.";
  if (record.parcel_area_complete === false) return "Źródło oznaczyło sumę powierzchni działek transakcji jako niepełną.";
  const count = asFiniteNumber(record.building_count);
  if (!Number.isInteger(count) || count < 1) return "Brak budynków powiązanych w danych RCN.";

  const estimated = record.building_area_basis === "estimated_footprint_floors";
  const complete = estimated ? record.building_estimated_area_complete : record.building_area_complete;
  const covered = asFiniteNumber(estimated ? record.building_estimated_area_count : record.building_area_count);
  const area = asFiniteNumber(estimated ? record.building_estimated_area : record.building_area);
  if ((!estimated && record.building_area_basis !== "usable") || complete !== true || covered !== count || !(area > 0)) {
    return "Brak kompletnej podstawy powierzchniowej dla wszystkich powiązanych budynków.";
  }
  if (record.price_source !== "tran_cena_brutto") return "Brak potwierdzonej ceny całej transakcji grunt–budynki.";
  if (record.analysis_included === false) return record.building_price_m2_quality || "Źródło nie zakwalifikowało ceny do analizy.";
  if (!consistentRate(record.price, area, record.building_price_m2)) return "Wskaźnik nie zgadza się z ceną transakcji i powierzchnią budynków.";
  return "";
}

export function prepareRcnRecords(records, mode) {
  return records.filter((record) => record && typeof record === "object" && !Array.isArray(record))
    .map((record) => {
      const row = { ...record, [rowId]: String(nextRowId++) };
      for (const field of numericFields) row[field] = asFiniteNumber(row[field]);
      const land = mode === "grunt_niezabudowany" || mode === "grunt_zabudowany";
      const built = mode === "grunt_zabudowany";
      if (!land) {
        if (!(row.price_m2 > 0)) row.price_m2 = null;
        return row;
      }
      const issue = built ? builtRateIssue(row) : unbuiltRateIssue(row);
      if ((built && row.parcel_area_complete === false) || (!built && row.area_unit !== "geometria_m2")) {
        row.area_raw ??= row.area;
        row.area = null;
      }
      if (issue) {
        row.analysis_included = false;
        row.analysis_note = issue;
        row.price_m2_quality = issue;
        if (built) row.building_price_m2_quality = issue;
        row.price_m2 = null;
        row.building_price_m2 = null;
        row.land_price_m2_aux = null;
      } else {
        row.analysis_included = true;
        if (built) row.price_m2 = row.building_price_m2;
      }
      return row;
    });
}
