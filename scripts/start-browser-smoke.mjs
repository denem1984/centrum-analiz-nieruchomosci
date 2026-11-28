import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { BACKENDS } from "../app/js/config.js";
import { createRcnDemo } from "../app/js/modules/rcn/demo.js";
import { createOffersDemoFetch } from "../app/js/modules/oferty/demo.js";
import { buildBrowserLaunchArgs, CdpConnection, chooseBrowserPath, waitForDebugger } from "./browser-smoke.mjs";
import { createStaticServer } from "./serve.mjs";
import { openSmokeBudget } from "./smoke-budget.mjs";

const [headed, browserFlag, browserPathArg, publicFlag] = process.argv.slice(2);
assert.ok(headed === "--headed" && browserFlag === "--browser" && browserPathArg && (!publicFlag || publicFlag === "--public-map"),
  'Użycie: node scripts/start-browser-smoke.mjs --headed --browser "ścieżka do Edge" [--public-map]');
const browserPath = chooseBrowserPath({ explicitPath: browserPathArg });
assert.ok(browserPath);
const artifacts = resolve(".local-results", "start-browser-smoke");
await mkdir(artifacts, { recursive: true });
const output = await mkdtemp(join(artifacts, "run-"));
const budget = await openSmokeBudget(resolve(".local-results", "budgets", "start-m3c.json"), "start-m3c");
assert.ok(await budget.reserveLaunch(), "Wyczerpano budżet M3c");
const profile = join(output, "profile");
const child = spawn(browserPath, buildBrowserLaunchArgs({ headed: true, profile }), { stdio: "ignore" });
const server = createStaticServer();
server.listen(0, "127.0.0.1");
await once(server, "listening");
const origin = "http://127.0.0.1:" + server.address().port;
const errors = [];
const requests = { rcn: [], oferty: [], prg: [], uug: [], uldk: [] };
const rcnDemo = createRcnDemo({});
const ofertyDemo = createOffersDemoFetch();
const polygon = [[20.47, 53.77], [20.48, 53.77], [20.48, 53.78], [20.47, 53.78], [20.47, 53.77]];
const parcelId = "286201_1.0001.12/3";
const publicUrls = [
  "https://mapy.geoportal.gov.pl/wss/ims/maps/PRG_gugik_wyszukiwarka/FeatureServer/0/query?where=teryt%3D%272862011%27&outFields=teryt%2Cnazwa&returnGeometry=true&outSR=4326&f=json",
  "https://services.gugik.gov.pl/uug/?request=GetAddress&address=Olsztyn%2C+Aleja+Warszawska",
  "https://uldk.gugik.gov.pl/?request=GetParcelById&id=281603_4.0001.1849&result=id%2Cteryt%2Cparcel%2Ccounty%2Ccommune%2Cregion%2Cgeom_wkt&srid=4326",
];
const sent = new Set();
let verifyPublic = false;
let page;
let browser;

async function evaluate(code) {
  const { result, exceptionDetails } = await page.command("Runtime.evaluate", {
    expression: `(() => {
      const id = (name) => document.getElementById("start-" + name);
      const rcn = (name) => document.querySelector("[data-rcn]")?.shadowRoot?.getElementById(name);
      const part = (scope, name) => document.querySelector("[data-" + scope + "]")?.querySelector('[data-part="' + name + '"]');
      const go = (route) => document.querySelector('[data-module-link="' + route + '"]').click();
      const change = (name, value, event = "change") => {
        id(name).value = value;
        id(name).dispatchEvent(new Event(event, { bubbles: true }));
      };
      return (${code});
    })()`, returnByValue: true,
  });
  if (exceptionDetails) throw new Error(result.description ?? exceptionDetails.text);
  return result.value;
}

async function screenshot(name) {
  const { data } = await page.command("Page.captureScreenshot", { format: "png" });
  await writeFile(join(output, name + ".png"), Buffer.from(data, "base64"));
}
async function check(code) {
  for (let n = 0; n < 140; n += 1) {
    if (await evaluate(code)) return;
    await sleep(55);
  }
  await screenshot("blad");
  throw new Error(code + " • " + await evaluate("id('status')?.textContent ?? rcn('status')?.textContent ?? document.querySelector('#module-view')?.innerText.slice(0,300)"));
}

