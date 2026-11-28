import { loadLeaflet } from "../dzialki/leaflet-loader.js";
import { createRcnClient } from "./client.js";

const CHART_URL = new URL("../../../vendor/rcn/chartjs-4.5.1/chart.umd.min.js", import.meta.url);
const LEAFLET_CSS = new URL("../../../vendor/dzialki/leaflet-1.9.4/leaflet.css", import.meta.url);
const VIEW_CSS = new URL("./view.css", import.meta.url);
const VIEW_HTML = new URL("./view.html", import.meta.url);
let chartLoad;

function loadCharts(document) {
  if (document.defaultView.Chart) return Promise.resolve(document.defaultView.Chart);
  chartLoad ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CHART_URL.href;
    script.integrity = "sha256-SERKgtTty1vsDxll+qzd4Y2cF9swY9BCq62i9wXJ9Uo=";
    script.crossOrigin = "anonymous";
    script.addEventListener("load", () => {
      const Chart = document.defaultView.Chart;
      if (typeof Chart === "function") resolve(Chart);
      else reject(new Error("Brak interfejsu Chart.js."));
    }, { once: true });
    script.addEventListener("error", () => reject(new Error("Nie udało się załadować wykresów.")), { once: true });
    document.head.append(script);
  }).catch((error) => {
    chartLoad = null;
    throw error;
  });
  return chartLoad;
}

function addStyles(root, href) {
  return new Promise((resolve, reject) => {
    const element = root.ownerDocument.createElement("link");
    element.rel = "stylesheet";
    element.href = href;
    element.addEventListener("load", resolve, { once: true });
    element.addEventListener("error", reject, { once: true });
    root.append(element);
  });
}

function mountRcn(container, context) {
  const document = container.ownerDocument ?? globalThis.document;
  const host = document.createElement("section");
  const status = document.createElement("p");
  const controller = new AbortController();
  const { signal } = controller;
  host.dataset.rcn = "";
  status.setAttribute("role", "status");
  status.textContent = "Wczytywanie modułu RCN…";
  container.append(status, host);

  async function start() {
    const root = host.attachShadow({ mode: "open" });
    const [response, { mountRcnFrontend }, L, Chart] = await Promise.all([
      globalThis.fetch(VIEW_HTML, { signal }),
      import("./frontend.js"),
      loadLeaflet({ document, window: document.defaultView }),
      loadCharts(document),
      addStyles(root, LEAFLET_CSS.href),
      addStyles(root, VIEW_CSS.href),
    ]);
    if (!response.ok) throw new Error("Nie udało się załadować formularza.");
    const template = document.createElement("template");
    template.innerHTML = await response.text();
    if (signal.aborted) return;
    root.append(template.content);
    const demo = context.rcnDemo === true;
    const fetch = demo
      ? (await import("./demo.js")).createRcnDemo({ signal })
      : createRcnClient({ signal });
    if (signal.aborted) return;
    mountRcnFrontend(root, { L, Chart, fetch, signal, demo, context });
    status.remove();
  }

  // Let the shell paint the loading state before initializing the map.
  void Promise.resolve().then(() => {
    if (!signal.aborted) return start();
  }).catch(() => {
    if (signal.aborted) return;
    controller.abort();
    host.remove();
    status.textContent = "Nie udało się otworzyć RCN. Odśwież stronę, aby ponowić.";
  });
  return () => controller.abort();
}

export const rcnModule = Object.freeze({
  id: "rcn",
  label: "RCN",
  description: "Analiza transakcji z Rejestru Cen Nieruchomości.",
  backend: "RCN",
  mount: mountRcn,
});
