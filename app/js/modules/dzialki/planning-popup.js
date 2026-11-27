import { safePlanningHref } from "./planning-services.js";

const text = (value) => value === null || value === undefined ? "" : String(value);
function line(document, container, label, value) {
  if (!text(value) || value === "-") return;
  const row = document.createElement("p");
  row.textContent = (label ? label + ": " : "") + text(value);
  container.append(row);
}
function link(document, container, label, value) {
  const href = safePlanningHref(value);
  if (!href) return;
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.textContent = text(label) || "Dokument";
  container.append(anchor, document.createElement("br"));
}

export function renderMpzp(document, container, data) {
  const plans = Array.isArray(data?.plans) ? data.plans : [];
  const details = data?.mpzp;
  if (!plans.length && !details) return false;
  for (const plan of plans) {
    line(document, container, "MPZP", plan.tytul || "plan miejscowy");
    line(document, container, "Status", plan.status);
    line(document, container, plan.obowiazujeOd ? "Obowiązuje od" : "Uchwała z dnia", plan.obowiazujeOd || plan.data);
    for (const item of Array.isArray(plan.links) ? plan.links : []) link(document, container, item.label, item.href);
  }
  if (details) {
    if (!plans.length) line(document, container, "MPZP", details.nazwaAktu || "plan miejscowy");
    line(document, container, "Uchwała nr", details.numerUchwaly);
    line(document, container, "Data uchwały", details.dataUchwaly);
    for (const zone of Array.isArray(details.strefy) ? details.strefy : []) {
      line(document, container, "Przeznaczenie", [zone.etykieta, zone.opis].filter(Boolean).join(" – "));
      link(document, container, "Ustalenia szczegółowe", zone.ustalenia);
      link(document, container, "Legenda", details.linki?.legenda);
    }
    for (const [key, label] of [["uchwala", "Uchwała"], ["rysunek", "Rysunek"], ["gml", "GML"]]) link(document, container, label, details.linki?.[key]);
  }
  return true;
}

export function renderAdoptedPog(document, container, data) {
  for (const zone of data?.zones ?? []) {
    line(document, container, "POG – strefa", zone.oznaczenie);
    line(document, container, "", zone.nazwa);
    for (const [key, label] of [["profilPodstawowy", "Profil podstawowy"], ["profilDodatkowy", "Profil dodatkowy"],
      ["maksNadziemnaIntensywnoscZabudowy", "Maks. intensywność zabudowy"], ["maksUdzialPowierzchniZabudowy", "Maks. powierzchnia zabudowy"],
      ["maksWysokoscZabudowy", "Maks. wysokość zabudowy"], ["minUdzialPowierzchniBiologicznieCzynnej", "Min. powierzchnia biologicznie czynna"]]) line(document, container, label, zone[key]);
  }
  if (data?.plan) {
    line(document, container, "", data.plan.tytul || "Plan ogólny");
    line(document, container, "Obowiązuje od", data.plan.obowiazujeOd);
    line(document, container, "Status", data.plan.status);
  }
  return Boolean(data?.zones?.length || data?.plan);
}

export function renderDraftPog(document, container, records) {
  for (const record of records ?? []) {
    line(document, container, "Projektowany POG – strefa", [record.Oznaczenie || record.Symbol || "strefa", record.Nazwa].filter(Boolean).join(" – "));
    for (const label of ["Symbol", "Status", "Profil podstawowy", "Profil dodatkowy", "Maksymalna wysokość zabudowy", "Minimalny udział powierzchni biologicznie czynnej", "Obowiązuje od"]) line(document, container, label, record[label]);
  }
  return Boolean(records?.length);
}
