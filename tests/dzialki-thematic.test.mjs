import test from "node:test";
import assert from "node:assert/strict";
import { createFakeDom } from "./helpers/fake-dom.mjs";
import { createFakeLeaflet } from "./helpers/fake-leaflet.mjs";
import { resetDzialkiState,updateDzialkiState } from "../app/js/modules/dzialki/state.js";
import { mountPlanningLayers } from "../app/js/modules/dzialki/planning-layers.js";
import { buildThematicGetMapUrl,buildOwnershipUrl,buildRwdzInfoUrl,parseRwdz,rwdzFieldLabel,enrichOwnership,THEMATIC_LEGENDS } from "../app/js/modules/dzialki/thematic-services.js";
import { mountThematicLayers } from "../app/js/modules/dzialki/thematic-layers.js";

const flush = async () => { for (let i = 0; i < 8; i += 1) await new Promise((resolve) => setImmediate(resolve)); };
const prefix = "https://mapy.geoportal.gov.pl/wss/ext/GlownyUrzadNadzoruBudowlanego/RWDZ-WMS";
test("trzy rastry i dwa żądania backendu odtwarzają pełne adresy starego frontu",() => {
  assert.equal(buildThematicGetMapUrl("rwdz",[1,2,3,4]),prefix + "?service=WMS&request=GetMap&layers=pozwolenia_pkt%2Cpozwolenia_POLYGON&styles=&format=image%2Fpng&transparent=true&version=1.3.0&width=256&height=256&crs=EPSG%3A3857&bbox=1,2,3,4");
  assert.equal(buildThematicGetMapUrl("flood",[1,2,3,4]),"https://wody.isok.gov.pl/wss/INSPIRE/INSPIRE_NZ_HY_MZPMRP_WMS?service=WMS&request=GetMap&layers=NZ.Fluvial%2CNZ.SeaWater&styles=NZ.HazardArea_r.Default%2CNZ.HazardArea_sea.Default&format=image%2Fpng&transparent=true&version=1.3.0&width=256&height=256&crs=EPSG%3A3857&bbox=1,2,3,4");
  assert.equal(buildThematicGetMapUrl("kiut",[1,2,3,4]),"https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu?service=WMS&request=GetMap&layers=gesut%2Ckgesut_dane%2Cprzewod_urzadzenia%2Cprzewod_specjalny%2Cprzewod_niezidentyfikowany%2Cprzewod_elektroenergetyczny%2Cprzewod_telekomunikacyjny%2Cprzewod_gazowy%2Cprzewod_cieplowniczy%2Cprzewod_kanalizacyjny%2Cprzewod_wodociagowy&styles=&format=image%2Fpng&transparent=true&version=1.1.1&width=256&height=256&srs=EPSG%3A3857&bbox=1,2,3,4");
  assert.equal(buildOwnershipUrl({getSouth:()=>53,getWest:()=>16,getNorth:()=>54,getEast:()=>17}),"https://analizator-nieruchomosci.onrender.com/api/ownership-national?bbox=53%2C16%2C54%2C17");
  assert.equal(buildRwdzInfoUrl({bbox:[1,2,3,4],size:{x:1000,y:800},pixel:{x:500.9,y:400.2}}),"https://analizator-nieruchomosci.onrender.com/api/rwdz-feature-info?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&LAYERS=pozwolenia_pkt%2Cpozwolenia_POLYGON&QUERY_LAYERS=pozwolenia_pkt%2Cpozwolenia_POLYGON&STYLES=default%2Cdefault&CRS=EPSG%3A3857&BBOX=1%2C2%2C3%2C4&WIDTH=1000&HEIGHT=800&FORMAT=image%2Fpng&INFO_FORMAT=text%2Fxml&I=500&J=400&FEATURE_COUNT=5");
  assert.equal(THEMATIC_LEGENDS.rwdz[0],prefix + "?version=1.3.0&service=WMS&request=GetLegendGraphic&sld_version=1.1.0&layer=pozwolenia_pkt&format=image/png&STYLE=default");
  assert.equal(THEMATIC_LEGENDS.rwdz[1],prefix + "?version=1.3.0&service=WMS&request=GetLegendGraphic&sld_version=1.1.0&layer=pozwolenia_POLYGON&format=image/png&STYLE=default");
  assert.deepEqual(THEMATIC_LEGENDS.flood,[
    "https://wody.isok.gov.pl/wss/INSPIRE/INSPIRE_NZ_HY_MZPMRP_WMS?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetLegendGraphic&LAYER=NZ.Fluvial&STYLE=NZ.HazardArea_r.Default&FORMAT=image/png&WIDTH=490&HEIGHT=80",
    "https://wody.isok.gov.pl/wss/INSPIRE/INSPIRE_NZ_HY_MZPMRP_WMS?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetLegendGraphic&LAYER=NZ.SeaWater&STYLE=NZ.HazardArea_sea.Default&FORMAT=image/png&WIDTH=658&HEIGHT=60",
  ]);
  assert.throws(() => buildThematicGetMapUrl("unknown",[1,2,3,4]));
});

