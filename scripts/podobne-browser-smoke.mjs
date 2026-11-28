import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { BACKENDS } from "../app/js/config.js";
import { ADDRESS_URL } from "../app/js/modules/podobne/client.js";
import { demoSimilarFetch } from "../app/js/modules/podobne/demo.js";
import { buildBrowserLaunchArgs, CdpConnection, chooseBrowserPath, waitForDebugger } from "./browser-smoke.mjs";
import { createStaticServer } from "./serve.mjs";
import { openSmokeBudget } from "./smoke-budget.mjs";

const [headed, browserFlag, path] = process.argv.slice(2);
if (headed !== "--headed" || browserFlag !== "--browser" || !path) {
  throw new Error('Użycie: node scripts/podobne-browser-smoke.mjs --headed --browser "ścieżka do Edge"');
}
const browserPath = chooseBrowserPath({ explicitPath: path });
assert.ok(browserPath, "Brak przeglądarki");
const artifact = resolve(".local-results", "podobne-browser-smoke");
await mkdir(artifact, { recursive: true });
const output = await mkdtemp(join(artifact, "run-"));
const task = "podobne-m7";
const budget = await openSmokeBudget(resolve(".local-results", "budgets", task + ".json"), task);
try { assert.ok(await budget.reserveLaunch(), "Wyczerpano budżet M7"); } finally { await budget.close(); }
const profile = join(output, "profile");
const child = spawn(browserPath, buildBrowserLaunchArgs({ headed: true, profile }), { stdio: "ignore" });
const server = createStaticServer();
server.listen(0, "127.0.0.1");
await once(server, "listening");
const origin = "http://127.0.0.1:" + server.address().port;
const requested = [];
const unexpected = [];
const errors = [];
let page;
let browser;

async function evaluate(expression) {
  const { result, exceptionDetails } = await page.command("Runtime.evaluate", {
    expression: `(() => {
      const root = document.querySelector('[data-podobne]');
      const part = (id) => root?.querySelector('[data-part="' + id + '"]');
      const card = (index) => root?.querySelectorAll('[data-property]')[index];
      const field = (index, name) => card(index)?.querySelector('[data-field="' + name + '"]');
      const set = (index, name, value, event = 'input') => {
        const element = field(index, name);
        element.value = value;
        element.dispatchEvent(new Event(event, { bubbles: true }));
      };
      const count = (selector) => root?.querySelectorAll(selector).length;
      return (${expression});
    })()`, returnByValue: true,
  });
  if (exceptionDetails) throw new Error(result.description ?? exceptionDetails.text);
  return result.value;
}

async function check(expression) {
  for (let index = 0; index < 90; index += 1) {
    if (await evaluate(expression)) return;
    await sleep(80);
  }
  const state = await evaluate("({ map: part('mapStatus')?.textContent, status: field(0,'status')?.textContent, markers: count('.similar-pin') })");
  await capture("blad.png");
  throw new Error(expression + " " + JSON.stringify(state));
}

async function capture(file) {
  const { data } = await page.command("Page.captureScreenshot", { format: "png" });
  await writeFile(join(output, file), Buffer.from(data, "base64"));
}

const transparentPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6X8G2cAAAAASUVORK5CYII=";
const service = BACKENDS.Podobne.baseUrl;
let failRegions = true;
async function handle({ requestId, request }) {
  const url = new URL(request.url);
  if (url.origin === origin) return page.command("Fetch.continueRequest", { requestId });
  if (request.method !== "GET") throw new Error("Oczekiwano wyłącznie GET");
  let result;
  if (request.url.startsWith(ADDRESS_URL) && url.searchParams.get("request") === "GetAddress") {
    requested.push(url.pathname + url.search);
    result = url.searchParams.get("address") === "Test wieloznaczności"
      ? Response.json({ results: { 1: { city: "Testowo", x: "599000", y: "598000" }, 2: { city: "Testowo", x: "601000", y: "598000" } } })
      : demoSimilarFetch(url);
  } else if (Object.values(BACKENDS).some((item) => url.origin === item.baseUrl && url.pathname === item.healthPath)) {
    result = Response.json({ ok: true });
  } else if (url.origin === service && ["/api/prg/1/query", "/api/prg/0/query", "/api/regions", "/api/uldk"].includes(url.pathname)) {
    requested.push(url.pathname + url.search);
    if (failRegions && url.pathname === "/api/regions") {
      failRegions = false;
      result = Response.json({ ok: false }, { status: 502 });
    } else result = demoSimilarFetch(url);
  } else if (url.origin === "https://server.arcgisonline.com" && /\/World_(Street_Map|Imagery)\/MapServer\/tile\/\d+\/\d+\/\d+$/.test(url.pathname)) {
    result = new Response(Buffer.from(transparentPng, "base64"), { headers: { "Content-Type": "image/png" } });
  } else {
    unexpected.push(request.url);
    return page.command("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
  }
  try {
    return await page.command("Fetch.fulfillRequest", {
      requestId, responseCode: result.status, body: Buffer.from(await result.arrayBuffer()).toString("base64"),
      responseHeaders: [
        { name: "Content-Type", value: result.headers.get("content-type") ?? "application/json" },
        { name: "Access-Control-Allow-Origin", value: "*" },
      ],
    });
  } catch (error) {
    if (!/Invalid InterceptionId/i.test(error.message)) throw error;
  }
}

try {
  const { port, version } = await waitForDebugger(profile, child);
  browser = new CdpConnection(version.webSocketDebuggerUrl);
  await browser.connect();
  const tabs = await (await fetch("http://127.0.0.1:" + port + "/json/list")).json();
  page = new CdpConnection(tabs.find((tab) => tab.type === "page").webSocketDebuggerUrl);
  await page.connect();
  page.onEvent = ({ method, params }) => {
    if (method === "Fetch.requestPaused") void handle(params).catch((error) => errors.push(error.message));
    if (method === "Runtime.exceptionThrown") errors.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
  };
  await page.command("Page.enable");
  await page.command("Page.bringToFront");
  await page.command("Emulation.setFocusEmulationEnabled", { enabled: true });
  await page.command("Runtime.enable");
  await page.command("Fetch.enable", { patterns: [{ urlPattern: "http*" }] });
  await page.command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await page.command("Page.navigate", { url: origin + "/?podobne=demo#/podobne" });
  await check("part('demo')?.hidden === false && part('map').classList.contains('leaflet-container')");
  await evaluate("part('example').click()");
  await check("count('.similar-pin') === 4 && count('.similar-map-label.distance') === 3 && field(2,'status').textContent.includes('12/3')");
  await evaluate("root.scrollIntoView({block:'start'})");
  await sleep(400);
  await capture("podobne-mapa.png");
  await evaluate("root.querySelector('.similar-pin.subject').click()");
  await check("root.querySelector('.similar-subject-popup')?.textContent.includes('Przykładowa')");
  await evaluate("root.querySelector('.leaflet-popup-close-button').click()");
  const label = await evaluate("document.querySelector('.similar-map-label.info').getBoundingClientRect().toJSON()");
  const labelStart = { x: label.x + label.width / 2, y: label.y + label.height / 2 };
  await page.command("Input.dispatchMouseEvent", { type: "mousePressed", ...labelStart, button: "left", buttons: 1, clickCount: 1 });
  await page.command("Input.dispatchMouseEvent", { type: "mouseMoved", x: labelStart.x + 25, y: labelStart.y - 15, button: "left", buttons: 1 });
  await page.command("Input.dispatchMouseEvent", { type: "mouseMoved", x: labelStart.x + 50, y: labelStart.y - 30, button: "left", buttons: 1 });
  await page.command("Input.dispatchMouseEvent", { type: "mouseReleased", x: labelStart.x + 50, y: labelStart.y - 30, button: "left", clickCount: 1 });
  await check("document.querySelector('.similar-map-label.info').getBoundingClientRect().x > " + (label.x + 20));
  const before = await evaluate("({ top: part('map').getBoundingClientRect().top, y: scrollY, panel: part('panel').getBoundingClientRect().toJSON() })");
  await page.command("Input.dispatchMouseEvent", { type: "mouseWheel", x: before.panel.x + 70, y: before.panel.y + 85, deltaX: 0, deltaY: 500 });
  await check("part('panel').scrollTop > 0");
  assert.equal(await evaluate("part('map').getBoundingClientRect().top"), before.top);
  assert.equal(await evaluate("scrollY"), before.y);
  await evaluate("part('satellite').click(), part('price').click()");
  await check("part('satellite').getAttribute('aria-pressed') === 'true' && !root.querySelector('.similar-map-label.info').textContent.includes('zł')");
  await capture("podobne-satelita.png");
  await evaluate("part('add').click(), field(1, 'remove').click()");
  await check("count('[data-property]') === 4 && count('.similar-pin') === 3");
  await evaluate("set(0, 'address', 'Błędny adres'), field(0,'form').requestSubmit()");
  await check("count('.similar-pin') === 2 && field(0,'status').textContent.includes('Brak dopasowania')");
  await evaluate("part('example').click()");
  await check("count('.similar-pin') === 4 && !part('example').disabled");
  await page.command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate("root.scrollIntoView({block:'start'})");
  await sleep(150);
  await evaluate("part('fit').click()");
  await sleep(300);
  assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1 && part('map').getBoundingClientRect().top < part('panel').getBoundingClientRect().top"));
  assert.ok(await evaluate(`(() => {
    const map = part("map").getBoundingClientRect();
    return [...root.querySelectorAll(".similar-pin")].every((pin) => {
      const bounds = pin.getBoundingClientRect();
      return bounds.left >= map.left && bounds.right <= map.right && bounds.top >= map.top && bounds.bottom <= map.bottom;
    });
  })()`));
  await capture("podobne-mobile.png");
  assert.deepEqual(requested, []);

  await page.command("Page.navigate", { url: origin + "/#/podobne" });
  await check("part('demo')?.hidden === true && part('map').classList.contains('leaflet-container')");
  await evaluate("set(0, 'address', 'Test wieloznaczności'), field(0,'form').requestSubmit()");
  await check("!field(0,'candidates').hidden && field(0,'candidates').children.length === 2");
  assert.equal(await evaluate("count('.similar-pin')"), 0);
  await evaluate("field(0,'candidates').querySelector('button').click(), set(1, 'type', 'parcel', 'change')");
  await check("!field(1,'county').disabled && field(1,'county').options.length === 2");
  await evaluate("set(1,'county','2862','change')");
  await check("!field(1,'commune').disabled");
  await evaluate("set(1,'commune','2862011','change')");
  await check("!field(1,'retry').hidden && field(1,'status').textContent.includes('502')");
  await evaluate("field(1,'retry').click()");
  await check("!field(1,'region').disabled");
  await evaluate("set(1,'region','286201_1.0001','change'), set(1,'number','12/3'), field(1,'form').requestSubmit()");
  await check("count('.similar-pin') === 2 && field(1,'status').textContent.includes('12/3') && !field(1,'distance').textContent.includes('—')");
  assert.deepEqual(requested, [
    "/uug/?request=GetAddress&address=Test+wieloznaczno%C5%9Bci",
    "/api/prg/1/query?where=1%3D1&outFields=teryt%2Cnazwa&returnGeometry=false&f=json",
    "/api/prg/0/query?where=teryt+LIKE+%272862%25%27&outFields=teryt%2Cnazwa&returnGeometry=false&f=json",
    "/api/regions?teryt=2862011",
    "/api/regions?teryt=2862011",
    "/api/uldk?request=GetParcelByIdOrNr&id=286201_1.0001.12%2F3&result=id%2Cparcel%2Cregion%2Ccommune%2Ccounty%2Cvoivodeship%2Cgeom_wkt&srid=4326",
  ]);
  await evaluate("document.querySelector('[data-module-link=start]').click()");
  await check("!root && !document.querySelector('.similar-map.leaflet-container')");
  await evaluate("document.querySelector('[data-module-link=podobne]').click()");
  await check("root && count('.similar-pin') === 0");
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  await writeFile(join(output, "result.json"), JSON.stringify({ requested, realExternalRequests: 0 }, null, 2));
  console.log("PASS M7: adres, działka, odległości, przeciąganie, przewijanie panelu, ponowienie i mobile. " + output);
} finally {
  await browser?.command("Browser.close", {}, 2000).catch(() => {});
  page?.close();
  browser?.close();
  if (!browser) child.kill();
  server.close();
}
