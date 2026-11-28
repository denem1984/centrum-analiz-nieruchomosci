import test from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import { isAllowedThematicRequest } from "./thematic-allowlist.mjs";
import { thematicStateExpression } from "./thematic-smoke.mjs";
import { isAllowedBrowserRequest } from "./browser-smoke.mjs";
import { buildThematicGetMapUrl,buildOwnershipUrl,buildRwdzInfoUrl,THEMATIC_LEGENDS } from "../app/js/modules/dzialki/thematic-services.js";

test("allowlista M4d.3 zachowuje dokładne warstwy i parametry, a węzły KIUT wymagają przekierowania",() => {
  assert.doesNotThrow(()=>new Script(thematicStateExpression));
  const urls = [
    ...["rwdz","flood","kiut"].map(id=>buildThematicGetMapUrl(id,[1,2,3,4])),
    buildOwnershipUrl({getSouth:()=>53,getWest:()=>16,getNorth:()=>54,getEast:()=>17}),
    buildRwdzInfoUrl({bbox:[1,2,3,4],size:{x:1000,y:800},pixel:{x:500,y:400}}),...Object.values(THEMATIC_LEGENDS).flat(),
  ];
  for(const url of urls){
    assert.equal(isAllowedThematicRequest(url,"GET"),true,url);
    assert.equal(isAllowedThematicRequest(url,"POST"),false);
    assert.equal(isAllowedThematicRequest(url+"&extra=1","GET"),false);
    assert.equal(isAllowedBrowserRequest(url,"GET",{thematicLayers:true}),true);
    assert.equal(isAllowedBrowserRequest(url,"GET"),false);
  }
  const kiut = buildThematicGetMapUrl("kiut",[1,2,3,4]).replace("integracja.gugik.gov.pl","integracja02.gugik.gov.pl");
  assert.equal(isAllowedThematicRequest(kiut,"GET"),false);
  assert.equal(isAllowedThematicRequest(kiut,"GET",{allowRedirectKiutHosts:true}),true);
  assert.equal(isAllowedThematicRequest(kiut+"&extra=1","GET",{allowRedirectKiutHosts:true}),false);
});