function parserWithRecords({count = 1,fields = [["nazwa_zamierzenia","Fikcyjna inwestycja"],["informacje_dodatkowe","pomijane"],["geom","pomijane"],["nazwisko_projektanta","Fikcyjny"]],mode = "attribute"} = {}) {
  const {document} = createFakeDom();
  const doc = document.createElement("root");
  for (let i = 0; i < count; i += 1) {
    const member = document.createElement("gml:featureMember"),feature = document.createElement("pozwolenia_pkt");
    for (const [key,value] of fields) {
      const field = document.createElement(mode === "attribute" ? "Attribute" : key);
      if (mode === "attribute") field.setAttribute("Name",key);
      field.textContent = value; feature.append(field);
    }
    member.append(feature); doc.append(member);
  }
  return class Parser { parseFromString() { return doc; } };
}
test("RWDZ obsługuje Attribute i GML, zachowuje limity 5×16 oraz pomija pola niewyświetlane w źródle",() => {
  for (const mode of ["attribute","gml"]) {
    const records = parseRwdz("synthetic",parserWithRecords({mode}));
    assert.equal(records.length,1);
    assert.ok(records[0].some(([key,value]) => key === "Nazwa zamierzenia budowlanego" && value === "Fikcyjna inwestycja"));
    assert.equal(records[0].some(([key]) => /geom|informacje/i.test(key)),false);
    assert.ok(records[0].some(([key]) => key === "Projektant"));
  }
  assert.equal(rwdzFieldLabel("data_wplywu_wniosku"),"Data wpływu wniosku");
  const records = parseRwdz("synthetic",parserWithRecords({count:7,fields:Array.from({length:20},(_,i)=>["pole_"+i,"fikcyjne"])}));
  assert.equal(records.length,5); assert.ok(records.every((record)=>record.length===16));
  class ErrorParser { parseFromString() { return {querySelector:()=>({textContent:"error"})}; } }
  assert.throws(()=>parseRwdz("synthetic",ErrorParser));
});