async function fulfill(requestId, response) {
  return page.command("Fetch.fulfillRequest", {
    requestId, responseCode: response.status,
    body: Buffer.from(await response.arrayBuffer()).toString("base64"),
    responseHeaders: [
      { name: "Content-Type", value: response.headers.get("Content-Type") ?? "text/plain" },
      { name: "Access-Control-Allow-Origin", value: "*" },
    ],
  });
}

async function handle({ requestId, request }) {
  const url = new URL(request.url);
  if (url.origin === origin) return page.command("Fetch.continueRequest", { requestId });
  assert.equal(request.method, "GET");
  if (verifyPublic && publicUrls.includes(url.href) && !sent.has(url.href)) {
    assert.ok(await budget.reserveRequest(url.href), "Wyczerpano budżet żądań do GUGiK");
    sent.add(url.href);
    return page.command("Fetch.continueRequest", { requestId });
  }
  const json = (payload) => fulfill(requestId, Response.json(payload));
  if (Object.values(BACKENDS).some((item) => url.origin === item.baseUrl && url.pathname === item.healthPath)) return json({ ok: true });
  if (url.origin === BACKENDS.RCN.baseUrl) {
    const key = url.pathname + url.search;
    requests.rcn.push(key);
    return fulfill(requestId, await rcnDemo(key));
  }
  if (url.origin === BACKENDS.Oferty.baseUrl) {
    requests.oferty.push(url.pathname + url.search);
    return fulfill(requestId, await ofertyDemo(url.href));
  }
  if (url.hostname === "mapy.geoportal.gov.pl" && url.pathname.endsWith("/FeatureServer/0/query")) {
    requests.prg.push(url.href);
    return json({ spatialReference: { wkid: 4326 }, features: [
      { attributes: { teryt: "2862011" }, geometry: { rings: [polygon] } },
    ] });
  }
  if (url.hostname === "services.gugik.gov.pl" && url.pathname === "/uug/") {
    requests.uug.push(url.href);
    const address = url.searchParams.get("address");
    const streetName = address?.includes("Warszawska") ? "Aleja Warszawska" : null;
    const payload = { results: {
      a: { simc: "0964465", city: "Olsztyn", street: streetName, ulic: streetName && "38564", x: "600000", y: "600000" },
      b: { simc: "0140675", city: "Olsztyn", x: "500000", y: "400000" },
    } };
    if (address !== "Olsztyn") return json(payload);
    await sleep(220);
    await json(payload).catch((error) => {
      if (!/invalid interceptionid|invalid requestid|invalid request id/i.test(error.message)) throw error;
    });
    return;
  }
  if (url.hostname === "uldk.gugik.gov.pl") {
    requests.uldk.push(url.href);
    const body = url.searchParams.get("request") === "GetRegionByNameOrId"
      ? "0\n286201_1.0001|2862011|Obręb testowy|Olsztyn|Olsztyn"
      : "0\n" + parcelId + "|2862011|12/3|Olsztyn|Olsztyn|Obręb testowy|POLYGON((20.47 53.77,20.471 53.77,20.471 53.771,20.47 53.77))";
    return fulfill(requestId, new Response(body));
  }
  if (url.pathname === "/api/wfs") return json({ type: "FeatureCollection", features: [] });
  if (url.hostname === "integracja.gugik.gov.pl" && url.searchParams.get("REQUEST")?.toLowerCase() === "getfeatureinfo") {
    return fulfill(requestId, new Response("<FeatureCollection/>", { headers: { "Content-Type": "text/xml" } }));
  }
  if (request.headers.Accept?.includes("image/") || request.headers.accept?.includes("image/")) {
    const tile = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e7eeeb"/><path d="M0 256 256 0 M0 0H256V256" stroke="#c8d6cf" fill="none"/></svg>';
    return fulfill(requestId, new Response(tile, { headers: { "Content-Type": "image/svg+xml" } }));
  }
  errors.push("Nieobsłużone żądanie " + url.host + url.pathname);
  return page.command("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
}

try {
  const { port, version } = await waitForDebugger(profile, child);
  browser = new CdpConnection(version.webSocketDebuggerUrl);
  await browser.connect();
  const tabs = await (await fetch("http://127.0.0.1:" + port + "/json/list")).json();
  page = new CdpConnection(tabs.find((tab) => tab.type === "page").webSocketDebuggerUrl);
  await page.connect();
  page.onEvent = ({ method, params }) => {
    if (method === "Fetch.requestPaused") {
      void handle(params).catch(async (error) => {
        if (await evaluate("Boolean(document)").catch(() => false)) errors.push(error.message);
        await page.command("Fetch.failRequest", { requestId: params.requestId, errorReason: "BlockedByClient" }).catch(() => {});
      });
    }
    if (method === "Runtime.exceptionThrown") errors.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
  };
  await page.command("Page.enable");
  await page.command("Page.bringToFront");
  await page.command("Runtime.enable");
  await page.command("Fetch.enable", { patterns: [{ urlPattern: "http*" }] });
  await page.command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await page.command("Page.navigate", { url: origin + "/#/start" });
  await check("id('voiv')?.options.length === 17 && document.querySelector('#start-map.leaflet-container')");
  await evaluate("change('voiv','28'), change('county','2862'), change('commune','2862011'), id('form').requestSubmit()");
  await check("id('map-caption').textContent.includes('Granica gminy') && document.querySelector('#start-map .leaflet-overlay-pane path')");
  await screenshot("obszar-desktop");
  await evaluate("go('gminy')");
  await check("part('gminy','target')?.value === 'Olsztyn' && !part('gminy','filters').disabled");
  await evaluate("part('gminy','form').requestSubmit()");
  await check("part('gminy','ranking').children.length === 20");
  await evaluate("go('rcn')");
  await check("rcn('gmina_mode')?.checked");
  assert.equal(requests.rcn.length, 0);
  await evaluate("rcn('searchBtn').click()");
  await check("rcn('status').textContent.includes('W tabeli:')");
  await evaluate("go('oferty')");
  await check("part('oferty','submit')?.disabled && document.querySelector('[data-oferty] .shared-location-notice').textContent.includes('wymagają miejscowości')");
  await evaluate("go('start')");
  await check("!id('submit')?.disabled && id('commune').value === '2862011'");
  await evaluate("change('voiv',''), change('mode','address'), change('place-query','Olsztyn','input'), id('find-place').click()");
  await check("Array.from(id('place').options).some(x => x.value === '0140675') && Array.from(id('place').options).some(x => x.value === '0964465')");
  await evaluate("change('place','0964465')");
  await check("Array.from(id('street').options).some(x => x.value === '38564')");
  await evaluate("change('street','38564'), id('form').requestSubmit()");
  await check("id('map-caption').textContent.includes('Punkt orientacyjny ulicy') && id('selection').textContent.includes('Warszawska')");
  await screenshot("adres-desktop");
  await evaluate("go('rcn')");
  await check("rcn('city')?.value === 'Olsztyn' && rcn('street').value.includes('Warszawska')");
  await evaluate("rcn('searchBtn').click()");
  await check("rcn('status').textContent.includes('W tabeli:')");
  await evaluate("go('oferty')");
  await check("part('oferty','location')?.value === 'Olsztyn' && !part('oferty','submit').disabled");
  await evaluate("part('oferty','form').requestSubmit()");
  await check("!part('oferty','results').hidden");
  await evaluate("go('podobne')");
  await check("document.querySelector('.similar-subject [data-field=status]')?.textContent.includes('Punkt orientacyjny ulicy')");
  await check("!document.querySelector('[data-part=comparisons] [data-field=form]').hidden");
  await evaluate("go('start')");
  await check("!id('submit')?.disabled");
  await evaluate("change('mode','parcel')");
  await check("Array.from(id('district').options).some(x => x.value === '286201_1.0001')");
  await evaluate("change('parcel-id', '" + parcelId + "', 'input'), id('form').requestSubmit()");
  await check("id('map-caption').textContent.includes('Obrys działki')");
  await evaluate("go('dzialki')");
  await check("document.getElementById('dzialki-search-numer')?.value === '12/3' && document.querySelector('[class*=\"dzialki-selection-pane\"] path')");
  assert.equal(await evaluate("getComputedStyle(document.getElementById('dzialki-search-powiat').parentElement).display"), "none");
  await evaluate("go('podobne')");
  await check("document.querySelector('.similar-subject [data-field=status]')?.textContent.includes('" + parcelId + "')");
  await evaluate("document.getElementById('clear-location').click()");
  await check("!location.hash.includes('ctx=') && document.querySelector('[data-podobne] .shared-location-notice')?.textContent.includes('wymaga działki')");
  await evaluate("go('start')");
  await check("!id('submit')?.disabled");
  await evaluate("change('voiv','28'), change('county','2862'), change('commune','2862011'), change('place-query','Olsztyn','input'), id('find-place').click()");
  await check("Array.from(id('place').options).some(x => x.value === '0964465')");
  await evaluate("change('place','0964465'), id('form').requestSubmit()");
  await sleep(70);
  await evaluate("change('voiv','02')");
  await sleep(310);
  assert.equal(await evaluate("location.hash"), "#/start");
  assert.equal(await evaluate("id('commune').value"), "");
  await page.command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await page.command("Page.navigate", { url: origin + "/?start=demo#/start" });
  await check("!id('submit')?.disabled && document.querySelector('.shared-start-demo')");
  await evaluate("change('mode','parcel'), change('parcel-id','" + parcelId + "','input'), id('form').requestSubmit()");
  await check("id('map-caption').textContent.includes('Obrys działki')");
  assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"));
  await screenshot("dzialka-mobile");
  await evaluate("id('map').scrollIntoView({ block: 'center' })");
  await screenshot("mapa-mobile");

  const searches = requests.rcn.map((path) => new URL(path, BACKENDS.RCN.baseUrl));
  assert.equal(searches.length, 2);
  assert.equal(searches[0].pathname, "/api/search");
  assert.equal(searches[0].searchParams.get("area_admin_level"), "gmina");
  assert.equal(searches[0].searchParams.get("gmina_teryt6"), "286201");
  assert.equal(searches[0].searchParams.get("street"), null);
  assert.equal(searches[1].searchParams.get("city"), "Olsztyn");
  assert.equal(searches[1].searchParams.get("teryt"), "286201");
  assert.match(searches[1].searchParams.get("street"), /Warszawska/);
  assert.equal(requests.oferty.length, 1);
  assert.match(requests.oferty[0], /^\/api\/live\/combined\?location=Olsztyn&teryt=2862011&simc=0964465&area=/);
  assert.ok(requests.uldk.some((url) => url.includes("GetParcelById&id=286201_1.0001.12%2F3")));
  assert.deepEqual(errors, []);
  let publicMap = [];
  if (publicFlag) {
    verifyPublic = true;
    const { result } = await page.command("Runtime.evaluate", {
      expression: `Promise.all(${JSON.stringify(publicUrls)}.map(async (url) => {
        try {
          const result = await fetch(url, {signal: AbortSignal.timeout(10000)});
          return [new URL(url).host, result.status];
        } catch (error) { return [new URL(url).host, error.name]; }
      }))`, awaitPromise: true, returnByValue: true,
    }, 15_000);
    publicMap = result.value;
  }
  await writeFile(join(output, "result.json"), JSON.stringify({ requests, sentToExternalServices: sent.size, publicMap }, null, 2));
  if (publicFlag) console.log("Publiczne usługi GUGiK z poziomu Edge:", publicMap);
  console.log("PASS M3c. " + output);
} finally {
  await browser?.command("Browser.close", {}, 2000).catch(() => {});
  page?.close();
  browser?.close();
  if (!browser) child.kill();
  server.close();
  await budget.close();
}
