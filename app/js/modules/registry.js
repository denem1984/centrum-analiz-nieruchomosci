import { mountLocationSearch } from "../location/search-ui.js";

function appendText(parent, tagName, text, className) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  parent.append(element);
  return element;
}

function mountMockup(module, container, ctx) {
  const section = document.createElement("section");
  section.className = "module-intro";
  section.setAttribute("aria-labelledby", "module-title");

  appendText(section, "h2", module.label).id = "module-title";
  appendText(section, "p", module.description, "module-description");
  appendText(section, "p", "moduł w przygotowaniu", "preparation-note");

  if (module.backend) {
    section.append(ctx.createBackendStatusPanel(module.backend));
  }

  container.append(section);
}

function mountStart(container, ctx) {
  const section = document.createElement("section");
  section.className = "module-intro";
  section.setAttribute("aria-labelledby", "module-title");
  appendText(section, "h2", "Start").id = "module-title";
  appendText(
    section,
    "p",
    "Tutaj znajdziesz skrót do modułów i stan połączenia z ich usługami.",
    "module-description",
  );
  appendText(section, "p", "moduł w przygotowaniu", "preparation-note");
  container.append(section);
  mountLocationSearch(container, ctx);
  ctx.renderBackendCards(container);
}

function moduleDefinition(id, label, description, backend = null) {
  const definition = { id, label, description, backend };
  definition.mount = (container, ctx) => mountMockup(definition, container, ctx);
  return Object.freeze(definition);
}

export const MODULES = Object.freeze([
  Object.freeze({
    id: "start",
    label: "Start",
    description: "Punkt wejścia do Centrum Analiz Nieruchomości.",
    backend: null,
    mount: mountStart,
  }),
  moduleDefinition("dzialki", "Działki", "W przyszłości moduł połączy analizę działek i warstw przestrzennych.", "Dzialki"),
  moduleDefinition("rcn", "RCN", "W przyszłości moduł pokaże transakcje i analizy rynku RCN.", "RCN"),
  moduleDefinition("oferty", "Oferty", "W przyszłości moduł wyszuka i porówna ceny ofertowe.", "Oferty"),
  moduleDefinition("podobne", "Podobne", "W przyszłości moduł pomoże porównać nieruchomości podobne.", "Podobne"),
  moduleDefinition("gminy", "Gminy", "W przyszłości moduł porówna gminy na podstawie pliku danych.", null),
]);

export const MODULE_BY_ID = Object.freeze(
  Object.fromEntries(MODULES.map((module) => [module.id, module])),
);

