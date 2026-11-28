import { checkBackend, getBackendStatus, subscribeBackendStatus } from "../../health.js";
import { getDzialkiState, updateDzialkiState } from "./state.js";
import { REGISTRATION_GROUP_DESCRIPTIONS } from "./egib.js";
import { planningRequest } from "./planning-services.js";
import { mountRasterMonitor } from "./raster-monitor.js";
import { THEMATIC_LAYERS, THEMATIC_LEGENDS, OWNERSHIP_COLORS, KIUT_LEGEND,
  buildOwnershipUrl, enrichOwnership, buildRwdzInfoUrl, parseRwdz } from "./thematic-services.js";

const groupCache = new Map();
function element(document,tag,text,className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function mercator(lng,lat) {
  const phi = Math.max(-85.0511287798,Math.min(85.0511287798,lat)) * Math.PI / 180;
  return [6378137 * lng * Math.PI / 180,6378137 * Math.log(Math.tan(Math.PI / 4 + phi / 2))];
}
function renderRecords(document,container,records) {
  for (const [index,record] of records.entries()) {
    container.append(element(document,"strong",records.length > 1 ? "Wpis RWDZ " + (index + 1) : "Wpis dotyczący budowy – GUNB RWDZ"));
    for (const [label,value] of record) container.append(element(document,"p",label + ": " + value));
  }
  const source = element(document,"a","Źródło: wyszukiwarka GUNB");
  source.href = "https://wyszukiwarka.gunb.gov.pl/"; source.target = "_blank"; source.rel = "noopener noreferrer";
  container.append(source);
}

export function mountThematicLayers(investmentContainer,infrastructureContainer,options = {}) {
  const document = options.document ?? globalThis.document;
  const fetchImpl = options.fetchImpl ?? ((...args) => globalThis.fetch(...args));
  const setTimer = options.setTimeoutFn ?? setTimeout, clearTimer = options.clearTimeoutFn ?? clearTimeout;
  const entries = new Map();
  const cache = options.groupCache ?? groupCache;
  let map,L,disposed = false,ownershipTimer = null,ownershipController = null,popupController = null;
  let ownershipLayer = null,ownershipGeneration = 0,ownershipLoading = false,activePopup = null,activePopupRoot = null,popupWait = null;
  const enabled = () => getDzialkiState().thematicLayers;

  function colorLegend(container,items) {
    for (const [color,label] of items) {
      const row = element(document,"p",undefined,"dzialki-color-legend-row");
      const swatch = element(document,"span",undefined,"dzialki-color-swatch");
      swatch.style.backgroundColor = color; swatch.setAttribute("aria-hidden","true");
      row.append(swatch,element(document,"span",label)); container.append(row);
    }
  }
  function infoButton(row,label,onClick) {
    const button = element(document,"button","?","dzialki-layer-help-button");
    button.type = "button"; button.setAttribute("aria-label","Informacja: " + label);
    button.addEventListener("click",onClick); row.append(button); return button;
  }
  function imageLegend(entry,text,urls) {
    const help = element(document,"div",undefined,"dzialki-planning-help");
    help.id = "dzialki-thematic-" + entry.id + "-help"; help.hidden = true;
    help.append(element(document,"p",text));
    let imagesAdded = false;
    const button = infoButton(entry.row,entry.label,() => {
      help.hidden = !help.hidden; button.setAttribute("aria-expanded",String(!help.hidden));
      if (!help.hidden && !imagesAdded) {
        imagesAdded = true;
        for (const url of urls) { const img = element(document,"img"); img.src = url; img.alt = "Legenda " + entry.label; help.append(img); }
      }
    });
    button.setAttribute("aria-controls",help.id); button.setAttribute("aria-expanded","false");
    entry.container.append(help);
  }

  for (const [id,label,container] of [
    ["rwdz",THEMATIC_LAYERS.rwdz.label,investmentContainer], ["flood",THEMATIC_LAYERS.flood.label,investmentContainer],
    ["kiut",THEMATIC_LAYERS.kiut.label,infrastructureContainer], ["ownership","Mapa własności",infrastructureContainer],
  ]) {
    const row = element(document,"div",undefined,"dzialki-planning-row");
    const input = element(document,"input"); input.type = "checkbox"; input.id = "dzialki-thematic-" + id;
    input.dataset.thematicLayer = id; input.checked = enabled()[id];
    const title = element(document,"label",label); title.htmlFor = input.id;
    row.append(input,title); container.append(row);
    const entry = {id,label,container,row,input,monitor:null,legend:null}; entries.set(id,entry);
    if (id === "rwdz") imageLegend(entry,"Dane obejmują wnioski, decyzje i zgłoszenia. Lokalizacje spraw są widoczne przy skali 1:5 000–1:50 000, obrysy przy 1:5 000 i większym przybliżeniu. Kliknij mapę po szczegóły; obrys rejestru może różnić się od aktualnego EGiB.",THEMATIC_LEGENDS.rwdz);
    if (id === "flood") mountFloodDialog(entry);
    if (id === "kiut" || id === "ownership") {
      entry.legend = element(document,"div",undefined,"dzialki-thematic-color-legend"); entry.legend.hidden = !input.checked;
      colorLegend(entry.legend,id === "kiut" ? KIUT_LEGEND : Object.entries(OWNERSHIP_COLORS).map(([group,color]) => [color,group + " – " + REGISTRATION_GROUP_DESCRIPTIONS[group]]));
      entry.legend.append(element(document,"p",id === "kiut" ? "Urządzenia techniczne mają kolor swojej sieci. Źródło: KIUT." : "Kolory oznaczają grupy rejestrowe, nie nazwiska właścicieli. Nieustalona grupa pozostaje szara.","dzialki-help"));
      container.append(entry.legend);
    }
    const status = element(document,"p","Warstwa wyłączona.","dzialki-planning-status"); status.dataset.thematicStatus = id;
    status.setAttribute("role","status"); status.setAttribute("aria-live","polite");
    const retry = element(document,"button","Spróbuj ponownie: " + label,"dzialki-thematic-retry"); retry.type = "button"; retry.hidden = true;
    entry.status = status; entry.retry = retry; container.append(status,retry);
    input.addEventListener("change",() => {
      updateDzialkiState({ thematicLayers:{...enabled(),[id]:input.checked} });
      sync(entry);
    });
    retry.addEventListener("click",() => id === "ownership" ? scheduleOwnership(true) : entry.monitor?.retry());
  }
  investmentContainer.append(element(document,"p","Wczytane kafelki nie potwierdzają pełnej publikacji danych. Brak symbolu nie dowodzi braku zagrożenia lub postępowania.","dzialki-help"));

  function mountFloodDialog(entry) {
    const backdrop = element(document,"div",undefined,"dzialki-flood-backdrop"); backdrop.hidden = true;
    const dialog = element(document,"section",undefined,"dzialki-flood-dialog"); dialog.setAttribute("role","dialog"); dialog.setAttribute("aria-modal","true");
    dialog.id = "dzialki-flood-dialog";
    dialog.setAttribute("aria-labelledby","dzialki-flood-title");
    const title = element(document,"h3","Obszary zagrożenia powodziowego – ISOK"); title.id = "dzialki-flood-title";
    const close = element(document,"button","Zamknij"); close.type = "button";
    dialog.append(title,close,element(document,"p","Ogólne strefy powodzi rzecznej i morskiej od skali 1:50 000. To nie jest prognoza na żywo; scenariusze prawdopodobieństwa i głębokości wody sprawdź w Hydroportalu."));
    const images = element(document,"div"); dialog.append(images);
    const source = element(document,"a","Otwórz Hydroportal ISOK"); source.href = "https://wody.isok.gov.pl/hydroportal.html"; source.target = "_blank"; source.rel = "noopener noreferrer"; dialog.append(source);
    let loaded = false;
    const button = infoButton(entry.row,entry.label,() => {
      backdrop.hidden = false;
      button.setAttribute("aria-expanded","true");
      if (!loaded) {
        loaded = true;
        THEMATIC_LEGENDS.flood.forEach((url,index) => {
          const group = element(document,"div",undefined,"dzialki-legend-image-scroll");
          const img = element(document,"img"); img.src = url; img.alt = index ? "Powódź morska" : "Powódź rzeczna"; group.append(img); images.append(group);
        });
      }
      close.focus();
    });
    button.setAttribute("aria-haspopup","dialog"); button.setAttribute("aria-controls",dialog.id); button.setAttribute("aria-expanded","false");
    const dismiss = () => { backdrop.hidden = true; button.setAttribute("aria-expanded","false"); button.focus(); };
    close.addEventListener("click",dismiss);
    backdrop.addEventListener("click",(event) => { if (event.target === backdrop) dismiss(); });
    dialog.addEventListener("keydown",(event) => {
      if (event.key === "Escape") { event.preventDefault(); dismiss(); }
      if (event.key === "Tab" && event.shiftKey && document.activeElement === close) { event.preventDefault(); source.focus(); }
      else if (event.key === "Tab" && !event.shiftKey && document.activeElement === source) { event.preventDefault(); close.focus(); }
    });
    backdrop.append(dialog); document.body.append(backdrop);
    entry.removeDialog = () => backdrop.remove();
  }

  function sync(entry) {
    if (!map || disposed) return;
    if (entry.legend) entry.legend.hidden = !enabled()[entry.id];
    if (entry.id === "ownership") { scheduleOwnership(); return; }
    if (enabled()[entry.id] && !entry.monitor) {
      const def = THEMATIC_LAYERS[entry.id];
      const layer = L.tileLayer.wms(def.url,{pane:entry.id === "rwdz" ? "dzialki-rwdz-pane" : entry.id === "kiut" ? "dzialki-kiut-pane" : "overlayPane",
        layers:def.layers,styles:def.styles,version:def.version,crs:L.CRS.EPSG3857,format:"image/png",transparent:true,opacity:def.opacity,maxZoom:22,
        updateWhenZooming:false,updateWhenIdle:true,keepBuffer:1,className:"dzialki-thematic-tile-" + entry.id,
        attribution:entry.id === "flood" ? "© Wody Polskie — MZP/MRP, ISOK" : entry.id === "kiut" ? "© GUGiK — KIUT" : "© GUNB RWDZ / Geoportal"});
      entry.monitor = mountRasterMonitor(map,layer,entry.status,entry.retry,options);
    } else if (!enabled()[entry.id]) {
      entry.monitor?.cleanup(); entry.monitor = null;
      entry.status.dataset.state = "inactive"; entry.status.textContent = "Warstwa wyłączona."; entry.retry.hidden = true;
    }
  }

  const unsubscribe = (options.subscribeBackendStatus ?? subscribeBackendStatus)("Dzialki",(status) => {
    if (status.state !== "waking" || disposed) return;
    const message = "Usługa się budzi · oczekiwanie: " + status.waitSeconds + " s";
    if (ownershipLoading) entries.get("ownership").status.textContent = message;
    if (popupWait) popupWait.textContent = message;
  });
  async function ready(signal) {
    signal.throwIfAborted();
    const status = (options.getBackendStatus ?? getBackendStatus)("Dzialki");
    if (status.state === "ready") return;
    const result = await (options.checkBackend ?? checkBackend)("Dzialki",{force:status.state === "error"});
    signal.throwIfAborted();
    if (result.state !== "ready") throw new Error("Backend nie odpowiedział.");
  }
  function clearOwnership() {
    if (ownershipLayer && map?.hasLayer(ownershipLayer)) map.removeLayer(ownershipLayer);
    ownershipLayer = null;
  }
  function scheduleOwnership(immediate = false) {
    if (ownershipTimer !== null) clearTimer(ownershipTimer);
    ownershipTimer = null; ownershipController?.abort(); ownershipGeneration += 1; ownershipLoading = false;
    const entry = entries.get("ownership");
    if (!map || disposed) return;
    clearOwnership();
    if (!enabled().ownership) { entry.status.dataset.state = "inactive"; entry.status.textContent = "Warstwa wyłączona."; entry.retry.hidden = true; return; }
    const generation = ownershipGeneration;
    entry.status.dataset.state = "loading"; entry.status.textContent = "Wczytywanie geometrii i grup rejestrowych…"; entry.retry.hidden = true;
    ownershipTimer = setTimer(async () => {
      ownershipTimer = null;
      const controller = new AbortController(); ownershipController = controller; ownershipLoading = true;
      try {
        await ready(controller.signal);
        const data = await planningRequest(buildOwnershipUrl(map.getBounds()),{fetchImpl,signal:controller.signal});
        if (!data || data.type !== "FeatureCollection" || !Array.isArray(data.features)) throw new Error("Nieprawidłowa odpowiedź mapy własności.");
        if (disposed || controller.signal.aborted || generation !== ownershipGeneration) return;
        const features = data.features.filter((feature) => feature?.geometry);
        ownershipLayer = L.geoJSON({type:"FeatureCollection",features},{pane:"overlayPane",style:(feature) => ({color:"#555",weight:0.8,
          fillColor:OWNERSHIP_COLORS[String(feature?.properties?.GRUPA_REJESTROWA ?? "").trim()] || "#9ca3af",fillOpacity:0.55})}).addTo(map);
        const result = await enrichOwnership(features,{fetchImpl,signal:controller.signal,cache,onProgress:(progress) => {
          if (disposed || controller.signal.aborted || generation !== ownershipGeneration) return;
          ownershipLayer?.setStyle?.((feature) => ({color:"#555",weight:0.8,fillColor:OWNERSHIP_COLORS[String(feature?.properties?.GRUPA_REJESTROWA ?? "").trim()] || "#9ca3af",fillOpacity:0.55}));
          entry.status.textContent = "Geometrie: " + features.length + "; sprawdzone grupy: " + progress.completed + "/" + progress.total + "; nadal nieustalone: " + progress.missing;
        }});
        if (disposed || controller.signal.aborted || generation !== ownershipGeneration) return;
        ownershipLayer?.setStyle?.((feature) => ({color:"#555",weight:0.8,fillColor:OWNERSHIP_COLORS[String(feature?.properties?.GRUPA_REJESTROWA ?? "").trim()] || "#9ca3af",fillOpacity:0.55}));
        const incomplete = result.missing > 0 || data.truncated === true || data.partial === true;
        entry.status.dataset.state = incomplete ? "incomplete" : features.length ? "ready" : "empty";
        entry.status.textContent = "Wczytano geometrię " + features.length + " obiektów. Nieustalone grupy: " + result.missing
          + (incomplete ? ". Wynik niepełny — spróbuj ponownie, aby uzupełnić dalsze grupy." : ". Dane dotyczą obiektów zwróconych przez usługę.");
        entry.retry.hidden = !incomplete;
      } catch {
        if (disposed || controller.signal.aborted || generation !== ownershipGeneration) return;
        entry.status.dataset.state = "error"; entry.status.textContent = "Nie udało się wczytać mapy własności."; entry.retry.hidden = false;
      } finally { if (generation === ownershipGeneration) ownershipLoading = false; }
    },immediate ? 0 : 350);
  }

  function updatePopup() {
    const root = activePopup?.getContent?.();
    if (root === activePopupRoot || root?.contains?.(activePopupRoot)) activePopup.update?.();
  }
  function extendPopup(content,event) {
      popupController?.abort(); popupWait = null;
    if (disposed || !enabled().rwdz) return content;
    const controller = new AbortController(); popupController = controller;
    const root = element(document,"div",undefined,"dzialki-thematic-popup");
    root.append(typeof content === "string" ? element(document,"p",content) : content);
    const section = element(document,"section"); section.append(element(document,"h4","Pozwolenia na budowę – GUNB RWDZ"));
    const status = element(document,"p","Wczytywanie…"); status.setAttribute("role","status"); status.setAttribute("aria-live","polite");
    const body = element(document,"div"), retry = element(document,"button","Spróbuj ponownie"); retry.type = "button"; retry.hidden = true;
    section.append(status,body,retry); root.append(section); activePopupRoot = root;
    async function run() {
      section.dataset.state = "loading"; status.textContent = "Wczytywanie…"; body.replaceChildren(); retry.hidden = true; popupWait = status;
      try {
        await ready(controller.signal);
        const bounds = map.getBounds(), sw = mercator(bounds.getWest(),bounds.getSouth()), ne = mercator(bounds.getEast(),bounds.getNorth());
        const xml = await planningRequest(buildRwdzInfoUrl({bbox:[...sw,...ne],size:map.getSize(),pixel:event.containerPoint ?? map.latLngToContainerPoint(event.latlng)}),{fetchImpl,signal:controller.signal,format:"text"});
        const records = parseRwdz(xml,options.DOMParser ?? globalThis.DOMParser);
        if (disposed || controller.signal.aborted) return;
        section.dataset.state = records.length ? "ready" : "empty";
        status.textContent = records.length ? "Wczytano." : "Brak wpisu RWDZ w tym miejscu. Przybliż mapę, aby sprawdzić działkę.";
        if (records.length) renderRecords(document,body,records);
      } catch {
        if (disposed || controller.signal.aborted) return;
        section.dataset.state = "error"; status.textContent = "Nie udało się pobrać szczegółów wpisu z rejestru RWDZ."; retry.hidden = false;
      } finally { if (popupWait === status) popupWait = null; updatePopup(); }
    }
    controller.signal.addEventListener("abort",() => {
      if (section.dataset.state === "loading") { section.dataset.state = "cancelled"; status.textContent = "Anulowano sprawdzanie. Kliknij ponownie wybrane miejsce."; }
      retry.hidden = true;
    },{once:true});
    retry.addEventListener("click",() => { void run(); });
    void run(); return root;
  }
  const cancelPopup = () => popupController?.abort();
  const closePopup = (event) => { if (event.popup?.getContent?.() === activePopupRoot) cancelPopup(); };
  const viewChanged = () => scheduleOwnership();
  return {
    extendPopup,hasPopup:() => enabled().rwdz,
    onPopupOpen(popup) { activePopup = popup; },
    attach(nextMap,nextL) {
      map = nextMap; L = nextL;
      for (const [name,zIndex] of [["dzialki-rwdz-pane",420],["dzialki-kiut-pane",410]]) {
        if (map.createPane && !map.getPane?.(name)) map.createPane(name);
        const pane = map.getPane?.(name); if (pane) pane.style.zIndex = String(zIndex);
        if (name === "dzialki-kiut-pane") pane?.classList?.add("dzialki-kiut-pane");
      }
      for (const entry of entries.values()) sync(entry);
      map.on("moveend",viewChanged); map.on("zoomend",viewChanged);
      for (const name of ["dragstart","zoomstart","keydown"]) map.on(name,cancelPopup);
      map.on("popupclose",closePopup);
    },
    cleanup() {
      if (disposed) return; disposed = true;
      unsubscribe(); cancelPopup(); ownershipController?.abort(); ownershipGeneration += 1;
      if (ownershipTimer !== null) clearTimer(ownershipTimer);
      for (const entry of entries.values()) { entry.monitor?.cleanup(); entry.removeDialog?.(); }
      clearOwnership(); map?.off("moveend",viewChanged); map?.off("zoomend",viewChanged);
      for (const name of ["dragstart","zoomstart","keydown"]) map?.off(name,cancelPopup);
      map?.off("popupclose",closePopup);
    },
  };
}
