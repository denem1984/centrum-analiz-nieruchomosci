import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { openSmokeBudget, smokeServiceKey, validateSmokeTask,replaceBudgetFile } from "./smoke-budget.mjs";

test("atomowa podmiana czeka na krótką blokadę Windows, ale trwały błąd blokuje dalszą pracę",async()=>{
  const waits=[];let calls=0;
  await replaceBudgetFile("temporary","state",{renameImpl:async(from,to)=>{
    assert.equal(from,"temporary");assert.equal(to,"state");calls+=1;
    if(calls<3)throw Object.assign(new Error("busy"),{code:"EPERM"});
  },wait:async(ms)=>waits.push(ms)});
  assert.equal(calls,3);assert.deepEqual(waits,[25,50]);
  calls=0;
  await assert.rejects(replaceBudgetFile("temporary","state",{renameImpl:async()=>{calls+=1;throw Object.assign(new Error("busy"),{code:"EACCES"});},wait:async()=>{}}),{code:"EACCES"});
  assert.equal(calls,6);
  await assert.rejects(replaceBudgetFile("temporary","state",{renameImpl:async()=>{throw Object.assign(new Error("disk"),{code:"ENOSPC"});},wait:async()=>assert.fail("bez ponawiania błędu dysku")}),{code:"ENOSPC"});
});

async function removeTestDirectory(root) {
  assert.equal(dirname(resolve(root)), resolve(tmpdir()));
  assert.ok(basename(root).startsWith("smoke-budget-test-"));
  await rm(root, { recursive: true, force: true });
}

test("identyfikator zadania nie pozwala wyjść poza katalog; przekierowania i subdomeny dzielą limit", () => {
  for (const task of [undefined, "", "../test", "A", "a/b"]) assert.throws(() => validateSmokeTask(task));
  assert.equal(validateSmokeTask("m4d2"), "m4d2");
  assert.equal(smokeServiceKey("https://integracja01.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow?x=1"),
    smokeServiceKey("https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow?x=2"));
  assert.equal(smokeServiceKey("https://a.tile.openstreetmap.org/1/2/3.png"), "tile.openstreetmap.org");
  assert.equal(smokeServiceKey("https://wms.e-mapa.net/cgi-bin/pog/998877"),
    smokeServiceKey("https://wms.e-mapa.net/cgi-bin/pog/998899"));
});

test("licznik zachowuje starty i żądania po wznowieniu oraz blokuje równoległy proces", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "smoke-budget-test-"));
  const path = join(root, "test.json");
  t.after(() => removeTestDirectory(root));
  const first = await openSmokeBudget(path, "test");
  try {
    await assert.rejects(openSmokeBudget(path, "test"), /zablokowany/);
    const launches = await Promise.all(Array.from({ length: 5 }, () => first.reserveLaunch()));
    assert.deepEqual(launches, [true, true, true, true, false]);
    assert.equal(await first.reserveRequest("https://example.org/path"), true);
  } finally { await first.close(); }
  const second = await openSmokeBudget(path, "test");
  try {
    assert.equal(await second.reserveLaunch(), false);
    assert.equal(second.snapshot().requests["example.org"], 1);
    assert.equal(JSON.parse(await readFile(path, "utf8")).launches, 4);
  } finally { await second.close(); }
});

test("granice 300/400 są twarde, również przy współbieżnych rezerwacjach", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "smoke-budget-test-"));
  const path = join(root, "test.json");
  t.after(() => removeTestDirectory(root));
  // Seed near the limit to test the boundary without hundreds of disk writes.
  await writeFile(path, JSON.stringify({ version: 1, task: "test", launches: 1,
    requests: { "example.org": 299, "analizator-nieruchomosci.onrender.com": 399 } }));
  const budget = await openSmokeBudget(path, "test");
  try {
    for (const address of ["https://example.org/a", "https://analizator-nieruchomosci.onrender.com/health"]) {
      assert.deepEqual(await Promise.all([budget.reserveRequest(address), budget.reserveRequest(address)]), [true, false]);
    }
    assert.equal(budget.snapshot().requests["example.org"], 300);
    assert.equal(budget.snapshot().requests["analizator-nieruchomosci.onrender.com"], 400);
  } finally { await budget.close(); }
  await assert.rejects(budget.reserveLaunch(), /zamknięty/);
});

test("nieczytelny albo niezgodny stan blokuje pracę zamiast zerować budżet", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "smoke-budget-test-"));
  const path = join(root, "test.json");
  t.after(() => removeTestDirectory(root));
  for (const source of ["{", JSON.stringify({ version: 1, task: "other", launches: 0, requests: {} }),
    JSON.stringify({ version: 1, task: "test", launches: 5, requests: {} })]) {
    await writeFile(path, source);
    await assert.rejects(openSmokeBudget(path, "test"), /licznik zadania/);
  }
});
