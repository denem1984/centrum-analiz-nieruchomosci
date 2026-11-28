import { loadLeaflet } from "../dzialki/leaflet-loader.js";
import { locationNotice, sharedSubject } from "../../location/shared.js";
import { loadPlanningProjection } from "../dzialki/planning-projection.js";
import { createSimilarClient } from "./client.js";
import { demoFields, demoSimilarFetch } from "./demo.js";
import { createSimilarMap, distanceLabel } from "./map.js";
import { propertyView, similarView } from "./view.js";

const overlays = ["lines", "labels", "price", "date"];
const unitPrompt = { county: "Wybierz powiat", commune: "Wybierz gminę", region: "Wybierz obręb" };

function mountSimilar(container, context) {
  const document = container.ownerDocument ?? globalThis.document;
  const root = document.createElement("section");
  root.dataset.podobne = "";
  root.className = "similar";
  root.innerHTML = similarView;
  container.append(root);
  const part = (name) => root.querySelector(`[data-part="${name}"]`);
  if (!part("subject")) return () => root.remove();

  const window = document.defaultView ?? globalThis.window;
  const lifetime = new AbortController();
  const demo = context.podobneDemo === true;
  const client = createSimilarClient({
    signal: lifetime.signal,
    project: () => loadPlanningProjection(document, window, { inverse: true }),
    ...(demo ? { fetchImpl: demoSimilarFetch } : {}),
  });
  const editors = [];
  let map;
  let nextId = 0;
  let satellite = false;
  let fitPending = false;
  let examplePending = false;

  if (context.localPreview) {
    const link = part("previewLink");
    link.href = demo ? "./#/podobne" : "./?podobne=demo#/podobne";
    link.textContent = demo ? "Przejdź do danych rzeczywistych" : "Wypróbuj dane przykładowe";
    link.hidden = false;
  }
  part("demo").hidden = !demo;
  part("credit").hidden = demo;

  function draw() {
    const subject = editors[0]?.location;
    const values = editors.map((editor, index) => {
      editor.index = index;
      const { id, location, field } = editor;
      if (index > 0) {
        field("title").textContent = "Nieruchomość " + index;
        field("remove").setAttribute("aria-label", "Usuń nieruchomość " + index);
        const meters = subject && location && map ? map.distance(subject.point, location.point) : null;
        field("distance").textContent = "Odległość: " + distanceLabel(meters);
      }
      return { index, id, location, price: field("price")?.value ?? "", date: field("date")?.value ?? "" };
    });
    part("fit").disabled = !map || !values.some(({ location }) => location);
    map?.render(values, Object.fromEntries(overlays.map((key) => [key, part(key).checked])));
  }

  function fit() {
    fitPending = !map;
    map?.fit();
  }

  function focusEditor(id) {
    const editor = editors.find((item) => item.id === id);
    if (!editor) return;
    editor.card.focus({ preventScroll: true });
    const panel = part("panel");
    if (panel.scrollHeight > panel.clientHeight) {
      panel.scrollTop += editor.card.getBoundingClientRect().top - panel.getBoundingClientRect().top - 10;
    } else {
      editor.card.scrollIntoView({ block: "nearest" });
    }
  }

  function setStatus(editor, message, error = false) {
    const status = editor.field("status");
    status.textContent = message;
    status.classList.toggle("similar-error", error);
  }

  function resetLocation(editor) {
    editor.request?.abort();
    editor.request = null;
    editor.location = null;
    editor.field("locate").disabled = false;
    const candidates = editor.field("candidates");
    candidates.replaceChildren();
    candidates.hidden = true;
    map?.clearPositions(editor.id);
    setStatus(editor, "");
    draw();
  }

  function optionsFor(select, name, choices = [], message = unitPrompt[name]) {
    const prompt = document.createElement("option");
    prompt.textContent = message;
    prompt.value = "";
    select.replaceChildren(prompt, ...choices.map(({ code, name: label }) => {
      const option = document.createElement("option");
      option.value = code;
      option.textContent = name === "region" ? code.split(".")[1] + " · " + label : label + " (" + code + ")";
      return option;
    }));
    select.value = "";
    select.disabled = choices.length === 0;
  }

  async function loadUnits(editor, unit) {
    const { field } = editor;
    const pending = { unit };
    editor.units = pending;
    const select = field(unit);
    field("retry").hidden = true;
    optionsFor(select, unit, [], "Ładowanie…");
    const selectedCounty = field("county").value;
    const selectedCommune = field("commune").value;
    try {
      const rows = await (unit === "county" ? client.counties()
        : unit === "commune" ? client.communes(selectedCounty)
          : client.regions(selectedCommune));
      if (lifetime.signal.aborted || editor.units !== pending) return false;
      optionsFor(select, unit, rows, rows.length ? unitPrompt[unit] : "Brak pozycji");
      if (unit === "region") editor.regionNames = new Map(rows.map(({ code, name }) => [code, name]));
      return rows.length > 0;
    } catch (error) {
      if (lifetime.signal.aborted || editor.units !== pending) return false;
      optionsFor(select, unit, [], "Lista niedostępna");
      editor.retryUnit = unit;
      field("retry").hidden = false;
      setStatus(editor, error.name === "TimeoutError" ? "Lista nie odpowiedziała. Spróbuj ponownie." : error.message, true);
      return false;
    } finally {
      if (editor.units === pending) editor.units = null;
    }
  }

  function chooseLocation(editor, location) {
    const candidates = editor.field("candidates");
    candidates.replaceChildren();
    candidates.hidden = true;
    editor.location = location;
    setStatus(editor, [location.title, location.detail].filter(Boolean).join(" · "));
    draw();
    if (!examplePending) fit();
  }

  async function locate(editor) {
    const { field } = editor;
    resetLocation(editor);
    const request = new AbortController();
    editor.request = request;
    field("locate").disabled = true;
    setStatus(editor, "Ustalanie położenia…");
    try {
      if (field("type").value === "parcel") {
        const region = field("region").value;
        const result = await client.parcel(region, field("number").value, editor.regionNames?.get(region), request.signal);
        if (!lifetime.signal.aborted && editor.request === request) chooseLocation(editor, result);
        return;
      }
      const rows = await client.address(field("address").value, request.signal);
      if (lifetime.signal.aborted || editor.request !== request) return;
      if (rows.length === 1) {
        chooseLocation(editor, rows[0]);
      } else {
        const list = field("candidates");
        for (const row of rows) {
          const item = document.createElement("li");
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = [row.title, row.detail].filter(Boolean).join(" · ");
          button.addEventListener("click", () => chooseLocation(editor, row));
          item.append(button);
          list.append(item);
        }
        list.hidden = false;
        setStatus(editor, "Wybierz właściwy adres.");
      }
    } catch (error) {
      if (lifetime.signal.aborted || editor.request !== request) return;
      setStatus(editor, error.name === "TimeoutError" ? "Usługa nie odpowiedziała. Spróbuj ponownie." : error.message, true);
    } finally {
      if (editor.request === request) {
        editor.request = null;
        field("locate").disabled = false;
      }
    }
  }

  function setMode(editor, mode) {
    const { field } = editor;
    editor.units = null;
    field("retry").hidden = true;
    field("type").value = mode;
    field("addressFields").hidden = mode === "parcel";
    field("parcelFields").hidden = mode !== "parcel";
    resetLocation(editor);
    if (mode !== "parcel") return Promise.resolve();
    optionsFor(field("commune"), "commune");
    optionsFor(field("region"), "region");
    return loadUnits(editor, "county");
  }

  function makeEditor(main) {
    const id = "property-" + nextId++;
    const card = document.createElement("article");
    card.className = "similar-item" + (main ? " similar-subject" : "");
    card.tabIndex = -1;
    card.dataset.property = id;
    card.innerHTML = propertyView(id, main);
    const field = (name) => card.querySelector(`[data-field="${name}"]`);
    const editor = { id, card, field, location: null };
    editors.push(editor);
    part(main ? "subject" : "comparisons").append(card);

    field("form").addEventListener("submit", (event) => { event.preventDefault(); void locate(editor); });
    field("type").addEventListener("change", () => void setMode(editor, field("type").value));
    field("address").addEventListener("input", () => resetLocation(editor));
    field("number").addEventListener("input", () => resetLocation(editor));
    field("region").addEventListener("change", () => resetLocation(editor));
    field("county").addEventListener("change", () => {
      resetLocation(editor);
      editor.units = null;
      field("retry").hidden = true;
      optionsFor(field("commune"), "commune");
      optionsFor(field("region"), "region");
      if (field("county").value) void loadUnits(editor, "commune");
    });
    field("commune").addEventListener("change", () => {
      resetLocation(editor);
      editor.units = null;
      field("retry").hidden = true;
      optionsFor(field("region"), "region");
      if (field("commune").value) void loadUnits(editor, "region");
    });
    field("retry").addEventListener("click", () => {
      setStatus(editor, "");
      void loadUnits(editor, editor.retryUnit);
    });
    if (!main) {
      field("price").addEventListener("input", draw);
      field("date").addEventListener("change", draw);
      field("remove").addEventListener("click", () => {
        resetLocation(editor);
        editor.units = null;
        editors.splice(editors.indexOf(editor), 1);
        card.remove();
        draw();
        part("add").focus({ preventScroll: true });
      });
    }
    return editor;
  }

  const subjectEditor = makeEditor(true);
  if (context.sharedSearch) {
    subjectEditor.card.append(subjectEditor.field("status"));
    subjectEditor.field("form").hidden = true;
    const subject = sharedSubject(context.location);
    part("subject").append(locationNotice(document, context, subject
      ? "Nieruchomość analizowana ze Startu."
      : "Nieruchomość analizowana wymaga działki lub adresu z punktem na mapie."));
    if (subject) chooseLocation(subjectEditor, subject);
  }
  for (let index = 0; index < 3; index += 1) makeEditor(false);
  draw();
  part("add").addEventListener("click", () => {
    const editor = makeEditor(false);
    draw();
    focusEditor(editor.id);
  });
  for (const key of overlays) part(key).addEventListener("change", draw);
  part("fit").addEventListener("click", fit);
  for (const key of ["street", "satellite"]) {
    part(key).addEventListener("click", () => {
      satellite = key === "satellite";
      part("street").setAttribute("aria-pressed", String(!satellite));
      part("satellite").setAttribute("aria-pressed", String(satellite));
      map?.selectBase(satellite);
    });
  }
  if (demo) part("example").addEventListener("click", async () => {
    part("example").disabled = true;
    part("panel").inert = true;
    examplePending = true;
    for (const editor of editors) {
      resetLocation(editor);
      editor.units = null;
      if (editor !== editors[0]) editor.card.remove();
    }
    editors.splice(1);
    for (let index = 1; index < demoFields.length; index += 1) makeEditor(false);
    for (const key of overlays) part(key).checked = true;
    try {
      await Promise.all(demoFields.map(async (data, index) => {
        if (index === 0 && context.sharedSearch) return;
        const editor = editors[index];
        const { field } = editor;
        await setMode(editor, data.type ?? "address");
        if (data.type === "parcel") {
          field("county").value = data.county;
          await loadUnits(editor, "commune");
          field("commune").value = data.commune;
          await loadUnits(editor, "region");
          field("region").value = data.region;
          field("number").value = data.number;
        } else {
          field("address").value = data.address;
        }
        if (index > 0) {
          field("price").value = data.price;
          field("date").value = data.date;
        }
        if (!lifetime.signal.aborted) await locate(editor);
      }));
      if (!lifetime.signal.aborted) fit();
    } finally {
      examplePending = false;
      part("panel").inert = false;
      part("example").disabled = false;
    }
  });

  const mapStatus = (message) => {
    part("mapStatus").textContent = message;
    part("mapStatus").hidden = !message;
  };
  void loadLeaflet({ document, window }).then((L) => {
    if (lifetime.signal.aborted) return;
    map = createSimilarMap(L, part("map"), { demo, onPick: focusEditor, onTileStatus: mapStatus });
    map.selectBase(satellite);
    mapStatus("");
    draw();
    if (fitPending) fit();
  }).catch((error) => { if (!lifetime.signal.aborted) mapStatus(error.message); });

  return () => {
    lifetime.abort();
    map?.destroy();
    root.remove();
  };
}

export const similarModule = Object.freeze({
  id: "podobne", label: "Podobne", backend: "Podobne",
  description: "Mapa nieruchomości porównawczych i odległości.", mount: mountSimilar,
});
