export const thematicStateExpression = `(() => ({
  count:document.querySelectorAll('[data-thematic-layer]').length,
  allOff:[...document.querySelectorAll('[data-thematic-layer]')].every(el=>!el.checked),
  layers:[...document.querySelectorAll('[data-thematic-status]')].map(el=>({id:el.dataset.thematicStatus,state:el.dataset.state,loaded:Number(el.dataset.loaded),total:Number(el.dataset.total),text:el.textContent})),
  popup:[...document.querySelectorAll('.dzialki-thematic-popup section')].map(el=>({state:el.dataset.state,title:el.querySelector('h4')?.textContent})),
  groupCount:document.querySelectorAll('.dzialki-thematic-color-legend p').length
}))()`;

export async function runThematicSmoke({evaluate,command,sleep,origin,context,waitForMap,setZoom,offline,capture}) {
  await command("Page.navigate",{url:origin + "/#/dzialki?ctx=" + context});
  await waitForMap(origin); await setZoom();
  if (offline) await evaluate(`(() => {const el=document.createElement('p');el.textContent='TEST OFFLINE — atrapy usług, dane fikcyjne.';document.querySelector('.dzialki-header').append(el);})()`);
  const initial = await evaluate(thematicStateExpression);
  await evaluate(`(() => {
    document.querySelector('[data-layer-group="investments"]').open=true;
    document.querySelector('[data-layer-group="infrastructure"]').open=true;
    for(const input of document.querySelectorAll('[data-thematic-layer]')){input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}));}
    document.querySelector('[aria-label="Informacja: Pozwolenia na budowę (GUNB RWDZ)"]').click();
    document.querySelector('[aria-label="Informacja: Zagrożenie powodziowe – ISOK (Wody Polskie)"]').click();
  })()`);
  if (offline) await capture("m4d3-isok-dialog.png");
  const dialog = await evaluate(`(() => {const el=document.querySelector('.dzialki-flood-dialog');const visible=!el.parentElement.hidden;el.querySelector('button').click();return visible&&el.parentElement.hidden;})()`);
  const deadline = Date.now() + 145000;
  let state;
  do { await sleep(500);state=await evaluate(thematicStateExpression); }
  while(Date.now()<deadline && state.layers.some(layer=>layer.state==="loading"));
  await evaluate(`(() => {const el=document.querySelector('.dzialki-map');const r=el.getBoundingClientRect();el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientX:r.left+r.width/2,clientY:r.top+r.height/2}));})()`);
  const popupDeadline = Date.now() + 145000;
  let popup;
  do {await sleep(500);popup=await evaluate(thematicStateExpression);}
  while(Date.now()<popupDeadline && (!popup.popup.length||popup.popup.some(section=>section.state==="loading")));
  // Popup auto-pan changes bounds and can restart ownership and raster requests.
  await sleep(600);
  const finalDeadline=Date.now()+145000;
  do {await sleep(500);state=await evaluate(thematicStateExpression);}
  while(Date.now()<finalDeadline&&state.layers.some(layer=>layer.state==="loading"));
  const assertions = [
    {name:"Cztery warstwy domyślnie wyłączone",pass:initial.count===4&&initial.allOff},
    ...state.layers.map(layer=>({name:"Wczytanie: "+layer.id,pass:layer.id==="ownership"?["ready","empty"].includes(layer.state):layer.state==="complete"&&layer.total>0&&layer.loaded===layer.total})),
    {name:"Legenda ISOK otwiera się i zamyka",pass:dialog},
    {name:"Legenda sieci i 16 grup rejestrowych",pass:state.groupCount>=25},
    {name:"Popup RWDZ zakończył sprawdzanie",pass:popup.popup.length===1&&["ready","empty"].includes(popup.popup[0].state)},
  ];
  // RWDZ may return names. Keep only status and heading in live screenshots.
  if (!offline) await evaluate(`document.querySelectorAll('.dzialki-thematic-popup section > div').forEach(el=>{el.textContent='Szczegóły wpisu pominięte na zrzucie testowym.';})`);
  await capture("m4d3-thematic.png");
  await evaluate("location.hash='#/rcn'");await sleep(200);
  const removed = await evaluate("!document.querySelector('.leaflet-container') && !document.querySelector('.dzialki-flood-backdrop')");
  await evaluate("location.hash='#/dzialki'");await waitForMap(origin);
  const preserved = await evaluate("[...document.querySelectorAll('[data-thematic-layer]')].every(el=>el.checked)");
  assertions.push({name:"Cleanup mapy i dialogu oraz zachowanie wyborów",pass:removed&&preserved});
  let mobile=null;
  if(offline){
    await command("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});await sleep(300);
    const mobileDeadline=Date.now()+145000;
    let mobileState;
    do {await sleep(500);mobileState=await evaluate(thematicStateExpression);}
    while(Date.now()<mobileDeadline&&mobileState.layers.some(layer=>layer.state==="loading"));
    mobile=await evaluate("({width:innerWidth,scrollWidth:document.documentElement.scrollWidth})");
    assertions.push({name:"Widok 390 px bez przewijania dokumentu w bok",pass:mobile.scrollWidth<=mobile.width+1});
    await capture("m4d3-mobile.png");
  }
  await evaluate("location.hash='#/rcn'");await sleep(200);
  return {initial,state,popup,mobile,assertions};
}
