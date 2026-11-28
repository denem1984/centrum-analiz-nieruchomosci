import { contextStore, validateContext } from "../context.js";
import { loadLeaflet } from "../modules/dzialki/leaflet-loader.js";
import { loadPlanningProjection } from "../modules/dzialki/planning-projection.js";
import { compareChoices, createStartClient, normalizedName, provinceCodes } from "./start-client.js";
import { locationLine, parcelParts } from "./shared.js";

const precision = {
  area: "Granica gminy · Państwowy Rejestr Granic",
  place: "Punkt orientacyjny miejscowości · GUGiK",
  street: "Punkt orientacyjny ulicy · GUGiK",
  address: "Punkt adresowy · GUGiK",
  parcel: "Obrys działki · ULDK",
};

export function mountSharedStart(container, ctx) {
  const document = container.ownerDocument;
  const window = document.defaultView;
  const lifetime = new AbortController();
  const { signal } = lifetime;
  const project = () => loadPlanningProjection(document, window, { inverse: true });
  const client = createStartClient({ signal, project });
  let dataClient = client;
  let units = new Map();
  let active;
  let map;
  let layer;
  let visible;
  let leaflet;
  let selectedPlace;
  let choices = new Map();
  let streets = [];
  let districts = [];
  let updateId = 0;

  function element(tag, parent, text, id) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (id) node.id = "start-" + id;
    parent.append(node);
    return node;
  }
  function field(tag, parent, text, id) {
    const label = element("label", parent, text);
    const node = element(tag, label, "", id);
    return { node, label };
  }
  function optionList(select, rows, placeholder, value = "") {
    const placeholderNode = document.createElement("option");
    placeholderNode.value = "";
    placeholderNode.textContent = placeholder;
    const options = [...rows].sort(compareChoices).map((row) => {
      const option = document.createElement("option");
      option.value = row.value;
      option.textContent = row.label;
      return option;
    });
    select.replaceChildren(placeholderNode, ...options);
    select.value = value;
  }
  const layout = element("section", container);
  layout.className = "shared-start";
  const form = element("form", layout, "", "form");
  form.className = "shared-start-form";
  if (ctx.startDemo) {
    const demoNote = element("p", form, "Podgląd: słowniki TERYT i przykładowa geometria dla miejskiego Olsztyna, al. Warszawskiej i działki 286201_1.0001.12/3.");
    demoNote.className = "shared-start-demo";
  }
  const mode = field("select", form, "Co chcesz wyszukać?", "mode").node;
  optionList(mode, [
    { value: "area", label: "Obszar" }, { value: "address", label: "Adres" }, { value: "parcel", label: "Działka" },
  ], "Wybierz sposób wyszukiwania", "area");
  const direct = field("input", form, "Pełny identyfikator działki", "parcel-id");
  direct.node.maxLength = 64;
  direct.node.placeholder = "np. 000000_1.0001.12/3";
  const voiv = field("select", form, "Województwo", "voiv").node;
  const county = field("select", form, "Powiat", "county").node;
  const commune = field("select", form, "Gmina / jednostka ewidencyjna", "commune").node;
  const district = field("select", form, "Obręb", "district");
  const number = field("input", form, "Numer działki (opcjonalny)", "parcel-number");
  number.node.maxLength = 32;
  const extra = field("input", form, "Uzupełnij miejscowość i ulicę", "extra");
  extra.node.type = "checkbox";
  extra.label.className = "shared-check";
  const address = element("div", form);
  const placeQuery = field("input", address, "Nazwa miejscowości", "place-query").node;
  placeQuery.maxLength = 100;
  const findPlace = element("button", address, "Znajdź miejscowość", "find-place");
  findPlace.type = "button";
  const placeOption = field("select", address, "Wybierz miejscowość", "place").node;
  const street = field("select", address, "Ulica", "street");
  const house = field("input", address, "Numer adresowy (opcjonalny)", "house");
  house.node.maxLength = 24;
  const submit = element("button", form, "Ustal lokalizację", "submit");
  submit.type = "submit";
  const status = element("p", form, "Wczytywanie słownika TERYT…", "status");
  status.setAttribute("role", "status");
  const selection = element("p", form, "Nie wybrano lokalizacji.", "selection");
  selection.setAttribute("aria-live", "polite");
  const mapSection = element("div", layout);
  mapSection.className = "shared-start-map";
  const canvas = element("div", mapSection, "", "map");
  canvas.setAttribute("aria-label", "Mapa wybranej lokalizacji");
  const caption = element("p", mapSection, "Wybierz lokalizację, aby zobaczyć ją na mapie.", "map-caption");

  function report(text) { status.textContent = text; }
  function cancel() {
    active?.abort();
    updateId += 1;
  }
  async function run(task, onError = report) {
    cancel();
    active = new AbortController();
    const request = active;
    const id = updateId;
    const current = () => !signal.aborted && id === updateId;
    submit.disabled = true;
    try { await task(request.signal, current); }
    catch (error) { if (current()) onError(error.message || "Nie udało się przygotować lokalizacji."); }
    finally { if (current()) submit.disabled = false; }
  }

  const unitName = (code) => units.get(code)?.name ?? code;
  function adminChoices(length, prefix = "") {
    return [...units].filter(([code]) => code.length === length && code.startsWith(prefix))
      .map(([value, { name, type }]) => ({ value, label: length === 7 ? name + " · " + type : name }));
  }
  function admin(terc) {
    const canonical = units.get(terc)?.canonical;
    if (!canonical) throw new Error("Jednostka nie występuje w słowniku TERYT. Sprawdź identyfikator.");
    const ww = terc.slice(0, 2);
    const pp = terc.slice(0, 4);
    return {
      voivodeship: { code: ww, name: unitName(ww).toLocaleLowerCase("pl") },
      powiat: { code: pp, name: unitName(pp) },
      gmina: { terc7: terc, name: unitName(terc), kind: [1, 2, 3].includes(Number(terc.at(-1))) ? Number(terc.at(-1)) : null },
      ...(canonical !== terc && { canonicalGmina: { terc7: canonical, name: unitName(canonical) } }),
      ...(units.get(canonical)?.bdl && { bdlUnitId: units.get(canonical).bdl }),
    };
  }
  function showAdmin(ww, pp = "", terc = "") {
    voiv.value = ww;
    optionList(county, ww ? adminChoices(4, ww) : [], "Wybierz powiat", pp);
    optionList(commune, pp ? adminChoices(7, pp) : [], "Wybierz gminę lub jednostkę", terc);
    county.disabled = !ww;
    commune.disabled = !pp;
  }
  function clearPlace() {
    selectedPlace = null;
    choices.clear();
    streets = [];
    optionList(placeOption, [], "Najpierw znajdź miejscowość");
    optionList(street.node, [], "Wybierz miejscowość");
    house.node.value = "";
  }
  function clearDistrict() {
    district.label.hidden = mode.value !== "parcel";
    districts = [];
    optionList(district.node, [], "Wybierz jednostkę ewidencyjną");
    number.node.value = "";
  }
  function syncMode() {
    const isParcel = mode.value === "parcel";
    direct.label.hidden = !isParcel;
    district.label.hidden = !isParcel;
    number.label.hidden = !isParcel;
    extra.label.hidden = !isParcel;
    address.hidden = isParcel && !extra.node.checked;
    street.label.hidden = mode.value === "area";
    house.label.hidden = mode.value !== "address";
  }
  async function readDistricts(terc, request, current, selected = "") {
    if (!terc) return;
    const rows = (await dataClient.districts(terc, request))
      .filter(({ code }) => parcelParts(code + ".1")?.terc === terc);
    if (!current()) return;
    districts = rows;
    optionList(district.node, rows.map(({ code, name }) => ({ value: code, label: name + " · " + code.split(".")[1] })),
      rows.length ? "Wybierz obręb (opcjonalnie)" : "Brak obrębów w tej jednostce", selected);
  }
  async function readStreets(row, request, current, selected = "") {
    if (mode.value === "area" || !row) return;
    const rows = await dataClient.streets(row[2].slice(0, 2), row[0]);
    if (!current() || request.aborted) return;
    streets = rows;
    optionList(street.node, rows.map(([value, label]) => ({ value, label })),
      rows.length ? "Wybierz ulicę" : "Brak ulic w słowniku ULIC", selected);
  }
  function showMap(result) {
    visible = result;
    caption.textContent = result?.description
      ? (ctx.startDemo ? "Podgląd przykładowy · " : "") + result.description
      : "Wybierz lokalizację, aby zobaczyć ją na mapie.";
    if (!map) return;
    layer?.remove();
    layer = null;
    if (result?.geometry) {
      layer = leaflet.geoJSON(result.geometry, { style: {
        color: "#006779", weight: 3, fillColor: "#20a3ab", fillOpacity: 0.22,
      } }).addTo(map);
      map.fitBounds(layer.getBounds(), { padding: [26, 26], maxZoom: 18, animate: false });
    } else if (result?.point) {
      const point = [result.point.lat, result.point.lon];
      layer = leaflet.circleMarker(point, { color: "#fff", weight: 3, fillColor: "#006779", fillOpacity: 1, radius: 10 }).addTo(map);
      map.setView(point, { area: 10, place: 13, street: 15, address: 17, parcel: 17 }[result.point.role], { animate: false });
    } else map.setView([52.1, 19.25], 6, { animate: false });
  }
  async function buildResult(request) {
    const raw = direct.node.value.trim();
    const districtValue = districts.find(({ code }) => code === district.node.value);
    const numberValue = number.node.value.trim();
    const isParcel = mode.value === "parcel";
    const parts = isParcel && (raw ? parcelParts(raw) : numberValue ? parcelParts(district.node.value + "." + numberValue) : null);
    if (isParcel && (raw || numberValue) && !parts) throw new Error("Podaj poprawny identyfikator albo wybierz obręb i wpisz numer działki.");
    const row = (!isParcel || extra.node.checked) ? selectedPlace : null;
    const terc = parts?.terc || row?.[2] || commune.value;
    if (!terc) throw new Error("Wybierz gminę, znajdź miejscowość lub podaj pełny identyfikator działki.");
    if (row && units.get(row[2])?.canonical !== units.get(terc)?.canonical) {
      throw new Error("Podana miejscowość należy do innej gminy niż działka.");
    }
    if (mode.value === "address" && !row) throw new Error("Najpierw znajdź i wybierz miejscowość.");
    if (mode.value === "area" && placeQuery.value.trim() && !row) throw new Error("Wybierz miejscowość z wyników albo wyczyść jej nazwę.");
    const code = mode.value === "area" ? null : streets.find(([id]) => id === street.node.value);
    if (mode.value === "address" && !code) throw new Error("Wybierz ulicę z listy ULIC.");
    const unit = admin(terc);
    const place = row ? { simc7: row[0], name: row[1], terc7: row[2] } : null;
    const addressNumber = mode.value === "address" ? house.node.value.trim() : "";
    const streetValue = place && code
      ? { ulic5: code[0], name: code[1], simc7: place.simc7, ...(addressNumber && { number: addressNumber }) } : null;
    const location = {
      version: "2", source: "start", match: "exact", ...unit,
      kind: parts ? "dzialka" : isParcel && districtValue ? "obreb" : streetValue ? "adres" : place ? "miejscowosc" : "gmina",
      ...(place && { place }), ...(streetValue && { street: streetValue }),
    };
    let geometry;
    let warning;
    if (parts) {
      const parcel = await dataClient.parcel(parts.districtId, parts.number, request);
      if (!parcel || parcel.id !== parts.districtId + "." + parts.number) throw new Error("ULDK nie potwierdził działki o tym identyfikatorze.");
      location.district = { id: parts.districtId, name: parcel.region || parts.districtId.split(".")[1] };
      location.parcel = { id: parcel.id };
      location.point = { ...parcel.extent.center, role: "parcel", crs: "EPSG:4326" };
      geometry = parcel.geometry;
    } else {
      if (isParcel && districtValue) location.district = { id: districtValue.code, name: districtValue.name };
      if (place && !isParcel) {
        try { location.point = await dataClient.address(place, streetValue, request); }
        catch { request.throwIfAborted(); }
        if (!location.point) warning = "GUGiK nie potwierdził jednoznacznego punktu. Zapisano kody wybranej lokalizacji.";
      }
      if (!location.point) {
        try {
          const area = await dataClient.area(units.get(terc).canonical, request);
          if (area) ({ geometry, point: location.point } = area);
        } catch { request.throwIfAborted(); }
        if (!geometry && !warning) warning = "Nie udało się pobrać granicy. Zapisano kody wybranej lokalizacji.";
      }
      if (location.district && geometry) warning = "Na mapie widoczna jest granica gminy. Obręb zapisano według identyfikatora ULDK.";
      if (!location.point) delete location.point;
    }
    return { location, geometry, warning };
  }

  findPlace.addEventListener("click", () => void run(async (_request, current) => {
    const term = normalizedName(placeQuery.value);
    if (term.length < 2) { report("Wpisz co najmniej dwa znaki nazwy miejscowości."); return; }
    clearPlace();
    report("Wyszukiwanie w słowniku SIMC…");
    const prefix = commune.value || county.value || voiv.value;
    const provinces = prefix ? [prefix.slice(0, 2)] : provinceCodes;
    const areas = await Promise.all(provinces.map((code) => dataClient.places(code)));
    if (!current()) return;
    const rows = areas.flat().filter((row) => (
      (row[2].startsWith(prefix) || units.get(row[2])?.canonical === prefix)
      && normalizedName(row[1]).includes(term)
    ));
    rows.sort((a, b) => Number(normalizedName(b[1]) === term) - Number(normalizedName(a[1]) === term)
      || a[1].localeCompare(b[1], "pl") || a[2].localeCompare(b[2]) || a[0].localeCompare(b[0]));
    const options = rows.slice(0, 50);
    choices = new Map(options.map((row) => [row[0], row]));
    optionList(placeOption, options.map(([value, name, terc, type]) => ({
      value, label: [name, type, "gm. " + unitName(terc), "pow. " + unitName(terc.slice(0, 4)),
        unitName(terc.slice(0, 2)).toLocaleLowerCase("pl"), "SIMC " + value].join(" · "),
    })), options.length ? "Wybierz wynik" : "Brak wyników");
    report(rows.length > 50 ? "Pokazano 50 wyników. Zawęź wybór województwem, powiatem lub dłuższą nazwą."
      : rows.length ? "Wybierz miejscowość z listy." : "Brak miejscowości dla tych filtrów w słowniku SIMC.");
    placeOption.focus();
  }));
  placeQuery.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); findPlace.click(); }
  });
  placeQuery.addEventListener("input", () => { cancel(); clearPlace(); submit.disabled = false; });
  placeOption.addEventListener("change", () => void run(async (request, current) => {
    selectedPlace = choices.get(placeOption.value);
    streets = [];
    optionList(street.node, [], "Wczytywanie ulic…");
    house.node.value = "";
    if (!selectedPlace) return;
    const terc = selectedPlace[2];
    if (mode.value !== "parcel") showAdmin(terc.slice(0, 2), terc.slice(0, 4), terc);
    await readStreets(selectedPlace, request, current);
    if (current()) report(mode.value !== "area" && !streets.length
      ? "Ta miejscowość nie ma ulic w słowniku ULIC." : "Wybrano miejscowość.");
  }));
  street.node.addEventListener("change", () => { cancel(); house.node.value = ""; submit.disabled = false; });
  for (const input of [direct.node, number.node, house.node]) {
    input.addEventListener("input", () => { cancel(); submit.disabled = false; });
  }
  district.node.addEventListener("change", () => { cancel(); number.node.value = ""; direct.node.value = ""; submit.disabled = false; });
  extra.node.addEventListener("change", () => { cancel(); clearPlace(); syncMode(); submit.disabled = false; });
  function changeAdmin(ww, pp, terc) {
    void run(async (request, current) => {
      showAdmin(ww, pp, terc);
      clearPlace();
      clearDistrict();
      direct.node.value = "";
      if (mode.value === "parcel" && terc) {
        report("Wczytywanie obrębów ULDK…");
        await readDistricts(terc, request, current);
        if (!current()) return;
      }
      report("Uzupełnij pola potrzebne do wybranego sposobu wyszukiwania.");
    });
  }
  voiv.addEventListener("change", () => changeAdmin(voiv.value, "", ""));
  county.addEventListener("change", () => changeAdmin(voiv.value, county.value, ""));
  commune.addEventListener("change", () => changeAdmin(voiv.value, county.value, commune.value));
  mode.addEventListener("change", () => { syncMode(); changeAdmin(voiv.value, county.value, commune.value); });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void run(async (request, current) => {
      report("Ustalanie lokalizacji…");
      const { location, geometry, warning } = await buildResult(request);
      if (!current()) return;
      const checked = validateContext(location);
      if (!checked.context) throw new Error(checked.reason);
      const result = ctx.setContext(checked.context);
      if (!result.context) throw new Error(result.reason);
      showMap({ geometry, point: location.point, description: location.point ? precision[location.point.role] : warning });
      report(warning ?? "Lokalizacja jest gotowa do użycia w pozostałych modułach.");
    });
  });

  const unsubscribe = contextStore.subscribe((value) => {
    if (value.kind === "nieokreslona") {
      cancel();
      placeQuery.value = "";
      mode.value = "area";
      extra.node.checked = false;
      syncMode();
      changeAdmin("", "", "");
      showMap(null);
    }
    selection.textContent = locationLine(value.kind === "nieokreslona" ? null : value);
  });

  mode.value = "area";
  syncMode();
  clearPlace();
  clearDistrict();
  showAdmin("");
  submit.disabled = true;
  const saved = ctx.location;
  if (saved) {
    selection.textContent = locationLine(saved);
    if (saved.point) showMap({ point: saved.point, description: precision[saved.point.role] + " · zapisane położenie" });
  }
  if (window) {
    void loadLeaflet({ document, window }).then((L) => {
      if (signal.aborted) return;
      leaflet = L;
      map = L.map(canvas, { scrollWheelZoom: false, zoomAnimation: false });
      if (!ctx.startDemo) L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxNativeZoom: 19, maxZoom: 21, attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);
      showMap(visible);
    }).catch(() => { if (!signal.aborted) caption.textContent = "Nie udało się załadować mapy."; });
  }
  void (async () => {
    if (ctx.startDemo) {
      const { demoStartClient } = await import("./start-demo.js");
      dataClient = demoStartClient(client);
    }
    units = await dataClient.units();
    if (signal.aborted) return;
    optionList(voiv, adminChoices(2), "Wybierz województwo");
    if (!saved || updateId) {
      report("Wybierz obszar, wyszukaj adres lub podaj działkę.");
      submit.disabled = false;
      return;
    }
    await run(async (request, current) => {
      const { voivodeship, powiat, gmina, parcel, place, district: savedDistrict, street: savedStreet } = saved;
      mode.value = parcel || savedDistrict ? "parcel" : savedStreet ? "address" : "area";
      extra.node.checked = Boolean(place);
      showAdmin(voivodeship.code, powiat.code, gmina.terc7);
      syncMode();
      if (parcel) direct.node.value = parcel.id;
      if (savedDistrict) {
        districts = [{ code: savedDistrict.id, name: savedDistrict.name }];
        optionList(district.node, [{ value: savedDistrict.id, label: savedDistrict.name }], "Wybierz obręb", savedDistrict.id);
      }
      if (place) {
        placeQuery.value = place.name;
        selectedPlace = [place.simc7, place.name, place.terc7 ?? gmina.terc7];
        choices = new Map([[place.simc7, selectedPlace]]);
        optionList(placeOption, [{ value: place.simc7, label: place.name }], "Wybierz miejscowość", place.simc7);
        await readStreets(selectedPlace, request, current, savedStreet?.ulic5);
        if (!current()) return;
        house.node.value = savedStreet?.number ?? "";
      }
      report("Wczytano wspólną lokalizację.");
      try {
        const result = await buildResult(request);
        if (current()) showMap({
          point: result.location.point ?? saved.point, geometry: result.geometry,
          description: result.warning ? result.warning : precision[result.location.point?.role],
        });
      } catch { /* The saved identifiers remain available if the map service is unavailable. */ }
    });
  })().catch((error) => { if (!signal.aborted) report(error.message); });
  return () => { cancel(); lifetime.abort(); unsubscribe(); map?.remove(); };
}
