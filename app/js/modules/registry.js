import { mountSharedStart } from "../location/start-ui.js";
import { dzialkiModule } from "./dzialki/index.js";
import { rcnModule } from "./rcn/index.js";
import { offersModule } from "./oferty/index.js";
import { similarModule } from "./podobne/index.js";
import { gminyModule } from "./gminy/index.js";

function appendText(parent, tagName, text, className) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  parent.append(element);
  return element;
}

function mountStart(container, ctx) {
  const section = document.createElement("section");
  section.className = "module-intro";
  section.setAttribute("aria-labelledby", "module-title");
  appendText(section, "h2", "Start").id = "module-title";
  appendText(
    section,
    "p",
    "Ustal lokalizację, z której skorzystają wszystkie moduły.",
    "module-description",
  );
  container.append(section);
  return mountSharedStart(container, ctx);
}

export const MODULES = Object.freeze([
  Object.freeze({
    id: "start",
    label: "Start",
    description: "Punkt wejścia do Centrum Analiz Nieruchomości.",
    backend: null,
    mount: mountStart,
  }),
  dzialkiModule,
  rcnModule,
  offersModule,
  similarModule,
  gminyModule,
]);

export const MODULE_BY_ID = Object.freeze(
  Object.fromEntries(MODULES.map((module) => [module.id, module])),
);

