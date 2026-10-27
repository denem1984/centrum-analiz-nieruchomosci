import { BACKENDS, BACKEND_IDS } from "./config.js";
import { checkBackend, getBackendStatus } from "./health.js";
import { decodeContext, encodeContext, contextStore } from "./context.js";
import { MODULES, MODULE_BY_ID } from "./modules/registry.js";

export const MODULE_IDS = Object.freeze(MODULES.map((module) => module.id));

export function resolveRoute(hash) {
  const fragment = String(hash ?? "").replace(/^#/, "");
  const path = fragment.split("?", 1)[0].replace(/^\/+/, "");
  return MODULE_IDS.includes(path) ? path : "start";
}

export function hashForRoute(id, encodedContext = null) {
  const route = MODULE_IDS.includes(id) ? id : "start";
  const hash = "#/" + route;
  return typeof encodedContext === "string" && encodedContext
    ? hash + "?ctx=" + encodedContext
    : hash;
}

function encodedCurrentContext() {
  const context = contextStore.get();
  if (context.kind === "nieokreslona") return null;
  return encodeContext(context).encoded;
}

export function decodeContextFromHash(hash) {
  const fragment = String(hash ?? "").replace(/^#/, "");
  const queryIndex = fragment.indexOf("?");
  if (queryIndex === -1) return { present: false, context: null, reason: null };
  const params = new URLSearchParams(fragment.slice(queryIndex + 1));
  if (!params.has("ctx")) return { present: false, context: null, reason: null };
  const decoded = decodeContext(params.get("ctx"));
  return { present: true, context: decoded.context, reason: decoded.reason };
}

export function formatLocationSummary(context) {
  if (!context || context.kind === "nieokreslona") return "Nie wybrano lokalizacji";

  const primary = context.name
    ?? context.place?.name
    ?? context.gmina?.name
    ?? (context.parcel ? "Działka " + context.parcel.id : null)
    ?? (context.point ? "Punkt " + context.point.lat + ", " + context.point.lon : "Lokalizacja");
  const details = [];
  if (context.gmina?.name) details.push("gmina: " + context.gmina.name);
  if (context.powiat?.name) details.push("powiat: " + context.powiat.name);
  if (context.voivodeship?.name) details.push("województwo: " + context.voivodeship.name);
  return "Wybrana lokalizacja: " + [primary, ...details].join(" · ");
}

function updateLocationToolbar(context = contextStore.get()) {
  const summary = document.getElementById("location-summary");
  if (summary) summary.textContent = locationSummary(context);
  const clearButton = document.getElementById("clear-location");
  if (clearButton) clearButton.disabled = context.kind === "nieokreslona";
}

function renderNavigation(activeId) {
  const nav = document.getElementById("module-nav");
  nav.replaceChildren();
  const encodedContext = encodedCurrentContext();

  for (const module of MODULES) {
    const link = document.createElement("a");
    link.className = "module-link";
    link.href = hashForRoute(module.id, encodedContext);
    link.dataset.moduleLink = module.id;
    link.textContent = module.label;
    if (module.id === activeId) link.setAttribute("aria-current", "page");
    nav.append(link);
  }
}

function updateNavigationLinks() {
  const encodedContext = encodedCurrentContext();
  for (const link of document.querySelectorAll("[data-module-link]")) {
    link.href = hashForRoute(link.dataset.moduleLink, encodedContext);
  }
}

function showContextLoadError(message = "") {
  const status = document.getElementById("context-load-status");
  if (status) status.textContent = message;
}

function loadContextFromHash(hash) {
  const decoded = decodeContextFromHash(hash);
  showContextLoadError();
  if (!decoded.present) {
    contextStore.clear();
    return true;
  }

  if (!decoded.context) {
    showContextLoadError("Nie udało się wczytać lokalizacji z adresu");
    return false;
  }
  const stored = contextStore.set(decoded.context);
  if (!stored.context) {
    showContextLoadError("Nie udało się wczytać lokalizacji z adresu");
    return false;
  }
  return true;
}

function writeContextToHash() {
  if (typeof window === "undefined") return;
  const route = resolveRoute(window.location.hash);
  const hash = hashForRoute(route, encodedCurrentContext());
  if (window.location.hash !== hash) {
    const url = window.location.pathname + window.location.search + hash;
    window.history.replaceState(null, "", url);
  }
  updateNavigationLinks();
}

function setAppContext(value) {
  const result = contextStore.set(value);
  if (result.context) {
    showContextLoadError();
    writeContextToHash();
  }
  return result;
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

function renderCurrentView() {
  const rawHash = window.location.hash;
  loadContextFromHash(rawHash);
  const route = resolveRoute(rawHash);
  const normalizedHash = hashForRoute(route, encodedCurrentContext());
  if (rawHash !== normalizedHash) {
    const url = window.location.pathname + window.location.search + normalizedHash;
    window.history.replaceState(null, "", url);
  }

  renderNavigation(route);
  const view = document.getElementById("module-view");
  view.replaceChildren();
  const ctx = {
    createBackendStatusPanel,
    renderBackendCards,
    getBackendStatus,
    setContext: setAppContext,
    providerConfig: { provider: "fixture" },
  };
  MODULE_BY_ID[route].mount(view, ctx);
}

function startHealthChecks() {
  for (const id of BACKEND_IDS) {
    void checkBackend(id, { onState: (status) => updateBackendPanels(id, status) });
  }
}

function init() {
  contextStore.subscribe((context) => {
    updateLocationToolbar(context);
    updateNavigationLinks();
  });
  updateLocationToolbar();
  document.getElementById("clear-location").addEventListener("click", () => {
    contextStore.clear();
    showContextLoadError();
    writeContextToHash();
  });
  renderCurrentView();
  window.addEventListener("hashchange", renderCurrentView);
  startHealthChecks();
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  init();
}



