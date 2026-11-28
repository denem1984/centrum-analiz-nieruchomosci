export async function inspectPlanningPresentation({ evaluate, command, sleep, capture }) {
  const toggle = (selector, checked) => evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});
    input.checked=${checked};input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const mapClick = (type, fraction = 0.5) => evaluate(`(()=>{const map=document.querySelector('.dzialki-map'),r=map.getBoundingClientRect();
    map.dispatchEvent(new MouseEvent(${JSON.stringify(type)}, {bubbles:true,cancelable:true,button:${type === "contextmenu" ? 2 : 0},
      clientX:r.left+r.width/2,clientY:r.top+r.height*${fraction}}));})()`);
  async function waitFor(expression) {
    for (let i = 0; i < 48; i++) {
      const result = await evaluate(expression);
      if (result) return result;
      await sleep(250);
    }
    return null;
  }
  await toggle('[data-thematic-layer="ownership"]', true);
  await toggle('[data-planning-layer="pogDraftGugik"]', true);
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 560, deviceScaleFactor: 1, mobile: true });
  await sleep(700);
  await evaluate("document.querySelector('.dzialki-map').scrollIntoView({block:'start'})");
  await mapClick("click", 0.08);
  const popup = await waitFor(`(()=>{const panel=document.querySelector('.leaflet-popup');
    const link=panel?.querySelector('a[href*="GetFeatureInfo"]');
    if(!link || !panel.textContent.includes('Projektowany POG'))return null;
    const bounds=panel.getBoundingClientRect(),map=document.querySelector('.dzialki-map').getBoundingClientRect();
    const content=panel.querySelector('.leaflet-popup-content');
    return {width:bounds.width,top:bounds.top,bottom:bounds.bottom,mapTop:map.top,mapBottom:map.bottom,
      contained:bounds.top>=map.top+1&&bounds.bottom<=map.bottom-1&&bounds.left>=map.left&&bounds.right<=map.right,
      scrollable:content.scrollHeight>content.clientHeight&&getComputedStyle(content).overflowY==='auto',
      message:panel.textContent,link:link.href,selected:document.querySelectorAll('.dzialki-selected-parcel').length};})()`);
  await capture("planning-popup-mobile.png");
  await evaluate("document.querySelector('.leaflet-popup-close-button')?.click()");
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await sleep(600);
  const ownership = await waitFor(`(()=>{const shape=document.querySelector('.dzialki-ownership-shape');
    const row=[...document.querySelectorAll('.dzialki-color-legend-row')].find(el=>el.textContent.startsWith('7 - '));
    if(!shape||!row)return null;
    return {fill:getComputedStyle(shape).fill, opacity:getComputedStyle(shape).fillOpacity,
      legend:getComputedStyle(row.querySelector('.dzialki-color-swatch')).backgroundColor};})()`);
  await mapClick("contextmenu");
  await evaluate("document.querySelector('#dzialki-menu-select-parcel').click()");
  const select = await waitFor(`(()=>{const selected=document.querySelector('.dzialki-selected-parcel');return selected?{opacity:getComputedStyle(selected).fillOpacity}:null;})()`);
  await toggle('[data-thematic-layer="kiut"]', false);
  await evaluate(`document.querySelector('[data-layer-group="infrastructure"]').open=true;
    [...document.querySelectorAll('.dzialki-color-legend-row')].find(el=>el.textContent.startsWith('7 - ')).scrollIntoView({block:'center'})`);
  await sleep(400);
  await capture("planning-ownership.png");
  await mapClick("click");
  const leftAgain = await waitFor("Boolean(document.querySelector('.leaflet-popup') && document.querySelector('.dzialki-selected-parcel'))");
  await mapClick("contextmenu");
  await evaluate("document.querySelector('#dzialki-menu-deselect-parcel').click()");
  const removed = await waitFor("!document.querySelector('.dzialki-selected-parcel')");
  await evaluate("document.querySelector('.leaflet-popup-close-button')?.click()");

  await toggle('[data-thematic-layer="ownership"]', false);
  await toggle('[data-planning-layer="mpzp"]', false);
  await sleep(900);
  return {
    popup, ownership, select,
    assertions: [
      { name: "Długi popup mieści się w małej mapie, treść ma przewijanie", pass: !!popup?.contained && popup.scrollable },
      { name: "Brak szczegółów MPZP ma odnośnik do punktu i wyjaśnienie rysunku", pass: /Rysunek MPZP na mapie może nadal pokazywać plan/.test(popup?.message ?? "") && popup.link.includes("SRS=EPSG%3A2180") },
      { name: "Kolor powierzchni własności odpowiada legendzie", pass: !!ownership && ownership.fill === ownership.legend && ownership.opacity === "1" },
      { name: "Lewy klik tylko pokazuje dane, menu zaznacza i odznacza", pass: popup?.selected === 0 && !!select && !!leftAgain && !!removed },
      { name: "Zaznaczenie nad własnością to obrys bez wypełnienia", pass: select?.opacity === "0" },
    ],
  };
}
