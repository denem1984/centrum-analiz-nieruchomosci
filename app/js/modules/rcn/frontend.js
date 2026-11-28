// Frontend port of denem1984/rcn-web-app static/app.js at 85cb2f91348e10fc1fa3491c5e4e0c07b4a952bb.
export function mountRcnFrontend(root, { L, Chart, fetch, signal, demo = false }) {
  const window = root.ownerDocument.defaultView;
  const timers = new Set();
  function later(callback, delay) {
    if (signal.aborted) return null;
    const timer = window.setTimeout(() => {
      timers.delete(timer);
      callback();
    }, delay);
    timers.add(timer);
    return timer;
  }
  function cancelLater(timer) {
    window.clearTimeout(timer);
    timers.delete(timer);
  }
  signal.addEventListener("abort", () => {
    for (const timer of timers) window.clearTimeout(timer);
    timers.clear();
    priceChart?.destroy();
    histChart?.destroy();
    map?.remove();
  }, { once: true });

  const $ = (id) => root.getElementById(id);
  const fmtMoney = (v) => v == null ? "—" : new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 0 }).format(v) + " zł";
  const fmtNum = (v, d = 2) => v == null ? "—" : new Intl.NumberFormat("pl-PL", { maximumFractionDigits: d }).format(v);
  const fmtPct = (v) => v == null ? "—" : (v > 0 ? "+" : "") + new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 }).format(v) + "%";
  const fmtArea = (v) => v == null ? "—" : fmtNum(v, 1) + " m²";
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
  $("rcn-demo-note").hidden = !demo;
  if (demo) {
    for (const id of ["exportBtn", "pdfBtn"]) {
      $(id).disabled = true;
      $(id).title = "Eksport jest dostępny w trybie danych RCN.";
    }
  }




  function landModeLabel() {
    const mode = $("land_record_mode")?.value || "";
    if (mode === "built_land") return "grunt zabudowany";
    if (mode === "unbuilt_land") return "grunt niezabudowany";
    return "działki";
  }

  function activeModuleFromInputs() {
    if ($("layer")?.value === "lokale") return "lokale";
    return ($("land_record_mode")?.value === "built_land") ? "grunt_zabudowany" : "grunt_niezabudowany";
  }

  function setModule(module) {
    stopSearch();
    const previousLayer = $("layer")?.value || "lokale";
    if (module === "grunty") module = "grunt_niezabudowany"; // zgodność z wcześniejszymi linkami / stanem

    root.querySelectorAll(".module-tab").forEach(x => {
      x.classList.toggle("active", x.dataset.module === module);
    });

    if (module === "lokale") {
      $("layer").value = "lokale";
      if (previousLayer === "dzialki") {
        // Prosty promień miejscowości obowiązuje tylko w modułach gruntowych.
        // Po powrocie do lokali czyścimy punkt/promień, żeby lokale działały jak wcześniej.
        clearMapAnalysisContext();
      }
      $("property_kind").value = "nieruchomoscLokalowa";
      if ($("land_record_mode")) $("land_record_mode").value = "land_only";
      $("searchTitle").textContent = "Wyszukiwanie — lokale";
      $("streetLabel").textContent = "Ulica";
      $("street").placeholder = "np. Kościuszki albo Barcza";
      $("areaMinLabel").textContent = "Pow. lokalu od";
      $("areaMaxLabel").textContent = "Pow. lokalu do";
      $("function").disabled = false;
      if (!$("function").value) $("function").value = "mieszkalna";
      setModuleSpecificFilters("lokale");
      if ($("exclude_outliers")) $("exclude_outliers").checked = true;
      $("streetsPanel")?.classList.remove("hidden");
      $("outliersWrap")?.classList.remove("hidden");
      $("cityFieldWrap")?.classList.add("hidden");
      $("gminaPickerWrap")?.classList.remove("hidden");
      $("basicRangeFiltersWrap")?.classList.add("hidden");
      if (!$("gmina_voivodeship").options.length || $("gmina_voivodeship").options.length <= 1) loadVoivodeships();
      applyGminaModeVisibility();
    } else if (module === "grunt_niezabudowany" || module === "grunt_zabudowany") {
      const built = module === "grunt_zabudowany";
      $("layer").value = "dzialki";
      $("property_kind").value = "";
      if ($("land_record_mode")) $("land_record_mode").value = built ? "built_land" : "unbuilt_land";
      $("searchTitle").textContent = built ? "Wyszukiwanie — grunt zabudowany" : "Wyszukiwanie — grunt niezabudowany";
      $("streetLabel").textContent = "Obręb / opis pomocniczy";
      $("street").placeholder = "opcjonalnie; zwykle pozostaw puste";
      $("areaMinLabel").textContent = "Pow. gruntu od";
      $("areaMaxLabel").textContent = "Pow. gruntu do";
      $("basicRangeFiltersWrap")?.classList.remove("hidden");
      $("function").disabled = true;
      $("function").value = "";
      setModuleSpecificFilters(built ? "grunt_zabudowany" : "grunt_niezabudowany");
      $("streetsPanel")?.classList.add("hidden");
      $("outliersWrap")?.classList.add("hidden");
      $("cityFieldWrap")?.classList.add("hidden");
      $("gminaPickerWrap")?.classList.remove("hidden");
      if ($("gminaModeWrap")) $("gminaModeWrap").classList.remove("hidden");
      if ($("miejscowoscFieldWrap")) $("miejscowoscFieldWrap").classList.remove("hidden");
      if (!$("gmina_voivodeship").options.length || $("gmina_voivodeship").options.length <= 1) loadVoivodeships();
      if ($("streetFieldWrap")) $("streetFieldWrap").classList.remove("hidden");
      if (selectedPlace && isValidPolandPoint(selectedPlace.lat, selectedPlace.lon) && map) {
        map.setView([Number(selectedPlace.lat), Number(selectedPlace.lon)], 13);
      }
    } else {
      setModule("lokale");
      return;
    }

    baseRecords = [];
    lastRecords = [];
    excludedTransactionKeys.clear();
    renderRows([]);
    renderMap([]);
    renderStreets([]);
    renderCharts([], {});
    $("stats").innerHTML = "";
    $("summaryNote").textContent = "";
    renderAudit(null);

    const moduleLabel = module === "lokale" ? "Lokale" : (module === "grunt_zabudowany" ? "Grunt zabudowany" : "Grunt niezabudowany");
    updateModulePresentation(module);

    // Jeśli te same kryteria (moduł + lokalizacja + filtry, niezależnie od zakresu dat)
    // były już wyszukane wcześniej w tej sesji — np. wracamy z Gruntów do Lokali po tym
    // samym wyszukiwaniu — przywracamy wynik z krótkotrwałej pamięci przeglądarki
    // zamiast pytać serwer od nowa. To ten sam bufor, co przy zmianie zakresu dat.
    // Uwaga: ręczne „Pomiń” dla pojedynczych transakcji nie jest tu przywracane.
    pruneSearchResultsCache();
    const key = queryExcludingDate();
    const newFrom = $("date_from")?.value || "";
    const newTo = $("date_to")?.value || "";
    const cached = searchResultsCache.find(e => e.key === key &&
      (!e.dateFrom || !newFrom || e.dateFrom <= newFrom) &&
      (!e.dateTo || !newTo || e.dateTo >= newTo));

    if (cached) {
      baseRecords = cached.records;
      lastFetchDateFrom = cached.dateFrom;
      lastFetchDateTo = cached.dateTo;
      lastFetchQuery = cached.key;
      lastDiagnostics = cached.diagnostics;
      const minsAgo = Math.round((Date.now() - cached.timestamp) / 60000);
      refreshFromBaseRecords();
      $("status").textContent = `Wybrano moduł: ${moduleLabel}. Przywrócono z pamięci to samo wyszukiwanie (pobrane ${minsAgo < 1 ? "przed chwilą" : minsAgo + " min temu"}, bez nowego zapytania do serwera).`;
    } else {
      $("status").textContent = `Wybrano moduł: ${moduleLabel}. Kliknij „Szukaj”, aby pobrać dane.`;
    }
    scheduleVisualRefresh();
  }

  function setupModuleTabs() {
    root.querySelectorAll(".module-tab").forEach(btn => {
      if (btn.dataset.tabsReady) return;
      btn.dataset.tabsReady = "1";
      btn.addEventListener("click", () => setModule(btn.dataset.module));
    });
  }


  function formatApiError(detail) {
    if (!detail) return "Błąd pobierania danych";
    const sanitize = (text) => {
      // Komunikaty o awarii technicznego magazynu danych (Cloudflare R2 / Parquet)
      // nie mają trafiać do użytkownika w tej formie — w aplikacji widocznym
      // źródłem danych jest wyłącznie Rejestr Cen Nieruchomości – geoportal.gov.pl.
      const technicalPattern = /cloudflare|r2[_\s]|bucket|parquet|endpoint|duckdb|\.aws|s3v4/i;
      if (technicalPattern.test(text)) {
        return "Tymczasowy problem z przygotowaniem danych z Rejestru Cen Nieruchomości. Spróbuj ponownie za chwilę.";
      }
      return text;
    };
    if (typeof detail === "string") return sanitize(detail);
    if (Array.isArray(detail)) {
      return detail.map(item => {
        if (!item) return "";
        if (typeof item === "string") return sanitize(item);
        const loc = Array.isArray(item.loc) ? item.loc.join(".") : "";
        const msg = sanitize(item.msg || item.message || JSON.stringify(item));
        return loc ? `${loc}: ${msg}` : msg;
      }).filter(Boolean).join("; ");
    }
    if (typeof detail === "object") {
      return sanitize(detail.msg || detail.message || JSON.stringify(detail));
    }
    return sanitize(String(detail));
  }

  function recordKey(r) {
    return String(r?.transaction_id || `${r?.date || ""}|${r?.address || ""}|${r?.area || ""}|${r?.price || ""}`);
  }


  function currentModuleLabel() {
    return $("layer")?.value === "dzialki" ? landModeLabel() : "lokalu";
  }

  function isBuiltLandModule() {
    return $("layer")?.value === "dzialki" && $("land_record_mode")?.value === "built_land";
  }

  function asFiniteNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function unitPriceValue(record) {
    const built = isBuiltLandModule() || Boolean(record?.is_built_land);
    return asFiniteNumber(built ? (record?.building_price_m2 ?? record?.price_m2) : record?.price_m2);
  }

  function unitPriceQuality(record) {
    const built = isBuiltLandModule() || Boolean(record?.is_built_land);
    return built ? (record?.building_price_m2_quality || record?.price_m2_quality || "") : (record?.price_m2_quality || "");
  }

  function buildingAreaBasisLabel(record) {
    if (record?.building_area_basis === "usable") return "pow. użytkowej budynków podanej w RCN";
    if (record?.building_area_basis === "estimated_footprint_floors") {
      return "szacowanej pow. kondygnacji (to nie jest pow. użytkowa)";
    }
    return "powierzchni porównawczej";
  }

  function buildingUnitPriceDescription(record) {
    const value = unitPriceValue(record);
    return value != null
      ? `Pomocnicza cena/m² ${buildingAreaBasisLabel(record)} (z gruntem): ${fmtMoney(value)}`
      : `Cena/m² nieobliczona: ${escapeHtml(unitPriceQuality(record) || "brak kompletnych danych")}`;
  }

  function builtLandAreaDetails(record, separator = "<br>") {
    const lines = [];
    const total = asFiniteNumber(record?.building_count);
    const areaCount = asFiniteNumber(record?.building_area_count) || 0;
    const footprintCount = asFiniteNumber(record?.building_footprint_count) || 0;
    const estimatedCount = asFiniteNumber(record?.building_estimated_area_count) || 0;
    if (asFiniteNumber(record?.building_area) > 0) {
      lines.push(`Pow. użytk. RCN: ${fmtNum(record.building_area)} m²${record.building_area_complete ? "" : ` (dane dla ${areaCount}/${total || "?"} budynków)`}`);
    }
    if (asFiniteNumber(record?.building_footprint_area) > 0) {
      lines.push(`Pow. zabudowy: ${fmtNum(record.building_footprint_area)} m²${total != null && footprintCount < total ? ` (dane dla ${footprintCount}/${total} budynków)` : ""}`);
    }
    if (record?.building_floor_counts) {
      lines.push(`Kondygnacje nadziemne kolejnych budynków: ${escapeHtml(record.building_floor_counts)}`);
    }
    if (asFiniteNumber(record?.building_estimated_area) > 0) {
      lines.push(`Szac. pow. kondygnacji: ${fmtNum(record.building_estimated_area)} m²${record.building_estimated_area_complete ? "" : ` (niepełne: ${estimatedCount}/${total || "?"} budynków)`}; to nie jest pow. użytkowa`);
    }
    return lines.join(separator);
  }

  function currentUnitPriceLabel() {
    return $("layer")?.value === "dzialki"
      ? (($("land_record_mode")?.value === "built_land")
        ? "Średnia pomocnicza cena/m² (z gruntem)"
        : "Średnia cena/m² gruntu niezabudowanego")
      : "Średnia cena/m²";
  }

  function updateModulePresentation(module) {
    const built = module === "grunt_zabudowany";
    const unbuilt = module === "grunt_niezabudowany";
    const setText = (id, value) => { const element = $(id); if (element) element.textContent = value; };
    setText("priceChartTitle", built ? "Dynamika pomocniczej ceny/m² powierzchni porównawczej" : (unbuilt ? "Dynamika cen gruntu za m² w czasie" : "Dynamika cen/m² w czasie"));
    setText("histChartTitle", built ? "Rozkład pomocniczej ceny/m² powierzchni porównawczej" : (unbuilt ? "Histogram ceny gruntu za m²" : "Histogram ceny/m²"));
    setText("histChartNote", built
      ? "Wskaźnik dzieli cenę całej transakcji (grunt + budynki) przez kompletną powierzchnię użytkową z RCN, jeśli jest dostępna. W przeciwnym razie może użyć szacunku: powierzchnia zabudowy × liczba kondygnacji nadziemnych. Ten szacunek nie jest powierzchnią użytkową. Oś X: zł/m², oś Y: liczba transakcji."
      : (unbuilt ? "Histogram pokazuje rozkład cen gruntu za 1 m². Oś X: przedziały ceny gruntu/m². Oś Y: liczba transakcji." : "Histogram pokazuje, ile transakcji mieści się w kolejnych przedziałach ceny za 1 m². Oś X: przedziały ceny/m². Oś Y: liczba transakcji."));
    setText("transactionsTitle", built ? "Transakcje grunt + budynki" : "Transakcje");
    setText("subjectAreaFieldLabel", built ? "Powierzchnia gruntu analizowanej nieruchomości (m²)" : (unbuilt ? "Powierzchnia działki analizowanej (m²)" : "Powierzchnia analizowana m²"));
    setText("subjectValueFieldLabel", built ? "Cena całej nieruchomości analizowanej" : "Wartość analizowanej nieruchomości");
    setText("similarModuleNote", built
      ? "Dopasowanie powierzchni porównuje sumę powierzchni działek. Cena/m² używa kompletnej pow. użytkowej RCN, a gdy jej brak — szacunku z pow. zabudowy i kondygnacji nadziemnych. Szacunek nie jest pow. użytkową; cena obejmuje grunt."
      : (unbuilt ? "Dopasowanie powierzchni i cena/m² dotyczą powierzchni działki." : ""));
  }

  function firstDefined(...values) {
    for (const v of values) {
      if (v !== undefined && v !== null && v !== "" && Number.isFinite(Number(v))) return Number(v);
    }
    return null;
  }

  let lastParams = "";
  let baseRecords = [];
  let similarMode = false;
  let lastRecords = [];
  let lastDiagnostics = null;
  let activeDatePresetMonths = null;
  // Bufor krótkotrwały: pozwala na zmianę samego zakresu dat (np. 24 -> 12 miesięcy,
  // i z powrotem) bez ponownego pobierania danych z serwera, jeśli wynik dla tego
  // zestawu filtrów (poza datą) już mamy — albo w aktualnie pobranych danych,
  // albo z niedawnego wcześniejszego wyszukiwania.
  let lastFetchDateFrom = null;
  let lastFetchDateTo = null;
  let lastFetchQuery = null;
  let searchResultsCache = [];
  const SEARCH_CACHE_MAX_ENTRIES = 6;
  const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
  let map, markersLayer, radiusLayer, polygonLayer, analysisMarkerLayer, priceChart, histChart;
  let analysisCenter = null;
  let polygonPoints = [];
  let polygonClosed = false;
  let selectedPlace = null;
  let cityChangedManually = false;
  let markerClickInProgress = false;
  let sortState = { key: null, dir: 1 };
  let excludedTransactionKeys = new Set();
  const dayList = [];

  function scheduleVisualRefresh() {
    // Leaflet i Chart.js czasem nie przeliczają szerokości po przełączeniu modułu
    // albo po wielokrotnym odświeżaniu wyników. Kilka odświeżeń w krótkich odstępach
    // usuwa szary pas na mapie i rozjechane proporcje wykresów.
    const refresh = () => {
      try { if (map) map.invalidateSize(true); } catch (e) {}
      try { if (priceChart) priceChart.resize(); } catch (e) {}
      try { if (histChart) histChart.resize(); } catch (e) {}
    };
    later(refresh, 60);
    later(refresh, 320);
    later(refresh, 900);
  }

  function setupResizeObservers() {
    const refresh = () => scheduleVisualRefresh();
    window.addEventListener("resize", refresh, { signal });
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(refresh);
      signal.addEventListener("abort", () => ro.disconnect(), { once: true });
      ["map", "priceChart", "histChart"].forEach(id => {
        const el = $(id);
        if (el) ro.observe(el);
      });
      const main = root.querySelector(".results");
      if (main) ro.observe(main);
    }
  }

  function initDaySlider() {
    const start = new Date(2004, 0, 1);
    const end = new Date();
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    dayList.length = 0;
    const cur = new Date(start);
    while (cur <= end) {
      dayList.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    const max = dayList.length - 1;
    $("date_start_idx").min = 0;
    $("date_start_idx").max = max;
    $("date_start_idx").step = 1;
    $("date_end_idx").min = 0;
    $("date_end_idx").max = max;
    $("date_end_idx").step = 1;
    $("date_start_idx").value = Math.max(0, max - 365 * 6); // domyślnie ok. ostatnie 6 lat
    $("date_end_idx").value = max;
    updateDateRange();
  }

  function dateISO(d) {
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${month}-${day}`;
  }

  function dateLabel(d) {
    return d.toLocaleDateString("pl-PL", { day: "numeric", month: "2-digit", year: "numeric" });
  }

  function parseISODate(value) {
    if (!value) return null;
    const [y, m, d] = value.split("-").map(Number);
    if (!y || !m || !d) return null;
    const dt = new Date(y, m - 1, d);
    dt.setHours(0, 0, 0, 0);
    return dt;
  }

  function findDayIndexForDate(d) {
    if (!dayList.length || !d) return 0;
    const t = d.getTime();
    const start = dayList[0].getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    const idx = Math.round((t - start) / dayMs);
    return Math.max(0, Math.min(dayList.length - 1, idx));
  }

  function applyDatePreset(months) {
    activeDatePresetMonths = months;
    $("last12").checked = months === 12;
    $("last24").checked = months === 24;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const from = new Date(today);
    from.setMonth(from.getMonth() - months);
    const a = findDayIndexForDate(from);
    const b = findDayIndexForDate(today);
    $("date_start_idx").value = a;
    $("date_end_idx").value = b;
    $("date_from").value = dateISO(dayList[a]);
    $("date_to").value = dateISO(dayList[b]);
    $("dateRangeLabel").textContent = `${dateLabel(dayList[a])} → ${dateLabel(dayList[b])}`;
    updateDateRangeTrack(a, b);
  }

  function clearDatePreset() {
    activeDatePresetMonths = null;
    if ($("last12")) $("last12").checked = false;
    if ($("last24")) $("last24").checked = false;
  }

  function updateDateRange() {
    if (activeDatePresetMonths) {
      applyDatePreset(activeDatePresetMonths);
      return;
    }
    let a = Number($("date_start_idx").value);
    let b = Number($("date_end_idx").value);
    if (a > b) [a, b] = [b, a];
    const from = dayList[a];
    const to = dayList[b];
    $("date_from").value = dateISO(from);
    $("date_to").value = dateISO(to);
    $("dateRangeLabel").textContent = `${dateLabel(from)} → ${dateLabel(to)}`;
    updateDateRangeTrack(a, b);
  }

  function updateDateRangeFromInputs() {
    clearDatePreset();
    const from = parseISODate($("date_from").value);
    const to = parseISODate($("date_to").value);
    if (!from || !to) return;
    let a = findDayIndexForDate(from);
    let b = findDayIndexForDate(to);
    if (a > b) [a, b] = [b, a];
    $("date_start_idx").value = a;
    $("date_end_idx").value = b;
    updateDateRange();
  }

  function updateDateRangeTrack(a, b) {
    const max = Number($("date_start_idx").max || 1);
    const left = max ? Math.min(a, b) / max * 100 : 0;
    const right = max ? Math.max(a, b) / max * 100 : 100;
    const el = $("dateRangeControl");
    if (el) {
      el.style.setProperty("--range-left", `${left}%`);
      el.style.setProperty("--range-right", `${right}%`);
    }
  }

  function getAreaMode() {
    const mode = $("area_mode")?.value || "none";
    return ["none", "radius", "polygon"].includes(mode) ? mode : "none";
  }

  function setAreaMode(mode) {
    const safe = ["none", "radius", "polygon"].includes(mode) ? mode : "none";
    if ($("area_mode")) $("area_mode").value = safe;
    if ($("use_radius")) $("use_radius").checked = safe === "radius";
    updateAreaModeUI();
  }

  function updateAreaModeUI() {
    const mode = getAreaMode();
    const radiusControls = $("radiusControls");
    const polygonControls = $("polygonControls");
    if (radiusControls) radiusControls.style.display = mode === "radius" ? "block" : "none";
    if (polygonControls) polygonControls.classList.toggle("hidden", mode !== "polygon");
    if ($("radius_m")) $("radius_m").disabled = mode !== "radius";
    if ($("use_radius")) $("use_radius").checked = mode === "radius";
    if ($("areaModeLabel")) {
      $("areaModeLabel").textContent = mode === "radius"
        ? "promień"
        : mode === "polygon"
          ? (polygonClosed ? `${polygonPoints.length} pkt — zamknięty` : `${polygonPoints.length} pkt`)
          : "bez ograniczenia";
    }
    drawSpatialOverlay();
  }

  function updateRadiusLabel() {
    $("radiusLabel").textContent = `${$("radius_m").value} m`;
  }

  function polygonParam() {
    if (!polygonClosed || polygonPoints.length < 3) return "";
    return polygonPoints.map(p => `${Number(p.lat).toFixed(7)},${Number(p.lon).toFixed(7)}`).join("|");
  }

  function polygonCenter() {
    if (!polygonPoints.length) return null;
    const lat = polygonPoints.reduce((s, p) => s + p.lat, 0) / polygonPoints.length;
    const lon = polygonPoints.reduce((s, p) => s + p.lon, 0) / polygonPoints.length;
    return { lat, lon };
  }

  function isCloseToFirstPolygonPoint(lat, lon) {
    if (polygonPoints.length < 3) return false;
    const first = polygonPoints[0];
    return haversine(lat, lon, first.lat, first.lon) <= 35;
  }

  function closePolygon() {
    polygonClosed = true;
    const center = polygonCenter();
    if (center) analysisCenter = center;
    drawPolygonOverlay();
    scheduleSpatialAutoSearch("Zamknięto dowolny obszar.");
  }


  function isValidPolandPoint(lat, lon) {
    const la = Number(lat), lo = Number(lon);
    return Number.isFinite(la) && Number.isFinite(lo) && la >= 48 && la <= 56.5 && lo >= 13 && lo <= 26.5;
  }

  function pointInPolygon(lat, lon, points) {
    if (!points || points.length < 3) return true;
    const x = Number(lon), y = Number(lat);
    let inside = false;
    let j = points.length - 1;
    for (let i = 0; i < points.length; i++) {
      const xi = Number(points[i].lon), yi = Number(points[i].lat);
      const xj = Number(points[j].lon), yj = Number(points[j].lat);
      const intersect = ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi);
      if (intersect) inside = !inside;
      j = i;
    }
    return inside;
  }

  function applyPolygonFilter(records) {
    if (getAreaMode() !== "polygon" || !polygonClosed || polygonPoints.length < 3) return records;
    return records.filter(r => isValidPolandPoint(r.lat, r.lon) && pointInPolygon(Number(r.lat), Number(r.lon), polygonPoints));
  }

  let polygonShapeLayer = null;

  function drawPolygonOverlay() {
    if (!polygonLayer) return;
    polygonLayer.clearLayers();
    polygonShapeLayer = null;
    if (!polygonPoints.length) {
      if ($("polygonStatus")) $("polygonStatus").textContent = "Klikaj dowolną liczbę punktów na mapie. Obszar zamkniesz, klikając ponownie pierwszy punkt.";
      if ($("areaModeLabel")) $("areaModeLabel").textContent = "0 pkt";
      return;
    }
    const latlngs = polygonPoints.map(p => [p.lat, p.lon]);
    if (polygonClosed && polygonPoints.length >= 3) {
      const areaPoly = L.polygon(latlngs, {
        color: "#7c3aed",
        weight: 3,
        fillColor: "#7c3aed",
        fillOpacity: 0.14,
        interactive: false
      }).addTo(polygonLayer);
      if (areaPoly.bringToBack) areaPoly.bringToBack();
      polygonShapeLayer = areaPoly;
    } else {
      const areaLine = L.polyline(latlngs, { color: "#7c3aed", weight: 3, dashArray: "7 7", interactive: false }).addTo(polygonLayer);
      if (areaLine.bringToBack) areaLine.bringToBack();
      polygonShapeLayer = areaLine;
    }
    polygonPoints.forEach((p, idx) => {
      const isFirst = idx === 0;
      if (polygonClosed && polygonPoints.length >= 3) {
        // Obszar domknięty: punkty stają się przeciągalne, żeby dało się zmienić
        // kształt bez konieczności rysowania od nowa — analogicznie do suwaka promienia.
        const dotStyle = isFirst
          ? "width:18px;height:18px;border-radius:50%;background:#ffffff;border:3px solid #111827;cursor:grab;box-shadow:0 1px 3px rgba(0,0,0,.35);"
          : "width:14px;height:14px;border-radius:50%;background:#ffffff;border:2px solid #7c3aed;cursor:grab;box-shadow:0 1px 3px rgba(0,0,0,.35);";
        const icon = L.divIcon({
          className: "polygon-vertex-icon",
          html: `<div style="${dotStyle}"></div>`,
          iconSize: [isFirst ? 18 : 14, isFirst ? 18 : 14],
          iconAnchor: [isFirst ? 9 : 7, isFirst ? 9 : 7],
        });
        const vertexMarker = L.marker([p.lat, p.lon], { icon, draggable: true }).addTo(polygonLayer);
        vertexMarker.bindTooltip(isFirst ? "1" : String(idx + 1), { permanent: true, direction: "top", offset: [0, -8], className: "polygon-point-label" });
        vertexMarker.on("drag", (ev) => {
          const ll = ev.target.getLatLng();
          polygonPoints[idx] = { lat: ll.lat, lon: ll.lng };
          if (polygonShapeLayer) polygonShapeLayer.setLatLngs(polygonPoints.map(pp => [pp.lat, pp.lon]));
        });
        vertexMarker.on("dragend", () => {
          $("status").textContent = "Zmieniono kształt obszaru — odświeżam wynik...";
          scheduleSpatialAutoSearch("Zmieniono kształt obszaru — odświeżam wynik...");
        });
      } else {
        const firstVertexCanClose = isFirst && polygonPoints.length >= 3;
        const pointMarker = L.circleMarker([p.lat, p.lon], {
          radius: isFirst ? 8 : 6,
          color: isFirst ? "#111827" : "#7c3aed",
          fillColor: "#ffffff",
          fillOpacity: 1,
          weight: isFirst ? 3 : 2,
          className: firstVertexCanClose ? "rcn-polygon-close" : "",
          interactive: firstVertexCanClose,
          bubblingMouseEvents: false,
        }).bindTooltip(isFirst ? "1 / zamknij" : String(idx + 1), { permanent: true, direction: "center", className: "polygon-point-label" }).addTo(polygonLayer);
        if (firstVertexCanClose) pointMarker.on("click", closePolygon);
      }
    });
    if ($("polygonStatus")) {
      if (polygonClosed) {
        $("polygonStatus").textContent = `Obszar zamknięty. Liczba punktów ${polygonPoints.length}. Przeciągnij punkt, aby zmienić kształt.`;
      } else if (polygonPoints.length >= 3) {
        $("polygonStatus").textContent = `Dodano ${polygonPoints.length} pkt. Możesz dodać kolejne albo kliknąć pierwszy punkt, aby zamknąć obszar.`;
      } else {
        $("polygonStatus").textContent = `Dodano ${polygonPoints.length} pkt. Dodaj jeszcze ${3 - polygonPoints.length}, a potem zamknij obszar kliknięciem pierwszego punktu.`;
      }
    }
    if ($("areaModeLabel")) $("areaModeLabel").textContent = polygonClosed ? `${polygonPoints.length} pkt — zamknięty` : `${polygonPoints.length} pkt`;
  }

  function drawSpatialOverlay() {
    if (radiusLayer) radiusLayer.clearLayers();
    if (analysisMarkerLayer) analysisMarkerLayer.clearLayers();
    if (getAreaMode() === "radius" && analysisCenter) drawAnalysisOverlay(analysisCenter);
    if (getAreaMode() === "polygon") drawPolygonOverlay();
  }

  function scheduleSpatialAutoSearch(reason = "Zmieniono obszar analizy.") {
    // Od wersji 5.3.4: żadna zmiana obszaru na mapie (promień, dowolny obszar,
    // klik ustawiający punkt) nie uruchamia już automatycznie nowego zapytania
    // do serwera. Jeśli mamy już dane z ostatniego wyszukiwania (baseRecords),
    // od razu doprecyzowujemy widok lokalnie w przeglądarce (dlatego zmniejszenie
    // promienia wygląda na natychmiastowe — to czysto lokalne przefiltrowanie,
    // bez nowego zapytania). Bez wcześniejszych danych trzeba kliknąć „Szukaj”.
    if (baseRecords.length > 0) {
      refreshFromBaseRecords();
      $("status").textContent = `${reason} Kliknij „Szukaj”, aby pobrać pełne dane dla nowego obszaru z serwera.`;
    } else {
      $("status").textContent = `${reason} Kliknij „Szukaj”, aby pobrać dane.`;
    }
  }


  function applyDateFilter(records) {
    const from = $("date_from")?.value || "";
    const to = $("date_to")?.value || "";
    if (!from && !to) return records;
    return records.filter(r => {
      const d = r?.date || "";
      if (!d) return true;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }

  function queryExcludingDate() {
    const p = new URLSearchParams(makeBaseParams());
    p.delete("date_from");
    p.delete("date_to");
    return p.toString();
  }

  function pruneSearchResultsCache() {
    const now = Date.now();
    searchResultsCache = searchResultsCache.filter(e => now - e.timestamp < SEARCH_CACHE_TTL_MS);
  }

  function scheduleDateRangeChange(reason = "Zmieniono zakres dat.") {
    const newFrom = $("date_from")?.value || "";
    const newTo = $("date_to")?.value || "";
    const key = queryExcludingDate();

    // Dane już pobrane (baseRecords) obejmują żądany zakres — filtrujemy lokalnie,
    // bez żadnego zapytania do serwera.
    if (baseRecords.length > 0 && lastFetchQuery === key &&
        (!lastFetchDateFrom || !newFrom || lastFetchDateFrom <= newFrom) &&
        (!lastFetchDateTo || !newTo || lastFetchDateTo >= newTo)) {
      refreshFromBaseRecords();
      $("status").textContent = `${reason} Przefiltrowano lokalnie (dane już pobrane, bez nowego zapytania do serwera).`;
      return;
    }

    // Mamy to w krótkotrwałej pamięci z niedawnego wcześniejszego wyszukiwania
    // (np. wróciłeś z 12 na 24 miesiące, a 24 miesiące były już wcześniej pobrane).
    pruneSearchResultsCache();
    const cached = searchResultsCache.find(e => e.key === key &&
      (!e.dateFrom || !newFrom || e.dateFrom <= newFrom) &&
      (!e.dateTo || !newTo || e.dateTo >= newTo));
    if (cached) {
      baseRecords = cached.records;
      lastFetchDateFrom = cached.dateFrom;
      lastFetchDateTo = cached.dateTo;
      lastFetchQuery = cached.key;
      lastDiagnostics = cached.diagnostics;
      const minsAgo = Math.round((Date.now() - cached.timestamp) / 60000);
      refreshFromBaseRecords();
      $("status").textContent = `${reason} Przywrócono z pamięci (pobrane ${minsAgo < 1 ? "przed chwilą" : minsAgo + " min temu"}, bez nowego zapytania do serwera).`;
      return;
    }

    // Ten zakres/zestaw filtrów nie był jeszcze pobrany — potrzebne kliknięcie „Szukaj”.
    scheduleFilterAutoSearch(reason);
  }

  function scheduleFilterAutoSearch(reason = "Zmieniono filtr.") {
    // Od wersji 5.2.4 zwykłe filtry nie uruchamiają pobierania automatycznie.
    // Użytkownik ma jasno widzieć, że wynik zmieni się dopiero po kliknięciu „Szukaj”.
    $("status").textContent = `${reason} Kliknij „Szukaj”, aby odświeżyć wynik.`;
  }



  function updateSubjectAreaFilterMode() {
    const mode = $("subject_area_filter_mode")?.value || "tolerance";
    const tol = $("areaToleranceBox");
    const range = $("subjectAreaRangeBox");
    if (tol) tol.classList.toggle("hidden", mode !== "tolerance");
    if (range) range.classList.toggle("hidden", mode !== "range");
  }


  function initMap() {
    // zoomSnap 0.5: dopasowanie do trafień jest ciaśniejsze niż przy skoku co pełny poziom.
    map = L.map($("map"), { zoomSnap: 0.5, zoomDelta: 1 }).setView([52.1, 19.4], 6);
    const osmLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap"
    });

    const satelliteLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19,
      attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
    });

    if (!demo) osmLayer.addTo(map);

    // Własny przełącznik warstwy mapy — zastępuje generyczny L.control.layers
    let activeBaseLayer = osmLayer;
    const baseLayers = [
      {
        id: "osm",
        label: "Mapa",
        layer: osmLayer,
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3V7z"/>
          <path d="M9 4v13M15 7v13"/>
        </svg>`,
      },
      {
        id: "satellite",
        label: "Satelita",
        layer: satelliteLayer,
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="3"/>
          <path d="M6.3 6.3a8 8 0 0 0 0 11.4M17.7 6.3a8 8 0 0 1 0 11.4"/>
          <path d="M3.5 3.5a13.5 13.5 0 0 0 0 17M20.5 3.5a13.5 13.5 0 0 1 0 17"/>
        </svg>`,
      },
    ];

    const layerControl = root.ownerDocument.createElement("div");
    layerControl.className = "rcn-layer-switcher";
    (demo ? [] : baseLayers).forEach(({ label, layer, icon }) => {
      const btn = root.ownerDocument.createElement("button");
      btn.className = "rcn-layer-btn" + (layer === activeBaseLayer ? " active" : "");
      btn.title = label;
      btn.innerHTML = `<span class="rcn-layer-icon">${icon}</span><span class="rcn-layer-label">${label}</span>`;
      btn.addEventListener("click", (e) => {
        L.DomEvent.stopPropagation(e);
        L.DomEvent.preventDefault(e);
        if (layer === activeBaseLayer) return;
        map.removeLayer(activeBaseLayer);
        layer.addTo(map);
        activeBaseLayer = layer;
        layerControl.querySelectorAll(".rcn-layer-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
      });
      layerControl.appendChild(btn);
    });

    const lcContainer = root.ownerDocument.createElement("div");
    lcContainer.className = "leaflet-top leaflet-right";
    lcContainer.style.cssText = "pointer-events: none;";
    const lcWrapper = root.ownerDocument.createElement("div");
    lcWrapper.className = "leaflet-control";
    lcWrapper.style.cssText = "pointer-events: auto; margin-top: 10px; margin-right: 10px;";
    lcWrapper.appendChild(layerControl);
    lcContainer.appendChild(lcWrapper);
    if (!demo) map.getContainer().appendChild(lcContainer);
    // Blokuj propagację kliknięć z kontrolki do mapy — bez tego klik na przycisk
    // warstwy ustawia też punkt analizy na mapie.
    L.DomEvent.disableClickPropagation(lcWrapper);
    L.DomEvent.disableScrollPropagation(lcWrapper);
    markersLayer = L.layerGroup().addTo(map);
    radiusLayer = L.layerGroup().addTo(map);
    polygonLayer = L.layerGroup().addTo(map);
    analysisMarkerLayer = L.layerGroup().addTo(map);
    setupResizeObservers();
    map.on("click", (e) => {
      if (markerClickInProgress) { markerClickInProgress = false; return; }
      const mode = getAreaMode();
      if (mode !== "polygon" && mode !== "radius") return;
      selectedPlace = null;
      cityChangedManually = false;
      if ($("street")) $("street").value = "";
      if (mode === "polygon") {
        const clicked = { lat: e.latlng.lat, lon: e.latlng.lng };
        if (polygonClosed) {
          polygonPoints = [clicked];
          polygonClosed = false;
          analysisCenter = clicked;
          drawPolygonOverlay();
          $("status").textContent = "Rozpoczęto nowy dowolny obszar. Dodawaj punkty i zamknij go kliknięciem pierwszego punktu.";
          reverseGeocodeAnalysisCenter();
          return;
        }
        if (isCloseToFirstPolygonPoint(clicked.lat, clicked.lon)) {
        closePolygon();
          return;
        }
        polygonPoints.push(clicked);
        if (!analysisCenter) {
          analysisCenter = clicked;
          reverseGeocodeAnalysisCenter();
        } else {
          const c = polygonCenter();
          if (c) analysisCenter = c;
        }
        drawPolygonOverlay();
        $("status").textContent = polygonPoints.length >= 3
          ? "Możesz dodać kolejne punkty albo kliknąć pierwszy punkt, aby zamknąć obszar."
          : "Dodaj co najmniej 3 punkty, a potem zamknij obszar kliknięciem pierwszego punktu.";
        return;
      }
      analysisCenter = { lat: e.latlng.lat, lon: e.latlng.lng };
      drawAnalysisOverlay(analysisCenter);
      scheduleSpatialAutoSearch("Ustawiono punkt promienia — odświeżam wynik...");
      reverseGeocodeAnalysisCenter();
    });
  }

  function params() {
    return makeBaseParams();
  }



  function drawAnalysisOverlay(centerObj = null) {
    if (!radiusLayer || !analysisMarkerLayer || getAreaMode() !== "radius") return;
    radiusLayer.clearLayers();
    analysisMarkerLayer.clearLayers();
    const center = centerObj || analysisCenter;
    if (!center) return;
    const latlng = L.latLng(center.lat, center.lon);
    const radius = Number($("radius_m").value || 800);
    L.circle(latlng, {
      radius,
      color: "#f39c12",
      weight: 2.5,
      dashArray: "8 8",
      fillColor: "#f39c12",
      fillOpacity: 0.10,
      interactive: false
    }).addTo(radiusLayer);
    L.marker(latlng).bindPopup("Punkt analizy — promień liczony od tego miejsca").addTo(analysisMarkerLayer);
  }

  async function reverseGeocodeAnalysisCenter() {
    if (!analysisCenter) return;
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${analysisCenter.lat}&lon=${analysisCenter.lon}&zoom=10&addressdetails=1`;
      const r = await fetch(url, { headers: { "Accept": "application/json" } });
      if (!r.ok) return;
      const data = await r.json();
      const a = data.address || {};
      const city = a.city || a.town || a.village || a.municipality || a.county || "";
      if (city && !$('teryt')?.value.trim()) {
        // Miejscowość w aplikacji musi pochodzić z listy podpowiedzi TERYT.
        // Reverse geocoding z mapy jest tylko informacją pomocniczą i nie nadpisuje pola miasta.
        $("status").textContent = `Punkt na mapie leży w pobliżu: ${city}. Wybierz miejscowość z listy podpowiedzi, aby odświeżyć dane.`;
      }
    } catch (e) {
      // Geokodowanie jest pomocnicze; brak odpowiedzi nie blokuje pracy aplikacji.
    }
  }


  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (x) => x * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  function getCenter(records) {
    const pts = records.filter(r => isValidPolandPoint(r.lat, r.lon)).map(r => ({...r, lat: Number(r.lat), lon: Number(r.lon), price_m2: unitPriceValue(r), price: asFiniteNumber(r.price), area: asFiniteNumber(r.area)}));
    if (!pts.length) return null;
    const lat = pts.reduce((s, r) => s + r.lat, 0) / pts.length;
    const lon = pts.reduce((s, r) => s + r.lon, 0) / pts.length;
    return { lat, lon };
  }

  function medianOf(vals) {
    if (!vals.length) return null;
    const a = [...vals].sort((x,y) => x-y);
    const mid = Math.floor(a.length / 2);
    return a.length % 2 ? a[mid] : (a[mid-1] + a[mid]) / 2;
  }


  function stdSample(vals) {
    const clean = vals.filter(v => Number.isFinite(v));
    if (clean.length < 2) return null;
    const avg = clean.reduce((a,b)=>a+b,0) / clean.length;
    const variance = clean.reduce((s,v)=>s + (v - avg) ** 2, 0) / (clean.length - 1);
    return Math.sqrt(variance);
  }

  function getSubjectValue() {
    const el = $("subject_value");
    const v = el ? Number(el.value || 0) : 0;
    return Number.isFinite(v) && v > 0 ? v : null;
  }

  // Filtry zależne od modułu: Lokale → „Funkcja lokalu”; Grunt niezabudowany → „Sposób użytkowania”;
  // Grunt zabudowany → „Rodzaj budynku”. Nieużywane filtry są ukrywane i zerowane, żeby stara
  // wartość nie wpływała po cichu na wyszukiwanie w innym module.
  function setModuleSpecificFilters(module) {
    const show = (id, on) => $(id)?.classList.toggle("hidden-control", !on);
    show("functionWrap", module === "lokale");
    show("landUseWrap", module === "grunt_niezabudowany");
    show("buildingTypeWrap", module === "grunt_zabudowany");
    if (module !== "grunt_niezabudowany" && $("land_use")) $("land_use").value = "";
    if (module !== "grunt_zabudowany" && $("building_type")) $("building_type").value = "";

    // W obu modułach gruntowych dostępne są tylko prawa do gruntu:
    // własność gruntu i użytkowanie wieczyste. Prawa lokalu/budynku nie pasują
    // do analizy gruntu zabudowanego ani niezabudowanego.
    // „Wszystkie” pozostaje i obejmuje oba prawa do gruntu.
    const right = $("right");
    const landModule = module === "grunt_niezabudowany" || module === "grunt_zabudowany";
    if (right) {
      const landRights = new Set(["", "wlasnoscNieruchomosciGruntowej", "uzytkowanieWieczyste"]);
      for (const option of right.options) {
        const restricted = landModule && !landRights.has(option.value);
        option.hidden = restricted;
        option.disabled = restricted;
      }
      if (landModule && right.selectedOptions[0]?.disabled) {
        right.value = "";
      }
    }
  }

  function makeBaseParams() {
    updateDateRange();
    const p = new URLSearchParams();
    for (const id of ["layer", "property_kind", "land_record_mode", "city", "teryt", "street", "market", "right", "function", "date_from", "date_to"]) {
      const el = $(id);
      if (!el) continue;
      const val = el.value.trim();
      if (val !== "") p.set(id, val);
    }
    // Filtry modułów gruntowych wysyłamy tylko w ich module.
    const landMode = $("land_record_mode")?.value || "";
    if ($("layer")?.value === "dzialki") {
      if (landMode === "unbuilt_land" && $("land_use")?.value) p.set("land_use", $("land_use").value);
      if (landMode === "built_land" && $("building_type")?.value) p.set("building_type", $("building_type").value);
    }
    // Pow./Cena od-do to pola współdzielone z modułem Grunty — dla Lokali są ukryte
    // w interfejsie i celowo pomijane (zastąpione modułem "Znajdź podobne").
    if ($("layer")?.value === "dzialki") {
      for (const id of ["area_min", "area_max", "price_min", "price_max"]) {
        const el = $(id);
        if (!el) continue;
        const val = el.value.trim();
        if (val !== "") p.set(id, val);
      }
    }
    // Pola „Nieruchomość analizowana” (powierzchnia/wartość/cena m² analizowanej,
    // tolerancje, wagi podobieństwa) dotyczą wyłącznie „Znajdź podobne” — ogólne
    // wyszukiwanie („Szukaj”) ich celowo nie wysyła i nie jest przez nie ograniczane.
    if (similarMode) {
      for (const id of ["subject_area", "subject_value", "subject_area_filter_mode", "subject_area_min", "subject_area_max", "area_tolerance", "price_m2_min", "price_m2_max", "w_area", "w_location", "w_market"]) {
        const el = $(id);
        if (!el) continue;
        const val = el.value.trim();
        if (val !== "") p.set(id, val);
      }
      p.set("subject_area_filter_mode", $("subject_area_filter_mode")?.value || "all");
    }
    p.set("similar_mode", similarMode ? "true" : "false");
    p.set("only_with_price", "true");
    p.set("exclude_outliers", $("exclude_outliers")?.checked ? "true" : "false");
    const mode = getAreaMode();
    p.set("area_mode", mode);
    const placeCenter = analysisCenter || selectedPlace;
    if (mode === "radius" && placeCenter && isValidPolandPoint(placeCenter.lat, placeCenter.lon) && Number($("radius_m")?.value || 0) > 0) {
      p.set("use_radius", "true");
      p.set("center_lat", String(placeCenter.lat));
      p.set("center_lon", String(placeCenter.lon));
      p.set("radius_m", $("radius_m").value || "5000");
    } else {
      p.set("use_radius", "false");
      if (selectedPlace && isValidPolandPoint(selectedPlace.lat, selectedPlace.lon)) {
        p.set("center_lat", String(selectedPlace.lat));
        p.set("center_lon", String(selectedPlace.lon));
      }
    }
    if (mode === "polygon" && polygonClosed && polygonPoints.length >= 3) {
      p.set("polygon", polygonParam());
      const c = polygonCenter();
      if (c) {
        p.set("center_lat", String(c.lat));
        p.set("center_lon", String(c.lon));
      }
    }
    if ($("gmina_mode")?.checked && $("gmina_gmina")?.value) {
      p.set("area_admin_level", "gmina");
      p.set("gmina", $("gmina_gmina").value);
      p.set("powiat", $("gmina_powiat")?.value || "");
      p.set("voivodeship", $("gmina_voivodeship")?.value || "");
      p.set("gmina_teryt6", $("gmina_gmina").selectedOptions[0]?.dataset.teryt6 || "");
      p.delete("city");
      p.delete("teryt");
    }
    return p.toString();
  }

  function calcClientStats(records) {
    const pricesM2 = records.map(unitPriceValue).filter(v => v != null);
    const priceM2QualityCounts = {};
    records.forEach(r => {
      const value = unitPriceValue(r);
      const q = unitPriceQuality(r) || (value != null ? "policzona" : "brak");
      priceM2QualityCounts[q] = (priceM2QualityCounts[q] || 0) + 1;
    });
    const prices = records.map(r => asFiniteNumber(r.price)).filter(v => v != null);
    const med = medianOf(pricesM2);
    const avg = pricesM2.length ? pricesM2.reduce((a,b)=>a+b,0) / pricesM2.length : null;
    const subjectArea = Number($("subject_area").value || 0);
    const byStreet = new Map();
    records.forEach(r => {
      const value = unitPriceValue(r);
      if (value == null) return;
      const st = r.street || "brak ulicy";
      if (!byStreet.has(st)) byStreet.set(st, []);
      byStreet.get(st).push(value);
    });
    const streets = [...byStreet.entries()].map(([street, vals]) => ({
      street,
      count: vals.length,
      avg_price_m2: vals.reduce((a,b)=>a+b,0) / vals.length,
      median_price_m2: medianOf(vals),
      min_price_m2: Math.min(...vals),
      max_price_m2: Math.max(...vals),
    })).sort((a,b) => b.count - a.count).slice(0, 50);

    const dated = records.map(r => ({...r, price_m2: unitPriceValue(r)})).filter(r => r.date && r.price_m2 != null).sort((a,b) => String(a.date).localeCompare(String(b.date)));
    let trend = null;
    if (dated.length >= 4) {
      const half = Math.floor(dated.length / 2);
      const first = dated.slice(0, half).map(r => r.price_m2);
      const second = dated.slice(half).map(r => r.price_m2);
      const firstAvg = first.reduce((a,b)=>a+b,0) / first.length;
      const secondAvg = second.reduce((a,b)=>a+b,0) / second.length;
      trend = { first_avg_price_m2: firstAvg, second_avg_price_m2: secondAvg, percent: ((secondAvg-firstAvg)/firstAvg)*100, first_from: dated[0].date, first_to: dated[half-1].date, second_from: dated[half].date, second_to: dated[dated.length-1].date };
    }
    const monthlyMap = new Map();
    dated.forEach(r => {
      const m = r.date.slice(0,7);
      if (!monthlyMap.has(m)) monthlyMap.set(m, []);
      monthlyMap.get(m).push(r.price_m2);
    });
    const monthly_series = [...monthlyMap.entries()].sort().map(([month, vals]) => ({
      month, count: vals.length, avg_price_m2: vals.reduce((a,b)=>a+b,0)/vals.length, median_price_m2: medianOf(vals), min_price_m2: Math.min(...vals), max_price_m2: Math.max(...vals)
    }));
    const marketCounts = { pierwotny: 0, wtorny: 0, other: 0 };
    records.forEach(r => {
      if (r.market === "pierwotny") marketCounts.pierwotny++;
      else if (r.market === "wtorny") marketCounts.wtorny++;
      else marketCounts.other++;
    });
    const marketTotal = marketCounts.pierwotny + marketCounts.wtorny + marketCounts.other;
    const market_distribution = {
      pierwotny: marketCounts.pierwotny,
      wtorny: marketCounts.wtorny,
      other: marketCounts.other,
      pierwotny_pct: marketTotal ? marketCounts.pierwotny / marketTotal * 100 : null,
      wtorny_pct: marketTotal ? marketCounts.wtorny / marketTotal * 100 : null,
    };

    const stdPriceM2 = stdSample(pricesM2);
    const avgTransactionValue = prices.length ? prices.reduce((a,b)=>a+b,0) / prices.length : null;
    const isBuiltLandModule = $("layer")?.value === "dzialki" && $("land_record_mode")?.value === "built_land";
    const estimated = !isBuiltLandModule && subjectArea && avg
      ? { method: "avg_price_m2", by_avg: avg * subjectArea, low: avg * 0.8 * subjectArea, high: avg * 1.2 * subjectArea, by_median: med ? med * subjectArea : null }
      : null;
    const subjectValue = getSubjectValue();
    const referenceValue = estimated ? estimated.by_avg : null;
    const subjectDiffToEstimated = (subjectValue != null && referenceValue) ? subjectValue - referenceValue : null;
    const subjectDiffToEstimatedPct = (subjectDiffToEstimated != null && referenceValue) ? subjectDiffToEstimated / referenceValue * 100 : null;

    const areas = records.map(r => asFiniteNumber(r.area)).filter(v => v != null && v > 0);
    const buildingAreas = records
      .filter(r => r.building_area_complete === true)
      .map(r => asFiniteNumber(r.building_area))
      .filter(v => v != null && v > 0);
    const buildingFootprints = records
      .filter(r => asFiniteNumber(r.building_count) > 0 && asFiniteNumber(r.building_footprint_count) === asFiniteNumber(r.building_count))
      .map(r => asFiniteNumber(r.building_footprint_area))
      .filter(v => v != null && v > 0);
    const estimatedBuildingAreas = records
      .filter(r => r.building_estimated_area_complete === true)
      .map(r => asFiniteNumber(r.building_estimated_area))
      .filter(v => v != null && v > 0);
    const usableBasisCount = records.filter(r => r.building_area_basis === "usable" && unitPriceValue(r) != null).length;
    const estimatedBasisCount = records.filter(r => r.building_area_basis === "estimated_footprint_floors" && unitPriceValue(r) != null).length;
    const buildingCounts = records.map(r => asFiniteNumber(r.building_count)).filter(v => v != null && v > 0);
    const medianTransactionValue = medianOf(prices);

    return {
      count: records.length,
      price_m2_count: pricesM2.length,
      price_m2_quality_counts: priceM2QualityCounts,
      avg_price: avgTransactionValue,
      median_transaction_value: medianTransactionValue,
      avg_price_m2: avg,
      median_price_m2: med,
      std_price_m2: stdPriceM2,
      min_price_m2: pricesM2.length ? Math.min(...pricesM2) : null,
      max_price_m2: pricesM2.length ? Math.max(...pricesM2) : null,
      min_area: areas.length ? Math.min(...areas) : null,
      max_area: areas.length ? Math.max(...areas) : null,
      avg_area: areas.length ? areas.reduce((a,b)=>a+b,0) / areas.length : null,
      building_area_count: buildingAreas.length,
      median_building_area: medianOf(buildingAreas),
      avg_building_area: buildingAreas.length ? buildingAreas.reduce((a,b)=>a+b,0) / buildingAreas.length : null,
      building_footprint_count: buildingFootprints.length,
      avg_building_footprint_area: buildingFootprints.length ? buildingFootprints.reduce((a,b)=>a+b,0) / buildingFootprints.length : null,
      building_estimated_area_count: estimatedBuildingAreas.length,
      avg_building_estimated_area: estimatedBuildingAreas.length ? estimatedBuildingAreas.reduce((a,b)=>a+b,0) / estimatedBuildingAreas.length : null,
      usable_basis_count: usableBasisCount,
      estimated_basis_count: estimatedBasisCount,
      avg_building_count: buildingCounts.length ? buildingCounts.reduce((a,b)=>a+b,0) / buildingCounts.length : null,
      streets,
      estimated,
      subject_value: subjectValue,
      avg_transaction_value: avgTransactionValue,
      subject_diff_to_avg_transaction: subjectDiffToEstimated,
      subject_diff_to_avg_transaction_pct: subjectDiffToEstimatedPct,
      trend,
      monthly_series,
      market_distribution,
    };}

  function applyRadiusFilter(records) {
    if (getAreaMode() !== "radius" || !$("use_radius").checked) return records;
    const center = analysisCenter || getCenter(records);
    const radius = Number($("radius_m").value || 0);
    if (!center || !radius) return records;
    return records
      .filter(r => isValidPolandPoint(r.lat, r.lon))
      .map(r => ({ ...r, distance_m: haversine(center.lat, center.lon, Number(r.lat), Number(r.lon)) }))
      .filter(r => Number.isFinite(r.distance_m) && r.distance_m <= radius);
  }

  function removeOutliersIQR(records) {
    const vals = records.map(r => r.price_m2).filter(v => Number.isFinite(v)).sort((a,b) => a-b);
    if (vals.length < 8) return records;
    const q1 = vals[Math.floor(vals.length / 4)];
    const q3 = vals[Math.floor(vals.length * 3 / 4)];
    const iqr = q3 - q1;
    const lo = q1 - 1.5 * iqr;
    const hi = q3 + 1.5 * iqr;
    return records.filter(r => !Number.isFinite(r.price_m2) || (r.price_m2 >= lo && r.price_m2 <= hi));
  }


  function applySubjectAreaFilter(records) {
    const mode = $("subject_area_filter_mode")?.value || "all";
    if (mode === "all") return records;
    if (mode === "range") {
      const amin = Number($("subject_area_min")?.value || NaN);
      const amax = Number($("subject_area_max")?.value || NaN);
      if (!Number.isFinite(amin) && !Number.isFinite(amax)) return records;
      return records.filter(r => {
        const a = Number(r.area);
        if (!Number.isFinite(a)) return false;
        if (Number.isFinite(amin) && a < amin) return false;
        if (Number.isFinite(amax) && a > amax) return false;
        return true;
      });
    }

    const subjectArea = Number($("subject_area")?.value || NaN);
    const tolerance = Number($("area_tolerance")?.value || 20) / 100;
    if (!Number.isFinite(subjectArea) || subjectArea <= 0 || !Number.isFinite(tolerance)) return records;
    const amin = subjectArea * (1 - tolerance);
    const amax = subjectArea * (1 + tolerance);
    return records.filter(r => {
      const a = Number(r.area);
      return Number.isFinite(a) && a >= amin && a <= amax;
    });
  }


  function refreshSubjectAreaFilter() {
    updateSubjectAreaFilterMode();
    if (baseRecords.length) {
      refreshFromBaseRecords();
    } else {
      $("status").textContent = "Zmieniono filtr powierzchni. Kliknij „Szukaj”, aby pobrać transakcje.";
    }
  }


  function activeCandidateRecords() {
    return applySubjectAreaFilter(applyPolygonFilter(applyRadiusFilter(applyDateFilter(baseRecords))));
  }


  function refreshFromBaseRecords() {
    const visibleRecords = activeCandidateRecords();
    lastRecords = visibleRecords.filter(r => !excludedTransactionKeys.has(recordKey(r)));
    lastParams = params();
    const stats = calcClientStats(lastRecords);
    renderStats(stats);
    renderRows(visibleRecords);
    renderStreets(stats.streets || []);
    renderMap(lastRecords, analysisCenter || selectedPlace || getCenter(visibleRecords.length ? visibleRecords : baseRecords));
    renderCharts(lastRecords, stats);
    const d = lastDiagnostics || {};
    const isParquetSource = d.source_mode === "local_parquet" || d.source_mode === "r2_parquet";
    const sourceLabel = d.source_label || (isParquetSource ? "Rejestr Cen Nieruchomości – geoportal.gov.pl" : "WFS Geoportalu");
    const loadedCount = d.pobrano_zrodlo ?? d.pobrano_z_wfs;
    const limitNote = d.wynik_ograniczony_limitem ? ` Kandydatów przed limitem: ${d.kandydaci_przed_limitem}. Limit: ${d.limit_lokalnej_bazy}.` : "";
    const freshnessNote = d.plik_pobrany ? ` Plik danych pobrany: ${d.plik_pobrany}.` : "";
    const diag = loadedCount != null ? `Pobrano z ${sourceLabel}: ${loadedCount}. Po filtrach: ${d.po_filtrach_ogolnych}. Po automatycznym IQR: ${d.po_iqr}.${limitNote}${freshnessNote}` : `Pobrano: ${baseRecords.length}.`;
    $("status").textContent = `${diag} Widoczne w tabeli: ${visibleRecords.length}. Aktywne w analizie: ${lastRecords.length}. Pominięto ręcznie: ${excludedTransactionKeys.size}.`;
    renderAudit(lastDiagnostics, visibleRecords.length, lastRecords.length);
  }


  function renderAudit(diagnostics, baseCount, finalCount) {
    const panel = $("auditPanel");
    const body = $("auditTable")?.querySelector("tbody");
    if (!panel || !body) return;
    if (!diagnostics) {
      panel.style.display = "none";
      return;
    }
    const stages = [...(diagnostics.audit_stages || [])];
    if (baseCount != null) {
      stages.push({ stage: "Po stronie przeglądarki", before: baseCount, after: finalCount, removed: baseCount - finalCount, note: "np. promień lub dowolny obszar na mapie / ręczne wykluczenia" });
    }
    body.innerHTML = stages.map(s => `
      <tr>
        <td>${escapeHtml(s.stage || "")}</td>
        <td>${escapeHtml(s.before ?? "")}</td>
        <td>${escapeHtml(s.after ?? "")}</td>
        <td>${escapeHtml(s.removed ?? "")}</td>
        <td>${escapeHtml(s.note || "")}</td>
      </tr>`).join("");
    const samples = diagnostics.sample_addresses || [];
    const extra = [];
    if (diagnostics.layer) extra.push(`warstwa: ${diagnostics.layer}`);
    if (diagnostics.tryb_dzialek) extra.push(`tryb działek: ${diagnostics.tryb_dzialek}`);
    if (diagnostics.teryt) extra.push(`TERYT: ${diagnostics.teryt}`);
    if (diagnostics.teryt_po_lokalnym != null) extra.push(`po TERYT: ${diagnostics.teryt_po_lokalnym}`);
    if (diagnostics.bbox_aktywny != null) extra.push(`BBOX: ${diagnostics.bbox_aktywny ? "tak" : "nie"}`);
    if (diagnostics.liczba_po_bbox_lokalnym != null) extra.push(`po ograniczeniu lokalnym: ${diagnostics.liczba_po_bbox_lokalnym}`);
    if (diagnostics.plik_pobrany) extra.push(`plik danych pobrany: ${diagnostics.plik_pobrany}`);
    if (diagnostics.dane_aktualne_do) extra.push(`najnowsza transakcja w pliku: ${diagnostics.dane_aktualne_do}`);
    const sampleLabel = (diagnostics.source_mode === "local_parquet" || diagnostics.source_mode === "r2_parquet") ? "Przykładowe adresy z Rejestru Cen Nieruchomości" : "Przykładowe adresy pobrane z WFS Geoportalu";
    const sampleText = samples.length ? `<br><b>${sampleLabel}:</b> ${escapeHtml(samples.slice(0, 12).join("; "))}` : "";
    const rawSamples = diagnostics.raw_field_samples || [];
    const priceSources = diagnostics.price_source_samples || [];
    const priceText = priceSources.length ? `<br><b>Źródła ceny:</b> ${escapeHtml(priceSources.join("; "))}` : "";
    const rawText = rawSamples.length ? `<br><b>Przykładowe surowe pola działek:</b> ${escapeHtml(rawSamples.slice(0, 2).map(x => JSON.stringify(x)).join(" | "))}` : "";
    $("auditSamples").innerHTML = `${extra.length ? `<b>Diagnostyka:</b> ${escapeHtml(extra.join(" · "))}` : ""}${sampleText}${priceText}${rawText}`;
    panel.style.display = "block";
  }

  function renderStats(s) {
    const est = s.estimated;
    const trend = s.trend;
    const md = s.market_distribution || {};
    const marketText = (md.pierwotny != null || md.wtorny != null)
      ? `<div class="market-card-lines"><div>rynek wtórny <b>${md.wtorny || 0}</b> (${fmtPct(md.wtorny_pct).replace("+", "")})</div><div>rynek pierwotny <b>${md.pierwotny || 0}</b> (${fmtPct(md.pierwotny_pct).replace("+", "")})</div>${md.other ? `<div>rynek nieokreślony <b>${md.other}</b> (${fmtPct((md.other / ((md.pierwotny||0)+(md.wtorny||0)+md.other))*100).replace("+", "")})</div>` : ""}</div>`
      : "—";
    const isDzialki = $("layer")?.value === "dzialki";
    const builtLand = isBuiltLandModule();
    const qualityCounts = s.price_m2_quality_counts || {};
    const qualitySummary = Object.entries(qualityCounts).map(([quality,count]) => `${quality}: ${count}`).join("; ");
    let items;
    if (builtLand) {
      items = [
        ["Liczba transakcji", s.count],
        ["Mediana ceny całej transakcji", fmtMoney(s.median_transaction_value)],
        ["Średnia cena całej transakcji", fmtMoney(s.avg_transaction_value)],
        ["Transakcje z policzoną ceną/m²", `${s.price_m2_count} / ${s.count}`],
        [`Mediana ${currentUnitPriceLabel().replace(/^Średnia /, "")}`, fmtMoney(s.median_price_m2)],
        [currentUnitPriceLabel(), fmtMoney(s.avg_price_m2)],
        ["Min pomocnicza cena/m² pow. porównawczej", fmtMoney(s.min_price_m2)],
        ["Max pomocnicza cena/m² pow. porównawczej", fmtMoney(s.max_price_m2)],
        ["Wskaźnik na pow. użytkowej RCN", `${s.usable_basis_count} / ${s.price_m2_count}`],
        ["Wskaźnik na szac. pow. kondygnacji (nie użytkowej)", `${s.estimated_basis_count} / ${s.price_m2_count}`],
        ["Średnia pow. gruntu (suma działek)", fmtArea(s.avg_area)],
        ["Transakcje z kompletną pow. użytkową RCN", `${s.building_area_count} / ${s.count}`],
        ["Średnia pow. użytk. budynków (RCN)", fmtArea(s.avg_building_area)],
        ["Transakcje z pełną pow. zabudowy", `${s.building_footprint_count} / ${s.count}`],
        ["Średnia pow. zabudowy budynków", fmtArea(s.avg_building_footprint_area)],
        ["Transakcje z kompletnym szacunkiem pow. kondygnacji", `${s.building_estimated_area_count} / ${s.count}`],
        ["Średnia szac. pow. kondygnacji (nie użytkowej)", fmtArea(s.avg_building_estimated_area)],
        ["Średnia liczba budynków na transakcję", s.avg_building_count != null ? fmtNum(s.avg_building_count, 1) : "—"],
      ];
    } else {
      items = [
        ["Liczba transakcji", s.count],
        ["Min powierzchnia", fmtArea(s.min_area)],
        ["Max powierzchnia", fmtArea(s.max_area)],
        ["Średnia powierzchnia", fmtArea(s.avg_area)],
        isDzialki
          ? [`<span class="stat-help" title="Mediana jest mniej wrażliwa na skrajne ceny niż średnia — przydatna, gdy w zbiorze mieszają się np. małe działki budowlane i duże grunty rolne.">Mediana cena/m² gruntu</span>`, fmtMoney(s.median_price_m2)]
          : ["Rodzaj rynku", marketText],
        ["Min cena/m²", fmtMoney(s.min_price_m2)],
        ["Max cena/m²", fmtMoney(s.max_price_m2)],
        [currentUnitPriceLabel(), fmtMoney(s.avg_price_m2)],
        [`<span class="stat-help" title="Zakres to średnia cena/m² pomnożona przez powierzchnię analizowanej nieruchomości, ±20%. Dolna granica: średnia × 0,8 × powierzchnia. Górna granica: średnia × 1,2 × powierzchnia. To orientacyjny przedział, nie precyzyjna wycena.">Przedział wartości</span>`, est ? `${fmtMoney(est.low)} – ${fmtMoney(est.high)}` : "—"],
        ["Wartość wg średniej ceny m²", est ? fmtMoney(est.by_avg) : "—"],
        ["Wartość analizowanej nieruchomości", s.subject_value ? fmtMoney(s.subject_value) : "—"],
        ["Odchylenie od wartości wg średniej", s.subject_diff_to_avg_transaction != null ? `${fmtMoney(s.subject_diff_to_avg_transaction)} (${fmtPct(s.subject_diff_to_avg_transaction_pct)})` : "—"],
      ];
    }
    $("stats").innerHTML = items.map(([label, value]) => `<div class="card"><div class="label">${label}</div><div class="value">${value}</div></div>`).join("");
    const details = [];
    if (est && $("layer")?.value !== "dzialki") details.push(`Szacowany zakres wartości wg średniej ceny/m²: ${fmtMoney(est.low)} – ${fmtMoney(est.high)}. Wartość wg średniej: ${fmtMoney(est.by_avg)}.`);
    if (trend && $("layer")?.value !== "dzialki") details.push(`Dynamika liczona jako porównanie średniej ceny/m²: ${trend.first_from}–${trend.first_to} vs ${trend.second_from}–${trend.second_to}.`);
    if (isDzialki) {
      if (builtLand) {
        details.push("Każdy wiersz reprezentuje jedną transakcję grunt + budynki; powierzchnia gruntu jest sumą działek z wyniku wyszukiwania. Cena/m² to pomocnicza relacja ceny całej nieruchomości do łącznej powierzchni użytkowej budynków. Nie jest to wycena samego budynku ani gruntu.");
        details.push(`Wskaźnik liczony jest tylko przy kompletnych powierzchniach wszystkich budynków, bezpiecznej cenie całej nieruchomości i pełnym udziale. Policzone dla ${s.price_m2_count} z ${s.count} transakcji.${qualitySummary ? ` Przyczyny / jakość: ${qualitySummary}.` : ""}`);
      } else {
        details.push("Do analizy ceny m² przyjmowane są grunty niezabudowane z ceną działki albo ceną nieruchomości. Rekordy z ceną całej transakcji są pomocnicze.");
      }
    }
    if (s.subject_diff_to_avg_transaction != null && $("layer")?.value !== "dzialki") details.push(`Wartość wpisana dla analizowanej nieruchomości różni się od wartości wg średniej ceny m² o ${fmtMoney(s.subject_diff_to_avg_transaction)} (${fmtPct(s.subject_diff_to_avg_transaction_pct)}).`);
    $("summaryNote").textContent = details.join(" ");
  }



  const lokalTableColumns = [
    { key: "_exclude", type: "none", label: "Pomiń" },
    { key: "date", type: "text", label: "Data" },
    { key: "address", type: "text", label: "Adres" },
    { key: "unit_number", type: "text", label: "Nr lokalu" },
    { key: "area", type: "number", label: "Pow. m²" },
    { key: "price", type: "number", label: "Cena" },
    { key: "price_m2", type: "number", label: "Cena/m²" },
    { key: "price_m2_quality", type: "text", label: "Uwagi" },
    { key: "market", type: "text", label: "Rynek" },
    { key: "right", type: "text", label: "Prawo" },
    { key: "property_type", type: "text", label: "Rodzaj" },
    { key: "function", type: "text", label: "Funkcja" },
    { key: "rooms", type: "number", label: "Liczba izb" },
    { key: "floor", type: "number", label: "Kondygnacja" },
    { key: "similarity_score", type: "number", label: "Podobieństwo" },
  ];

  const dzialkiTableColumns = [
    { key: "_exclude", type: "none", label: "Pomiń" },
    { key: "date", type: "text", label: "Data" },
    { key: "price", type: "number", label: "Cena nieruchomości (PLN)" },
    { key: "area", type: "number", label: "Pow. gruntu m²" },
    { key: "price_m2", type: "number", label: "Cena/m² gruntu" },
    { key: "analysis_included", type: "text", label: "W analizie" },
    { key: "analysis_note", type: "text", label: "Powód / opis" },
    { key: "price_m2_quality", type: "text", label: "Uwagi do ceny/m²" },
    { key: "address", type: "text", label: "Adres / ID działki" },
    { key: "city", type: "text", label: "Miejscowość" },
    { key: "local_id", type: "text", label: "ID działki" },
    { key: "land_record_type_label", type: "text", label: "Typ rekordu" },
    { key: "transaction_type", type: "text", label: "Rodzaj transakcji" },
    { key: "market", type: "text", label: "Rynek" },
    { key: "property_type", type: "text", label: "Rodzaj nieruchomości" },
    { key: "right", type: "text", label: "Prawo" },
    { key: "function", type: "text", label: "Sposób użytkowania" },
    { key: "price_source", type: "text", label: "Źródło ceny" },
    { key: "area_source", type: "text", label: "Źródło powierzchni" },
  ];

  // Grunt zabudowany: transakcja gruntu połączona z transakcją budynku (po ID transakcji).
  // Cena jest łączna (grunt + budynki), więc zamiast ceny/m² gruntu pokazujemy dane budynków.
  const dzialkiBuiltTableColumns = [
    { key: "_exclude", type: "none", label: "Pomiń" },
    { key: "date", type: "text", label: "Data" },
    { key: "price", type: "number", label: "Cena łączna (grunt + budynki, PLN)" },
    { key: "area", type: "number", label: "Pow. gruntu (suma działek) m²" },
    { key: "parcel_count", type: "number", label: "Liczba działek" },
    { key: "building_count", type: "number", label: "Liczba budynków" },
    { key: "building_types", type: "text", label: "Rodzaje budynków" },
    { key: "building_area", type: "number", label: "Pow. użytk. RCN m²" },
    { key: "building_footprint_area", type: "number", label: "Pow. zabudowy budynków m²" },
    { key: "building_floor_counts", type: "text", label: "Kondygnacje nadziemne (kolejno budynki)" },
    { key: "building_estimated_area", type: "number", label: "Szac. pow. kondygnacji m² (nie użytkowa)" },
    { key: "building_price_m2", type: "number", label: "Cena/m² pow. porównawczej (z gruntem)" },
    { key: "building_area_basis", type: "text", label: "Podstawa ceny/m²" },
    { key: "building_price_m2_quality", type: "text", label: "Uwagi do ceny/m²" },
    { key: "address", type: "text", label: "Adres / ID działki" },
    { key: "city", type: "text", label: "Miejscowość" },
    { key: "local_id", type: "text", label: "ID działki" },
    { key: "transaction_type", type: "text", label: "Rodzaj transakcji" },
    { key: "market", type: "text", label: "Rynek" },
    { key: "right", type: "text", label: "Prawo" },
    { key: "function", type: "text", label: "Sposób użytkowania" },
    { key: "price_source", type: "text", label: "Źródło ceny" },
  ];

  function currentTableColumns() {
    if ($("layer")?.value !== "dzialki") return lokalTableColumns;
    return ($("land_record_mode")?.value === "built_land") ? dzialkiBuiltTableColumns : dzialkiTableColumns;
  }

  function renderTableHeader() {
    const headRow = $("resultsTable")?.querySelector("thead tr");
    if (!headRow) return;
    headRow.innerHTML = currentTableColumns().map(c => `<th>${c.label}</th>`).join("");
  }

  function tableCellValue(r, key) {
    if (key === "_exclude") {
      const rowKey = escapeHtml(recordKey(r));
      const excluded = excludedTransactionKeys.has(recordKey(r));
      return `<input type="checkbox" class="exclude-row" data-key="${rowKey}" ${excluded ? "checked" : ""} title="Pomiń tę transakcję w bieżącej analizie" />`;
    }
    if (key === "area") {
      const title = r.is_built_land && r.parcel_area_complete === false
        ? ` title="Niepełna suma powierzchni działek: ${fmtNum(r.parcel_area_partial_sum)} m²"`
        : (r.area_raw != null ? ` title="Powierzchnia źródłowa: ${fmtNum(r.area_raw, 4)} (${r.area_unit === "ha_przeliczone_na_m2" ? "ha" : "m²"})"` : "");
      return `<span${title}>${fmtNum(r.area)}</span>`;
    }
    if (key === "analysis_included") return r.analysis_included ? "TAK" : "NIE";
    if (key === "building_area") {
      if (r.building_area == null) return "—";
      return `${fmtNum(r.building_area)}${r.building_area_complete ? "" : ` (częściowo, ${escapeHtml(r.building_area_count || 0)}/${escapeHtml(r.building_count || "?")})`}`;
    }
    if (key === "building_footprint_area") {
      if (r.building_footprint_area == null) return "—";
      const complete = Number(r.building_footprint_count) === Number(r.building_count);
      return `${fmtNum(r.building_footprint_area)}${complete ? "" : ` (częściowo, ${escapeHtml(r.building_footprint_count || 0)}/${escapeHtml(r.building_count || "?")})`}`;
    }
    if (key === "building_floor_counts") return escapeHtml(r.building_floor_counts || "—");
    if (key === "building_estimated_area") {
      if (r.building_estimated_area == null) return "—";
      return `${fmtNum(r.building_estimated_area)}${r.building_estimated_area_complete ? "" : ` (częściowo, ${escapeHtml(r.building_estimated_area_count || 0)}/${escapeHtml(r.building_count || "?")})`}`;
    }
    if (key === "building_area_basis") return r.building_area_basis === "usable"
      ? "powierzchnia użytkowa RCN"
      : (r.building_area_basis === "estimated_footprint_floors" ? "szacunek: zabudowa × kondygnacje (nie użytkowa)" : "—");
    if (key === "building_price_m2") return r.building_price_m2 != null ? fmtMoney(r.building_price_m2) : "—";
    if (key === "building_count" || key === "parcel_count") return escapeHtml(r[key] ?? "—");
    if (key === "building_types") return escapeHtml(r.building_types || "—");
    if (key === "price_m2" && (r.is_built_land || r.price_m2 == null)) return "—";
    if (key === "price" || key === "price_m2") return fmtMoney(r[key]);
    if (key === "similarity_score") return r[key] != null ? fmtNum(r[key], 1) + "%" : "—";
    return escapeHtml(r[key]);
  }


  function sortRecords(records) {
    const col = currentTableColumns().find((item) => item.key === sortState.key);
    if (!col) return records;
    return [...records].sort((a, b) => {
      const av = col.type === "number" ? asFiniteNumber(a[col.key]) : a[col.key] || null;
      const bv = col.type === "number" ? asFiniteNumber(b[col.key]) : b[col.key] || null;
      if (av == null || bv == null) return Number(av == null) - Number(bv == null);
      const delta = col.type === "number" ? av - bv
        : String(av).localeCompare(String(bv), "pl", { sensitivity: "base", numeric: true });
      return delta * sortState.dir;
    });
  }

  function setupTableSorting(records) {
    const columns = currentTableColumns();
    $("resultsTable").querySelectorAll("thead th").forEach((th, index) => {
      const column = columns[index];
      if (!column || column.type === "none") return;
      const button = root.ownerDocument.createElement("button");
      const selected = sortState.key === column.key;
      button.type = "button";
      button.className = "sort-button";
      button.textContent = column.label + (selected ? (sortState.dir === 1 ? " ▲" : " ▼") : "");
      th.setAttribute("aria-sort", selected ? (sortState.dir === 1 ? "ascending" : "descending") : "none");
      button.addEventListener("click", () => {
        sortState = { key: column.key, dir: selected ? -sortState.dir : 1 };
        renderRows(records);
        $("resultsTable").querySelectorAll("thead th")[index]?.firstElementChild?.focus();
      });
      th.replaceChildren(button);
    });
  }

  function renderRows(records) {
    const table = $("resultsTable");
    const body = table.querySelector("tbody");
    renderTableHeader();
    const displayRecords = sortRecords(records);
    setupTableSorting(records);
    const cols = currentTableColumns();

    body.innerHTML = displayRecords.map((r, idx) => {
      const key = recordKey(r);
      const excluded = excludedTransactionKeys.has(key);
      return `
      <tr class="result-row ${excluded ? "excluded" : ""}" data-idx="${idx}" data-key="${escapeHtml(key)}" title="Kliknij, aby wyśrodkować mapę na tej transakcji">
        ${cols.map(c => `<td>${tableCellValue(r, c.key)}</td>`).join("")}
      </tr>`;
    }).join("");

    body.querySelectorAll("input.exclude-row").forEach(input => {
      input.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const key = input.dataset.key;
        if (input.checked) excludedTransactionKeys.add(key);
        else excludedTransactionKeys.delete(key);
        refreshFromBaseRecords();
      });
    });
    body.querySelectorAll("tr.result-row").forEach(row => {
      row.addEventListener("click", () => {
        const r = displayRecords[Number(row.dataset.idx)];
        if (r && isValidPolandPoint(r.lat, r.lon) && map) {
          map.setView([r.lat, r.lon], 16);
          if (analysisMarkerLayer) {
            analysisMarkerLayer.clearLayers();
            const unitPopup = r.is_built_land
              ? buildingUnitPriceDescription(r)
              : `${fmtMoney(r.price_m2)}/m²`;
            L.marker([r.lat, r.lon]).addTo(analysisMarkerLayer).bindPopup(`${escapeHtml(r.address || "")}<br>${unitPopup}`).openPopup();
          }
        }
      });
    });
  }


  function focusRecordOnMap(r) {
    if (!r || !map) return;
    if (isValidPolandPoint(r.lat, r.lon)) {
      map.setView([r.lat, r.lon], Math.max(map.getZoom(), 17), { animate: true });
      L.popup()
        .setLatLng([r.lat, r.lon])
        .setContent($("layer")?.value === "dzialki"
          ? (r.is_built_land
            ? `<b>Transakcja grunt + budynki</b><br>Adres: ${escapeHtml(r.address || "—")}<br>Data: ${escapeHtml(r.date || "")}<br>Pow. gruntu (suma działek): ${fmtNum(r.area)} m²<br>${builtLandAreaDetails(r)}<br>Cena łączna: ${fmtMoney(r.price)}<br>${buildingUnitPriceDescription(r)}${r.valuation_note ? `<br><small>${escapeHtml(r.valuation_note)}</small>` : ""}`
            : `<b>Działka / powiązanie</b><br>Adres: ${escapeHtml(r.address || "—")}<br>ID działki: ${escapeHtml(r.local_id || "—")}<br>Typ: ${escapeHtml(r.land_record_type_label || "—")}<br>Data: ${escapeHtml(r.date || "")}<br>Pow.: ${fmtNum(r.area)} m²<br>Cena: ${fmtMoney(r.price)}<br>Cena/m²: ${r.price_m2 == null ? "—" : fmtMoney(r.price_m2)}`)
          : `<b>Transakcja</b><br>Adres: ${escapeHtml(r.address || "—")}<br>Data: ${escapeHtml(r.date || "")}<br>Pow.: ${fmtNum(r.area)} m²<br>Cena użyta: ${fmtMoney(r.price)}<br>Źródło ceny: ${escapeHtml(r.price_source || "—")}<br>Cena/m²: ${r.price_m2 == null ? "—" : fmtMoney(r.price_m2)}<br><small>tran: ${fmtMoney(r.tran_cena_brutto)} | nier: ${fmtMoney(r.nier_cena_brutto)} | lok: ${fmtMoney(r.lok_cena_brutto)}</small>`)
        .openOn(map);
    }
  }

  function renderStreets(streets) {
    const body = $("streetsTable").querySelector("tbody");
    body.innerHTML = streets.map(r => `
      <tr><td>${escapeHtml(r.street)}</td><td>${escapeHtml(r.count)}</td><td>${fmtMoney(r.avg_price_m2)}</td><td>${fmtMoney(r.median_price_m2)}</td><td>${fmtMoney(r.min_price_m2)}</td><td>${fmtMoney(r.max_price_m2)}</td></tr>`).join("");
  }

  function priceColor(value, min, max) {
    if (!Number.isFinite(value) || min == null || max == null || max === min) return "#7c3aed";
    const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
    // gradient blue -> cyan -> yellow -> red
    const stops = [
      [0.00, [37, 99, 235]],
      [0.35, [6, 182, 212]],
      [0.65, [250, 204, 21]],
      [1.00, [220, 38, 38]],
    ];
    let a = stops[0], b = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (t >= stops[i][0] && t <= stops[i+1][0]) { a = stops[i]; b = stops[i+1]; break; }
    }
    const u = (t - a[0]) / Math.max(0.0001, b[0] - a[0]);
    const rgb = a[1].map((v, i) => Math.round(v + (b[1][i] - v) * u));
    return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
  }

  function renderLegend(min, max) {
    const el = $("mapLegend");
    if (min == null || max == null || !Number.isFinite(min) || !Number.isFinite(max)) {
      el.innerHTML = "";
      return;
    }
    const buckets = 5;
    const legendTitle = isBuiltLandModule() ? "Pomocnicza cena/m² (z gruntem)" : currentUnitPriceLabel().replace(/^Średnia /, "");
    let html = `<div class="legend-title">${legendTitle}</div>`;
    for (let i = 0; i < buckets; i++) {
      const lo = min + (max - min) * i / buckets;
      const hi = min + (max - min) * (i + 1) / buckets;
      const color = priceColor((lo + hi) / 2, min, max);
      html += `<div class="legend-row"><span class="legend-swatch" style="background:${color}"></span><span>${fmtNum(lo, 0)}–${fmtNum(hi, 0)} zł</span></div>`;
    }
    el.innerHTML = html;
  }

  function waitForScrollEnd(el, callback, maxWaitMs = 3000) {
    let lastTop = el.getBoundingClientRect().top;
    let stableFrames = 0;
    const start = performance.now();
    function check() {
      const top = el.getBoundingClientRect().top;
      if (Math.abs(top - lastTop) < 1) {
        stableFrames++;
      } else {
        stableFrames = 0;
        lastTop = top;
      }
      // Kilka kolejnych klatek bez zmiany pozycji = przewijanie faktycznie się zakończyło
      // (a nie tylko chwilowo zwolniło) — działa niezależnie od tego, czy przewija się
      // cała strona, czy zagnieżdżony kontener z tabelą.
      if (stableFrames >= 6 || performance.now() - start > maxWaitMs) {
        callback();
        return;
      }
      requestAnimationFrame(check);
    }
    requestAnimationFrame(check);
  }

  function highlightRecordInTable(r) {
    if (!root.getElementById("rcn-row-flash-style")) {
      const style = root.ownerDocument.createElement("style");
      style.id = "rcn-row-flash-style";
      style.textContent = `
        tr.result-row.row-flash { animation: rcnRowFlash 2.2s ease-out; }
        @keyframes rcnRowFlash {
          0% { background-color: #fde68a; }
          75% { background-color: #fde68a; }
          100% { background-color: transparent; }
        }
      `;
      root.appendChild(style);
    }
    const key = recordKey(r);
    const row = root.querySelector(`tr.result-row[data-key="${CSS.escape(key)}"]`);
    if (!row) return;
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    waitForScrollEnd(row, () => {
      row.classList.add("row-flash");
      later(() => row.classList.remove("row-flash"), 2200);
    });
  }

  // ── Dopasowanie mapy do trafień ─────────────────────────────────────────────
  // Mapa ma pokazywać tylko obszar, w którym są transakcje. Dopasowujemy więc nie tylko
  // przybliżenie, ale też SZEROKOŚĆ panelu mapy do kształtu skupiska trafień (wąskie
  // skupisko = węższa mapa, a wolne miejsce dostaje wykres obok). Układ nigdy nie jest
  // szerszy niż dotychczasowe 50/50, a na wąskich ekranach (jedna kolumna) zostaje bez zmian.
  const MAP_HEIGHT_PX = 360;
  const MAP_MIN_WIDTH_PX = 460;
  const MAP_FIT_PADDING_PX = 28;
  const MAP_PANEL_CHROME_PX = 36;   // padding + ramki panelu i mapy
  const MAP_ROW_GAP_PX = 14;
  const MAP_MIN_CHART_PX = 380;
  const MAP_STACK_BREAKPOINT_PX = 1050;
  let lastMapAspect = null;

  function boundsAspect(b) {
    const midLat = (b.getNorth() + b.getSouth()) / 2;
    const dx = Math.abs(b.getEast() - b.getWest()) * Math.cos(midLat * Math.PI / 180);
    const dy = Math.abs(b.getNorth() - b.getSouth());
    if (dx < 1e-6 && dy < 1e-6) return 1.4;               // pojedynczy punkt
    return Math.min(4, Math.max(0.25, dx / Math.max(dy, 1e-9)));
  }

  function mapPanelWidthFor(aspect, rowWidth) {
    const wanted = Math.round(MAP_HEIGHT_PX * aspect + 2 * MAP_FIT_PADDING_PX) + MAP_PANEL_CHROME_PX;
    const minW = MAP_MIN_WIDTH_PX + MAP_PANEL_CHROME_PX;
    const maxForChart = Math.max(minW, rowWidth - MAP_ROW_GAP_PX - MAP_MIN_CHART_PX);   // wykres zawsze ma miejsce
    const half = Math.floor((rowWidth - MAP_ROW_GAP_PX) / 2);                           // dotychczasowy układ 50/50
    return Math.max(minW, Math.min(wanted, maxForChart, Math.max(half, minW)));
  }

  function applyMapColumns(aspect) {
    const mapEl = $("map");
    const row = mapEl ? mapEl.closest(".grid2") : null;
    if (!row) return;
    const stacked = window.matchMedia(`(max-width: ${MAP_STACK_BREAKPOINT_PX}px)`).matches;
    if (aspect == null || stacked) { row.style.gridTemplateColumns = ""; return; }
    const width = mapPanelWidthFor(aspect, row.clientWidth);
    row.style.gridTemplateColumns = `${width}px minmax(0, 1fr)`;
  }

  function fitMapToHits(bounds) {
    if (!map || !bounds || !bounds.isValid()) return;
    lastMapAspect = boundsAspect(bounds);
    applyMapColumns(lastMapAspect);
    try { map.invalidateSize({ animate: false, pan: false }); } catch (e) {}
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    if (sw.equals(ne)) { map.setView(sw, 17, { animate: false }); return; }
    map.fitBounds(bounds, { padding: [MAP_FIT_PADDING_PX, MAP_FIT_PADDING_PX], maxZoom: 18, animate: false });
  }

  let mapResizeTimer = null;
  window.addEventListener("resize", () => {
    cancelLater(mapResizeTimer);
    mapResizeTimer = later(() => {
      applyMapColumns(lastMapAspect);
      try { if (map) map.invalidateSize(true); } catch (e) {}
      try { if (priceChart) priceChart.resize(); } catch (e) {}
    }, 150);
  }, { signal });

  function renderMap(records, centerForCircle = null) {
    if (!markersLayer || !radiusLayer) return;
    try { if (map) map.invalidateSize(true); } catch (e) {}
    markersLayer.clearLayers();
    radiusLayer.clearLayers();
    if (analysisMarkerLayer) analysisMarkerLayer.clearLayers();
    const pts = records.filter(r => isValidPolandPoint(r.lat, r.lon)).map(r => ({...r, lat: Number(r.lat), lon: Number(r.lon), price_m2: unitPriceValue(r), price: asFiniteNumber(r.price), area: asFiniteNumber(r.area)}));
    const visible = pts.slice(0, 1500);
    const prices = visible.map(r => r.price_m2).filter(v => Number.isFinite(v));
    const min = prices.length ? Math.min(...prices) : null;
    const max = prices.length ? Math.max(...prices) : null;
    $("rcn-map-count").textContent = records.length
      ? `W analizie ${records.length} · z lokalizacją ${pts.length} · na mapie ${visible.length}${pts.length > visible.length ? " (limit 1500)" : ""}`
      : "";
    renderLegend(min, max);

    // Własny tooltip przy kursorze — nie używa Leaflet popup, więc nie jest obcinany przez mapę
    let tooltip = root.getElementById("rcn-map-tooltip");
    if (!tooltip) {
      tooltip = root.ownerDocument.createElement("div");
      tooltip.id = "rcn-map-tooltip";
      tooltip.className = "rcn-tooltip";
      tooltip.style.display = "none";
      root.appendChild(tooltip);
    }

    function showTooltip(e, html) {
      tooltip.innerHTML = html;
      tooltip.style.display = "block";
      moveTooltip(e);
    }
    function moveTooltip(e) {
      const x = e.originalEvent ? e.originalEvent.clientX : e.clientX;
      const y = e.originalEvent ? e.originalEvent.clientY : e.clientY;
      const tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
      const vw = window.innerWidth, vh = window.innerHeight;
      let left = x + 14, top = y - 10;
      if (left + tw > vw - 8) left = x - tw - 14;
      if (top + th > vh - 8) top = vh - th - 8;
      tooltip.style.left = left + "px";
      tooltip.style.top = top + "px";
    }
    function hideTooltip() { tooltip.style.display = "none"; }

    hideTooltip();
    visible.forEach(r => {
      const color = priceColor(r.price_m2, min, max);
      const isGrunt = r.layer === "dzialki";
      const areaLabel = isGrunt ? (r.is_built_land ? "Pow. gruntu (suma działek)" : "Pow. gruntu") : "Pow. użytkowa";
      const builtPrice = unitPriceValue(r);
      const builtQuality = unitPriceQuality(r);
      const builtInfo = r.is_built_land
        ? `Działki: ${escapeHtml(r.parcel_count != null ? r.parcel_count : "brak danych")}; budynki: ${escapeHtml(r.building_count != null ? r.building_count : "brak danych")}${escapeHtml(r.building_types ? " (" + r.building_types + ")" : "")}<br>${builtLandAreaDetails(r)}`
        : "";
      const priceM2Label = r.is_built_land
        ? `${builtPrice != null ? buildingUnitPriceDescription(r) : `Cena/m² nieobliczona: ${escapeHtml(builtQuality || "brak kompletnych danych")}`}<br>${builtInfo}`
        : (isGrunt ? `Cena/m² gruntu: ${fmtMoney(r.price_m2)}` : `Cena/m²: ${fmtMoney(r.price_m2)}`);
      const note = r.valuation_note ? `<br>Uwaga: ${escapeHtml(r.valuation_note)}` : "";
      const html = `<b>Transakcja</b><br>Adres: ${escapeHtml(r.address || "—")}<br>Data: ${escapeHtml(r.date || "")}<br>${areaLabel}: ${fmtNum(r.area)} m²<br>Cena: ${fmtMoney(r.price)}<br>Źródło ceny: ${escapeHtml(r.price_source || "—")}<br>${priceM2Label}<br>Rynek: ${escapeHtml(r.market || "")}${note}`;
      if (r.geometry && r.geometry.type === "Polygon" && r.geometry.coordinates?.length) {
        const latlngs = r.geometry.coordinates.map(ring => ring.map(pt => [pt[1], pt[0]]));
        const poly = L.polygon(latlngs, { color, fillColor: color, fillOpacity: 0.28, weight: 2 }).addTo(markersLayer);
        poly.on("mouseover", (e) => { markerClickInProgress = true; showTooltip(e, html); });
        poly.on("mousemove", moveTooltip);
        poly.on("mouseout", () => { markerClickInProgress = false; hideTooltip(); });
        poly.on("click", (e) => { markerClickInProgress = false; L.DomEvent.stopPropagation(e); hideTooltip(); highlightRecordInTable(r); focusRecordOnMap(r); });
      } else {
        const marker = L.circleMarker([r.lat, r.lon], { radius: 6, color, fillColor: color, fillOpacity: 0.78, weight: 1.5 }).addTo(markersLayer);
        marker.on("mouseover", (e) => { markerClickInProgress = true; showTooltip(e, html); });
        marker.on("mousemove", moveTooltip);
        marker.on("mouseout", () => { markerClickInProgress = false; hideTooltip(); });
        marker.on("click", (e) => { markerClickInProgress = false; L.DomEvent.stopPropagation(e); hideTooltip(); highlightRecordInTable(r); focusRecordOnMap(r); });
      }
    });

    drawSpatialOverlay();
    if (markersLayer && markersLayer.bringToFront) markersLayer.bringToFront();
    if (pts.length) {
      // Bounds liczymy z tych samych punktów, które faktycznie rysujemy (pierwsze 1500) —
      // inaczej niewidoczne na mapie rekordy rozciągałyby widok na puste obszary.
      const bounds = L.latLngBounds(visible.map(r => [r.lat, r.lon]));
      const centerObj = centerForCircle || getCenter(pts);
      const center = centerObj ? L.latLng(centerObj.lat, centerObj.lon) : bounds.getCenter();
      if (getAreaMode() === "radius" && $("use_radius").checked && !analysisCenter) {
        const radius = Number($("radius_m").value || 800);
        L.circle(center, {
          radius,
          color: "#f39c12",
          weight: 2.5,
          dashArray: "8 8",
          fillColor: "#f39c12",
          fillOpacity: 0.10,
          interactive: false
        }).addTo(radiusLayer);
      }
      try {
        // Zawsze dopasowanie do TRAFIEŃ (także przy promieniu / obszarze): mapa nie pokazuje
        // pustych fragmentów, w których nie ma żadnej transakcji.
        fitMapToHits(bounds);
      } catch (e) {
        console.warn("Nie udało się dopasować mapy:", e);
      }
    } else if (centerForCircle && isValidPolandPoint(centerForCircle.lat, centerForCircle.lon) && map) {
      // Gdy wyszukiwanie nie zwróci punktów, mapa nadal ma pokazać wybraną miejscowość,
      // a nie zostać w poprzednim miejscu.
      lastMapAspect = null;
      applyMapColumns(null);
      map.setView([Number(centerForCircle.lat), Number(centerForCircle.lon)], Math.max(map.getZoom(), 13));
    } else {
      lastMapAspect = null;
      applyMapColumns(null);
    }
    scheduleVisualRefresh();
  }

  function buildMonthlySeriesFromRecords(records) {
    const groups = {};
    records.forEach(r => {
      const price = unitPriceValue(r);
      if (!r.date || !Number.isFinite(price)) return;
      const m = String(r.date).slice(0, 7);
      if (!groups[m]) groups[m] = [];
      groups[m].push(price);
    });
    return Object.keys(groups).sort().map(month => {
      const vals = groups[month].sort((a,b)=>a-b);
      const avg = vals.reduce((a,b)=>a+b,0) / vals.length;
      const mid = Math.floor(vals.length / 2);
      const med = vals.length % 2 ? vals[mid] : (vals[mid-1] + vals[mid]) / 2;
      return { month, avg_price_m2: avg, median_price_m2: med };
    });
  }

  function renderCharts(records, stats) {
    let monthly = (stats.monthly_series || []).filter(r => Number.isFinite(Number(r.avg_price_m2)) || Number.isFinite(Number(r.median_price_m2)));
    if (!monthly.length && records.length) monthly = buildMonthlySeriesFromRecords(records);
    const labels = monthly.map(r => r.month);
    const avgValues = monthly.map(r => asFiniteNumber(r.avg_price_m2));
    const medValues = monthly.map(r => asFiniteNumber(r.median_price_m2));
    if (priceChart) priceChart.destroy();

    const priceCanvas = $("priceChart");
    const emptyTrend = !labels.length || (!avgValues.some(v => v != null) && !medValues.some(v => v != null));
    priceChart = new Chart(priceCanvas, {
      type: "line",
      data: {
        labels: labels.length ? labels : ["brak danych"],
        datasets: [
          { label: "Średnia", data: avgValues.length ? avgValues : [null], tension: 0.25, pointRadius: 3 },
          { label: "Mediana", data: medValues.length ? medValues : [null], tension: 0.25, pointRadius: 3 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtMoney(ctx.raw)}` } },
          title: { display: emptyTrend, text: "Brak danych do wykresu dynamiki" }
        },
        scales: {
          x: { title: { display: true, text: "Data transakcji (miesiąc)" }, ticks: { maxTicksLimit: 10 } },
          y: { title: { display: true, text: "zł/m²" }, ticks: { callback: (v) => fmtNum(v, 0) }, beginAtZero: false }
        }
      }
    });

    const nums = records.map(unitPriceValue).filter(v => v != null).map(Math.round);
    const buckets = [];
    if (nums.length) {
      const min = Math.min(...nums), max = Math.max(...nums);
      const step = Math.max(1, Math.ceil((max - min) / 10));
      for (let i = 0; i < 10; i++) buckets.push({ label: `${fmtNum(min + i * step, 0)}–${fmtNum(min + (i + 1) * step, 0)}`, count: 0 });
      nums.forEach(v => { const idx = Math.min(9, Math.floor((v - min) / step)); buckets[idx].count++; });
    }
    if (histChart) histChart.destroy();
    histChart = new Chart($("histChart"), {
      type: "bar",
      data: { labels: buckets.map(b => b.label), datasets: [{ label: "Liczba transakcji", data: buckets.map(b => b.count) }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { title: { display: true, text: "Przedział ceny (zł/m²)" }, ticks: { maxRotation: 45, minRotation: 45 } },
          y: { title: { display: true, text: "Liczba transakcji" }, beginAtZero: true }
        }
      }
    });
    scheduleVisualRefresh();
  }

  function refreshCalculatedOnly() {
    if (baseRecords.length) refreshFromBaseRecords();
  }


  let citySuggestTimer = null;

  function hideCitySuggestions() {
    const box = $("city_suggestions");
    if (box) box.classList.add("hidden");
  }

  function clearMapAnalysisContext() {
    analysisCenter = null;
    polygonPoints = [];
    polygonClosed = false;
    if (analysisMarkerLayer) analysisMarkerLayer.clearLayers();
    if (radiusLayer) radiusLayer.clearLayers();
    if (polygonLayer) polygonLayer.clearLayers();
    if ($("use_radius")) $("use_radius").checked = false;
    if ($("area_mode")) $("area_mode").value = "none";
    if ($("radius_m")) $("radius_m").disabled = true;
    updateAreaModeUI();
  }

  function enableSimpleDzialkiRadius(place) {
    if (!place || !isValidPolandPoint(place.lat, place.lon)) return false;
    if ($("layer")?.value !== "dzialki") return false;
    analysisCenter = { lat: Number(place.lat), lon: Number(place.lon) };
    if ($("radius_m")) {
      const current = Number($("radius_m").value || 0);
      if (!Number.isFinite(current) || current < 3000) $("radius_m").value = "5000";
    }
    setAreaMode("radius");
    if ($("use_radius")) $("use_radius").checked = true;
    updateRadiusLabel();
    drawAnalysisOverlay(analysisCenter);
    if (map) map.setView([analysisCenter.lat, analysisCenter.lon], Math.max(map.getZoom() || 0, 13));
    return true;
  }

  async function ensureLokalePlaceCenter() {
    if ($("layer")?.value === "dzialki") return;
    const mode = getAreaMode();
    if ((mode === "radius" && analysisCenter) || (mode === "polygon" && polygonClosed && polygonPoints.length >= 3)) {
      // Przy aktywnym obszarze nie przestawiamy mapy z powrotem na miejscowość.
      return;
    }
    const city = $("city")?.value.trim() || "";
    if (!city) return;
    if (selectedPlace && isValidPolandPoint(selectedPlace.lat, selectedPlace.lon)) {
      if (map) {
        map.setView([Number(selectedPlace.lat), Number(selectedPlace.lon)], Math.max(map.getZoom() || 0, 12));
        scheduleVisualRefresh();
      }
      return;
    }
    try {
      const url = `/api/geocode?city=${encodeURIComponent(city)}${$("teryt")?.value ? `&teryt=${encodeURIComponent($("teryt").value)}` : ""}`;
      const res = await fetch(url);
      const place = await res.json();
      if (place && isValidPolandPoint(place.lat, place.lon)) {
        selectedPlace = {
          city: place.city || city,
          gmina: place.gmina || $("gmina")?.value || "",
          powiat: place.powiat || $("powiat")?.value || "",
          voivodeship: place.voivodeship || $("voivodeship")?.value || "",
          teryt: place.teryt || $("teryt")?.value || "",
          lat: Number(place.lat),
          lon: Number(place.lon),
          source: place.source || "geocode"
        };
        if (selectedPlace.teryt && $("teryt")) $("teryt").value = selectedPlace.teryt;
        if (map) {
          map.setView([selectedPlace.lat, selectedPlace.lon], Math.max(map.getZoom() || 0, 12));
          scheduleVisualRefresh();
        }
      }
    } catch (e) {
      // Brak centrowania nie blokuje wyszukiwania — backend też spróbuje ustalić BBOX miejscowości.
    }
  }

  async function ensureDzialkiPlaceCenter() {
    if ($("layer")?.value !== "dzialki") return;
    if (analysisCenter && isValidPolandPoint(analysisCenter.lat, analysisCenter.lon)) return;
    if (selectedPlace && enableSimpleDzialkiRadius(selectedPlace)) return;
    const city = $("city")?.value.trim() || "";
    if (!city) return;
    try {
      const url = `/api/geocode?city=${encodeURIComponent(city)}${$("teryt")?.value ? `&teryt=${encodeURIComponent($("teryt").value)}` : ""}`;
      const res = await fetch(url);
      const place = await res.json();
      if (place && isValidPolandPoint(place.lat, place.lon)) {
        selectedPlace = {
          city: place.city || city,
          gmina: place.gmina || $("gmina")?.value || "",
          powiat: place.powiat || $("powiat")?.value || "",
          voivodeship: place.voivodeship || $("voivodeship")?.value || "",
          teryt: place.teryt || $("teryt")?.value || "",
          lat: Number(place.lat),
          lon: Number(place.lon),
          source: place.source || "geocode"
        };
        if (selectedPlace.teryt && $("teryt")) $("teryt").value = selectedPlace.teryt;
        enableSimpleDzialkiRadius(selectedPlace);
      }
    } catch (e) {
      // brak geokodowania nie blokuje wyszukiwania, ale wtedy backend nie ma punktu promienia
    }
  }


  async function resolvePlaceCoordinates(place) {
    const out = { ...(place || {}) };
    const isLokale = $("layer")?.value === "lokale";
    // Dla lokali zawsze odpytujemy backend o najlepszy punkt miejscowości.
    // Część podpowiedzi TERYT ma kod/nazwę, ale bez dobrego punktu dla mapy.
    // Backend potrafi wtedy wyznaczyć centrum z rzeczywistych punktów RCN.
    if (!isLokale && isValidPolandPoint(out.lat, out.lon) && out.bbox4326) return out;
    const q = new URLSearchParams();
    if (out.city) q.set("city", out.city);
    if (out.gmina) q.set("gmina", out.gmina);
    if (out.powiat) q.set("powiat", out.powiat);
    if (out.voivodeship) q.set("voivodeship", out.voivodeship);
    if (out.teryt) q.set("teryt", out.teryt);
    if (!q.get("city")) return out;
    try {
      const res = await fetch(`/api/geocode?${q.toString()}`);
      const data = await res.json();
      if (data && !data.detail) {
        for (const k of ["city", "gmina", "powiat", "voivodeship", "teryt", "lat", "lon", "bbox4326", "source", "records_for_center"]) {
          if (data[k] !== undefined && data[k] !== null && data[k] !== "") out[k] = data[k];
        }
      }
    } catch (e) {
      // Brak koordynat nie blokuje wyszukiwania. Backend i tak spróbuje użyć TERYT/ID lokalu.
    }
    return out;
  }

  async function fetchCitySuggestions(q) {
    const box = $("city_suggestions");
    if (!box) return;
    if (!q || q.trim().length < 3) {
      box.innerHTML = "";
      box.classList.add("hidden");
      return;
    }
    try {
      const res = await fetch(`/api/place_suggest?q=${encodeURIComponent(q.trim())}`);
      const items = await res.json();
      if (!Array.isArray(items) || !items.length) {
        box.innerHTML = `<div class="suggestion-item"><div class="suggestion-meta">Brak podpowiedzi</div></div>`;
        box.classList.remove("hidden");
        return;
      }
      box.innerHTML = items.map((it, idx) => {
        const meta = [it.voivodeship, it.powiat, it.gmina, it.teryt ? `TERYT ${it.teryt}` : ""].filter(Boolean).join(" • ");
        return `<div class="suggestion-item" data-idx="${idx}">
          <div class="suggestion-title">${escapeHtml(it.city)}</div>
          <div class="suggestion-meta">${escapeHtml(meta || it.display_name || "")}</div>
        </div>`;
      }).join("");
      box.classList.remove("hidden");
      box.querySelectorAll(".suggestion-item[data-idx]").forEach(el => {
        el.addEventListener("click", async () => {
          const raw = items[Number(el.dataset.idx)];
          cityChangedManually = false;
          $("city").value = raw.city || "";
          if ($("teryt")) $("teryt").value = raw.teryt || "";
          if ($("voivodeship") && raw.voivodeship) $("voivodeship").value = raw.voivodeship;
          if ($("powiat") && raw.powiat) $("powiat").value = raw.powiat;
          if ($("gmina") && raw.gmina) $("gmina").value = raw.gmina;
          if ($("street")) $("street").value = "";
          clearMapAnalysisContext();

          const it = await resolvePlaceCoordinates(raw);
          selectedPlace = it;
          if (it.teryt && $("teryt")) $("teryt").value = it.teryt || "";
          if (it.voivodeship && $("voivodeship")) $("voivodeship").value = it.voivodeship;
          if (it.powiat && $("powiat")) $("powiat").value = it.powiat;
          if (it.gmina && $("gmina")) $("gmina").value = it.gmina;

          enableSimpleDzialkiRadius(it);
          if (isValidPolandPoint(it.lat, it.lon) && map) {
            map.setView([Number(it.lat), Number(it.lon)], 13);
            scheduleVisualRefresh();
          }
          hideCitySuggestions();
          const radiusNote = ($("layer")?.value === "dzialki") ? " W module Działki ustawiono prosty tryb: punkt miejscowości + promień." : "";
          const centerNote = isValidPolandPoint(it.lat, it.lon) ? " Mapa została ustawiona na miejscowość." : "";
          $("status").textContent = `Wybrano miejscowość: ${it.city || raw.city}${it.voivodeship ? " — " + it.voivodeship : ""}.${centerNote}${radiusNote} Kliknij „Szukaj”, aby odświeżyć wynik.`;
        });
      });
    } catch (e) {
      box.innerHTML = "";
      box.classList.add("hidden");
    }
  }

  function setupCitySuggestions() {
    const city = $("city");
    if (!city) return;
    city.addEventListener("input", () => {
      cityChangedManually = true;
      selectedPlace = null;
      if ($("teryt")) $("teryt").value = "";
      cancelLater(citySuggestTimer);
      citySuggestTimer = later(() => fetchCitySuggestions(city.value), 350);
    });
    city.addEventListener("blur", () => later(() => {
      hideCitySuggestions();
      if (city.value.trim() && !$('teryt').value.trim()) {
        $("status").textContent = "Możesz wybrać miejscowość z listy podpowiedzi. Jeśli jej nie wybierzesz, aplikacja spróbuje ustalić miejscowość automatycznie przy wyszukiwaniu.";
      }
    }, 180));
  }

  async function fillAdministrativeFromCity() {
    const city = $("city").value.trim();
    if (!city) return;
    try {
      const res = await fetch(`/api/geocode?city=${encodeURIComponent(city)}${$("teryt")?.value ? `&teryt=${encodeURIComponent($("teryt").value)}` : ""}`);
      const data = await res.json();
      if (data.teryt && $("teryt")) $("teryt").value = data.teryt;
      if (data.voivodeship && !$("voivodeship").value) $("voivodeship").value = data.voivodeship.toLowerCase();
      if (data.powiat && !$("powiat").value) $("powiat").value = data.powiat.replace(/^powiat\s+/i, "");
      if (data.gmina && !$("gmina").value) $("gmina").value = data.gmina.replace(/^gmina\s+/i, "");
    } catch (e) { /* brak autouzupełniania nie blokuje wyszukiwania */ }
  }


  function normalizeRecord(r) {
    const numericFields = ["price_m2", "land_price_m2_aux", "price", "area", "lat", "lon", "distance_m", "similarity_score", "tran_cena_brutto", "nier_cena_brutto", "lok_cena_brutto"];
    const out = { ...r };
    numericFields.forEach(k => {
      if (out[k] !== undefined && out[k] !== null && out[k] !== "") {
        const n = Number(out[k]);
        if (Number.isFinite(n)) out[k] = n;
      }
    });
    return out;
  }

  let currentSearch = null;
  let waitTimer = null;

  function setSearchWaiting(waiting) {
    const wait = $("rcn-wait");
    cancelLater(waitTimer);
    wait.hidden = !waiting;
    $("searchBtn").disabled = waiting;
    $("similarBtn").disabled = waiting;
    if (!waiting) return;
    const started = Date.now();
    const tick = () => {
      wait.textContent = "Oczekiwanie na dane RCN — " + Math.floor((Date.now() - started) / 1000) + " s";
      waitTimer = later(tick, 1000);
    };
    tick();
  }

  function stopSearch() {
    currentSearch?.abort();
    currentSearch = null;
    setSearchWaiting(false);
  }

  async function search() {
    if (currentSearch || signal.aborted) return;
    if (!$("city").value.trim() && !($("gmina_mode").checked && $("gmina_gmina").value)
        && !(getAreaMode() === "radius" && analysisCenter)
        && !(getAreaMode() === "polygon" && polygonClosed)) {
      $("status").textContent = "Wybierz miejscowość, całą gminę lub gotowy obszar na mapie.";
      return;
    }
    const request = new AbortController();
    currentSearch = request;
    setSearchWaiting(true);
    try {
      // Jeżeli użytkownik ręcznie zmienił miejscowość, najpierw usuwamy poprzedni punkt/promień.
      // Dzięki temu nowe wyszukiwanie nie korzysta przypadkowo ze starego obszaru.
      if (cityChangedManually) {
        clearMapAnalysisContext();
        cityChangedManually = false;
      }
      if ($("layer")?.value === "dzialki") {
        await ensureDzialkiPlaceCenter();
      } else {
        await ensureLokalePlaceCenter();
      }
      if (signal.aborted || request !== currentSearch) return;
      // Przy nowym wyszukiwaniu czyścimy stare wyniki, aby eksport nie pokazał poprzedniej miejscowości.
      baseRecords = [];
      lastRecords = [];
      excludedTransactionKeys.clear();
      renderRows([]);
      renderMap([]);
      renderStats({ count: 0, price_m2_count: 0, price_m2_quality_counts: {}, market_distribution: {} });
      renderAudit(null);
      $("summaryNote").textContent = "";
      lastParams = params();
      const activeCity = $("city").value.trim();
      const activeStreet = $("street").value.trim();
      const activeModule = $("layer").value === "dzialki" ? landModeLabel() : "lokale";
      const activeTeryt = $("teryt")?.value || "";
      $("status").textContent = `Odświeżam dane RCN — moduł: ${activeModule}${activeCity ? ", miasto: " + activeCity : ""}${activeStreet ? ", ulica/obręb: " + activeStreet : ""}${activeTeryt ? ", TERYT: " + activeTeryt : ""}...`;
      const requestedQuery = queryExcludingDate();
      const res = await fetch(`/api/search?${lastParams}`, { signal: request.signal });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); }
      catch { throw new Error("Serwer zwrócił nieczytelną odpowiedź."); }
      if (signal.aborted || request !== currentSearch) return;
      if (!res.ok) throw new Error(formatApiError(data?.detail));
      if (!Array.isArray(data?.records)) throw new Error("W odpowiedzi zabrakło listy transakcji.");
      if (requestedQuery !== queryExcludingDate()) {
        $("status").textContent = "Filtry zmieniły się podczas pobierania. Kliknij „Szukaj”, aby pobrać właściwe dane.";
        return;
      }
      baseRecords = data.records.map(normalizeRecord);
      excludedTransactionKeys.clear();
      lastDiagnostics = data.diagnostics || null;
      {
        const fetchedParams = new URLSearchParams(lastParams);
        lastFetchDateFrom = fetchedParams.get("date_from") || "";
        lastFetchDateTo = fetchedParams.get("date_to") || "";
        lastFetchQuery = requestedQuery;
        pruneSearchResultsCache();
        searchResultsCache = searchResultsCache.filter(e => e.key !== lastFetchQuery);
        searchResultsCache.push({
          key: lastFetchQuery,
          dateFrom: lastFetchDateFrom,
          dateTo: lastFetchDateTo,
          records: baseRecords,
          diagnostics: lastDiagnostics,
          timestamp: Date.now(),
        });
        if (searchResultsCache.length > SEARCH_CACHE_MAX_ENTRIES) searchResultsCache.shift();
      }
      refreshFromBaseRecords();
      if (demo) $("status").textContent += " Dane przykładowe.";
      else if (data.source) $("status").textContent += " Źródło: Rejestr Cen Nieruchomości.";
    } catch (e) {
      if (signal.aborted || request !== currentSearch) return;
      $("status").textContent = e.name === "TimeoutError"
        ? "Usługa RCN nie odpowiedziała w ciągu 120 s. Spróbuj ponownie."
        : `Błąd pobierania danych. ${e.message}`;
    } finally {
      if (request === currentSearch) {
        currentSearch = null;
        setSearchWaiting(false);
      }
    }
  }

  function clearFilters() {
    stopSearch();
    const currentLayer = $("layer").value || "lokale";
    selectedPlace = null;
    analysisCenter = null;
    polygonPoints = [];
    polygonClosed = false;
    if (polygonLayer) polygonLayer.clearLayers();
    if (analysisMarkerLayer) analysisMarkerLayer.clearLayers();
    if ($("city")) $("city").value = "";
    if ($("teryt")) $("teryt").value = "";
    if ($("gmina_voivodeship")) $("gmina_voivodeship").value = "";
    resetGminaSelect("gmina_powiat", "— najpierw wybierz województwo —");
    resetGminaSelect("gmina_gmina", "— najpierw wybierz powiat —");
    resetGminaSelect("gmina_miejscowosc", "— najpierw wybierz gminę —");
    if ($("gmina_mode")) $("gmina_mode").checked = false;
    root.querySelectorAll("input").forEach(i => {
      if (i.type === "checkbox") i.checked = false;
      else if (i.type !== "range" && i.type !== "hidden") i.value = "";
    });
    similarMode = false;
    if ($("teryt")) $("teryt").value = "";
    $("right").value = "";
    $("market").value = "";
    if ($("subject_area_filter_mode")) $("subject_area_filter_mode").value = "all";
    if ($("subject_area_min")) $("subject_area_min").value = "";
    if ($("subject_area_max")) $("subject_area_max").value = "";
    $("area_tolerance").value = "20";
    updateSubjectAreaFilterMode();
    $("radius_m").value = "800";
    initDaySlider();
    updateRadiusLabel();
    $("summaryNote").textContent = "";
    $("mapLegend").innerHTML = "";
    setAreaMode("none");
    baseRecords = [];
    lastRecords = [];
    excludedTransactionKeys.clear();
    lastDiagnostics = null;
    renderAudit(null);
    renderMap([]);
    setModule(currentLayer === "dzialki" ? activeModuleFromInputs() : "lokale");
    if (currentLayer !== "dzialki") {
      if ($("exclude_outliers")) $("exclude_outliers").checked = true;
      if ($("function")) $("function").value = "mieszkalna";
    }
  }

  $("date_start_idx").addEventListener("input", () => { clearDatePreset(); updateDateRange(); scheduleDateRangeChange("Zmieniono zakres dat."); });
  $("date_end_idx").addEventListener("input", () => { clearDatePreset(); updateDateRange(); scheduleDateRangeChange("Zmieniono zakres dat."); });
  $("date_from").addEventListener("change", () => { updateDateRangeFromInputs(); scheduleDateRangeChange("Zmieniono datę od."); });
  $("date_to").addEventListener("change", () => { updateDateRangeFromInputs(); scheduleDateRangeChange("Zmieniono datę do."); });
  $("last12").addEventListener("change", () => { if ($("last12").checked) applyDatePreset(12); else clearDatePreset(); updateDateRange(); scheduleDateRangeChange("Zmieniono zakres dat."); });
  $("last24").addEventListener("change", () => { if ($("last24").checked) applyDatePreset(24); else clearDatePreset(); updateDateRange(); scheduleDateRangeChange("Zmieniono zakres dat."); });
  $("radius_m").addEventListener("input", () => {
    updateRadiusLabel();
    if (getAreaMode() === "radius") {
      drawSpatialOverlay();
      scheduleSpatialAutoSearch("Zmieniono promień na mapie — odświeżam wynik...");
    }
  });
  $("area_mode").addEventListener("change", () => {
    const mode = getAreaMode();
    if (mode !== "polygon") {
      polygonPoints = [];
      polygonClosed = false;
      if (polygonLayer) polygonLayer.clearLayers();
    }
    if (mode !== "radius" && radiusLayer) radiusLayer.clearLayers();
    setAreaMode(mode);
    const hasRadiusCenter = analysisCenter || selectedPlace;
    if (baseRecords.length || mode === "radius" || mode === "polygon") {
      if (mode === "none" || (mode === "radius" && hasRadiusCenter) || (mode === "polygon" && polygonClosed && polygonPoints.length >= 3)) {
        if (mode === "radius" && !analysisCenter && selectedPlace && isValidPolandPoint(selectedPlace.lat, selectedPlace.lon)) {
          analysisCenter = { lat: Number(selectedPlace.lat), lon: Number(selectedPlace.lon) };
          drawAnalysisOverlay(analysisCenter);
        }
        scheduleSpatialAutoSearch("Zmieniono tryb obszaru — odświeżam wynik...");
      } else if (baseRecords.length) {
        refreshFromBaseRecords();
      }
    }
  });
  $("undoPolygonPoint").addEventListener("click", () => {
    if (polygonClosed) polygonClosed = false;
    else if (polygonPoints.length) polygonPoints.pop();
    drawPolygonOverlay();
    if (polygonClosed && polygonPoints.length >= 3) scheduleSpatialAutoSearch("Zmieniono dowolny obszar — odświeżam wynik...");
    else refreshFromBaseRecords();
  });
  $("clearPolygon").addEventListener("click", () => {
    polygonPoints = [];
    polygonClosed = false;
    if (polygonLayer) polygonLayer.clearLayers();
    drawPolygonOverlay();
    scheduleSpatialAutoSearch("Wyczyszczono dowolny obszar — odświeżam wynik...");
  });
  // --- Wyszukiwanie po całej gminie (Etap 4) ---
  async function loadVoivodeships() {
    try {
      const res = await fetch("/api/teryt/voivodeships");
      if (!res.ok) throw new Error("Brak listy województw");
      const list = await res.json();
      if (signal.aborted) return;
      const sel = $("gmina_voivodeship");
      sel.innerHTML = '<option value="">— wybierz —</option>' + list.map(v => `<option value="${escapeHtml(v.name)}">${escapeHtml(v.name)}</option>`).join("");
      $("gmina_retry").hidden = true;
    } catch (e) {
      if (signal.aborted) return;
      $("gmina_retry").hidden = false;
      $("status").textContent = "Nie udało się pobrać listy województw.";
    }
  }

  function resetGminaSelect(selectId, placeholderText) {
    const sel = $(selectId);
    sel.innerHTML = `<option value="">${placeholderText}</option>`;
    sel.disabled = true;
  }

  $("gmina_voivodeship")?.addEventListener("change", async () => {
    resetGminaSelect("gmina_powiat", "— najpierw wybierz województwo —");
    resetGminaSelect("gmina_gmina", "— najpierw wybierz powiat —");
    resetGminaSelect("gmina_miejscowosc", "— najpierw wybierz gminę —");
    clearSelectedPlace();
    const woj = $("gmina_voivodeship").value;
    if (!woj) return;
    try {
      const res = await fetch(`/api/teryt/powiaty?voivodeship=${encodeURIComponent(woj)}`);
      if (!res.ok) throw new Error("Brak listy powiatów");
      const list = await res.json();
      if (signal.aborted || $("gmina_voivodeship").value !== woj) return;
      const sel = $("gmina_powiat");
      sel.innerHTML = '<option value="">— wybierz —</option>' + list.map(p => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)}</option>`).join("");
      sel.disabled = false;
    } catch (e) {
      $("status").textContent = "Nie udało się pobrać listy powiatów — spróbuj ponownie.";
    }
  });

  $("gmina_powiat")?.addEventListener("change", async () => {
    resetGminaSelect("gmina_gmina", "— najpierw wybierz powiat —");
    resetGminaSelect("gmina_miejscowosc", "— najpierw wybierz gminę —");
    clearSelectedPlace();
    const woj = $("gmina_voivodeship").value;
    const pow = $("gmina_powiat").value;
    if (!woj || !pow) return;
    try {
      const res = await fetch(`/api/teryt/gminy?voivodeship=${encodeURIComponent(woj)}&powiat=${encodeURIComponent(pow)}`);
      if (!res.ok) throw new Error("Brak listy gmin");
      const list = await res.json();
      if (signal.aborted || $("gmina_voivodeship").value !== woj || $("gmina_powiat").value !== pow) return;
      const sel = $("gmina_gmina");
      sel.innerHTML = '<option value="">— wybierz —</option>' + list.map(g => `<option value="${escapeHtml(g.gmina_name)}" data-teryt6="${escapeHtml(g.teryt6)}" data-display="${escapeHtml(g.name)}">${escapeHtml(g.name)}</option>`).join("");
      sel.disabled = false;
    } catch (e) {
      $("status").textContent = "Nie udało się pobrać listy gmin — spróbuj ponownie.";
    }
  });

  async function loadMiejscowosciForSelectedGmina() {
    resetGminaSelect("gmina_miejscowosc", "— najpierw wybierz gminę —");
    const woj = $("gmina_voivodeship").value;
    const pow = $("gmina_powiat").value;
    const gmi = $("gmina_gmina").value;
    const gmiOpt = $("gmina_gmina").selectedOptions[0];
    const gmiTeryt6 = gmiOpt?.dataset.teryt6 || "";
    if (!woj || !pow || !gmi) return;
    try {
      const res = await fetch(`/api/teryt/miejscowosci?voivodeship=${encodeURIComponent(woj)}&powiat=${encodeURIComponent(pow)}&gmina=${encodeURIComponent(gmi)}&gmina_teryt=${encodeURIComponent(gmiTeryt6)}`);
      if (!res.ok) throw new Error("Brak listy miejscowości");
      const list = await res.json();
      if (signal.aborted || $("gmina_gmina").selectedOptions[0] !== gmiOpt) return;
      const sel = $("gmina_miejscowosc");
      sel.innerHTML = '<option value="">— wybierz —</option>' + list.map(m => `<option value="${escapeHtml(m.name)}" data-teryt="${escapeHtml(m.teryt || "")}">${escapeHtml(m.name)}</option>`).join("");
      sel.disabled = false;
    } catch (e) {
      $("status").textContent = "Nie udało się pobrać listy miejscowości — spróbuj ponownie.";
    }
  }

  function clearSelectedPlace() {
    stopSearch();
    selectedPlace = null;
    $("city").value = "";
    $("teryt").value = "";
    clearMapAnalysisContext();
  }

  $("gmina_gmina")?.addEventListener("change", async () => {
    clearSelectedPlace();
    await loadMiejscowosciForSelectedGmina();
  });

  $("gmina_miejscowosc")?.addEventListener("change", async () => {
    stopSearch();
    selectedPlace = null;
    const opt = $("gmina_miejscowosc").selectedOptions[0];
    const cityName = opt?.value || "";
    $("city").value = cityName;
    $("teryt").value = opt?.dataset.teryt || "";
    if ($("voivodeship")) $("voivodeship").value = $("gmina_voivodeship").value || "";
    if ($("powiat")) $("powiat").value = $("gmina_powiat").value || "";
    if ($("gmina")) $("gmina").value = $("gmina_gmina").value || "";
    cityChangedManually = false;
    clearMapAnalysisContext();
    if (!cityName) return;
    const it = await resolvePlaceCoordinates({
      city: cityName,
      teryt: opt?.dataset.teryt || "",
      voivodeship: $("gmina_voivodeship").value || "",
      powiat: $("gmina_powiat").value || "",
      gmina: $("gmina_gmina").value || "",
    });
    if (signal.aborted || $("gmina_miejscowosc").selectedOptions[0] !== opt || $("gmina_mode").checked) return;
    selectedPlace = it;
    if (it.teryt) $("teryt").value = it.teryt;
    if (isValidPolandPoint(it.lat, it.lon) && map) {
      map.setView([Number(it.lat), Number(it.lon)], 13);
      scheduleVisualRefresh();
    }
    const centerNote = isValidPolandPoint(it.lat, it.lon) ? " Mapa została ustawiona na miejscowość." : "";
    $("status").textContent = `Wybrano miejscowość: ${cityName}.${centerNote} Kliknij „Szukaj”, aby pobrać dane.`;
  });

  function applyGminaModeVisibility() {
    const active = $("gmina_mode").checked;
    $("miejscowoscFieldWrap").classList.toggle("hidden", active);
    $("streetFieldWrap").classList.toggle("hidden", active);
    if (active) {
      clearSelectedPlace();
      $("street").value = "";
      $("status").textContent = "Wybierz województwo, powiat i gminę, a następnie kliknij „Szukaj”.";
    } else if ($("gmina_gmina")?.value) {
      // Gmina była już wybrana — odtwórz listę miejscowości zamiast zostawiać ją
      // zablokowaną aż do odświeżenia strony.
      loadMiejscowosciForSelectedGmina();
      $("status").textContent = "Wybierz miejscowość, a następnie kliknij „Szukaj”.";
    } else {
      resetGminaSelect("gmina_miejscowosc", "— najpierw wybierz gminę —");
      $("status").textContent = "Wybierz województwo, powiat, gminę i miejscowość, a następnie kliknij „Szukaj”.";
    }
  }

  $("gmina_mode")?.addEventListener("change", applyGminaModeVisibility);
  $("gmina_retry").addEventListener("click", loadVoivodeships);

  $("searchBtn").addEventListener("click", () => { similarMode = false; search(); });
  $("similarBtn").addEventListener("click", () => { similarMode = true; search(); });
  $("clearBtn").addEventListener("click", clearFilters);
  $("exportBtn").addEventListener("click", async () => {
    try {
      const records = lastRecords.filter(r => !excludedTransactionKeys.has(recordKey(r)));
      if (!records.length) {
        $("status").textContent = "Brak rekordów do eksportu XLSX.";
        return;
      }
      $("status").textContent = "Przygotowuję eksport XLSX z aktualnej tabeli...";
      const res = await fetch("/api/export_current.xlsx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records })
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Błąd eksportu XLSX");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = root.ownerDocument.createElement("a");
      a.href = url;
      a.download = "rcn_wyniki.xlsx";
      root.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      $("status").textContent = `Wyeksportowano XLSX: ${records.length} rekordów.`;
    } catch (err) {
      $("status").textContent = "Błąd eksportu XLSX: " + (err?.message || err);
    }
  });
  $("pdfBtn").addEventListener("click", async () => {
    try {
      const records = lastRecords.filter(r => !excludedTransactionKeys.has(recordKey(r)));
      if (!records.length) {
        $("status").textContent = "Brak rekordów do raportu Word.";
        return;
      }
      $("status").textContent = "Przygotowuję raport Word...";
      const reportParams = Object.fromEntries(new URLSearchParams(params()).entries());
      reportParams.subject_area = $("subject_area")?.value || "";
      reportParams.subject_value = $("subject_value")?.value || "";
      reportParams.subject_area_filter_mode = $("subject_area_filter_mode")?.value || "all";
      reportParams.subject_area_min = $("subject_area_min")?.value || "";
      reportParams.subject_area_max = $("subject_area_max")?.value || "";
      reportParams.price_m2_min = $("price_m2_min")?.value || "";
      reportParams.price_m2_max = $("price_m2_max")?.value || "";
      reportParams.city = $("city")?.value || reportParams.city || "";
      reportParams.street = $("street")?.value || reportParams.street || "";
      const res = await fetch("/api/export_current.docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records, params: reportParams })
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Błąd raportu Word");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = root.ownerDocument.createElement("a");
      a.href = url;
      a.download = "raport_rcn.docx";
      root.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      $("status").textContent = "Wygenerowano raport Word.";
    } catch (err) {
      $("status").textContent = "Błąd raportu Word: " + (err?.message || err);
    }
  });


  initDaySlider();
  if ($("exclude_outliers")) $("exclude_outliers").checked = true;
  if ($("function") && $("layer")?.value === "lokale") $("function").value = "mieszkalna";
  updateSubjectAreaFilterMode();
  initMap();
  window.addEventListener("resize", scheduleVisualRefresh, { signal });
  setupCitySuggestions();
  setupModuleTabs();
  scheduleVisualRefresh();


  // Zwykłe filtry i zakres czasu nie odświeżają już automatycznie pełnego wyniku.
  // Automatyczne odświeżanie zostaje wyłącznie dla zmian obszaru na mapie.
  ["street", "market", "right", "function", "land_use", "building_type", "land_record_mode", "exclude_outliers", "subject_area", "subject_value", "price_m2_min", "price_m2_max", "area_tolerance", "w_area", "w_location", "w_market"].forEach(id => {
    const el = $(id);
    if (!el) return;
    const markChanged = () => {
      $("status").textContent = "Zmieniono filtr. Kliknij „Szukaj”, aby odświeżyć wynik.";
    };
    el.addEventListener("change", markChanged);
    el.addEventListener("input", markChanged);
  });

  ["subject_area", "subject_area_filter_mode", "subject_area_min", "subject_area_max", "area_tolerance"].forEach(id => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("change", refreshSubjectAreaFilter);
    el.addEventListener("input", refreshSubjectAreaFilter);
  });

  ["subject_value"].forEach(id => {
    const el = $(id);
    if (!el) return;
    const recalc = () => {
      refreshCalculatedOnly();
      $("status").textContent = "Zmieniono wartość analizowanej nieruchomości — przeliczono statystyki.";
    };
    el.addEventListener("change", recalc);
    el.addEventListener("input", recalc);
  });

  $("radius_m").disabled = !$("use_radius").checked;

  // Bez tego wywołania nowy panel wyboru lokalizacji (Lokale) pozostawał w stanie
  // "surowego" HTML aż do pierwszego ręcznego przełączenia zakładki — setModule()
  // wcześniej uruchamiał się dopiero przy kliknięciu w moduł albo czyszczeniu filtrów,
  // nigdy przy samym otwarciu strony.
  setModule($("layer")?.value === "dzialki" ? activeModuleFromInputs() : "lokale");
}
