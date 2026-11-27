import test from "node:test";
import assert from "node:assert/strict";
import { isAllowedPlanningRequest } from "./planning-allowlist.mjs";
import { isAllowedBrowserRequest } from "./browser-smoke.mjs";
import { buildPlanningGetMapUrl, buildMpzpInfoUrl, buildDzinfoUrl, buildEmapaCapabilitiesUrl,
  buildEmapaInfoUrl, buildDraftZoneInfoUrl } from "../app/js/modules/dzialki/planning-services.js";
import { PLANNING_LEGEND_URLS } from "../app/js/modules/dzialki/planning-layers.js";

test("allowlista planowania dopuszcza wyłącznie używane URL-e GET i wymaga scenariusza planowania", () => {
  const urls = [
    ...["mpzp", "buildingLines", "pogAdopted", "pogDraftRu", "pogDraftGugik"].map((id) => buildPlanningGetMapUrl(id, [1,2,3,4])),
    buildMpzpInfoUrl({lat:53,lng:17}, "998877"), buildMpzpInfoUrl({lat:53,lng:17}),
    buildDzinfoUrl("998877_2.0001.12/3"), buildEmapaCapabilitiesUrl("998877"), buildEmapaInfoUrl("998877", [500000,600000]),
    buildDraftZoneInfoUrl({bbox:[1,2,3,4],size:{x:1000,y:800},pixel:{x:500,y:400}}),
    ...Object.values(PLANNING_LEGEND_URLS),
    "https://wms.e-mapa.net/cgi-bin/pog/998877?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=app.StrefaPlanistyczna%2Capp.StrefaPlanistyczna-etykiety&STYLES=%2C&SRS=EPSG:2180&BBOX=345609.86,571593.31,348650.86,574627.37&WIDTH=265&HEIGHT=264&FORMAT=image/png&TRANSPARENT=TRUE",
  ];
  for (const url of urls) {
    assert.equal(isAllowedPlanningRequest(url, "GET"), true, url);
    assert.equal(isAllowedPlanningRequest(url, "POST"), false);
    assert.equal(isAllowedPlanningRequest(url + "&extra=1", "GET"), false);
    assert.equal(isAllowedBrowserRequest(url, "GET", { planningLayers: true }), true);
    assert.equal(isAllowedBrowserRequest(url, "GET"), false);
    assert.equal(isAllowedPlanningRequest(url.replace("https:", "http:"), "GET"), false);
  }
  assert.equal(isAllowedPlanningRequest(buildPlanningGetMapUrl("mpzp", [1,2,3,4]).replace("EPSG%3A3857", "EPSG%3A2180"), "GET"), false);
  assert.equal(isAllowedPlanningRequest("https://example.org/api/mpzp-info?lat=53&lon=17", "GET"), false);
});
