const RADIUS = 6371000;
const radians = (degrees) => degrees * Math.PI / 180;
const number = new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const validPoint = (p) => p && Number.isFinite(p.lat) && Math.abs(p.lat) <= 90
  && Number.isFinite(p.lng) && Math.abs(p.lng) <= 180;

export function pointDistance(a, b) {
  const h = Math.sin(radians(b.lat - a.lat) / 2) ** 2
    + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(radians(b.lng - a.lng) / 2) ** 2;
  return 2 * RADIUS * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
}

export function measureGeometry(points) {
  let length = 0, sum = 0;
  for (let i = 0; i < points.length; i++) {
    if (i > 0) length += pointDistance(points[i - 1], points[i]);
    const a = points[i], b = points[(i + 1) % points.length];
    let delta = radians(b.lng - a.lng);
    if (delta > Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;
    sum += delta * (2 + Math.sin(radians(a.lat)) + Math.sin(radians(b.lat)));
  }
  return {
    length,
    perimeter: points.length >= 3 ? length + pointDistance(points.at(-1), points[0]) : 0,
    area: points.length >= 3 ? Math.abs(sum * RADIUS * RADIUS / 2) : 0,
  };
}

export function streetViewUrl(point) {
  if (!validPoint(point)) throw new Error("Nieprawidłowy punkt Street View.");
  return "https://www.google.com/maps?layer=c&cbll=" + point.lat + "," + point.lng;
}

export function mountMapTools(container, options = {}) {
  const document = container.ownerDocument;
  const win = options.window ?? globalThis.window;
  let map = null, L = null, graphics = null, measurement = null, zoomWasEnabled = false;
  let menuPoint = null, returnFocus = null, frame = null, cursor = null, disposed = false;
  const requestFrame = options.requestFrame ?? ((fn) => win.requestAnimationFrame(fn));
  const cancelFrame = options.cancelFrame ?? ((id) => win.cancelAnimationFrame(id));
  const root = document.createElement("section");
  root.className = "dzialki-map-tools";
  root.setAttribute("aria-label", "Pomiary i opcje miejsca na mapie");
  const toolbar = document.createElement("div");
  toolbar.className = "dzialki-measure-buttons";
  const help = document.createElement("p");
  help.className = "dzialki-help";
  help.textContent = "Wybierz pomiar i klikaj punkty mapy. Menu miejsca: prawy przycisk myszy lub przytrzymanie mapy.";
  function button(parent, id, label, handler) {
    const node = document.createElement("button");
    node.type = "button"; node.id = id; node.textContent = label;
    node.addEventListener("click", handler); parent.append(node); return node;
  }
  const distanceButton = button(toolbar, "dzialki-measure-distance", "Mierz odległość", () => start("distance"));
  const areaButton = button(toolbar, "dzialki-measure-area", "Mierz obszar", () => start("area"));
  const menuButton = button(toolbar, "dzialki-map-options", "Opcje środka mapy", () => openMenu(map?.getCenter(), null, menuButton));
  menuButton.setAttribute("aria-haspopup", "menu");
  menuButton.setAttribute("aria-expanded", "false");
  menuButton.setAttribute("aria-controls", "dzialki-map-menu");
  const launchButtons = [distanceButton, areaButton, menuButton];
  for (const item of launchButtons) item.disabled = true;
  const panel = document.createElement("section");
  panel.id = "dzialki-measure-panel"; panel.hidden = true;
  panel.setAttribute("aria-label", "Wynik pomiaru");
  const title = document.createElement("h4");
  const values = document.createElement("p"); values.id = "dzialki-measure-values";
  const hint = document.createElement("p"); hint.id = "dzialki-measure-hint";
  hint.setAttribute("role", "status"); hint.setAttribute("aria-live", "polite");
  panel.append(title, values, hint);
  const finishButton = button(panel, "dzialki-measure-finish", "Zakończ pomiar", finish);
  button(panel, "dzialki-measure-clear", "Usuń pomiar", clear);
  const accuracy = document.createElement("p"); accuracy.className = "dzialki-help";
  accuracy.textContent = "Pomiar orientacyjny po powierzchni Ziemi; nie jest powierzchnią ewidencyjną ani pomiarem geodezyjnym.";
  panel.append(accuracy);
  root.append(toolbar, help); container.append(root);
  (options.resultContainer ?? root).append(panel);
  const menu = document.createElement("div");
  menu.id = "dzialki-map-menu"; menu.className = "dzialki-map-menu";
  menu.setAttribute("role", "menu"); menu.setAttribute("aria-label", "Opcje wskazanego miejsca"); menu.hidden = true;
  const menuDistance = button(menu, "dzialki-menu-distance", "Mierz odległość stąd", () => start("distance", menuPoint));
  const menuArea = button(menu, "dzialki-menu-area", "Mierz obszar stąd", () => start("area", menuPoint));
  const street = document.createElement("a"); street.id = "dzialki-street-view";
  street.textContent = "Otwórz Street View"; street.target = "_blank"; street.rel = "noopener noreferrer";
  street.addEventListener("click", () => closeMenu(true)); menu.append(street);
  const menuItems = [menuDistance, menuArea, street];
  if (options.onSelection) {
    for (const [id, label, select] of [
      ["dzialki-menu-select-parcel", "Zaznacz działkę", true],
      ["dzialki-menu-deselect-parcel", "Odznacz działkę", false],
    ]) {
      menuItems.push(button(menu, id, label, () => {
        const point = menuPoint;
        closeMenu(true);
        options.onSelection(point, select);
      }));
    }
  }
  if (options.onAddParcel) menuItems.push(button(menu, "dzialki-menu-add-parcel", "Dodaj działkę do raportu", () => {
    const point = menuPoint;
    closeMenu(true);
    options.onAddParcel(point);
  }));
  if (options.onAddSnapshot) menuItems.push(button(menu, "dzialki-menu-add-map", "Dodaj widok mapy do raportu", () => {
    closeMenu(true);
    options.onAddSnapshot();
  }));
  for (const item of menuItems) item.setAttribute("role", "menuitem");
  (options.menuContainer ?? container).append(menu);

  function persist() { options.onChange?.(measurement ? { mode: measurement.mode, points: measurement.points, active: measurement.active } : null); }
  function restoreZoom() { if (zoomWasEnabled) map?.doubleClickZoom.enable(); zoomWasEnabled = false; }
  function cancelPreview() { if (frame !== null) cancelFrame(frame); frame = null; cursor = null; }
  function closeMenu(focus = false) {
    menu.hidden = true; menuButton.setAttribute("aria-expanded", "false");
    if (focus) returnFocus?.focus?.();
  }
  function openMenu(point, event, invoker) {
    if (!map || !validPoint(point)) return;
    menuPoint = { lat: point.lat, lng: point.lng };
    returnFocus = invoker ?? map.getContainer();
    street.href = streetViewUrl(menuPoint); menu.hidden = false;
    menuButton.setAttribute("aria-expanded", "true");
    const rect = menu.getBoundingClientRect();
    menu.style.left = Math.max(6, Math.min(event?.clientX ?? 24, win.innerWidth - rect.width - 6)) + "px";
    menu.style.top = Math.max(6, Math.min(event?.clientY ?? 24, win.innerHeight - rect.height - 6)) + "px";
    menuDistance.focus();
  }
  function ensureGraphics() {
    if (!map.getPane("dzialkiMeasurePane")) {
      const pane = map.createPane("dzialkiMeasurePane");
      pane.style.zIndex = "475"; pane.style.pointerEvents = "none";
    }
    graphics ??= L.layerGroup().addTo(map);
  }
  function paint(preview = null) {
    if (!measurement || disposed) return;
    ensureGraphics(); graphics.clearLayers();
    const points = measurement.points.slice();
    if (measurement.active && validPoint(preview) && (!points.length || pointDistance(points.at(-1), preview) >= 0.05)) points.push(preview);
    const style = { pane: "dzialkiMeasurePane", color: "#0f766e", weight: 3, opacity: 0.95, interactive: false, className: "dzialki-measure-shape" };
    if (measurement.mode === "area" && points.length >= 3) L.polygon(points, { ...style, fillColor: "#14b8a6", fillOpacity: 0.2 }).addTo(graphics);
    else if (points.length >= 2) L.polyline(points, { ...style, dashArray: measurement.active ? "8,6" : null }).addTo(graphics);
    for (const [i, point] of measurement.points.entries()) L.circleMarker(point, { ...style, color: "#0f172a", weight: 1, radius: i === 0 ? 5 : 4, fillColor: "#fff", fillOpacity: 1 }).addTo(graphics);
    const result = measureGeometry(points);
    title.textContent = measurement.mode === "area" ? "Pomiar obszaru" : "Pomiar odległości";
    values.textContent = measurement.mode === "area"
      ? "Powierzchnia: " + (points.length >= 3 ? number.format(result.area) : "—") + " m² · Obwód (wszystkie boki): " + (points.length >= 3 ? number.format(result.perimeter) : "—") + " m"
      : "Długość: " + number.format(result.length) + " m";
    panel.hidden = false; finishButton.hidden = !measurement.active;
    hint.textContent = measurement.active
      ? "Klikaj kolejne punkty. Zakończ przyciskiem, podwójnym kliknięciem lub prawym przyciskiem myszy. Esc usuwa pomiar."
      : "Pomiar zakończony. Możesz usunąć pomiar lub rozpocząć następny.";
  }
  function clear() {
    cancelPreview(); restoreZoom(); measurement = null;
    graphics?.clearLayers(); if (graphics) map.removeLayer(graphics); graphics = null;
    panel.hidden = true; persist();
  }
  function start(mode, point = null) {
    if (!map || disposed) return;
    clear(); closeMenu(); options.onStart?.();
    measurement = { mode, points: validPoint(point) ? [{ lat: point.lat, lng: point.lng }] : [], active: true };
    zoomWasEnabled = map.doubleClickZoom.enabled();
    if (zoomWasEnabled) map.doubleClickZoom.disable();
    paint(); persist(); map.getContainer().focus();
  }
  function finish() {
    if (!measurement?.active) return;
    const minimum = measurement.mode === "area" ? 3 : 2;
    if (measurement.points.length < minimum) { hint.textContent = "Aby zakończyć, dodaj co najmniej " + minimum + " punkty."; return; }
    cancelPreview(); measurement.active = false; restoreZoom(); paint(); persist();
  }
  const click = (event) => {
    if (!measurement?.active || !validPoint(event.latlng) || event.originalEvent?.detail > 1) return;
    if (measurement.points.length && pointDistance(measurement.points.at(-1), event.latlng) < 0.05) return;
    measurement.points.push({ lat: event.latlng.lat, lng: event.latlng.lng }); cancelPreview(); paint(); persist();
  };
  const move = (event) => {
    if (!measurement?.active) return;
    cursor = event.latlng;
    if (frame === null) frame = requestFrame(() => { frame = null; paint(cursor); });
  };
  const doubleClick = (event) => {
    if (!measurement?.active) return;
    event.originalEvent?.preventDefault?.(); event.originalEvent?.stopPropagation?.(); finish();
  };
  const contextMenu = (event) => {
    event.originalEvent?.preventDefault?.();
    if (measurement?.active) { closeMenu(); finish(); }
    else openMenu(event.latlng, event.originalEvent);
  };
  const outside = (event) => { if (!menu.contains(event.target) && !toolbar.contains(event.target)) closeMenu(); };
  const keydown = (event) => {
    if (event.key === "Escape") {
      if (!menu.hidden) { event.preventDefault(); closeMenu(true); }
      else if (measurement) { event.preventDefault(); clear(); }
    } else if (!menu.hidden && ["ArrowDown", "ArrowUp", "Home", "End", "Tab"].includes(event.key)) {
      if (event.key === "Tab") { closeMenu(); return; }
      event.preventDefault();
      const current = menuItems.indexOf(document.activeElement);
      const count = menuItems.length;
      const next = event.key === "Home" ? 0 : event.key === "End" ? count - 1
        : (current + (event.key === "ArrowUp" ? count - 1 : 1)) % count;
      menuItems[next].focus();
    }
  };
  const handlers = { click, mousemove: move, dblclick: doubleClick, contextmenu: contextMenu, movestart: () => closeMenu(), zoomstart: () => closeMenu(), dragstart: () => closeMenu() };
  win.addEventListener("keydown", keydown); win.addEventListener("pointerdown", outside);
  return {
    isMeasuring: () => measurement?.active === true,
    attach(nextMap, nextL, saved) {
      map = nextMap; L = nextL;
      for (const item of launchButtons) item.disabled = false;
      for (const [name, handler] of Object.entries(handlers)) map.on(name, handler);
      if (saved && ["distance", "area"].includes(saved.mode) && Array.isArray(saved.points) && saved.points.every(validPoint)) {
        measurement = { mode: saved.mode, points: saved.points.map(p => ({ ...p })), active: saved.active === true };
        if (measurement.active) { zoomWasEnabled = map.doubleClickZoom.enabled(); if (zoomWasEnabled) map.doubleClickZoom.disable(); }
        paint();
      }
    },
    cleanup() {
      if (disposed) return;
      disposed = true; cancelPreview(); restoreZoom();
      for (const [name, handler] of Object.entries(handlers)) map?.off(name, handler);
      win.removeEventListener("keydown", keydown); win.removeEventListener("pointerdown", outside);
      graphics?.clearLayers(); if (graphics) map.removeLayer(graphics);
      root.remove(); panel.remove(); menu.remove(); map = null; L = null;
    },
  };
}
