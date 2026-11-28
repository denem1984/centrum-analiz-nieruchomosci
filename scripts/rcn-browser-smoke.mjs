import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { BACKENDS } from "../app/js/config.js";
import { createRcnDemo } from "../app/js/modules/rcn/demo.js";
import { buildBrowserLaunchArgs, CdpConnection, chooseBrowserPath, waitForDebugger } from "./browser-smoke.mjs";
import { createStaticServer } from "./serve.mjs";
import { openSmokeBudget } from "./smoke-budget.mjs";

const args = process.argv.slice(2);
if (args[0] !== "--headed" || args[1] !== "--browser" || !args[2]) {
  throw new Error('Użycie: node scripts/rcn-browser-smoke.mjs --headed --browser "ścieżka do Edge"');
}
const browserPath = chooseBrowserPath({ explicitPath: args[2] });
assert.ok(browserPath, "Brak wskazanego pliku przeglądarki");
const artifacts = resolve(".local-results", "rcn-browser-smoke");
await mkdir(artifacts, { recursive: true });
const runDir = await mkdtemp(join(artifacts, "run-"));
const budget = await openSmokeBudget(resolve(".local-results", "budgets", "rcn-port.json"), "rcn-port");
try {
  assert.ok(await budget.reserveLaunch(), "Wyczerpano budżet tego scenariusza");
} finally {
  await budget.close();
}
const child = spawn(browserPath, buildBrowserLaunchArgs({
  headed: true, profile: join(runDir, "profile"),
}), { stdio: "ignore" });
const server = createStaticServer();
server.listen(0, "127.0.0.1");
await once(server, "listening");
const origin = "http://127.0.0.1:" + server.address().port;
const mock = createRcnDemo();
const requests = [];
const unexpected = [];
const errors = [];
const downloads = join(runDir, "downloads");
await mkdir(downloads);
let page;
let browser;

async function evaluate(expression) {
  const wrapped = `(() => {
    const root = document.querySelector('[data-rcn]')?.shadowRoot;
    const el = id => root?.getElementById(id);
    const select = (id, value) => {
      el(id).value = value;
      el(id).dispatchEvent(new Event("change"));
    };
    return (${expression});
  })()`;
  const result = await page.command("Runtime.evaluate", { expression: wrapped, returnByValue: true });
  if (result.exceptionDetails) throw Error(result.result?.description || result.exceptionDetails.text);
  return result.result?.value;
}

async function check(expression) {
  for (let attempts = 0; attempts < 100; attempts += 1) {
    if (await evaluate(expression)) return;
    await delay(75);
  }
  throw new Error("Brak oczekiwanego stanu: " + expression + " · " + JSON.stringify(await evaluate(
    "({ page: document.querySelector('#module-view')?.textContent, status: el('status')?.textContent })"
  )));
}

async function respond({ requestId, request }) {
  const url = new URL(request.url);
  if (url.origin === origin) return page.command("Fetch.continueRequest", { requestId });
  const backend = Object.values(BACKENDS).find((item) => item.baseUrl === url.origin);
  const isTile = /^(?:[a-z]\.)?tile\.openstreetmap\.org$/.test(url.hostname)
    || url.hostname === "server.arcgisonline.com";
  const isReverse = url.href.startsWith("https://nominatim.openstreetmap.org/reverse?");
  let response;
  if (isTile) {
    response = new Response(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR42mNgAAIAAAUAAel63DgAAAAASUVORK5CYII=", "base64"),
      { headers: { "content-type": "image/png" } });
  } else if (backend && url.pathname === backend.healthPath && request.method === "GET") {
    response = Response.json({ ok: true });
  } else if (backend?.id === "RCN" || isReverse) {
    requests.push({ path: url.pathname + url.search, method: request.method, body: request.postData });
    if (request.method === "OPTIONS") {
      response = new Response(null, { status: 204 });
    } else if (request.method === "POST" && /^\/api\/export_current\.(docx|xlsx)$/.test(url.pathname)) {
      response = new Response("fixture-" + url.pathname.split(".").at(-1));
    } else {
      response = await mock(url.pathname + url.search);
    }
  } else {
    unexpected.push(url.origin + url.pathname);
    return page.command("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
  }
  return page.command("Fetch.fulfillRequest", {
    requestId,
    responseCode: response.status,
    responseHeaders: [
      { name: "Content-Type", value: response.headers.get("content-type") ?? "application/json" },
      { name: "Access-Control-Allow-Origin", value: "*" },
      { name: "Access-Control-Allow-Methods", value: "GET,POST,OPTIONS" },
      { name: "Access-Control-Allow-Headers", value: "Content-Type" },
    ],
    body: Buffer.from(await response.arrayBuffer()).toString("base64"),
  });
}

async function capture(name) {
  const result = await page.command("Page.captureScreenshot", { format: "png" });
  await writeFile(join(runDir, name), Buffer.from(result.data, "base64"));
}

async function readDownload(name) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      return await readFile(join(downloads, name), "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await delay(75);
    }
  }
  throw new Error("Edge nie zakończył pobierania: " + name);
}

