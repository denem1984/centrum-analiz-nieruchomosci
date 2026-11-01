import test from "node:test";
import assert from "node:assert/strict";
import { loadLeaflet, leafletScriptUrl } from "../app/js/modules/dzialki/leaflet-loader.js";
import { createFakeDom } from "./helpers/fake-dom.mjs";

test("loader dodaje lokalny skrypt raz i zwraca Leaflet po załadowaniu", async () => {
  const fake = createFakeDom();
  const windowRef = {};
  const promise = loadLeaflet({ document: fake.document, window: windowRef });
  const second = loadLeaflet({ document: fake.document, window: windowRef });
  assert.equal(promise, second);
  const scripts = fake.document.head.children;
  assert.equal(scripts.length, 1);
  assert.match(scripts[0].src, /vendor\/dzialki\/leaflet-1\.9\.4\/leaflet\.js$/);
  const leaflet = { map() {} };
  windowRef.L = leaflet;
  scripts[0].dispatch("load");
  assert.equal(await promise, leaflet);
  assert.match(leafletScriptUrl, /vendor\/dzialki\/leaflet-1\.9\.4\/leaflet\.js$/);
});

test("loader zwraca czytelny błąd przy nieudanym skrypcie", async () => {
  const fake = createFakeDom();
  const windowRef = {};
  const promise = loadLeaflet({ document: fake.document, window: windowRef });
  fake.document.head.children[0].dispatch("error");
  await assert.rejects(promise, /lokalnej biblioteki Leaflet 1\.9\.4/);
});