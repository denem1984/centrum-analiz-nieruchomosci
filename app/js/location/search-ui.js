import { createProvider, selectedCandidateContext } from "./provider.js";

export function mountLocationSearch(container, ctx) {
  const provider = createProvider(ctx.providerConfig ?? {});
  const section = document.createElement("section");
  section.className = "location-search";
  section.setAttribute("aria-labelledby", "location-search-title");

  const heading = document.createElement("h3");
  heading.id = "location-search-title";
  heading.textContent = "Wyszukaj lokalizację";
  section.append(heading);

  if (provider.isFixture) {
    const fixtureNote = document.createElement("p");
    fixtureNote.className = "fixture-note";
    fixtureNote.textContent = "Dane testowe — nazwy i kody są fikcyjne.";
    section.append(fixtureNote);
  }

  const label = document.createElement("label");
  label.htmlFor = "location-query";
  label.textContent = "Nazwa gminy lub miejscowości";
  section.append(label);

  const input = document.createElement("input");
  input.id = "location-query";
  input.type = "search";
  input.autocomplete = "off";
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", "location-results");
  input.setAttribute("aria-expanded", "false");
  section.append(input);

  const list = document.createElement("ul");
  list.id = "location-results";
  list.className = "location-results";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "Wyniki wyszukiwania lokalizacji");
  section.append(list);

  const status = document.createElement("p");
  status.className = "location-search-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.textContent = "Wpisz nazwę, aby wyszukać lokalizację.";
  section.append(status);
  container.append(section);

  let timer;
  let requestNumber = 0;
  let results = [];
  let activeIndex = -1;

  function setActiveIndex(index) {
    activeIndex = index;
    const options = [...list.querySelectorAll('[role="option"]')];
    options.forEach((option, optionIndex) => {
      option.setAttribute("aria-selected", String(optionIndex === activeIndex));
    });
    if (activeIndex >= 0 && options[activeIndex]) {
      input.setAttribute("aria-activedescendant", options[activeIndex].id);
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  }

  function choose(candidate) {
    const selected = selectedCandidateContext(candidate);
    if (!selected.context) {
      status.textContent = selected.reason;
      return;
    }
    const stored = ctx.setContext(selected.context);
    if (!stored.context) {
      status.textContent = stored.reason;
      return;
    }

    input.value = selected.context.name ?? "";
    results = [];
    list.replaceChildren();
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    activeIndex = -1;
    status.textContent = "Wybrano lokalizację.";
    input.focus();
  }

  function renderResults(candidates, query) {
    results = candidates;
    activeIndex = -1;
    list.replaceChildren();
    input.removeAttribute("aria-activedescendant");
    input.setAttribute("aria-expanded", String(candidates.length > 0));

    candidates.forEach((candidate, index) => {
      const option = document.createElement("li");
      option.id = "location-option-" + index;
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", "false");
      option.tabIndex = -1;
      option.textContent = candidate.label;
      option.addEventListener("click", () => choose(candidate));
      list.append(option);
    });

    if (!query.trim()) {
      status.textContent = "Wpisz nazwę, aby wyszukać lokalizację.";
    } else if (candidates.length === 0) {
      status.textContent = "Brak wyników.";
    } else if (candidates.some((candidate) => candidate.match === "ambiguous")) {
      status.textContent = "Wybierz właściwą pozycję z listy.";
    } else {
      status.textContent = "Znaleziono " + candidates.length + " wyników.";
    }
  }

  async function runSearch(query, sequence) {
    try {
      const candidates = await provider.search(query, { limit: 10 });
      if (sequence !== requestNumber) return;
      renderResults(candidates, query);
    } catch {
      if (sequence !== requestNumber) return;
      renderResults([], query);
      status.textContent = "Nie udało się wyszukać lokalizacji.";
    }
  }

  input.addEventListener("input", () => {
    clearTimeout(timer);
    requestNumber += 1;
    const sequence = requestNumber;
    const query = input.value;
    results = [];
    activeIndex = -1;
    list.replaceChildren();
    input.removeAttribute("aria-activedescendant");
    input.setAttribute("aria-expanded", "false");
    status.textContent = query.trim() ? "Wyszukiwanie…" : "Wpisz nazwę, aby wyszukać lokalizację.";
    timer = setTimeout(() => { void runSearch(query, sequence); }, 250);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" && results.length) {
      event.preventDefault();
      setActiveIndex(Math.min(activeIndex + 1, results.length - 1));
    } else if (event.key === "ArrowUp" && results.length) {
      event.preventDefault();
      setActiveIndex(Math.max(activeIndex - 1, 0));
    } else if (event.key === "Enter" && activeIndex >= 0 && results[activeIndex]) {
      event.preventDefault();
      choose(results[activeIndex]);
    } else if (event.key === "Escape") {
      results = [];
      list.replaceChildren();
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
      activeIndex = -1;
    }
  });
}