async function choosePlace() {
  await check("el('gmina_voivodeship')?.options.length === 2");
  await evaluate("select('gmina_voivodeship', 'warmińsko-mazurskie')");
  await check("el('gmina_powiat').options.length > 1");
  await evaluate("select('gmina_powiat', 'Olsztyn')");
  await check("el('gmina_gmina').options.length === 2");
  await evaluate("select('gmina_gmina', 'Olsztyn')");
  await check("el('gmina_miejscowosc').options.length === 2");
  await evaluate("select('gmina_miejscowosc', 'Olsztyn')");
  await check("el('status').textContent.includes('Wybrano miejscowość: Olsztyn')");
}

try {
  const { port, version } = await waitForDebugger(join(runDir, "profile"), child);
  browser = new CdpConnection(version.webSocketDebuggerUrl);
  await browser.connect();
  const targets = await (await fetch("http://127.0.0.1:" + port + "/json/list")).json();
  page = new CdpConnection(targets.find((target) => target.type === "page").webSocketDebuggerUrl);
  await page.connect();
  page.onEvent = ({ method, params }) => {
    if (method === "Runtime.exceptionThrown") errors.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
    if (method === "Fetch.requestPaused") void respond(params).catch((error) => errors.push(error.message));
  };
  await page.command("Page.enable");
  await page.command("Runtime.enable");
  await page.command("Emulation.setTimezoneOverride", { timezoneId: "Europe/Warsaw" });
  await page.command("Fetch.enable", { patterns: [{ urlPattern: "http*" }] });
  await page.command("Page.setDownloadBehavior", { behavior: "allow", downloadPath: downloads });
  await page.command("Page.navigate", { url: origin + "/?rcn=demo#/rcn" });
  await choosePlace();
  assert.ok(await evaluate(`new Date().toLocaleDateString("sv-SE") === el("date_to").value`));
  await evaluate("el('searchBtn').click()");
  await check("el('rcn-map-count').textContent.includes('na mapie 11')");
  assert.ok(await evaluate("el('rcn-demo-note').hidden === false && !!window.Chart.getChart(el('priceChart'))"));
  assert.equal(requests.length, 0);
  await evaluate("el('map').scrollIntoView()");
  await capture("rcn-demo.png");
  await page.command("Page.navigate", { url: origin + "/#/rcn" });
  await choosePlace();
  const expectedLocations = [
    "/api/teryt/voivodeships",
    "/api/teryt/powiaty?voivodeship=warmi%C5%84sko-mazurskie",
    "/api/teryt/gminy?voivodeship=warmi%C5%84sko-mazurskie&powiat=Olsztyn",
    "/api/teryt/miejscowosci?voivodeship=warmi%C5%84sko-mazurskie&powiat=Olsztyn&gmina=Olsztyn&gmina_teryt=286201",
    "/api/geocode?city=Olsztyn&gmina=Olsztyn&powiat=Olsztyn&voivodeship=warmi%C5%84sko-mazurskie&teryt=286201",
  ];
  assert.deepEqual(requests.slice(0, 5).map(({ method, path }) => method + " " + path), expectedLocations.map((path) => "GET " + path));
  await evaluate("el('street').value = 'Testowa'");
  await evaluate("el('searchBtn').click()");
  await check("el('resultsTable').tBodies[0].rows.length === 6");
  assert.ok(requests.some(({ path }) => path.includes("street=Testowa")));
  await evaluate("el('street').value = ''");
  await evaluate("el('searchBtn').click()");
  await check("el('resultsTable').tBodies[0].rows.length === 12");
  assert.ok(await evaluate("el('rcn-map-count').textContent.includes('z lokalizacją 11')"));
  await evaluate("el('resultsTable').querySelector('input.exclude-row').click()");
  await check("el('rcn-map-count').textContent.includes('W analizie 11')");
  await evaluate("el('resultsTable').querySelector('thead button').click()");
  assert.ok(await evaluate("el('resultsTable').querySelector('[aria-sort=ascending]') && el('resultsTable').querySelector('.result-row.excluded')"));
  await evaluate("el('exportBtn').click()");
  await check("el('status').textContent.includes('Wyeksportowano XLSX: 11')");
  await evaluate("el('pdfBtn').click()");
  await check("el('status').textContent.includes('Wygenerowano raport Word')");
  for (const [name, type] of [["rcn_wyniki.xlsx", "xlsx"], ["raport_rcn.docx", "docx"]]) {
    assert.equal(await readDownload(name), "fixture-" + type);
  }
  const posts = requests.filter(({ method }) => method === "POST");
  assert.deepEqual(posts.map(({ path, body }) => [path, JSON.parse(body).records.length]), [
    ["/api/export_current.xlsx", 11], ["/api/export_current.docx", 11],
  ]);
  assert.equal(JSON.parse(posts[1].body).params.city, "Olsztyn");
  await evaluate("el('similarBtn').click()");
  await check("el('resultsTable').tBodies[0].rows.length === 12");
  assert.ok(requests.some(({ path }) => path.includes("similar_mode=true")));
  await evaluate("root.querySelector('[data-module=grunt_niezabudowany]').click()");
  await evaluate("el('searchBtn').click()");
  await check("el('stats').textContent.includes('Mediana cena/m² gruntu')");
  assert.ok(requests.some(({ path }) => path.includes("land_record_mode=unbuilt_land")));
  await evaluate("root.querySelector('[data-module=grunt_zabudowany]').click()");
  await evaluate("el('searchBtn').click()");
  await check("el('stats').textContent.includes('Wskaźnik na pow. użytkowej RCN')");
  assert.ok(requests.some(({ path }) => path.includes("land_record_mode=built_land") && path.includes("radius_m=5000")));
  await evaluate("el('map').scrollIntoView()");
  await capture("rcn-budynki.png");
  await evaluate("el('gmina_mode').click()");
  await evaluate("el('searchBtn').click()");
  await check("el('resultsTable').tBodies[0].rows.length === 12");
  assert.ok(requests.some(({ path }) => path.includes("area_admin_level=gmina") && path.includes("gmina_teryt6=286201")));
  await evaluate("select('area_mode', 'polygon')");
  await evaluate("el('map').scrollIntoView({ block: 'center' })");
  const bounds = await evaluate("el('map').getBoundingClientRect().toJSON()");
  async function mapClick(x, y) {
    await page.command("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await page.command("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  }
  for (const [xRatio, yRatio] of [[.25, .25], [.70, .24], [.54, .72]]) {
    await mapClick(bounds.left + bounds.width * xRatio, bounds.top + bounds.height * yRatio);
  }
  await check("el('polygonStatus').textContent.includes('Dodano 3 pkt')");
  const first = await evaluate("el('map').querySelector('.rcn-polygon-close').getBoundingClientRect().toJSON()");
  await mapClick(first.left + first.width / 2, first.top + first.height / 2);
  await check("el('polygonStatus').textContent.includes('Obszar zamknięty. Liczba punktów 3')");
  await evaluate("el('searchBtn').click()");
  await check("!el('searchBtn').disabled");
  const polygonRequest = requests.find(({ path }) => path.includes("area_mode=polygon"));
  assert.equal(new URL(polygonRequest.path, origin).searchParams.get("polygon").split("|").length, 3);
  await evaluate("el('clearPolygon').click()");
  await check("el('areaModeLabel').textContent === '0 pkt'");
  await page.command("Emulation.setDeviceMetricsOverride", { width: 390, height: 820, deviceScaleFactor: 1, mobile: true });
  await evaluate("document.querySelector('#module-view').scrollIntoView()");
  await capture("rcn-mobile.png");
  assert.ok(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"));
  await evaluate("document.querySelector('[data-module-link=start]').click()");
  await check("!document.querySelector('[data-rcn]')");
  await evaluate("document.querySelector('[data-module-link=rcn]').click()");
  await check("el('map')?.classList.contains('leaflet-container')");
  assert.deepEqual(unexpected, []);
  assert.deepEqual(errors, []);
  await writeFile(join(runDir, "result.json"), JSON.stringify({ externalRequestsSent: 0, requests: requests.map(({ path, method }) => ({ path, method })) }, null, 2));
  console.log("PASS RCN demo, trzy tryby, geokodowanie, filtry, mapa, wykres, sortowanie, wykluczenia, eksporty, responsywność i ponowny mount. " + runDir);
} finally {
  await browser?.command("Browser.close", {}, 2000).catch(() => {});
  page?.close();
  browser?.close();
  if (!browser) child.kill();
  server.close();
}
