export const appearanceStateExpression=`(async()=>{const {getDzialkiState}=await import('/js/modules/dzialki/state.js');const state=getDzialkiState();return{
  selectedCount:state.selectedMapParcels.length,initialized:state.mapSelectionInitialized,
  outline:state.appearance.outlineColor,color:state.appearance.selectionColor,
  paletteCount:document.querySelectorAll('[data-selection-color]').length,
  pressedCount:document.querySelectorAll('[data-selection-color][aria-pressed="true"]').length,
  selectedStrokes:[...document.querySelectorAll('.dzialki-selected-parcel')].map(el=>el.getAttribute('stroke')),
  outlineStrokes:[...document.querySelectorAll('.dzialki-egib-outline')].map(el=>el.getAttribute('stroke')),
  familyPresent:!!document.querySelector('#dzialki-family-toggle'),
};})()`;

export async function runAppearanceSmoke({evaluate,command,sleep,origin,context,waitForMap,setZoom,offline,capture}){
  const read=()=>evaluate(appearanceStateExpression);
  const tab=async(id)=>{await evaluate(`document.querySelector('[data-module-link="${id}"]').click()`);await sleep(250);};
  async function waitFor(predicate){const deadline=Date.now()+(offline?10000:145000);let state;do{await sleep(300);state=await read();if(predicate(state))return state;}while(Date.now()<deadline);return state;}
  await command('Page.navigate',{url:origin+'/#/dzialki?ctx='+context});await waitForMap(origin);await setZoom();
  const outlines=await waitFor(state=>state.outlineStrokes.length>0);
  if(!outlines.outlineStrokes.length)throw new Error('Nie wczytano geometrii do próby kolorów.');
  await evaluate(`(()=>{const el=document.querySelector('.dzialki-map'),r=el.getBoundingClientRect();el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientX:r.left+r.width/2,clientY:r.top+r.height/2}));})()`);
  const selected=await waitFor(state=>state.selectedCount>0);
  if(!selected.selectedCount)throw new Error('Nie uzyskano zaznaczenia do próby kolorów.');
  await evaluate(`(()=>{document.querySelector('[data-layer-group="tools"]').open=true;document.querySelector('[data-selection-color="#7c3aed"]').click();const el=document.querySelector('#dzialki-outline-color');el.value='#010203';el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const colors=await read();
  if(offline)await evaluate(`(()=>{const el=document.createElement('p');el.textContent='TEST OFFLINE — atrapy usług, dane fikcyjne.';document.querySelector('.dzialki-header').append(el);})()`);
  await capture('m4e1-colors.png');
  await tab('rcn');await tab('dzialki');await waitForMap(origin);
  const restored=await waitFor(state=>state.outlineStrokes.length>0);
  await evaluate("document.querySelector('#dzialki-clear-selection').click()");const cleared=await read();
  await tab('rcn');await tab('dzialki');await waitForMap(origin);const afterClear=await read();
  const assertions=[
    {name:'Osiem kolorów i jeden aktywny wybór',pass:colors.paletteCount===8&&colors.pressedCount===1},
    {name:'Kolor aktualizuje istniejące zaznaczenie i kontury',pass:colors.color==='#7c3aed'&&colors.outline==='#010203'&&colors.selectedStrokes.length>0&&colors.selectedStrokes.every(c=>c==='#7c3aed')&&colors.outlineStrokes.length>0&&colors.outlineStrokes.every(c=>c==='#010203')},
    {name:'Zaznaczenie i kolory zachowane między zakładkami',pass:restored.selectedCount===selected.selectedCount&&restored.color==='#7c3aed'&&restored.outline==='#010203'&&restored.selectedStrokes.every(c=>c==='#7c3aed')},
    {name:'Wyczyść usuwa geometrię i powrót jej nie przywraca',pass:cleared.selectedCount===0&&cleared.selectedStrokes.length===0&&afterClear.selectedCount===0&&afterClear.initialized},
    {name:'Brak opcji rodziny działek',pass:!colors.familyPresent&&!restored.familyPresent},
  ];
  let mobile=null;
  if(offline){
    await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await sleep(500);
    mobile=await evaluate('({width:innerWidth,scrollWidth:document.documentElement.scrollWidth})');
    assertions.push({name:'390 px bez przewijania dokumentu w bok',pass:mobile.scrollWidth<=mobile.width+1});await capture('m4e1-mobile.png');
  }
  await tab('rcn');
  const removed=await evaluate("!document.querySelector('.leaflet-container')");
  assertions.push({name:'Mapa usunięta przy opuszczeniu zakładki',pass:removed});
  return{colors,restored,cleared,afterClear,mobile,assertions};
}
