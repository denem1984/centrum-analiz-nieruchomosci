import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { BACKENDS } from "../app/js/config.js";
import { createOffersDemoFetch } from "../app/js/modules/oferty/demo.js";
import { buildBrowserLaunchArgs, CdpConnection, chooseBrowserPath, waitForDebugger } from "./browser-smoke.mjs";
import { createStaticServer } from "./serve.mjs";
import { openSmokeBudget } from "./smoke-budget.mjs";

const args = process.argv.slice(2);
if (args.length !== 3 || args[0] !== "--headed" || args[1] !== "--browser") {
  throw new Error('Użycie: node scripts/oferty-browser-smoke.mjs --headed --browser "ścieżka do Edge"');
}
const browserPath = chooseBrowserPath({ explicitPath: args[2] });
assert.ok(browserPath, "Brak wskazanej przeglądarki");
const artifacts = resolve(".local-results", "oferty-browser-smoke");
await mkdir(artifacts, { recursive: true });
const output = await mkdtemp(join(artifacts, "run-"));
const task = "oferty-m6";
const budget = await openSmokeBudget(resolve(".local-results", "budgets", task + ".json"), task);
try {
  assert.ok(await budget.reserveLaunch(), "Wyczerpano budżet testu Ofert");
} finally {
  await budget.close();
}

const profile = join(output, "profile");
const downloads = join(output, "downloads");
await mkdir(downloads);
const child = spawn(browserPath, buildBrowserLaunchArgs({ headed: true, profile }), { stdio: "ignore" });
const server = createStaticServer();
server.listen(0, "127.0.0.1");
await once(server, "listening");
const origin = "http://127.0.0.1:" + server.address().port;
const fixtureFetch = createOffersDemoFetch();
const requested = [];
const unexpected = [];
const exceptions = [];
let page;
let browser;

