import { BACKENDS, BACKEND_IDS } from "./config.js";
import { checkBackend, getBackendStatus } from "./health.js";
import { MODULES, MODULE_BY_ID } from "./modules/registry.js";

export const MODULE_IDS = Object.freeze(MODULES.map((module) => module.id));

export function resolveRoute(hash) {
  const value = String(hash ?? "").replace(/^#/, "").replace(/^\/+/, "");
  return MODULE_IDS.includes(value) ? value : "start";
}

export function hashForRoute(id) {
  return "#/" + (MODULE_IDS.includes(id) ? id : "start");
}

function textElement(tagName, text, className) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function statusLabel(state) {
  const labels = {
    idle: "Nie sprawdzono",
    waking: "Usługa się budzi",
    ready: "Dostępna",
    error: "Brak odpowiedzi",
  };
  return labels[state] ?? "Nieznany stan";
}

function updateBackendPanels(id, status) {
  for (const panel of document.querySelectorAll("[data-backend-panel]")) {
    if (panel.dataset.backendPanel !== id) continue;
    panel.dataset.state = status.state;
    const state = panel.querySelector("[data-backend-state]");
    const message = panel.querySelector("[data-backend-message]");
    const wait = panel.querySelector("[data-backend-wait]");
    const button = panel.querySelector("[data-check-backend]");
    state.textContent = statusLabel(status.state);
    message.textContent = status.message;
    wait.textContent = status.state === "waking"
      ? "Oczekiwanie: " + status.waitSeconds + " s"
      : "";
    wait.hidden = status.state !== "waking";
    button.disabled = status.state === "waking";
  }
}

function createBackendStatusPanel(id) {
  const backend = BACKENDS[id];
  const panel = document.createElement("article");
  panel.className = "backend-card";
  panel.dataset.backendPanel = id;
  panel.dataset.state = "idle";

  panel.append(textElement("h4", backend.label));
  const state = textElement("p", statusLabel("idle"), "backend-state");
  state.dataset.backendState = "";
  panel.append(state);
  const message = textElement("p", "Kontrola jeszcze się nie rozpoczęła.", "backend-message");
  message.dataset.backendMessage = "";
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");
  panel.append(message);
  const wait = textElement("p", "", "backend-wait");
  wait.dataset.backendWait = "";
  wait.hidden = true;
  panel.append(wait);

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Sprawdź ponownie";
  button.dataset.checkBackend = id;
  button.addEventListener("click", () => {
    void checkBackend(id, { force: true, onState: (status) => updateBackendPanels(id, status) });
  });
  panel.append(button);

  const cached = getBackendStatus(id);
  if (cached.state !== "idle") updateBackendPanels(id, cached);
  return panel;
}

function renderBackendCards(container) {
  const section = document.createElement("section");
  section.className = "backend-section";
  section.setAttribute("aria-labelledby", "backend-heading");
  section.append(textElement("h3", "Stan usług", ""));
  section.lastElementChild.id = "backend-heading";

  const grid = document.createElement("div");
  grid.className = "backend-grid";
  for (const id of BACKEND_IDS) grid.append(createBackendStatusPanel(id));
  section.append(grid);
  container.append(section);
}

function renderNavigation(activeId) {
  const nav = document.getElementById("module-nav");
  nav.replaceChildren();

  for (const module of MODULES) {
    const link = document.createElement("a");
    link.className = "module-link";
    link.href = hashForRoute(module.id);
    link.textContent = module.label;
    if (module.id === activeId) link.setAttribute("aria-current", "page");
    nav.append(link);
  }
}

function renderCurrentView() {
  const route = resolveRoute(window.location.hash);
  const normalizedHash = hashForRoute(route);
  if (window.location.hash !== normalizedHash) {
    const currentUrl = window.location.pathname + window.location.search + normalizedHash;
    window.history.replaceState(null, "", currentUrl);
  }

  renderNavigation(route);
  const view = document.getElementById("module-view");
  view.replaceChildren();
  const ctx = {
    createBackendStatusPanel,
    renderBackendCards,
    getBackendStatus,
  };
  MODULE_BY_ID[route].mount(view, ctx);
}

function startHealthChecks() {
  for (const id of BACKEND_IDS) {
    void checkBackend(id, { onState: (status) => updateBackendPanels(id, status) });
  }
}

function init() {
  renderCurrentView();
  window.addEventListener("hashchange", renderCurrentView);
  startHealthChecks();
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  init();
}
