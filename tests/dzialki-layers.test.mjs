import test from "node:test";
import assert from "node:assert/strict";
import {
  ARCHIVE_WMS_URL,
  BASE_LAYER_OPTIONS,
  archiveWmsOptionsForYear,
  createBaseLayers,
} from "../app/js/modules/dzialki/layers-base.js";

const expectedUrl = "https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolutionTime";
const expectedTimes = new Map([
  [1995, "1995-12-01"],
  [2004, "2004-12-01"],
  [2015, "2015-12-01"],
  [2025, "2025-11-01"],
]);

test("archiwalny WMS odtwarza endpoint i parametry frontu dla lat 1995, 2004, 2015 i 2025", () => {
  assert.equal(ARCHIVE_WMS_URL, expectedUrl);
  const calls = [];
  const leaflet = {
    CRS: { EPSG3857: "EPSG:3857" },
    tileLayer: Object.assign(
      (url, options) => ({ url, options }),
      { wms: (url, options) => { calls.push({ url, options }); return { url, options }; } },
    ),
  };
  const layers = createBaseLayers(leaflet);

  for (const [year, time] of expectedTimes) {
    const layer = layers.archive(year);
    assert.equal(layer.url, expectedUrl);
    assert.deepEqual(layer.options, {
      pane: "tilePane",
      layers: "Raster",
      styles: "default",
      version: "1.3.0",
      format: "image/png",
      transparent: true,
      time,
      maxZoom: 22,
      crs: "EPSG:3857",
      attribution: "© GUGiK — ortofotomapy archiwalne",
    });
  }
  assert.equal(calls.length, 4);
  assert.deepEqual([...expectedTimes].map(([year]) => archiveWmsOptionsForYear(year).time),
    [...expectedTimes.values()]);
});

test("atrybucja OpenStreetMap wskazuje contributors i oficjalną stronę praw autorskich", () => {
  const attribution = BASE_LAYER_OPTIONS.osm.attribution;
  assert.match(attribution, /© <a /);
  assert.match(attribution, /href="https:\/\/www\.openstreetmap\.org\/copyright"/);
  assert.match(attribution, />OpenStreetMap contributors<\/a>/);
});