const feature = (i) => ({type:"Feature",properties:{id_dzialki:"998877_2.0001."+i},geometry:{type:"Polygon",coordinates:[[[16,53],[16.01,53],[16.01,53.01],[16,53.01],[16,53]]]}});
test("uzupełnienie własności ma do 4 żądań jednocześnie i 60 na partię; cache pozwala dokończyć pozostałe",async () => {
  const features = Array.from({length:61},(_,i)=>feature(i)),cache = new Map();
  let active = 0,maxActive = 0,calls = 0;
  const fetchImpl = async (_url,options) => {
    assert.equal(options.method,"GET"); calls += 1; active += 1; maxActive = Math.max(maxActive,active);
    await new Promise((resolve)=>setImmediate(resolve)); active -= 1;
    return {ok:true,text:async()=>'<FeatureInfoResponse><Attribute Name="Grupa rejestrowa">7</Attribute></FeatureInfoResponse>'};
  };
  const first = await enrichOwnership(features,{fetchImpl,cache});
  assert.equal(first.missing,1); assert.equal(calls,60); assert.equal(maxActive,4);
  const second = await enrichOwnership(features,{fetchImpl,cache});
  assert.equal(second.missing,0); assert.equal(calls,61);
  await enrichOwnership(Array.from({length:61},(_,i)=>feature(i)),{fetchImpl,cache});
  assert.equal(calls,61,"znane grupy nie są pobierane ponownie");
});
test("niezgodna działka nie dostaje grupy, a anulowane odpowiedzi nie aktualizują cache",async () => {
  const wrong = await enrichOwnership([feature(1)],{fetchImpl:async()=>({ok:true,text:async()=>'<Attribute Name="Identyfikator działki">998877_2.0001.2</Attribute><Attribute Name="Grupa rejestrowa">7</Attribute>'})});
  assert.equal(wrong.missing,1); assert.equal(wrong.failures,1);
  const controller = new AbortController(),cache = new Map(); let release;
  const task = enrichOwnership([feature(1)],{signal:controller.signal,cache,fetchImpl:()=>new Promise((resolve)=>{release=resolve;})});
  controller.abort(); release({ok:true,text:async()=>'<Attribute Name="Grupa rejestrowa">7</Attribute>'});
  await assert.rejects(task,{name:"AbortError"}); assert.equal(cache.size,0);
});

function setup(t,options = {}) {
  resetDzialkiState();
  const dom = createFakeDom(),leaflet = createFakeLeaflet(),timers = new Map(); let clock = 0,next = 0;
  const first = dom.document.createElement("div"),second = dom.document.createElement("div"); dom.document.body.append(first,second);
  const map = leaflet.L.map(dom.document.createElement("div"),{});
  const controller = mountThematicLayers(first,second,{document:dom.document,subscribeBackendStatus:()=>()=>{},getBackendStatus:()=>({state:"ready"}),groupCache:new Map(),
    setTimeoutFn:(fn,delay)=>{const id=++next;timers.set(id,{fn,at:clock+delay});return id;},clearTimeoutFn:(id)=>timers.delete(id),nowFn:()=>clock,...options});
  t.after(()=>{controller.cleanup();resetDzialkiState();}); controller.attach(map,leaflet.L);
  return {...dom,...leaflet,map,controller,timers,
    change(id,value) {const input=dom.document.getElementById("dzialki-thematic-"+id);input.checked=value;input.dispatch("change");},
    status(id) {return dom.document.querySelectorAll("[data-thematic-status]").find((node)=>node.dataset.thematicStatus===id);},
    tick(ms) {clock+=ms;for(const [id,timer]of[...timers])if(timer.at<=clock){timers.delete(id);timer.fn();}},
  };
}
test("cztery przełączniki startują wyłączone, raster ma monitor i cleanup, legenda ISOK obsługuje Escape i Tab",(t) => {
  const fake = setup(t);
  assert.equal(fake.document.querySelectorAll("[data-thematic-layer]").length,4); assert.equal(fake.map.layers.size,0);
  fake.change("rwdz",true);
  const layer = fake.layers[0]; layer._tiles.a = {current:true,el:{complete:true,naturalWidth:256,naturalHeight:256}};
  layer.fire("tileload",{tile:layer._tiles.a.el}); assert.equal(fake.status("rwdz").dataset.state,"complete");
  fake.change("rwdz",false); assert.equal(layer.listenerCount("tileerror"),0); assert.equal(fake.timers.size,0);
  const dialog = fake.document.querySelector('[role="dialog"]'),backdrop=dialog.parentElement;
  const button = fake.document.querySelectorAll("button").find((node)=>node.attributes.get("aria-label")?.includes("Informacja: Zagrożenie"));
  assert.equal(backdrop.hidden,true); button.click(); assert.equal(backdrop.hidden,false);
  const close = dialog.querySelector("button"),link = dialog.querySelector("a");
  assert.equal(fake.document.activeElement,close);
  dialog.dispatch("keydown",{key:"Tab",shiftKey:true}); assert.equal(fake.document.activeElement,link);
  dialog.dispatch("keydown",{key:"Tab",shiftKey:false}); assert.equal(fake.document.activeElement,close);
  dialog.dispatch("keydown",{key:"Escape"}); assert.equal(backdrop.hidden,true); assert.equal(fake.document.activeElement,button);
  fake.controller.cleanup(); assert.equal(fake.document.body.contains(backdrop),false);
});
test("własność rozróżnia poprawny pusty wynik, niepełne grupy i błąd usługi",async (t) => {
  let mode = "empty";
  const fake = setup(t,{fetchImpl:async(url)=>({ok:mode!=="error",status:503,json:async()=>({type:"FeatureCollection",features:mode==="empty"?[]:[feature(1)]}),
    text:async()=>'<FeatureInfoResponse/>'})});
  fake.change("ownership",true); fake.tick(350); await flush(); assert.equal(fake.status("ownership").dataset.state,"empty");
  mode = "missing"; fake.map.fire("moveend"); fake.tick(350); await flush(); assert.equal(fake.status("ownership").dataset.state,"incomplete");
  mode = "error"; fake.map.fire("moveend"); fake.tick(350); await flush(); assert.equal(fake.status("ownership").dataset.state,"error");
  fake.change("ownership",false); assert.equal(fake.map.layers.size,0);
});
test("popup RWDZ renderuje tekst bez HTML i odróżnia brak wpisu od błędu",async (t) => {
  let fail = false;
  const Parser = parserWithRecords({fields:[["nazwa_zamierzenia","<script>fikcyjne</script>"]]});
  const fake = setup(t,{DOMParser:Parser,fetchImpl:async()=>({ok:!fail,status:503,text:async()=>"synthetic"})});
  fake.change("rwdz",true);
  const event = {latlng:{lat:53,lng:17},containerPoint:{x:500,y:400}};
  const popup = fake.controller.extendPopup("Działka fikcyjna",event); await flush();
  assert.equal(popup.querySelector("section").dataset.state,"ready"); assert.equal(popup.querySelectorAll("script").length,0);
  assert.match(popup.textContent,/<script>fikcyjne<\/script>/);
  fail = true; const error = fake.controller.extendPopup("Działka fikcyjna",event); await flush();
  assert.equal(error.querySelector("section").dataset.state,"error");
  assert.match(error.textContent,/Nie udało się pobrać szczegółów/);
});

