import { normalizeQuery } from "../../location/normalize.js";
import { locationNotice } from "../../location/shared.js";
import { createOffersClient, searchValues } from "./client.js";
import { createOffersDemoFetch } from "./demo.js";
import { exportOffers } from "./export.js";
import { comparison, formatOfferNumber as format, normalizeResults, sortOffers } from "./results.js";
import { columns, offersView } from "./view.js";

const inputNames = ["location", "propertyType", "radius", "mode", "area", "tolerance", "min", "max"];
const locationLabel = (place) => [place.name, place.powiat, place.wojewodztwo].filter(Boolean).join(" · ");
const offerPlural = new Intl.PluralRules("pl");

function offerCount(count, accusative = false) {
  const category = offerPlural.select(count);
  const noun = category === "one" ? (accusative ? "ofertę" : "oferta") : category === "few" ? "oferty" : "ofert";
  return format(count) + " " + noun;
}

function mountOffers(container, context) {
  const document = container.ownerDocument ?? globalThis.document;
  const root = document.createElement("section");
  root.dataset.oferty = "";
  root.className = "oferty";
  root.innerHTML = offersView;
  container.append(root);
  const part = (name) => root.querySelector(`[data-part="${name}"]`);
  const form = part("form");
  if (!form) {
    root.textContent = "Nie udało się wczytać formularza Ofert.";
    return;
  }
  const input = part("location");
  const list = part("suggestions");
  const lifetime = new AbortController();
  const { signal } = lifetime;
  const demo = context.ofertyDemo === true;
  const client = createOffersClient({ signal, ...(demo ? { fetchImpl: createOffersDemoFetch() } : {}) });
  part("demo").hidden = !demo;
  if (context.localPreview) {
    const link = part("previewLink");
    link.href = demo ? "./#/oferty" : "./?oferty=demo#/oferty";
    link.textContent = demo ? "Przejdź do ofert z portali" : "Sprawdź na danych przykładowych";
    part("previewMode").hidden = false;
  }

  let chosen = null;
  const shared = context.sharedSearch;
  const location = context.location;
  const sharedPlace = shared && location?.place ? {
    name: location.place.name, simc: location.place.simc7, teryt: location.place.terc7 ?? location.gmina.terc7,
    powiat: location.powiat.name, wojewodztwo: location.voivodeship.name,
  } : null;
  let suggestions = [];
  let checkedName;
  let activeSuggestion = -1;
  let lookup;
  let lookupTimer;
  let search;
  let waitTimer;
  let result;
  let exporting = false;
  let sortKey = "";
  let sortDirection = 1;
  const selectedIds = new Set();

  function node(tag, text = "") {
    const element = document.createElement(tag);
    element.textContent = text;
    return element;
  }

  function announce(text, error = false) {
    const el = part("status");
    el.textContent = text;
    el.classList.toggle("oferty-error", error);
  }

  function hideSuggestions() {
    activeSuggestion = -1;
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    for (const option of list.children) option.setAttribute("aria-selected", "false");
  }

  function stopLookup() {
    clearTimeout(lookupTimer);
    lookup?.abort();
    lookup = null;
  }

  function choose(place) {
    stopLookup();
    chosen = place;
    input.value = place.name;
    hideSuggestions();
    part("locationStatus").textContent = "Wybrano " + locationLabel(place);
  }

  if (shared) {
    form.prepend(locationNotice(document, context, !sharedPlace ? "Oferty wymagają miejscowości."
      : location.street ? "Oferty pobiorą dane dla " + sharedPlace.name + ". Usługa filtruje na poziomie miejscowości."
        : "Miejscowość ze Startu: " + locationLabel(sharedPlace) + "."));
    input.readOnly = true;
    if (sharedPlace) choose(sharedPlace);
    part("submit").disabled = !sharedPlace;
  }

  function renderSuggestions(items) {
    suggestions = items;
    list.replaceChildren(...suggestions.slice(0, 12).map((place, index) => {
      const option = node("li", locationLabel(place));
      option.id = "oferty-suggestion-" + index;
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", "false");
      option.addEventListener("mousedown", (event) => event.preventDefault());
      option.addEventListener("click", () => choose(place));
      return option;
    }));
    list.hidden = suggestions.length === 0;
    input.setAttribute("aria-expanded", String(!list.hidden));
  }

  async function showSuggestions(query) {
    const request = new AbortController();
    lookup = request;
    try {
      const items = await client.suggest(query, request.signal);
      if (signal.aborted || request !== lookup) return;
      checkedName = normalizeQuery(query);
      renderSuggestions(items);
      part("locationStatus").textContent = suggestions.length
        ? "Wybierz miejscowość z listy lub wpisz pełną nazwę."
        : "Brak podpowiedzi. Możesz wyszukać po pełnej nazwie.";
    } catch (error) {
      if (signal.aborted || request !== lookup) return;
      hideSuggestions();
      part("locationStatus").textContent = "Podpowiedzi są chwilowo niedostępne. Wpisz pełną nazwę.";
    }
  }

  function scheduleLookup() {
    const query = input.value.trim();
    part("locationStatus").textContent = query.length >= 2 ? "Szukanie miejscowości…" : "Wpisz co najmniej 2 znaki.";
    if (query.length >= 2) lookupTimer = setTimeout(() => void showSuggestions(query), 250);
  }

  input.addEventListener("input", () => {
    stopLookup();
    chosen = null;
    checkedName = undefined;
    suggestions = [];
    hideSuggestions();
    scheduleLookup();
  });
  input.addEventListener("focus", () => {
    const query = input.value.trim();
    if (chosen || search || query.length < 2) return;
    if (checkedName === normalizeQuery(query)) {
      renderSuggestions(suggestions);
    } else {
      scheduleLookup();
    }
  });
  input.addEventListener("blur", () => {
    stopLookup();
    hideSuggestions();
  });
  input.addEventListener("keydown", (event) => {
    if (list.hidden) return;
    if (event.key === "Escape") {
      hideSuggestions();
      event.preventDefault();
    }
    if (event.key === "Enter" && activeSuggestion >= 0) {
      event.preventDefault();
      choose(suggestions[activeSuggestion]);
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      const count = list.children.length;
      activeSuggestion = activeSuggestion < 0 ? (step > 0 ? 0 : count - 1)
        : (activeSuggestion + step + count) % count;
      for (const [index, option] of Array.from(list.children).entries()) {
        option.setAttribute("aria-selected", String(index === activeSuggestion));
      }
      const current = list.children[activeSuggestion];
      input.setAttribute("aria-activedescendant", current.id);
      current.scrollIntoView?.({ block: "nearest" });
    }
  });

  part("mode").addEventListener("change", () => {
    const mode = part("mode").value;
    part("percentFields").hidden = mode !== "percent";
    part("rangeFields").hidden = mode !== "range";
  });

  function setBusy(busy) {
    part("searchFields").disabled = busy;
    part("submit").disabled = busy;
    part("cancel").hidden = !busy;
    if (!busy) clearInterval(waitTimer);
  }

  function cancelSearch() {
    search?.abort();
    search = null;
    setBusy(false);
  }

  part("cancel").addEventListener("click", () => {
    cancelSearch();
    announce("Oczekiwanie anulowane.");
    part("submit").focus();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (search || (shared && !sharedPlace)) return;
    let query;
    try {
      query = searchValues(Object.fromEntries(inputNames.map((name) => [name, part(name).value])));
    } catch (error) {
      announce(error.message, true);
      return;
    }
    stopLookup();
    hideSuggestions();
    const request = new AbortController();
    search = request;
    setBusy(true);
    part("results").hidden = true;
    const started = Date.now();
    let stage = "Potwierdzanie lokalizacji";
    const tick = () => announce(stage + " · " + Math.floor((Date.now() - started) / 1000) + " s");
    tick();
    waitTimer = setInterval(tick, 1000);
    try {
      const name = normalizeQuery(query.location);
      if (!chosen && checkedName !== name) {
        try {
          const items = await client.suggest(query.location, request.signal);
          if (signal.aborted || request !== search) return;
          checkedName = name;
          suggestions = items;
        } catch (error) {
          if (signal.aborted || request !== search) return;
          part("locationStatus").textContent = "Podpowiedzi są chwilowo niedostępne. Sprawdzam pełną nazwę miejscowości.";
        }
      }
      const repeatedName = suggestions.filter((item) => normalizeQuery(item.name) === name).length > 1;
      if (!chosen && repeatedName) {
        setBusy(false);
        input.focus();
        renderSuggestions(suggestions);
        const message = "Kilka miejscowości ma tę nazwę. Wybierz właściwą z listy.";
        part("locationStatus").textContent = message;
        announce(message, true);
        return;
      }
      const resolved = sharedPlace ?? await client.resolve(query.location, chosen, request.signal);
      if (signal.aborted || request !== search) return;
      chosen = resolved;
      input.value = resolved.name;
      part("locationStatus").textContent = "Lokalizacja potwierdzona · " + locationLabel(resolved);
      stage = "Pobieranie ofert";
      tick();
      const data = await client.search(query, resolved, request.signal);
      if (signal.aborted || request !== search) return;
      renderResult(normalizeResults(data, query, resolved), (shared || repeatedName) && query.propertyType !== "mieszkanie");
      announce("Znaleziono " + offerCount(result.offers.length, true) + ".");
    } catch (error) {
      if (signal.aborted || request !== search) return;
      if (stage === "Potwierdzanie lokalizacji") {
        part("locationStatus").textContent = "Nie udało się potwierdzić miejscowości „" + query.location + "”.";
      }
      announce(error.name === "TimeoutError" ? "Usługa nie odpowiedziała w ciągu 120 s. Spróbuj ponownie." : error.message, true);
    } finally {
      if (request === search) {
        search = null;
        setBusy(false);
      }
    }
  });

  function sourceCard(source, radius) {
    const card = node("li");
    card.append(node("h3", source.name));
    card.append(node("p", [
      "Po filtrze " + format(source.filtered), "Duplikaty " + format(source.duplicates),
      "Przyjęte " + format(source.accepted),
    ].join(" · ")));
    if (source.failed) card.append(node("p", "Źródło niedostępne w tym wyszukiwaniu."));
    else if (radius > 0 && (!source.radiusSupported || (source.appliedRadius != null && source.appliedRadius < radius))) {
      card.append(node("p", source.appliedRadius > 0
        ? "Zastosowany promień " + format(source.appliedRadius, " km")
        : "Źródło ograniczyło wyniki do miejscowości."));
    }
    return card;
  }

  function renderResult(data, warnAboutLocation) {
    result = data;
    selectedIds.clear();
    sortKey = "";
    sortDirection = 1;
    part("query").textContent = [data.location, data.propertyType, data.filterLabel, "promień " + format(data.radius, " km")].join(" · ");
    for (const key of ["filtered", "duplicates", "accepted"]) part(key).textContent = format(data[key]);
    const areas = data.offers.map(({ area }) => area).filter((area) => area != null);
    part("rangeSummary").textContent = areas.length
      ? "Zakres powierzchni " + format(Math.min(...areas)) + "–" + format(Math.max(...areas), " m²")
      : "";
    const failed = data.sources.filter((entry) => entry.failed).map((entry) => entry.name);
    part("sourceWarning").hidden = failed.length === 0;
    part("sourceWarning").textContent = failed.length ? "Źródła niedostępne w tym wyszukiwaniu · " + failed.join(", ") : "";
    part("scopeWarning").hidden = !warnAboutLocation;
    part("scopeWarning").textContent = warnAboutLocation
      ? (shared
        ? "Portale dla tego typu nieruchomości filtrują po nazwie. Sprawdź, czy wyniki dotyczą wybranej miejscowości."
        : "Dla tego typu nieruchomości portale wyszukują po nazwie miejscowości. Nazwa się powtarza. Sprawdź adresy w wynikach.")
      : "";
    part("sourceDetails").hidden = data.sources.length === 0;
    part("sources").replaceChildren(...data.sources.map((entry) => sourceCard(entry, data.radius)));
    part("tableWrap").hidden = data.offers.length === 0;
    part("empty").hidden = data.offers.length > 0;
    part("empty").textContent = failed.length
      ? "Brak ofert z dostępnych źródeł. Możesz spróbować ponownie."
      : "Brak ofert dla podanych warunków.";
    part("exportStatus").textContent = "";
    renderTable();
    renderSelected();
    part("results").hidden = false;
  }

  function makeRow(offer, index) {
    const row = node("tr");
    const checkbox = node("input");
    checkbox.type = "checkbox";
    checkbox.dataset.offer = String(offer.id);
    checkbox.checked = selectedIds.has(offer.id);
    checkbox.setAttribute("aria-label", "Wybierz ofertę · " + (offer.location || offer.source || (index + 1)));
    const select = node("td");
    select.append(checkbox);
    row.append(select, node("td", String(index + 1)));
    for (const [key] of columns) {
      const cell = node("td");
      if (key === "url" && offer.url) {
        const link = node("a", "Otwórz");
        link.href = offer.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        cell.append(link);
      } else {
        const unit = { price: " zł", area: " m²", priceM2: " zł/m²" }[key];
        cell.textContent = unit ? format(offer[key], unit) : (offer[key] || "—");
      }
      row.append(cell);
    }
    return row;
  }

  function renderTable() {
    const offers = sortOffers(result.offers, sortKey, sortDirection);
    part("offerCount").textContent = offerCount(offers.length);
    part("offers").replaceChildren(...offers.map(makeRow));
    for (const button of root.querySelectorAll("[data-offerty-sort]")) {
      button.parentElement.setAttribute("aria-sort", button.dataset.offertySort === sortKey
        ? (sortDirection === 1 ? "ascending" : "descending")
        : "none");
    }
  }

  const selectedRows = () => result?.offers.filter((offer) => selectedIds.has(offer.id)) ?? [];
  function renderComparison(offers = selectedRows()) {
    const { mean, count, rate, difference } = comparison(offers, part("myPrice").value, part("myArea").value);
    part("mean").textContent = mean == null ? "—" : format(mean, " zł/m²") + " · " + offerCount(count);
    part("rate").textContent = format(rate, " zł/m²");
    part("difference").textContent = difference == null ? "—" : (difference > 0 ? "+" : "") + format(difference, "%");
    part("difference").classList.toggle("oferty-error", difference > 20);
  }

  function renderSelected() {
    const offers = selectedRows();
    part("selectedCount").textContent = offers.length ? "Wybrano " + offerCount(offers.length, true) + "." : "Zaznacz ofertę w tabeli, aby ją porównać.";
    part("selected").replaceChildren(...offers.map(makeRow));
    part("selectedWrap").hidden = offers.length === 0;
    part("export").disabled = exporting || offers.length === 0;
    renderComparison(offers);
  }

  for (const button of root.querySelectorAll("[data-offerty-sort]")) {
    button.addEventListener("click", () => {
      const key = button.dataset.offertySort;
      sortDirection = sortKey === key ? -sortDirection : 1;
      sortKey = key;
      renderTable();
    });
  }

  for (const name of ["offers", "selected"]) {
    part(name).addEventListener("change", ({ target }) => {
      if (target.dataset.offer === undefined) return;
      const id = Number(target.dataset.offer);
      if (target.checked) selectedIds.add(id);
      else selectedIds.delete(id);
      const mainCheckbox = part("offers").querySelector(`[data-offer="${id}"]`);
      if (mainCheckbox) mainCheckbox.checked = target.checked;
      renderSelected();
      if (name === "selected") mainCheckbox?.focus();
    });
  }
  for (const key of ["myPrice", "myArea"]) part(key).addEventListener("input", () => renderComparison());
  part("export").addEventListener("click", async () => {
    const rows = selectedRows();
    if (exporting || !rows.length) return;
    const snapshot = result;
    exporting = true;
    const button = part("export");
    button.disabled = true;
    part("exportStatus").textContent = "Przygotowywanie arkusza XLSX…";
    try {
      await exportOffers(document, rows, snapshot.location, signal);
      if (!signal.aborted && result === snapshot) part("exportStatus").textContent = "Wyeksportowano " + offerCount(rows.length, true) + ".";
    } catch (error) {
      if (!signal.aborted && result === snapshot) part("exportStatus").textContent = error.message;
    } finally {
      exporting = false;
      if (!signal.aborted) button.disabled = selectedIds.size === 0;
    }
  });

  return () => {
    stopLookup();
    cancelSearch();
    lifetime.abort();
  };
}

export const offersModule = Object.freeze({
  id: "oferty", label: "Oferty", backend: "Oferty",
  description: "Wyszukiwanie i porównanie ofert nieruchomości.",
  mount: mountOffers,
});
