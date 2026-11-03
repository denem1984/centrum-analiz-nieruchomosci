import { contextStore } from "../../context.js";
import { getDzialkiState, updateDzialkiState } from "./state.js";
import {
  createSearchApi,
  createSearchContext,
  isValidParcelNumber,
  resolveParcelAdministrativeNames,
  VOIVODESHIP_NAMES,
} from "./search.js";

function makeElement(document, tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function option(document, value, label) {
  const item = makeElement(document, "option", label);
  item.value = value;
  return item;
}

function setOptions(select, items, placeholder, selectedValue = "", labelFor = (item) => item.name) {
  const document = select.ownerDocument;
  select.replaceChildren(option(document, "", placeholder));
  for (const item of items) select.append(option(document, item.code, labelFor(item)));
  select.value = selectedValue;
}

function reportElement(document, tag, text, className) {
  const node = makeElement(document, tag, text, className);
  return node;
}

function createParcelReport(document) {
  const section = reportElement(document, "section", undefined, "dzialki-parcel-report");
  section.id = "dzialki-parcel-report";
  section.setAttribute("aria-labelledby", "dzialki-parcel-report-heading");
  section.dataset.egibState = "idle";
  const heading = reportElement(document, "h3", "2. Raport o działce");
  heading.id = "dzialki-parcel-report-heading";
  const body = reportElement(document, "div", undefined, "dzialki-parcel-report-body");
  section.append(heading, body);
  return { section, body };
}

function renderParcelReport(report, selection) {
  const { section, body } = report;
  body.replaceChildren();
  if (!selection) {
    section.dataset.egibState = "idle";
    body.append(reportElement(body.ownerDocument, "p", "Nie wybrano działki."));
    return;
  }
  const state = selection.egibState ?? (selection.egib ? "ready" : "loading");
  section.dataset.egibState = state;
  const rows = [
    ["Identyfikator działki", selection.parcel?.id],
    ["Województwo", selection.voivodeshipName],
    ["Powiat", selection.countyName || selection.powiat?.name],
    ["Gmina", selection.communeName || selection.gmina?.name],
    ["Obręb", selection.region?.name],
    ["Numer", selection.parcel?.number],
    ["Powierzchnia ewidencyjna", selection.egib?.area],
  ];
  const grid = reportElement(body.ownerDocument, "dl", undefined, "dzialki-report-rows");
  for (const [label, value] of rows) {
    const isIdentifier = label === "Identyfikator działki";
    grid.append(reportElement(body.ownerDocument, "dt", label,
      isIdentifier ? "dzialki-report-identifier-label" : ""));
    grid.append(reportElement(body.ownerDocument, "dd", typeof value === "string" && value ? value : "—",
      isIdentifier ? "dzialki-report-identifier-value" : ""));
  }
  body.append(grid);
  if (selection.egib?.group) {
    const group = reportElement(body.ownerDocument, "div", undefined, "dzialki-registration-group");
    group.append(reportElement(body.ownerDocument, "span", "Grupa rejestrowa"));
    group.append(reportElement(body.ownerDocument, "strong", "Grupa " + selection.egib.group));
    if (selection.egib.groupDescription) group.append(reportElement(body.ownerDocument, "span", selection.egib.groupDescription));
    body.append(group);
  }
  const uses = reportElement(body.ownerDocument, "section", undefined, "dzialki-land-uses");
  uses.append(reportElement(body.ownerDocument, "h4", "Klasoużytki"));
  if (selection.egib?.classUse?.length) {
    for (const item of selection.egib.classUse) {
      const row = reportElement(body.ownerDocument, "p", undefined, "dzialki-land-use");
      row.append(reportElement(body.ownerDocument, "strong", item.code));
      row.append(reportElement(body.ownerDocument, "span", item.description || "Brak opisu w słowniku aplikacji"));
      uses.append(row);
    }
  } else {
    const message = state === "ready"
      ? "Brak danych o użytkach w ewidencji powiatu (KIEG)."
      : state === "error" ? "Nie udało się pobrać danych ewidencyjnych. Możesz spróbować ponownie."
        : "Oczekiwanie na dane ewidencyjne…";
    uses.append(reportElement(body.ownerDocument, "p", message));
  }
  body.append(uses);
}

function writeSearchState(patch) {
  const current = getDzialkiState().search;
  updateDzialkiState({ search: { ...current, ...patch } });
}

function selectByCode(items, value) {
  return items.find((item) => item.code === value) ?? null;
}

export function mountParcelSearch(container, options = {}) {
  const document = container.ownerDocument;
  const root = makeElement(document, "section", undefined, "dzialki-search-panel");
  root.setAttribute("aria-labelledby", "dzialki-search-heading");
  const heading = makeElement(document, "h3", "Szukaj działki");
  heading.id = "dzialki-search-heading";
  root.append(heading);
  root.append(makeElement(
    document,
    "p",
    "Dane administracyjne: GUGiK PRG. Działka: ULDK GUGiK. Powierzchnia i klasoużytki: EGiB/KIEG.",
    "dzialki-search-source",
  ));

  const saved = getDzialkiState().search;
  const countyLabel = makeElement(document, "label", "Powiat");
  countyLabel.htmlFor = "dzialki-search-powiat";
  const county = makeElement(document, "select");
  county.id = "dzialki-search-powiat";
  county.setAttribute("autocomplete", "off");
  countyLabel.append(county);

  const communeLabel = makeElement(document, "label", "Gmina");
  communeLabel.htmlFor = "dzialki-search-gmina";
  const commune = makeElement(document, "select");
  commune.id = "dzialki-search-gmina";
  commune.disabled = !saved.powiatCode;
  communeLabel.append(commune);

  const precinctLabel = makeElement(document, "label", "Obręb");
  precinctLabel.htmlFor = "dzialki-search-obreb";
  const precinct = makeElement(document, "select");
  precinct.id = "dzialki-search-obreb";
  precinct.disabled = !saved.gminaCode;
  precinctLabel.append(precinct);

  const numberLabel = makeElement(document, "label", "Numer działki");
  numberLabel.htmlFor = "dzialki-search-numer";
  const number = makeElement(document, "input");
  number.id = "dzialki-search-numer";
  number.type = "text";
  number.inputMode = "text";
  number.autocomplete = "off";
  number.maxLength = 32;
  number.value = saved.parcelNumber;
  number.disabled = !saved.obrebCode;
  numberLabel.append(number);

  const searchButton = makeElement(document, "button", "Szukaj działki", "dzialki-search-submit");
  searchButton.id = "dzialki-search-submit";
  searchButton.type = "button";
  searchButton.disabled = !saved.obrebCode;
  const status = makeElement(document, "p", "Gotowe. Wybierz powiat.", "dzialki-search-status");
  status.id = "dzialki-search-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const retryButton = makeElement(document, "button", "Spróbuj ponownie", "dzialki-search-retry");
  retryButton.id = "dzialki-search-retry";
  retryButton.type = "button";
  retryButton.hidden = true;
  root.append(countyLabel, communeLabel, precinctLabel, numberLabel, searchButton, status, retryButton);
  container.append(root);

  const report = createParcelReport(document);
  container.append(report.section);
  renderParcelReport(report, getDzialkiState().selectedParcel);

  const api = options.api ?? createSearchApi(options.apiOptions);
  const savedState = getDzialkiState();
  const searchState = savedState.search;
  let disposed = false;
  let busy = false;
  let retryAction = null;
  let countyItems = Array.isArray(searchState.powiaty) ? searchState.powiaty : [];
  let communeItems = Array.isArray(searchState.gminy) ? searchState.gminy : [];
  let precinctItems = Array.isArray(searchState.obreby) ? searchState.obreby : [];
  const controllers = new Set();

  const countyLabelFor = (item) => item.name + " (" + (VOIVODESHIP_NAMES[item.code.slice(0, 2)] ?? "województwo nieznane") + ")";
  const precinctLabelFor = (item) => item.name + " (" + item.code.split(".").at(-1) + ")";
  setOptions(county, countyItems, "Wybierz powiat", searchState.powiatCode, countyLabelFor);
  setOptions(commune, communeItems, "Najpierw wybierz powiat", searchState.gminaCode);
  setOptions(precinct, precinctItems, "Najpierw wybierz gminę", searchState.obrebCode);

  function setStatus(message) {
    if (!disposed) status.textContent = message;
  }

  function storeSelection(selection) {
    updateDzialkiState({ selectedParcel: selection });
    renderParcelReport(report, selection);
  }

  async function loadEgib(selection) {
    const result = await runOperation("Pobieranie danych EGiB", ({ onWait, signal }) =>
      api.egib(selection.parcel.id, { onWait, signal }), () => loadEgib(selection));
    if (disposed) return;
    if (!result) {
      const failed = { ...selection, egib: null, egibState: "error" };
      storeSelection(failed);
      options.onEgib?.(failed);
      return;
    }
    const completed = { ...selection, egib: result, egibState: "ready" };
    storeSelection(completed);
    options.onEgib?.(completed);
    setStatus("Działka została znaleziona. Powierzchnia i klasoużytki pobrane z EGiB.");
  }

  function setBusy(value) {
    busy = value;
    searchButton.disabled = value || !precinct.value;
    county.disabled = value;
    commune.disabled = value || !county.value || communeItems.length === 0;
    precinct.disabled = value || !commune.value || precinctItems.length === 0;
    number.disabled = value || !precinct.value;
    retryButton.hidden = value || !retryAction;
  }

  function persistSearch(extra = {}) {
    writeSearchState({
      powiatCode: county.value,
      gminaCode: commune.value,
      obrebCode: precinct.value,
      parcelNumber: number.value,
      powiaty: countyItems,
      gminy: communeItems,
      obreby: precinctItems,
      ...extra,
    });
  }

  async function runOperation(label, operation, retry) {
    if (busy || disposed) return null;
    retryAction = null;
    retryButton.hidden = true;
    setBusy(true);
    const controller = new AbortController();
    controllers.add(controller);
    const onWait = (seconds) => {
      if (!disposed) setStatus(label + " · Usługa się budzi… Oczekiwanie: " + seconds
        + " s. Pierwsze pobranie może potrwać do około minuty.");
    };
    try {
      const result = await operation({ onWait, signal: controller.signal });
      if (disposed) return result;
      return result;
    } catch (error) {
      if (disposed || error?.name === "AbortError") return undefined;
      const message = error?.message || "Nie udało się pobrać danych.";
      setStatus(message + " Możesz spróbować ponownie.");
      retryAction = retry ?? (() => runOperation(label, operation, retry));
      retryButton.hidden = false;
      return undefined;
    } finally {
      controllers.delete(controller);
      if (!disposed) setBusy(false);
    }
  }

  async function loadCounties() {
    const rows = await runOperation("Pobieranie listy powiatów", ({ onWait, signal }) =>
      api.counties({ onWait, signal }), () => loadCounties());
    if (!rows || disposed) return;
    countyItems = rows;
    setOptions(county, countyItems, "Wybierz powiat", county.value, countyLabelFor);
    county.disabled = false;
    persistSearch();
    setStatus("Gotowe. Wybierz powiat.");
  }

  async function loadCommunes(selectedCounty) {
    const rows = await runOperation("Pobieranie listy gmin", ({ onWait, signal }) =>
      api.communes(selectedCounty.code, { onWait, signal }), () => loadCommunes(selectedCounty));
    if (!rows || disposed) return;
    communeItems = rows;
    setOptions(commune, communeItems, "Wybierz gminę");
    commune.disabled = false;
    persistSearch({ gminaCode: "", obrebCode: "", gminy: communeItems, obreby: [] });
    setStatus("Wybierz gminę.");
  }

  async function loadPrecincts(selectedCommune) {
    const rows = await runOperation("Pobieranie listy obrębów", ({ onWait, signal }) =>
      api.regions(selectedCommune.code, { onWait, signal }), () => loadPrecincts(selectedCommune));
    if (!rows || disposed) return;
    precinctItems = rows;
    setOptions(precinct, precinctItems, "Wybierz obręb", "", precinctLabelFor);
    precinct.disabled = false;
    persistSearch({ obrebCode: "", obreby: precinctItems });
    setStatus("Wybierz obręb.");
  }

  async function performSearch() {
    if (busy || disposed) return;
    const selectedCounty = selectByCode(countyItems, county.value);
    const selectedCommune = selectByCode(communeItems, commune.value);
    const selectedPrecinct = selectByCode(precinctItems, precinct.value);
    const parcelNumber = number.value.trim();
    if (!selectedCounty || !selectedCommune || !selectedPrecinct) {
      setStatus("Wybierz powiat, gminę i obręb.");
      return;
    }
    if (!isValidParcelNumber(parcelNumber)) {
      setStatus("Wpisz prawidłowy numer działki, np. 12/3.");
      number.focus();
      return;
    }
    persistSearch({ parcelNumber });
    const result = await runOperation("Wyszukiwanie działki", ({ onWait, signal }) =>
      api.parcel(selectedPrecinct.code, parcelNumber, { onWait, signal }), () => performSearch());
    if (disposed || busy) return;
    if (result === undefined) return;
    if (!result?.geometry) {
      setStatus("Nie znaleziono działki o podanym numerze.");
      return;
    }
    const names = resolveParcelAdministrativeNames(result, {
      powiat: selectedCounty,
      gmina: selectedCommune,
      region: selectedPrecinct,
    });
    const selection = {
      parcel: { id: result.id, number: result.number || parcelNumber },
      powiat: selectedCounty,
      gmina: selectedCommune,
      communes: communeItems,
      countyName: names.countyName,
      communeName: names.communeName,
      voivodeshipName: names.voivodeshipName,
      region: { ...selectedPrecinct, name: names.regionName },
      geometry: result.geometry,
      extent: result.extent,
      egib: null,
      egibState: "loading",
    };
    storeSelection(selection);
    options.onSelect?.(selection);
    const context = createSearchContext(selection);
    if (context) {
      const applied = typeof options.setContext === "function"
        ? options.setContext(context)
        : contextStore.set(context);
      if (!applied?.context) {
        setStatus("Działkę znaleziono, ale nie udało się zapisać lokalizacji.");
        return;
      }
    }
    setStatus("Działkę znaleziono. Pobieranie danych ewidencyjnych…");
    await loadEgib(selection);
  }

  county.addEventListener("change", () => {
    communeItems = [];
    precinctItems = [];
    setOptions(commune, [], "Najpierw wybierz powiat");
    setOptions(precinct, [], "Najpierw wybierz gminę");
    commune.disabled = true;
    precinct.disabled = true;
    number.value = "";
    number.disabled = true;
    searchButton.disabled = true;
    persistSearch({ gminaCode: "", obrebCode: "", parcelNumber: "", gminy: [], obreby: [] });
    const selected = selectByCode(countyItems, county.value);
    if (selected) void loadCommunes(selected);
    else setStatus("Wybierz powiat.");
  });

  commune.addEventListener("change", () => {
    precinctItems = [];
    setOptions(precinct, [], "Najpierw wybierz gminę");
    precinct.disabled = true;
    number.value = "";
    number.disabled = true;
    searchButton.disabled = true;
    persistSearch({ obrebCode: "", parcelNumber: "", obreby: [] });
    const selected = selectByCode(communeItems, commune.value);
    if (selected) void loadPrecincts(selected);
    else setStatus("Wybierz gminę.");
  });

  precinct.addEventListener("change", () => {
    const selected = selectByCode(precinctItems, precinct.value);
    number.disabled = !selected;
    searchButton.disabled = !selected;
    persistSearch();
    if (selected) number.focus();
    setStatus(selected ? "Wpisz numer działki." : "Wybierz obręb.");
  });
  number.addEventListener("input", () => {
    persistSearch();
    if (number.value.trim()) setStatus("Gotowe do wyszukiwania.");
  });
  number.addEventListener("keydown", (event) => {
    if (event.key === "Enter") void performSearch();
  });
  searchButton.addEventListener("click", () => void performSearch());
  retryButton.addEventListener("click", () => {
    const retry = retryAction;
    if (retry) void retry();
  });

  if (countyItems.length === 0) void loadCounties();
  else {
    county.disabled = false;
    if (searchState.obrebCode) {
      number.disabled = false;
      searchButton.disabled = false;
    }
    if (savedState.selectedParcel) setStatus("Znaleziono działkę. Obrys jest widoczny na mapie.");
    else setStatus(searchState.powiatCode ? "Wybierz gminę." : "Gotowe. Wybierz powiat.");
  }

  return function unmountParcelSearch() {
    if (disposed) return;
    disposed = true;
    for (const controller of controllers) controller.abort();
    controllers.clear();
    persistSearch();
    report.section.remove?.();
    root.replaceChildren();
  };
}