test("RWDZ i MPZP współdzielą popup także bez EGiB; zamknięcie anuluje oba żądania",async(t)=>{
  const signals=[];
  const fake=setup(t,{fetchImpl:async(_url,options)=>{signals.push(options.signal);return new Promise(()=>{});}});
  updateDzialkiState({egibLayers:{numbers:false,parcels:false,buildings:false},planningLayers:{mpzp:true}});
  fake.change("rwdz",true);
  let planning;
  planning=mountPlanningLayers(fake.document.body,{document:fake.document,subscribeBackendStatus:()=>()=>{},getBackendStatus:()=>({state:"ready"}),
    setTimeoutFn:()=>1,clearTimeoutFn:()=>{},hasAdditionalPopup:()=>fake.controller.hasPopup(),
    fetchImpl:async(_url,options)=>{signals.push(options.signal);return new Promise(()=>{});},
    extendStandalonePopup:(content,event)=>fake.controller.extendPopup(planning.extendPopup(content,event),event),
    onPopupOpen:(popup)=>{planning.onPopupOpen(popup);fake.controller.onPopupOpen(popup);},
  });
  t.after(()=>planning.cleanup());planning.attach(fake.map,fake.L);
  fake.map.fire("click",{latlng:{lat:53,lng:17},containerPoint:{x:500,y:400}});await flush();
  const popup=fake.map.popup,root=popup.getContent();
  assert.equal(root.querySelectorAll("section").length,2);
  assert.match(root.textContent,/Plan miejscowy/);assert.match(root.textContent,/GUNB RWDZ/);
  assert.ok(signals.length>=2);
  fake.map.fire("popupclose",{popup});
  assert.ok(signals.every(signal=>signal.aborted));
  assert.ok(root.querySelectorAll("section").every(section=>section.dataset.state==="cancelled"));
});
