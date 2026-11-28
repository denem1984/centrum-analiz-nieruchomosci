import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { inspectPlanningPresentation } from "./planning-presentation-smoke.mjs";

export async function runReportPdfSmoke({ evaluate, command, sleep, origin, context, waitForMap, setZoom, capture, resultDir, planningReview }) {
  const url = origin + "/#/dzialki?ctx=" + context;
  const assertions = [];
  const click = id => evaluate("document.getElementById(" + JSON.stringify("dzialki-" + id) + ").click()");
  const report = () => evaluate(`(()=>({
    parcels:document.querySelectorAll('[id^="dzialki-pdf-remove-parcel-"]').length,
    maps:document.querySelectorAll('[id^="dzialki-pdf-remove-map-"]').length,
    text:document.querySelector('#dzialki-pdf-status').textContent,
    saveDisabled:document.querySelector('#dzialki-pdf-save').disabled,
  }))()`);
  async function waitFor(predicate) {
    for (let i = 0; i < 80; i++) {
      const state = await report();
      if (predicate(state)) return state;
      await sleep(250);
    }
    throw new Error("Brak oczekiwanego wyniku raportu PDF: " + (await report()).text);
  }
  await command("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: resultDir });
  await command("Page.navigate", { url });
  await waitForMap(origin);
  await setZoom();
  const empty = await report();
  await evaluate(`(()=>{const el=document.querySelector('.dzialki-map'),r=el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,clientX:r.left+r.width/2,clientY:r.top+70}));})()`);
  await click("menu-add-parcel");
  const parcel = await waitFor(state => state.parcels === 1);
  await evaluate(`(()=>{const toggle = el => {el.checked=true;el.dispatchEvent(new Event('change',{bubbles:true}));};
    toggle(document.querySelector('[data-planning-layer="mpzp"]'));toggle(document.querySelector('[data-thematic-layer="kiut"]'));
    const note=document.createElement('p');note.textContent='TEST OFFLINE - dane fikcyjne';document.querySelector('.dzialki-header').append(note);})()`);
  await sleep(1700);
  await click("pdf-add-map");
  const captured = await waitFor(state => state.maps === 1);
  let planning = null;
  const expectedMaps = planningReview ? 2 : 1;
  if (planningReview) {
    planning = await inspectPlanningPresentation({ evaluate, command, sleep, capture });
    assertions.push(...planning.assertions);
    await click("pdf-add-map");
    await waitFor(state => state.maps === expectedMaps);
  }
  await evaluate("document.querySelector('[data-module-link=\"rcn\"]').click()");
  await evaluate("document.querySelector('[data-module-link=\"dzialki\"]').click()");
  await waitForMap(origin);
  const restored = await report();
  await evaluate("document.querySelector('.dzialki-pdf').scrollIntoView({block:'nearest'})");
  await capture("pdf-draft.png");
  await click("pdf-save");
  let filename;
  let pdf;
  for (let i = 0; i < 80; i++) {
    filename = (await readdir(resultDir)).find(name => /^raport-nieruchomosc-\d{4}-\d{2}-\d{2}\.pdf$/.test(name));
    if (filename) {
      pdf = await readFile(join(resultDir, filename)).catch(() => null);
      if (pdf?.subarray(-30).includes(Buffer.from("%%EOF"))) break;
    }
    await sleep(250);
  }
  await click("pdf-remove-map-0");
  const removed = await report();
  await click("pdf-clear");
  const cleared = await report();
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 600, deviceScaleFactor: 1, mobile: true });
  await sleep(400);
  await evaluate("document.querySelector('.dzialki-pdf').scrollIntoView({block:'nearest'})");
  await capture("pdf-mobile.png");
  const mobile = await evaluate("({viewport:innerWidth,body:document.documentElement.scrollWidth})");
  await click("pdf-add-map");
  await waitFor(state => state.maps === 1);
  await command("Page.reload");
  await waitForMap(origin);
  const reloaded = await report();
  assertions.push(
    { name: "Pusta lista nie eksportuje dokumentu", pass: empty.saveDisabled },
    { name: "Menu mapy dodaje działkę po danych punktu", pass: parcel.parcels === 1 },
    { name: "Zapisano widok mapy z warstwami", pass: captured.maps === 1 && captured.text === "Dodano widok mapy do raportu." },
    { name: "Zmiana zakładki zachowuje działkę i obrazy", pass: restored.parcels === 1 && restored.maps === expectedMaps },
    { name: "Przeglądarka pobrała prawidłowy plik PDF", pass: !!pdf && pdf.subarray(0, 5).toString() === "%PDF-" && pdf.subarray(-30).includes(Buffer.from("%%EOF")) },
    { name: "Usunięcie pozycji i wyczyszczenie listy", pass: removed.maps === expectedMaps - 1 && removed.parcels === 1 && cleared.saveDisabled },
    { name: "390 px bez poziomego przewijania strony", pass: mobile.body <= mobile.viewport + 1 },
    { name: "Odświeżenie usuwa roboczy raport", pass: reloaded.parcels === 0 && reloaded.maps === 0 && reloaded.saveDisabled },
  );
  return { assertions, filename, bytes: pdf?.length ?? 0, captured, mobile, planning };
}