async function action(expression) {
  const result = await page.command("Runtime.evaluate", {
    expression: `(() => {
      const root = document.querySelector('[data-oferty]');
      const el = (id) => root?.querySelector('[data-part="' + id + '"]');
      const set = (id, value) => { el(id).value = value; el(id).dispatchEvent(new Event('change', { bubbles: true })); };
      const type = (id, value) => { el(id).value = value; el(id).dispatchEvent(new Event('input', { bubbles: true })); };
      return (${expression});
    })()`, returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.result?.description ?? result.exceptionDetails.text);
  return result.result?.value;
}

async function check(expression) {
  for (let index = 0; index < 100; index += 1) {
    if (await action(expression)) return;
    await delay(75);
  }
  throw new Error("Brak oczekiwanego stanu " + expression + " • " + await action("el('status')?.textContent"));
}

async function capture(name) {
  const { data } = await page.command("Page.captureScreenshot", { format: "png" });
  await writeFile(join(output, name), Buffer.from(data, "base64"));
}

async function handle({ requestId, request }) {
  const url = new URL(request.url);
  if (url.origin === origin) return page.command("Fetch.continueRequest", { requestId });
  const backend = Object.values(BACKENDS).find(({ baseUrl }) => baseUrl === url.origin);
  if (request.method !== "GET" || !backend) {
    unexpected.push(request.method + " " + url.href);
    return page.command("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
  }
  let result;
  if (url.pathname === backend.healthPath) result = Response.json({ ok: true });
  else if (backend.id === "Oferty" && ["/api/location-suggestions", "/api/resolve-location", "/api/live/combined"].includes(url.pathname)) {
    requested.push(url.pathname + url.search);
    if (url.searchParams.get("area") === "999") result = Response.json({ error: "Przykładowa awaria Ofert." }, { status: 502 });
    else {
      if (url.searchParams.get("area") === "1234") await delay(550);
      result = await fixtureFetch(url);
    }
  } else {
    unexpected.push(request.method + " " + url.href);
    return page.command("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
  }
  try {
    return await page.command("Fetch.fulfillRequest", {
      requestId, responseCode: result.status,
      responseHeaders: [
        { name: "Content-Type", value: "application/json" },
        { name: "Access-Control-Allow-Origin", value: "*" },
      ],
      body: Buffer.from(await result.arrayBuffer()).toString("base64"),
    });
  } catch (error) {
    if (url.searchParams.get("area") !== "1234" || !/Invalid InterceptionId/i.test(error.message)) throw error;
  }
}

async function downloadedXlsx() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const file = (await readdir(downloads)).find((name) => name.endsWith(".xlsx"));
    if (file) return join(downloads, file);
    await delay(75);
  }
  throw new Error("Edge nie zakończył pobierania XLSX");
}

try {
  const { port, version } = await waitForDebugger(profile, child);
  browser = new CdpConnection(version.webSocketDebuggerUrl);
  await browser.connect();
  const tabs = await (await fetch("http://127.0.0.1:" + port + "/json/list")).json();
  page = new CdpConnection(tabs.find((tab) => tab.type === "page").webSocketDebuggerUrl);
  await page.connect();
  page.onEvent = ({ method, params }) => {
    if (method === "Fetch.requestPaused") void handle(params).catch((error) => exceptions.push(error.message));
    if (method === "Runtime.exceptionThrown") exceptions.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
  };
  await page.command("Page.enable");
  await page.command("Runtime.enable");
  await page.command("Fetch.enable", { patterns: [{ urlPattern: "http*" }] });
  await page.command("Page.setDownloadBehavior", { behavior: "allow", downloadPath: downloads });

  await page.command("Page.navigate", { url: origin + "/?oferty=demo#/oferty" });
  await check("el('demo')?.hidden === false");
  await action("el('location').focus(), type('location', 'olsz')");
  await check("el('suggestions').children.length === 1");
  await action(`el('location').dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", cancelable: true })),
    el('location').dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }))`);
  await check("el('location').value === 'Olsztyn' && el('suggestions').hidden");
  await action("el('form').requestSubmit()");
  await check("el('offers').children.length === 5 && !el('results').hidden");
  assert.deepEqual(await action("['filtered', 'duplicates', 'accepted'].map((key) => el(key).textContent)"), ["6", "1", "5"]);
  await check("el('sourceWarning').textContent.includes('Adresowo') && el('sources').children.length === 6");
  await action("root.querySelector('[data-offerty-sort=price]').click(), root.querySelector('[data-offerty-sort=price]').click()");
  assert.equal(await action("root.querySelector('[data-offerty-sort=price]').closest('th').getAttribute('aria-sort')"), "descending");
  await action("el('offers').querySelector('input[type=checkbox]').click()");
  await check("el('selected').children.length === 1 && !el('export').disabled");
  await action("type('myPrice', '902000'), type('myArea', '100')");
  await check("el('mean').textContent.includes('8') && el('difference').textContent.includes('+')");
  await action("el('export').click()");
  await check("el('exportStatus').textContent.includes('Wyeksportowano 1')");
  const require = createRequire(import.meta.url);
  const xlsx = require("../app/vendor/oferty/sheetjs-0.20.3/xlsx.mini.min.js");
  const workbook = xlsx.read(await readFile(await downloadedXlsx()), { type: "buffer" });
  const sheet = workbook.Sheets["Wybrane oferty"];
  assert.match(sheet.C2.v, /Olsztyn.*Przykładowa/);
  assert.equal(typeof sheet.F2.v, "number");
  assert.equal(sheet.A3, undefined);
  await action("el('selected').scrollIntoView({ block: 'center' })");
  await capture("oferty-porownanie.png");
  await action("el('selected').querySelector('input[type=checkbox]').click()");
  await check("el('export').disabled && el('selectedWrap').hidden");
  assert.deepEqual(requested, []);

  await page.command("Page.navigate", { url: origin + "/#/oferty" });
  await check("el('demo')?.hidden === true");
  await action("el('location').focus(), type('location', 'Testowo'), el('form').requestSubmit()");
  await check("el('status').textContent.includes('Kilka miejscowości')");
  await check("!el('suggestions').hidden && el('suggestions').children.length === 2");
  await action("el('suggestions').children[1].click(), set('propertyType', 'działka'), set('radius', '10'), set('mode', 'range'), set('min', '800'), set('max', '1200')");
  await action("el('form').requestSubmit()");
  await check("el('offers').children.length === 5 && !el('results').hidden");
  assert.deepEqual(requested.slice(0, 3), [
    "/api/location-suggestions?q=Testowo",
    "/api/resolve-location?location=Testowo&teryt=010201&simc=0102001",
    "/api/live/combined?location=Testowo&teryt=010201&simc=0102001&area=1000&tolerance=20&radius=10&propertyType=dzia%C5%82ka",
  ]);
  await check("el('sources').textContent.includes('Źródło ograniczyło wyniki do miejscowości')");
  await check("!el('scopeWarning').hidden && el('scopeWarning').textContent.includes('Nazwa się powtarza')");
  await action("el('sourceDetails').open = true, el('results').scrollIntoView()");
  await capture("oferty-wyniki-zrodel.png");
  await action("set('mode', 'none'), set('propertyType', 'Nieruchomość komercyjna'), el('form').requestSubmit()");
  await check("el('query').textContent.includes('komercyjna') && el('query').textContent.includes('bez filtra')");
  assert.match(requested.at(-1), /area=100&tolerance=9999&radius=10&propertyType=Nieruchomo%C5%9B%C4%87%20komercyjna$/);
  await action("set('mode', 'percent'), set('propertyType', 'dom'), set('area', '999'), el('form').requestSubmit()");
  await check("el('status').textContent.includes('Przykładowa awaria Ofert') && el('results').hidden");
  await action("set('area', '1234'), el('form').requestSubmit()");
  for (let index = 0; index < 100 && !requested.at(-1).includes("area=1234"); index += 1) await delay(10);
  assert.ok(requested.at(-1).includes("area=1234"));
  await action("el('cancel').click()");
  await check("el('status').textContent.includes('anulowane') && !el('submit').disabled");
  await action("set('area', '120'), el('form').requestSubmit()");
  await check("el('query').textContent.includes('dom') && !el('results').hidden");
  await page.command("Emulation.setDeviceMetricsOverride", { width: 390, height: 820, deviceScaleFactor: 1, mobile: true });
  await action("root.scrollIntoView()");
  await capture("oferty-mobile.png");
  assert.ok(await action("document.documentElement.scrollWidth <= window.innerWidth"));
  await action("document.querySelector('[data-module-link=start]').click()");
  await check("!root");
  await action("document.querySelector('[data-module-link=oferty]').click()");
  await check("el('location')?.value === ''");
  await delay(600);
  assert.deepEqual(exceptions, []);
  assert.deepEqual(unexpected, []);
  await writeFile(join(output, "result.json"), JSON.stringify({ requested, sentToExternalServices: 0 }, null, 2));
  console.log("PASS Oferty, cztery typy, trzy tryby filtrów, kody lokalizacji, dane częściowe, sortowanie, kalkulator, XLSX, anulowanie i mobile. " + output);
} finally {
  await browser?.command("Browser.close", {}, 2000).catch(() => {});
  page?.close();
  browser?.close();
  if (!browser) child.kill();
  server.close();
}
