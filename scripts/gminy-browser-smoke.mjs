import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { BACKENDS } from "../app/js/config.js";
import { buildBrowserLaunchArgs, CdpConnection, chooseBrowserPath, waitForDebugger } from "./browser-smoke.mjs";
import { createStaticServer } from "./serve.mjs";
import { openSmokeBudget } from "./smoke-budget.mjs";

const [headed, browserFlag, browserPathArg, dataFlag] = process.argv.slice(2);
if (headed !== "--headed" || browserFlag !== "--browser" || !browserPathArg || (dataFlag && dataFlag !== "--bdl")) {
  throw new Error('Użycie: node scripts/gminy-browser-smoke.mjs --headed --browser "ścieżka do Edge" [--bdl]');
}
const bdl = dataFlag === "--bdl";
const browserPath = chooseBrowserPath({ explicitPath: browserPathArg });
assert.ok(browserPath, "Brak przeglądarki");
const artifacts = resolve(".local-results", "gminy-browser-smoke");
await mkdir(artifacts, { recursive: true });
const output = await mkdtemp(join(artifacts, "run-"));
const task = "gminy-m8";
const budget = await openSmokeBudget(resolve(".local-results", "budgets", task + ".json"), task);
try { assert.ok(await budget.reserveLaunch(), "Wyczerpano budżet M8"); } finally { await budget.close(); }
const profile = join(output, "profile");
const downloads = join(output, "downloads");
await mkdir(downloads);
const child = spawn(browserPath, buildBrowserLaunchArgs({ headed: true, profile }), { stdio: "ignore" });
const server = createStaticServer();
server.listen(0, "127.0.0.1");
await once(server, "listening");
const origin = "http://127.0.0.1:" + server.address().port;
const requests = [];
const errors = [];
let page;
let browser;

async function evaluate(expression) {
  const { result, exceptionDetails } = await page.command("Runtime.evaluate", {
    expression: `(() => {
      const root = document.querySelector('[data-gminy]');
      const el = (id) => root?.querySelector('[data-part="' + id + '"]');
      const change = (id, value) => { el(id).value = value; el(id).dispatchEvent(new Event("change", { bubbles: true })); };
      const type = (value) => { el("target").focus(); el("target").value = value; el("target").dispatchEvent(new Event("input", { bubbles: true })); };
      return (${expression});
    })()`, returnByValue: true,
  });
  if (exceptionDetails) throw new Error(result.description ?? exceptionDetails.text);
  return result.value;
}

async function check(expression) {
  for (let index = 0; index < 100; index += 1) {
    if (await evaluate(expression)) return;
    await sleep(65);
  }
  await screenshot("blad.png");
  throw new Error(expression + " • " + await evaluate("el('status')?.textContent"));
}

async function screenshot(file) {
  const { data } = await page.command("Page.captureScreenshot", { format: "png" });
  await writeFile(join(output, file), Buffer.from(data, "base64"));
}

async function handle({ requestId, request }) {
  const url = new URL(request.url);
  if (url.origin === origin) {
    if (url.pathname === "/data/gminy/bdl.json") requests.push(url.pathname);
    return page.command("Fetch.continueRequest", { requestId });
  }
  const health = Object.values(BACKENDS).some((backend) => url.origin === backend.baseUrl && url.pathname === backend.healthPath);
  if (!health || request.method !== "GET") {
    errors.push("Nieoczekiwane żądanie " + url.host + url.pathname);
    return page.command("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
  }
  return page.command("Fetch.fulfillRequest", {
    requestId, responseCode: 200, body: Buffer.from('{"ok":true}').toString("base64"),
    responseHeaders: [
      { name: "Content-Type", value: "application/json" },
      { name: "Access-Control-Allow-Origin", value: "*" },
    ],
  });
}

async function downloadedPdf(terc) {
  for (let index = 0; index < 100; index += 1) {
    const name = (await readdir(downloads)).find((file) => file === "porownanie-gmin-" + terc + ".pdf");
    if (name) {
      const file = join(downloads, name);
      assert.match((await readFile(file)).subarray(0, 5).toString(), /^%PDF/);
      return file;
    }
    await sleep(80);
  }
  throw new Error("Edge nie zakończył pobierania PDF.");
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
  await page.command("Page.setDownloadBehavior", { behavior: "allow", downloadPath: downloads });
  await page.command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await page.command("Page.navigate", { url: origin + "/?gminy=demo#/gminy" });
  await check("el('demo')?.hidden === false && !el('filters').disabled");
  await evaluate("type('Zurawin')");
  await check("el('suggestions').children.length === 1 && !el('suggestions').hidden");
  await evaluate(`el('target').dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", cancelable: true })),
    el('target').dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }))`);
  await check("el('target').value === 'Żurawin' && el('suggestions').hidden");
  await evaluate("el('form').requestSubmit(), root.scrollIntoView({block:'start'})");
  await check("el('ranking').children.length === 20 && el('count').textContent === '23'");
  await screenShotRank();
  await evaluate("change('scope','voivodeship'), el('same').click(), change('profile','domy')");
  await check("el('count').textContent === '4' && el('activeProfile').textContent.includes('Domy')");
  await evaluate("el('ranking').children[0].querySelector('input').click(), el('ranking').children[1].click()");
  await check("el('selected').textContent.includes('2') && el('export').disabled");
  await evaluate("el('compare').click()");
  await check("el('details').children.length === 2 && el('details').querySelectorAll('dt').length === 14 && !el('export').disabled");
  await evaluate("el('export').click()");
  await check("el('exportStatus').textContent.includes('gotowy')");
  const file = await downloadedPdf("2801033");
  await sleep(350);
  await screenshot("gminy-porownanie.png");
  await evaluate("el('ranking').children[0].querySelector('input').click()");
  await check("el('export').disabled && el('comparison').hidden");
  await page.command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate("root.scrollIntoView({block:'start'})");
  await sleep(250);
  assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"));
  await screenshot("gminy-mobile.png");
  assert.deepEqual(requests, []);

  let officialPdf = null;
  if (bdl) {
    await page.command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await page.command("Page.navigate", { url: origin + "/#/gminy" });
    await check("el('demo')?.hidden === true && !el('filters').disabled && el('dataYear').textContent.includes('GUS BDL')");
    await evaluate("type('2862011'), el('form').requestSubmit(), root.scrollIntoView({block:'start'})");
    await check("el('targetName').textContent === 'Olsztyn' && el('ranking').children.length === 20");
    await screenshot("gminy-bdl.png");
    assert.deepEqual(requests, ["/data/gminy/bdl.json"]);
    await evaluate("el('ranking').children[0].querySelector('input').click(), el('compare').click(), el('export').click()");
    await check("el('exportStatus').textContent.includes('gotowy')");
    officialPdf = await downloadedPdf("2862011");
    await evaluate("document.querySelector('[data-module-link=start]').click()");
    await check("!root");
  }
  assert.deepEqual(errors, []);
  await writeFile(join(output, "result.json"), JSON.stringify({ bdl, requests, sentToExternalServices: 0, pdf: file, officialPdf }, null, 2));
  console.log("PASS M8: wybór gminy, trzy profile, zakres, ranking, porównanie, PDF i mobile. " + output);
} finally {
  await browser?.command("Browser.close", {}, 2000).catch(() => {});
  page?.close();
  browser?.close();
  if (!browser) child.kill();
  server.close();
}

async function screenShotRank() {
  await sleep(300);
  await screenshot("gminy-ranking.png");
}
