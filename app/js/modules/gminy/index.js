import { normalizeQuery } from "../../location/normalize.js";
import { locationNotice } from "../../location/shared.js";
import { demoMunicipalities } from "./demo.js";
import { findMunicipalities, formatScore, formatValue, INDICATORS, PROFILES, rankMunicipalities, readMunicipalities, TYPES } from "./model.js";
import { downloadGminyPdf } from "./pdf.js";
import { gminyView } from "./view.js";

export const MUNICIPALITIES_URL = new URL("../../../data/gminy/bdl.json", import.meta.url).href;
const label = (item) => item.name + " · " + TYPES[item.kind] + " · " + item.county + " · " + item.voivodeship;
const codeLabel = (item, year) => "TERC " + item.terc
  + (item.referenceTerc !== item.terc ? " · TERC w " + year + " r. " + item.referenceTerc : "");

function mountGminy(container, context) {
  const document = container.ownerDocument ?? globalThis.document;
  const root = document.createElement("section");
  root.className = "gminy";
  root.dataset.gminy = "";
  root.innerHTML = gminyView;
  container.append(root);
  const part = (name) => root.querySelector(`[data-part="${name}"]`);
  if (!part("form")) return () => root.remove();

  const demo = context.gminyDemo === true;
  const lifetime = new AbortController();
  const { signal } = lifetime;
  const input = part("target");
  const shared = context.sharedSearch === true;
  const location = context.location;
  if (shared) {
    input.readOnly = true;
    input.value = location?.gmina.name ?? "";
    part("form").prepend(locationNotice(document, context,
      location ? "Gmina ze Startu: " + location.gmina.name + "." : "Wybierz gminę w module Start."));
  }
  const suggestions = part("suggestions");
  let data;
  let active = -1;
  let options = [];
  let chosen;
  let analysis;
  let report;
  let exporting = false;
  const selected = new Set();
  part("demo").hidden = !demo;
  if (context.localPreview) {
    const link = part("previewLink");
    link.href = demo ? "./#/gminy" : "./?gminy=demo#/gminy";
    link.textContent = demo ? "Przejdź do danych GUS BDL" : "Wypróbuj dane przykładowe";
    link.hidden = false;
  }

  function node(tag, text = "", className = "") {
    const element = document.createElement(tag);
    element.textContent = text;
    if (className) element.className = className;
    return element;
  }

  function status(message, error = false) {
    part("status").textContent = message;
    part("status").classList.toggle("gminy-error", error);
  }

  function hideOptions() {
    active = -1;
    suggestions.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }

  function choose(item) {
    if (chosen?.terc !== item.terc) clearAnalysis();
    chosen = item;
    input.value = item.name;
    part("targetHelp").textContent = label(item) + " · " + codeLabel(item, data.year) + (item.complete ? "" : " · brak kompletu danych");
    if (item.complete && !analysis) showCoverage();
    hideOptions();
  }

  function offerOptions() {
    if (shared || chosen || !data) return;
    const value = input.value.trim();
    const matches = findMunicipalities(data.municipalities, value);
    options = matches.slice(0, 18);
    active = -1;
    input.removeAttribute("aria-activedescendant");
    suggestions.replaceChildren(...options.map((item, index) => {
      const option = node("li");
      option.id = "gminy-option-" + index;
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", "false");
      option.append(node("strong", item.name));
      option.append(node("span", [TYPES[item.kind], "pow. " + item.county, item.voivodeship, item.terc,
        item.complete ? "" : "brak kompletu danych"].filter(Boolean).join(" · ")));
      option.addEventListener("mousedown", (event) => event.preventDefault());
      option.addEventListener("click", () => choose(item));
      return option;
    }));
    suggestions.hidden = options.length === 0;
    input.setAttribute("aria-expanded", String(!suggestions.hidden));
    part("targetHelp").textContent = value.length < 2 ? "Wpisz co najmniej dwa znaki."
      : matches.length === 0 ? "Brak pasujących gmin."
        : matches.length > options.length ? "Dopisz powiat lub województwo, aby zawęzić wyniki." : "Wybierz gminę z listy.";
  }

  input.addEventListener("input", () => {
    chosen = null;
    clearAnalysis();
    offerOptions();
  });
  input.addEventListener("focus", offerOptions);
  input.addEventListener("blur", hideOptions);
  input.addEventListener("keydown", (event) => {
    if (suggestions.hidden) return;
    if (event.key === "Escape") {
      hideOptions();
      event.preventDefault();
    }
    if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      choose(options[active]);
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      active = active === -1 ? (step === 1 ? 0 : options.length - 1) : (active + step + options.length) % options.length;
      for (const [i, option] of Array.from(suggestions.children).entries()) option.setAttribute("aria-selected", String(i === active));
      const option = suggestions.children[active];
      input.setAttribute("aria-activedescendant", option.id);
      option.scrollIntoView?.({ block: "nearest" });
    }
  });

  async function loadData() {
    part("retry").hidden = true;
    status("Wczytywanie pliku wskaźników…");
    try {
      let payload = demoMunicipalities;
      if (!demo) {
        const fetchSignal = AbortSignal.any([signal, AbortSignal.timeout(12_000)]);
        const response = await fetch(MUNICIPALITIES_URL, { signal: fetchSignal, credentials: "same-origin" });
        if (!response.ok) throw new Error("Plik GUS BDL jest niedostępny (HTTP " + response.status + ").");
        payload = await response.json();
      }
      if (signal.aborted) return;
      data = readMunicipalities(payload, { demo });
      if (shared && location) {
        const { terc7 } = location.canonicalGmina ?? location.gmina;
        const canonical = ["4", "5"].includes(terc7.at(-1)) ? terc7.slice(0, 6) + "3" : terc7;
        const target = data.municipalities.find((item) => (
          (!location.bdlUnitId || item.id === location.bdlUnitId) && item.terc === canonical
        ));
        if (target) choose(target);
        else part("targetHelp").textContent = "Brak tej jednostki w pliku wskaźników BDL.";
      }
      part("filters").disabled = shared && !chosen;
      part("dataYear").textContent = data.source + " · rok danych " + data.year
        + (data.collected && !demo ? " · stan pliku " + data.collected : "");
      part("dataYear").hidden = false;
      showCoverage();
    } catch (error) {
      if (signal.aborted) return;
      status(error.name === "TimeoutError" ? "Przekroczono czas wczytywania danych." : error.message, true);
      part("retry").hidden = false;
    }
  }

  function showCoverage() {
    status(formatValue(data.full.length) + " gmin z kompletem siedmiu wskaźników."
      + (data.excluded ? " Gminy pominięte z powodu braków: " + formatValue(data.excluded) + "." : ""));
  }

  function clearReport() {
    report = null;
    part("comparison").hidden = true;
    part("details").replaceChildren();
    part("export").disabled = true;
    part("exportStatus").textContent = "";
  }

  function clearAnalysis() {
    if (!analysis) return;
    analysis = null;
    part("results").hidden = true;
    part("stats").hidden = true;
    part("activeProfile").textContent = "";
    part("empty").textContent = "Wybierz gminę i uruchom analizę.";
    part("empty").hidden = false;
    selected.clear();
    clearReport();
    showCoverage();
  }

  function selectedChanged() {
    clearReport();
    part("compare").disabled = selected.size === 0;
    part("selected").textContent = selected.size ? "Zaznaczone gminy: " + formatValue(selected.size) : "Zaznacz gminy do porównania.";
  }

  function rankingRow(item, index) {
    const row = node("tr");
    const select = node("td");
    const checkbox = node("input");
    checkbox.type = "checkbox";
    checkbox.setAttribute("aria-label", "Wybierz " + label(item));
    select.append(checkbox);
    const municipality = node("td");
    municipality.append(node("strong", item.name), node("small", item.county + " · " + item.voivodeship));
    const score = node("td", "", "gminy-score");
    const bar = node("progress");
    bar.value = item.score;
    bar.max = 100;
    bar.setAttribute("aria-label", "Podobieństwo " + item.name);
    score.append(node("strong", formatScore(item.score)), bar);
    row.append(select, node("td", index + 1), municipality, node("td", TYPES[item.kind]), score);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selected.add(item.terc); else selected.delete(item.terc);
      row.classList.toggle("gminy-picked", checkbox.checked);
      selectedChanged();
    });
    row.addEventListener("click", (event) => {
      if (event.target !== checkbox) checkbox.click();
    });
    return row;
  }

  function run() {
    if (!data) return;
    if (!chosen && !shared) {
      const value = normalizeQuery(input.value);
      const exact = data.municipalities.filter(({ name, terc, referenceTerc, id }) => [normalizeQuery(name), terc, referenceTerc, id].includes(value));
      if (exact.length === 1) choose(exact[0]);
    }
    if (!chosen?.complete) {
      const reason = chosen ? "Wybrana gmina ma braki we wskaźnikach." : "Wybierz jednoznaczną gminę z listy.";
      input.focus();
      if (!chosen) offerOptions();
      status(reason, true);
      return;
    }
    hideOptions();
    analysis = rankMunicipalities(data.full, chosen, {
      profile: part("profile").value, scope: part("scope").value, same: part("same").checked,
    });
    selected.clear();
    selectedChanged();
    const { target, results, profile, scopeLabel } = analysis;
    part("targetName").textContent = target.name;
    part("count").textContent = formatValue(results.length);
    part("type").textContent = TYPES[target.kind];
    part("activeProfile").textContent = PROFILES[profile];
    part("stats").hidden = false;
    part("ranking").replaceChildren(...results.slice(0, 20).map(rankingRow));
    part("results").hidden = !results.length;
    part("empty").hidden = results.length > 0;
    part("empty").textContent = "Brak innych gmin spełniających filtry.";
    status("Zakres rankingu · " + scopeLabel);
  }

  function detailCard(row, target, weights) {
    const article = node("article", "", "gminy-detail");
    const heading = node("div", "", "gminy-actions");
    heading.append(node("h4", row.name + " · " + TYPES[row.kind]), node("strong", formatScore(row.score)));
    article.append(heading, node("p", row.county + " · " + row.voivodeship + " · " + codeLabel(row, data.year) + " · BDL " + row.id, "gminy-caption"));
    const metrics = node("dl", "", "gminy-indicators");
    for (const [index, indicator] of INDICATORS.entries()) {
      const block = node("div");
      const item = node("dt", indicator.title);
      const values = node("dd");
      values.append(node("span", target.name + " · " + formatValue(target.values[index])),
        node("span", row.name + " · " + formatValue(row.values[index])),
        node("small", indicator.unit + " · " + data.year));
      const interpretation = node("dd", "", "gminy-indicator-meta");
      interpretation.append(node("strong", "Podobieństwo " + formatScore(row.scores[index])),
        node("span", "Waga " + weights[index] + "%"));
      block.append(item, values, interpretation, node("p", indicator.description, "gminy-caption"));
      metrics.append(block);
    }
    article.append(metrics);
    return article;
  }

  part("form").addEventListener("submit", (event) => { event.preventDefault(); run(); });
  for (const key of ["scope", "same", "profile"]) part(key).addEventListener("change", () => { if (analysis) run(); });
  part("retry").addEventListener("click", () => void loadData());
  part("compare").addEventListener("click", () => {
    if (!analysis || !selected.size) return;
    const rows = analysis.results.filter(({ terc }) => selected.has(terc));
    report = { analysis, rows, source: data.source, year: data.year };
    part("details").replaceChildren(...rows.map((row) => detailCard(row, analysis.target, analysis.weights)));
    part("comparison").hidden = false;
    part("export").disabled = exporting;
    part("comparison").scrollIntoView?.({ block: "start", behavior: "smooth" });
  });
  part("export").addEventListener("click", async () => {
    if (!report || exporting) return;
    const snapshot = report;
    exporting = true;
    part("export").disabled = true;
    part("exportStatus").textContent = "Przygotowywanie PDF…";
    try {
      await downloadGminyPdf(snapshot, signal);
      if (!signal.aborted && report === snapshot) part("exportStatus").textContent = "PDF jest gotowy do zapisania.";
    } catch {
      if (!signal.aborted && report === snapshot) part("exportStatus").textContent = "Nie udało się utworzyć PDF. Spróbuj ponownie.";
    } finally {
      exporting = false;
      if (!signal.aborted) part("export").disabled = !report;
    }
  });

  void loadData();
  return () => { lifetime.abort(); root.remove(); };
}

export const gminyModule = Object.freeze({
  id: "gminy", label: "Gminy", description: "Ranking podobieństwa gmin na podstawie publicznych wskaźników.", backend: null, mount: mountGminy,
});
