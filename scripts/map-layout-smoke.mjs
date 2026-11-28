import { runMapToolsSmoke } from "./map-tools-smoke.mjs";

const geometry = `(()=>{const panel=document.querySelector('.dzialki-controls'),map=document.querySelector('.dzialki-map'),frame=document.querySelector('.dzialki-map-frame');const p=panel.getBoundingClientRect(),m=map.getBoundingClientRect(),f=frame.getBoundingClientRect();return{scroll:panel.scrollTop,max:panel.scrollHeight-panel.clientHeight,windowY:scrollY,map:{top:m.top,left:m.left,width:m.width,height:m.height},panel:{top:p.top,left:p.left,height:p.height},frameHeight:f.height,width:innerWidth,scrollWidth:document.documentElement.scrollWidth};})()`;

export async function runMapLayoutSmoke(options) {
  const {evaluate,command,sleep,origin,context,waitForMap,setZoom,capture,verifyLines} = options;
  await command("Page.navigate",{url:origin+"/#/dzialki?ctx="+context}); await waitForMap(origin); await setZoom();
  const assertions=[], views=[];
  for(const [width,height] of [[1280,800],[390,844],[390,600]]) {
    await command("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width<500}); await sleep(350);
    await evaluate(`(()=>{for(const el of document.querySelectorAll('.dzialki-layer-group'))el.open=true;document.querySelector('.dzialki-layout').scrollIntoView({block:'start'});document.querySelector('.dzialki-controls').scrollTop=0;})()`); await sleep(200);
    const before=await evaluate(geometry);
    const wheel=async()=>{await command("Input.dispatchMouseEvent",{type:"mouseWheel",x:before.panel.left+80,y:before.panel.top+Math.min(80,before.panel.height/2),deltaX:0,deltaY:500});await sleep(250);};
    await wheel();const after=await evaluate(geometry);
    await evaluate("(()=>{const p=document.querySelector('.dzialki-controls');p.scrollTop=p.scrollHeight;})()");await wheel();const edge=await evaluate(geometry);
    const stable=s=>Math.abs(s.windowY-before.windowY)<2&&Math.abs(s.map.top-before.map.top)<2&&Math.abs(s.map.left-before.map.left)<2;
    assertions.push({name:width+'×'+height+': panel przewija się samodzielnie, mapa pozostaje w miejscu',pass:after.scroll>before.scroll&&stable(after)});
    assertions.push({name:width+'×'+height+': koniec panelu nie przewija strony ani mapy',pass:stable(edge)});
    assertions.push({name:width+'×'+height+': mapa i panel mieszczą się w obszarze roboczym',pass:before.map.height>50&&before.panel.height>50&&before.scrollWidth<=before.width+1&&(width>=500||before.map.top<before.panel.top)});
    views.push({width,height,before,after,edge});await capture('map-layout-'+width+'-'+height+'.png');
  }
  await command("Emulation.setDeviceMetricsOverride",{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  const tools=await runMapToolsSmoke(options); assertions.push(...tools.assertions);
  let lines=null;
  if(verifyLines){
    // Public vector-plan example from GUGiK's 2023 guide, transformed from EPSG:2180.
    const x=2376394.2425,y=6840382.314,rad=180/Math.PI;
    const point={lat:(2*Math.atan(Math.exp(y/6378137))-Math.PI/2)*rad,lon:x/6378137*rad,crs:'EPSG:4326'};
    const encoded=Buffer.from(JSON.stringify({version:'1',source:'start',kind:'punkt',match:'exact',point})).toString('base64url');
    await command("Emulation.setDeviceMetricsOverride",{width:1280,height:800,deviceScaleFactor:1,mobile:false});
    await command("Page.navigate",{url:origin+'/#/dzialki?ctx='+encoded}); await waitForMap(origin);
    await evaluate("document.querySelector('#dzialki-measure-clear').click()");
    // Fixture EGiB tiles are opaque; hide them so they cannot cover the real line layer.
    await evaluate("(()=>{for(const el of document.querySelectorAll('[data-egib-layer]')){el.checked=false;el.dispatchEvent(new Event('change',{bubbles:true}));}})()");
    await evaluate(`(()=>{const z=document.querySelector('input[aria-label="Przybliżenie mapy"]');z.value='19.5';z.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-layer-group="planning"]').open=true;const l=document.querySelector('#dzialki-planning-buildingLines');l.checked=true;l.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('.dzialki-layout').scrollIntoView({block:'start'});})()`);
    await evaluate("(()=>{const p=document.createElement('p');p.textContent='RZECZYWISTE LINIE KIMPZP; pozostałe warstwy — atrapy.';p.style.cssText='background:white;padding:12px';document.querySelector('.dzialki-map-frame').append(p);document.querySelector('#dzialki-planning-buildingLines').parentElement.querySelector('button').click();document.querySelector('#dzialki-planning-buildingLines').scrollIntoView({block:'nearest'});})()");
    const deadline=Date.now()+20000;
    do{await sleep(500);lines=await evaluate(`(()=>{const el=document.querySelector('[data-planning-status="buildingLines"]');return{state:el.dataset.state,loaded:Number(el.dataset.loaded),total:Number(el.dataset.total),images:[...document.querySelectorAll('.leaflet-tile')].filter(i=>i.src&&new URL(i.src).searchParams.get('layers')==='wektor-lzb').map(i=>({url:i.src,loaded:i.complete&&i.naturalWidth>1}))};})()`);}while(Date.now()<deadline&&lines.state==='loading');
    await sleep(1000); // Wait for Leaflet's image fade and ResizeObserver before visual inspection.
    await evaluate("document.querySelector('#dzialki-planning-buildingLines-help').scrollIntoView({block:'nearest'})");
    assertions.push({name:'KIMPZP: rzeczywiste kafelki linii przy dużym zbliżeniu',pass:lines.loaded>0&&lines.loaded===lines.total&&lines.images.length>0&&lines.images.every(i=>i.loaded)});
    await capture('building-lines-live.png');
  }
  return{views,tools,lines,liveBuildingLines:!!verifyLines,assertions};
}
