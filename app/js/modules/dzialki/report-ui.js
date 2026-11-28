import { getDzialkiState } from "./state.js";
import { collectReportParcel, reportMapLayers, reportMapLegends } from "./report-data.js";
import { captureReportMap } from "./report-snapshot.js";
import { downloadParcelPdf } from "./report-pdf.js";

// Draft belongs to the current application session, including tab changes (D15).
const parcels = [];
const snapshots = [];

export function mountParcelPdf(container, { getMapNode, planningHelp, getLayerNotices,
  readParcel = collectReportParcel, capture = captureReportMap, download = downloadParcelPdf }) {
  const { ownerDocument: document } = container;
  const lifetime = new AbortController();
  let busy = false;
  const node = (tag, text) => {
    const element = document.createElement(tag);
    if (text) element.textContent = text;
    return element;
  };
  const root = node("section");
  root.className = "dzialki-pdf";
  root.setAttribute("aria-labelledby", "dzialki-pdf-heading");
  const heading = node("h3", "Raport PDF");
  heading.id = "dzialki-pdf-heading";
  root.append(heading);
  function button(parent, id, label, action) {
    const element = node("button", label);
    element.id = id;
    element.type = "button";
    element.addEventListener("click", action);
    parent.append(element);
    return element;
  }
  const add = button(root, "dzialki-pdf-add-parcel", "Dodaj wyszukaną działkę", () => {
    const selection = getDzialkiState().selectedParcel;
    if (selection) addParcel({ selection });
  });
  const addMap = button(root, "dzialki-pdf-add-map", "Dodaj widok mapy", () => addSnapshot());
  const parcelList = node("ul"), snapshotList = node("ul");
  parcelList.id = "dzialki-pdf-parcels";
  snapshotList.id = "dzialki-pdf-snapshots";
  root.append(node("h4", "Działki"), parcelList, node("h4", "Widoki mapy"), snapshotList);
  const save = button(root, "dzialki-pdf-save", "Pobierz PDF", () => run("Tworzenie PDF…", async () => {
    await download(parcels, snapshots, lifetime.signal);
    return "PDF gotowy do pobrania.";
  }, "Nie udało się utworzyć PDF. Spróbuj ponownie."));
  const clear = button(root, "dzialki-pdf-clear", "Wyczyść listę", () => {
    parcels.length = snapshots.length = 0;
    status.textContent = "Wyczyszczono listę raportu.";
    render();
  });
  const status = node("p");
  status.id = "dzialki-pdf-status";
  status.setAttribute("role", "status");
  root.append(status);
  container.append(root);

  function renderList(list, items, kind, labelFor) {
    list.replaceChildren();
    if (!items.length) list.append(node("li", "Brak pozycji."));
    for (const [index, item] of items.entries()) {
      const label = labelFor(item, index);
      const li = node("li", label);
      const remove = button(li, "dzialki-pdf-remove-" + kind + "-" + index, "Usuń", () => {
        items.splice(index, 1);
        status.textContent = "Usunięto pozycję z raportu.";
        render();
        (document.getElementById(remove.id) ?? (clear.disabled ? addMap : clear)).focus();
      });
      remove.disabled = busy;
      remove.setAttribute("aria-label", "Usuń " + label);
      list.append(li);
    }
  }
  function render() {
    add.disabled = busy || !getDzialkiState().selectedParcel;
    addMap.disabled = busy || !getMapNode();
    save.disabled = clear.disabled = busy || (!parcels.length && !snapshots.length);
    renderList(parcelList, parcels, "parcel", parcel => parcel.id);
    renderList(snapshotList, snapshots, "map", (map, i) => "Widok " + (i + 1) + " · " + map.layers[0] + (map.notices.length ? " · niepełny" : ""));
  }
  async function run(progress, operation, failure) {
    if (busy || lifetime.signal.aborted) return;
    busy = true;
    status.textContent = progress;
    render();
    try {
      const message = await operation();
      if (!lifetime.signal.aborted) status.textContent = message;
    } catch {
      if (!lifetime.signal.aborted) status.textContent = failure;
    } finally {
      busy = false;
      if (!lifetime.signal.aborted) render();
    }
  }
  function addParcel(input) {
    return run("Pobieranie danych działki do raportu…", async () => {
      const parcel = await readParcel({ ...input, signal: lifetime.signal });
      lifetime.signal.throwIfAborted();
      if (!parcel) return "Nie znaleziono działki w tym miejscu.";
      const existing = parcels.findIndex(item => item.id === parcel.id);
      if (existing >= 0) parcels[existing] = parcel;
      else parcels.push(parcel);
      return "Działka " + parcel.id + " jest na liście raportu.";
    }, "Nie udało się pobrać działki do raportu. Spróbuj ponownie.");
  }
  function addSnapshot() {
    const mapNode = getMapNode();
    if (!mapNode) return;
    return run("Zapisywanie widoku mapy…", async () => {
      const state = getDzialkiState();
      const notices = getLayerNotices();
      const map = await capture(mapNode, lifetime.signal);
      lifetime.signal.throwIfAborted();
      map.notices.push(...notices);
      snapshots.push({ ...map, layers: reportMapLayers(state), legends: reportMapLegends(state, planningHelp) });
      return map.notices.length ? "Dodano niepełny widok mapy. PDF wskaże braki." : "Dodano widok mapy do raportu.";
    }, "Nie udało się zapisać widoku mapy. Spróbuj ponownie po wczytaniu warstw.");
  }
  render();
  return { refresh: render, addParcel, addSnapshot, cleanup() { lifetime.abort(); } };
}
