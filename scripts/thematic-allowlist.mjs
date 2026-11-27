import { THEMATIC_LAYERS,THEMATIC_LEGENDS,buildThematicGetMapUrl,buildOwnershipUrl,buildRwdzInfoUrl,KIUT_WMS } from "../app/js/modules/dzialki/thematic-services.js";

export function isAllowedThematicRequest(raw,method,options = {}) {
  let url;
  try {url = new URL(raw);} catch {return false;}
  if (method !== "GET" || url.protocol !== "https:" || url.port || url.username || url.password || url.hash) return false;
  if (Object.values(THEMATIC_LEGENDS).flat().includes(url.href)) return true;
  const params = url.searchParams;
  try {
    if (url.origin === "https://analizator-nieruchomosci.onrender.com") {
      if (url.pathname === "/api/ownership-national") {
        const box = (params.get("bbox") ?? "").split(",").map(Number);
        if (box.length !== 4 || !box.every(Number.isFinite)) return false;
        return url.href === buildOwnershipUrl({getSouth:()=>box[0],getWest:()=>box[1],getNorth:()=>box[2],getEast:()=>box[3]});
      }
      if (url.pathname === "/api/rwdz-feature-info") return url.href === buildRwdzInfoUrl({bbox:(params.get("BBOX") ?? "").split(",").map(Number),
        size:{x:Number(params.get("WIDTH")),y:Number(params.get("HEIGHT"))},pixel:{x:Number(params.get("I")),y:Number(params.get("J"))}});
    }
    let address = url.origin + url.pathname;
    if (["integracja01.gugik.gov.pl","integracja02.gugik.gov.pl"].includes(url.hostname)
        && url.pathname === new URL(KIUT_WMS).pathname && options.allowRedirectKiutHosts) {
      url.hostname = "integracja.gugik.gov.pl"; address = url.origin + url.pathname;
    }
    for (const [id,def] of Object.entries(THEMATIC_LAYERS)) {
      if (address !== def.url || params.get("layers") !== def.layers || params.get("request") !== "GetMap") continue;
      const box = (params.get("bbox") ?? "").split(",").map(Number);
      return url.href === buildThematicGetMapUrl(id,box,Number(params.get("width")),Number(params.get("height")));
    }
  } catch {return false;}
  return false;
}
