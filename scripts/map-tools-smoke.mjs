const stateExpression = `(async()=>{const {getDzialkiState}=await import('/js/modules/dzialki/state.js');const s=getDzialkiState();return{
  measurement:s.measurement,selected:s.selectedMapParcels.length,
  panelVisible:!document.querySelector('#dzialki-measure-panel').hidden,
  values:document.querySelector('#dzialki-measure-values').textContent,
  menuVisible:!document.querySelector('#dzialki-map-menu').hidden,
  href:document.querySelector('#dzialki-street-view').href,
  shapeCount:document.querySelectorAll('.dzialki-measure-shape').length,
  popups:document.querySelectorAll('.leaflet-popup').length,
};})()`;

export async function runMapToolsSmoke({ evaluate, command, sleep, origin, context, waitForMap, setZoom, offline, capture }) {
  const read = () => evaluate(stateExpression);
  const button = id => evaluate(`document.querySelector('#dzialki-${id}').click()`);
  const point = async (type, x, y) => {
    await evaluate(`(()=>{const node=document.querySelector('.dzialki-map');node.scrollIntoView({block:'center'});const r=node.getBoundingClientRect();node.dispatchEvent(new MouseEvent(${JSON.stringify(type)},{bubbles:true,cancelable:true,clientX:r.left+r.width*${x},clientY:r.top+r.height*${y},detail:1,button:${type === "contextmenu" ? 2 : 0}}));})()`);
    // Leaflet interprets consecutive detail=1 synthetic clicks <200 ms apart as a double tap.
    // Space single-point actions so only the explicit dblclick scenario finishes a measurement.
    await sleep(300);
  };
  const tab = async id => { await evaluate(`document.querySelector('[data-module-link="${id}"]').click()`); await sleep(250); };
  await command("Page.navigate", { url: origin + "/#/dzialki?ctx=" + context }); await waitForMap(origin); await setZoom();
  await evaluate("document.querySelector('[data-layer-group=\"tools\"]').open=true");
  if (offline) await evaluate("(()=>{const p=document.createElement('p');p.textContent='TEST OFFLINE — atrapy usług, dane fikcyjne.';document.querySelector('.dzialki-header').append(p);})()");
  const before = await read();
  await button("measure-distance"); await point("click", .35, .45); await point("click", .65, .45); await point("click", .65, .45);
  await point("mousemove", .7, .6); const preview = await read();
  await button("measure-finish"); const distance = await read();
  await evaluate("document.querySelector('.dzialki-map-frame').scrollIntoView({block:'start'})"); await capture("m4e2-distance.png");
  await tab("rcn"); await tab("dzialki"); await waitForMap(origin); const restored = await read();
  await point("contextmenu", .5, .45); const menu = await read(); await capture("m4e2-menu.png");
  await button("menu-area"); await point("click", .7, .45); await point("click", .7, .7);
  await point("contextmenu", .7, .7); const area = await read();
  await evaluate("document.querySelector('.dzialki-map-frame').scrollIntoView({block:'start'})"); await capture("m4e2-area.png");
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  const cleared = await read();
  const assertions = [
    { name: "Odległość: dwa punkty, dubel i kursor nie dodają punktu", pass: preview.measurement?.active && preview.measurement.points.length === 2 && distance.measurement?.points.length === 2 && !distance.measurement.active && distance.shapeCount === 3 && distance.values.includes("Długość:") },
    { name: "Pomiary nie zaznaczają działek ani nie otwierają popupów", pass: distance.selected === before.selected && area.selected === before.selected && distance.popups === 0 && area.popups === 0 },
    { name: "Wynik i geometria pozostają po zmianie zakładki", pass: JSON.stringify(restored.measurement) === JSON.stringify(distance.measurement) && restored.shapeCount === 3 && restored.panelVisible },
    { name: "Menu ma URL Street View bez nawigacji do Google", pass: menu.menuVisible && /^https:\/\/www.google.com\/maps\?layer=c&cbll=-?[\d.]+,-?[\d.]+$/.test(menu.href) },
    { name: "Obszar: trzy punkty, pole i pełny obwód; PPM kończy", pass: area.measurement?.points.length === 3 && !area.measurement.active && !area.menuVisible && area.shapeCount === 4 && area.values.includes("m²") && area.values.includes("Obwód (wszystkie boki):") },
    { name: "Escape usuwa wynik i grafikę", pass: cleared.measurement === null && !cleared.panelVisible && cleared.shapeCount === 0 },
  ];
  let mobile = null;
  if (offline) {
    await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }); await sleep(500);
    await button("measure-area"); await point("click", .35, .4); await point("click", .6, .4); await point("click", .6, .6); await button("measure-finish");
    await evaluate("document.querySelector('#dzialki-measure-panel').scrollIntoView({block:'end'})");
    mobile = await evaluate("({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,panelWidth:document.querySelector('#dzialki-measure-panel').getBoundingClientRect().width})");
    assertions.push({ name: "390 px: panel mieści się bez poziomego przewijania", pass: mobile.scrollWidth <= mobile.width + 1 && mobile.panelWidth <= mobile.width });
    await capture("m4e2-mobile.png");
  }
  await tab("rcn");
  assertions.push({ name: "Odejście usuwa mapę i menu", pass: await evaluate("!document.querySelector('.leaflet-container')&&!document.querySelector('#dzialki-map-menu')") });
  return { before, preview, distance, restored, menu, area, cleared, mobile, assertions };
}
