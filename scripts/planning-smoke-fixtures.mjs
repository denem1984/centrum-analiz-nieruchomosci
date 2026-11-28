import { deflateSync } from "node:zlib";

const images = new Map();
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
function png(width, height) {
  const key = width + "x" + height;
  if (images.has(key)) return images.get(key);
  const rows = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const i = y * (1 + width * 4) + 1 + x * 4;
    const grid = x % 64 === 0 || y % 64 === 0;
    rows[i] = grid ? 95 : 220; rows[i + 1] = grid ? 140 : 238; rows[i + 2] = grid ? 135 : 230; rows[i + 3] = 255;
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const image = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
  images.set(key, image);
  return image;
}

export function planningSmokeFixture(raw) {
  const url = new URL(raw), params = url.searchParams;
  const request = (params.get("request") ?? params.get("REQUEST") ?? "").toLowerCase();
  const result = (type, body) => ({ responseCode: 200, responseHeaders: [
    { name: "Content-Type", value: type }, { name: "Access-Control-Allow-Origin", value: "*" },
  ], body: Buffer.from(body).toString("base64") });
  const json = (body) => result("application/json", JSON.stringify(body));
  const id = "998877_2.0001.12/3";
  if (request === "getmap" || request === "getlegendgraphic" || /\.(png|jpg)$/.test(url.pathname) || url.hostname.includes("arcgisonline")) {
    const width = Number(params.get("width") ?? params.get("WIDTH")) || 256;
    const height = Number(params.get("height") ?? params.get("HEIGHT")) || 256;
    return result("image/png", png(Math.min(1200, width), Math.min(1200, height)));
  }
  if (url.pathname === "/api/wfs" || url.pathname === "/api/ownership-national") return json({ type: "FeatureCollection", features: [{ type: "Feature", properties: { id_dzialki: id, GRUPA_REJESTROWA:"7" }, geometry: {
    type: "Polygon", coordinates: [[[16.7375,53.1498],[16.7395,53.1498],[16.7395,53.1518],[16.7375,53.1518],[16.7375,53.1498]]],
  } }] });
  if (url.pathname.includes("FeatureServer")) return json({ features: [{ attributes: { teryt: "9988", nazwa: "Fikcyjny powiat" } }] });
  if (url.pathname.includes("KrajowaIntegracjaEwidencjiGruntow")) return result("text/xml", `<FeatureInfoResponse><Attribute Name="Identyfikator działki">${id}</Attribute><Attribute Name="Pole pow. w ewidencji gruntów">0,1234 ha</Attribute><Attribute Name="Grupa rejestrowa">7</Attribute><Attribute Name="Oznaczenie użytku">B</Attribute></FeatureInfoResponse>`);
  if (url.pathname === "/api/mpzp-gmina-info") return json({ plans: [{ tytul: "Fikcyjny plan testowy", status: "Test", links: [{ label: "Fikcyjna uchwała", href: "https://example.org/plan" }] }] });
  if (url.pathname === "/api/mpzp-info") return json({ found: false, plany: [] });
  if (url.pathname === "/api/dzinfo") return json({ mpzp: { nazwaAktu: "Plan testowy", strefy: [{ etykieta: "MN", opis: "Dane fikcyjne" }] } });
  if (url.pathname === "/api/rwdz-feature-info") return result("text/xml",'<FeatureInfoResponse><Feature><Attribute Name="nazwa_zamierzenia">Fikcyjna inwestycja testowa</Attribute><Attribute Name="stan_sprawy">Test</Attribute></Feature></FeatureInfoResponse>');
  if (request === "getcapabilities") return result("text/xml", '<WMS_Capabilities version="1.3.0"><Capability/></WMS_Capabilities>');
  if (url.hostname === "wms.e-mapa.net") return result("text/xml", '<FeatureInfoResponse><Layer name="app.StrefaPlanistyczna"><Feature><Attribute name="oznaczenie" value="SJ"/><Attribute name="nazwa" value="Strefa testowa"/><Attribute name="maksWysokoscZabudowy" value="12"/></Feature></Layer></FeatureInfoResponse>');
  if (url.pathname.endsWith("ProjektowanePlanyOgolneGmin")) return result("text/html", '<div class="accordion-content"><ul><li><span class="list-item-value">Oznaczenie</span>SJ</li><li><span class="list-item-value">Nazwa</span>Strefa fikcyjna</li></ul></div>');
  return json({ status: "ok" });
}
