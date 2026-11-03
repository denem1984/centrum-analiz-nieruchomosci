import test from "node:test";
import assert from "node:assert/strict";
import { validateContext } from "../app/js/context.js";
import {
  buildCommunesUrl,
  buildCountiesUrl,
  buildParcelId,
  buildParcelUrl,
  buildRegionsUrl,
  createSearchApi,
  createSearchContext,
  normalizeCommuneCode,
  parseCommunes,
  parseCounties,
  parseParcelText,
  parseRegionsText,
  parseWktGeometry,
  isValidParcelNumber,
  resolveParcelAdministrativeNames,
  terc7ToTeryt,
} from "../app/js/modules/dzialki/search.js";
import { resetDzialkiState, getDzialkiState, updateDzialkiState } from "../app/js/modules/dzialki/state.js";
import { deriveCommuneFromUnitId } from "../app/js/modules/dzialki/teryt.js";
import { buildEgibGeometryUrl, buildKiegFeatureInfoUrl, parseEgibGeometryText, parseKiegFeatureInfo } from "../app/js/modules/dzialki/egib.js";

const fakeGeometry = "POLYGON ((20.00 52.00, 20.10 52.00, 20.10 52.10, 20.00 52.10, 20.00 52.00))";
const syntheticParcelRow = "998877_6.0001.12/3|9988776|12/3|Fikcyjny powiat|Fikcyjna gmina|Fikcyjne województwo|" + fakeGeometry;

test("adresy wyszukiwania są zgodne z parametrami publicznego frontu", () => {
  assert.equal(
    buildCountiesUrl(),
    "https://mapy.geoportal.gov.pl/wss/ims/maps/PRG_gugik_wyszukiwarka/FeatureServer/1/query?where=1%3D1&outFields=teryt%2Cnazwa&returnGeometry=false&orderByFields=nazwa&f=json",
  );
  assert.equal(
    buildCommunesUrl("9988"),
    "https://mapy.geoportal.gov.pl/wss/ims/maps/PRG_gugik_wyszukiwarka/FeatureServer/0/query?where=teryt+LIKE+%279988%25%27&outFields=teryt%2Cnazwa&returnGeometry=true&outSR=4326&orderByFields=nazwa&f=json",
  );
  assert.equal(
    buildRegionsUrl("9988776"),
    "https://uldk.gugik.gov.pl/?request=GetRegionByNameOrId&id=998877_6&result=id%2Cteryt%2Cregion%2Ccommune%2Ccounty",
  );
  assert.equal(buildParcelId("998877_6.0001", " 12/3 "), "998877_6.0001.12/3");
  assert.equal(
    buildParcelUrl("998877_6.0001", "12/3"),
    "https://uldk.gugik.gov.pl/?request=GetParcelById&id=998877_6.0001.12%2F3&result=id%2Cteryt%2Cparcel%2Ccounty%2Ccommune%2Cregion%2Cgeom_wkt&srid=4326",
  );
  assert.throws(() => buildCommunesUrl("bad"), /powiatu/);
  assert.throws(() => buildRegionsUrl("998877"), /TERC7/);
  assert.throws(() => buildParcelUrl("998877_6.0001", "12&admin=true"), /Nieprawidłowy numer działki/);
});

test("buduje stare adresy ULDK i KIEG dla danych EGiB", () => {
  assert.equal(
    buildEgibGeometryUrl("998877_6.0001.12/3"),
    "https://uldk.gugik.gov.pl/?request=GetParcelById&id=998877_6.0001.12%2F3&result=id%2Cgeom_wkt&srid=2180",
  );
  const geometry = { type: "Polygon", coordinates: [[
    [300000, 500000], [300100, 500000], [300100, 500100], [300000, 500100], [300000, 500000],
  ]] };
  const url = new URL(buildKiegFeatureInfoUrl(geometry));
  assert.equal(url.origin + url.pathname, "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow");
  assert.deepEqual([...url.searchParams.keys()], [
    "SERVICE", "VERSION", "REQUEST", "SRS", "BBOX", "WIDTH", "HEIGHT", "X", "Y",
    "LAYERS", "QUERY_LAYERS", "INFO_FORMAT", "FORMAT", "TRANSPARENT",
  ]);
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    SERVICE: "WMS", VERSION: "1.1.1", REQUEST: "GetFeatureInfo", SRS: "EPSG:2180",
    BBOX: "299950,499950,300150,500150", WIDTH: "1000", HEIGHT: "1000", X: "500", Y: "500",
    LAYERS: "dzialki", QUERY_LAYERS: "dzialki", INFO_FORMAT: "text/xml", FORMAT: "image/png", TRANSPARENT: "TRUE",
  });
  assert.throws(() => buildEgibGeometryUrl("bad"), /identyfikator działki/);
  assert.throws(() => buildKiegFeatureInfoUrl(null), /geometrii działki/);
});

test("parsuje odpowiedź EGiB/KIEG z syntetycznej atrapy", () => {
  const geometry = parseEgibGeometryText(
    "0\n998877_6.0001.12/3|POLYGON ((300000 500000, 300100 500000, 300100 500100, 300000 500100, 300000 500000))",
    parseWktGeometry,
  );
  const result = parseKiegFeatureInfo(
    "<Feature><Attribute Name=\"Identyfikator działki\">998877_6.0001.12/3</Attribute>"
      + "<Attribute Name=\"Pole pow. w ewidencji gruntów\">0.4449</Attribute>"
      + "<Attribute Name=\"Grupa rejestrowa\">7</Attribute>"
      + "<Attribute Name=\"Oznaczenie użytku\">RVI, B</Attribute></Feature>",
    "998877_6.0001.12/3", geometry,
  );
  assert.deepEqual(result, {
    area: "0,4449 ha", group: "7", groupDescription: "osoby fizyczne",
    classUse: [
      { code: "RVI", description: "grunty orne, klasa VI" },
      { code: "B", description: "tereny mieszkaniowe" },
    ],
  });
  assert.throws(() => parseKiegFeatureInfo('<Attribute Name="Identyfikator działki">other</Attribute>', "expected", geometry), /inną działkę/);
  assert.throws(() => parseEgibGeometryText("1\nno data", parseWktGeometry), /nie zwróciła geometrii/);
});

test("API raportu EGiB wykonuje tylko dwa dozwolone GET-y w kolejności starego frontu", async () => {
  const calls = [];
  const responses = [
    "0\n998877_6.0001.12/3|POLYGON ((300000 500000, 300100 500000, 300100 500100, 300000 500100, 300000 500000))",
    "<Feature><Attribute Name=\"Pole pow. w ewidencji gruntów\">0.4449</Attribute>"
      + "<Attribute Name=\"Grupa rejestrowa\">7</Attribute><Attribute Name=\"Oznaczenie użytku\">RVI</Attribute></Feature>",
  ];
  const api = createSearchApi({
    async fetchImpl(url, options) {
      calls.push({ url: String(url), method: options.method });
      return { ok: true, status: 200, text: async () => responses.shift() };
    },
  });
  const result = await api.egib("998877_6.0001.12/3");
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((call) => call.method), ["GET", "GET"]);
  assert.equal(new URL(calls[0].url).hostname, "uldk.gugik.gov.pl");
  assert.equal(new URL(calls[0].url).searchParams.get("srid"), "2180");
  assert.equal(new URL(calls[1].url).hostname, "integracja.gugik.gov.pl");
  assert.equal(new URL(calls[1].url).searchParams.get("REQUEST"), "GetFeatureInfo");
  assert.equal(result.area, "0,4449 ha");
});

test("TERC7 pozostaje tekstem, a funkcja wyprowadza sześciocyfrowy TERYT", () => {
  assert.equal(terc7ToTeryt("0012345"), "001234");
  assert.equal(terc7ToTeryt("12345"), null);
  assert.equal(terc7ToTeryt(1234567), null);
  assert.equal(normalizeCommuneCode("0012345"), "001234_5");
  assert.equal(normalizeCommuneCode("001234"), null);
});

test("parsuje odpowiedzi list powiatu, gmin i obrębów z kodami jako tekst", () => {
  const counties = parseCounties({ features: [{ attributes: { teryt: "0012", nazwa: "Fikcyjny powiat" } }] });
  const communes = parseCommunes({ features: [{ attributes: { teryt: "0012345", nazwa: "Testowo" } }] });
  assert.deepEqual(counties, [{ code: "0012", name: "Fikcyjny powiat" }]);
  assert.deepEqual(communes, [{ code: "0012345", name: "Testowo" }]);
  assert.deepEqual(parseRegionsText("0\n001234_5.0001|0012345|Fikcyjny obręb|Testowo|Fikcyjny powiat"), [
    { code: "001234_5.0001", name: "Fikcyjny obręb" },
  ]);
  assert.deepEqual(parseRegionsText("0"), []);
  assert.throws(() => parseRegionsText("1\nUsługa niedostępna"), /błąd podczas pobierania listy obrębów/);
  assert.throws(() => parseCounties({ features: [{ attributes: { teryt: 12, nazwa: "Fikcyjny" } }] }), /nieprawidłowym/);
});

test("parsuje WKT działki i odrzuca błędną lub poza-polską geometrię", () => {
  const geometry = parseWktGeometry(fakeGeometry);
  assert.equal(geometry.type, "Polygon");
  assert.equal(geometry.coordinates[0].length, 5);
  const parcel = parseParcelText("0\n" + syntheticParcelRow, "fallback");
  assert.equal(parcel.id, "998877_6.0001.12/3");
  assert.equal(parcel.number, "12/3");
  assert.ok(Math.abs(parcel.extent.center.lat - 52.05) < 1e-8);
  assert.ok(Math.abs(parcel.extent.center.lon - 20.05) < 1e-8);
  assert.equal(parseParcelText("0", "fallback"), null);
  assert.throws(() => parseParcelText("1\nUsługa niedostępna", "fallback"), /błąd podczas wyszukiwania działki/);
  assert.equal(parseWktGeometry("POLYGON (broken)"), null);
  assert.throws(() => parseParcelText(
    "0\n001234_5.0001.4|0012345|4|Fikcyjny|Testowo|Fikcyjne|POLYGON ((1 1, 2 1, 2 2, 1 1))",
    "fallback",
  ), /nieprawidłową geometrię/);
  assert.equal(isValidParcelNumber("12/3"), true);
  assert.equal(isValidParcelNumber("12&debug"), false);
});

test("kontekst działki wyprowadza kody z identyfikatora jednostki i nazw PRG", () => {
  const selection = {
    parcel: { id: "998877_6.0001.12/3", number: "12/3" },
    powiat: { code: "9988", name: "Fikcyjny powiat" },
    gmina: { code: "998877", name: "Fikcyjna gmina" },
    voivodeshipName: "Fikcyjne województwo",
    extent: { center: { lat: 52.05, lon: 20.05 } },
  };
  let context = createSearchContext(selection);
  assert.equal(context.gmina, undefined, "sześć cyfr nie wystarcza do utworzenia terc7");
  assert.equal(context.parcel.id, selection.parcel.id);
  assert.equal(context.parcel.obrebTeryt, undefined);
  assert.deepEqual(context.point, { lat: 52.05, lon: 20.05, crs: "EPSG:4326" });
  assert.deepEqual(context.powiat, { code: "9988", name: "Fikcyjny powiat" });
  assert.deepEqual(context.voivodeship, { code: "99", name: "Fikcyjne województwo" });
  assert.equal(validateContext(context).context.source, "dzialki");

  context = createSearchContext({ ...selection, gmina: { code: "9988776", name: "Fikcyjna gmina" } });
  assert.equal(context.gmina, undefined, "kod z listy nie pasuje do rodzaju jednostki zakodowanego w ID");

  const communes = [
    { code: "9988771", name: "Fikcyjna gmina miejska" },
    { code: "9988772", name: "Fikcyjna gmina wiejska" },
    { code: "9988773", name: "Fikcyjna gmina miejsko-wiejska" },
  ];
  for (const kind of [1, 2, 3]) {
    const mapped = deriveCommuneFromUnitId(`998877_${kind}.0001.12/3`, communes);
    assert.deepEqual(mapped, { code: `998877${kind}`, name: communes[kind - 1].name, kind, inferred: false });
    const result = createSearchContext({ ...selection, parcel: { id: `998877_${kind}.0001.12/3` }, communes });
    assert.deepEqual(result.gmina, { terc7: `998877${kind}`, name: communes[kind - 1].name, kind });
    assert.equal(validateContext(result).context.gmina.terc7, `998877${kind}`);
  }
  for (const kind of [4, 5]) {
    const mapped = deriveCommuneFromUnitId(`998877_${kind}.0001.12/3`, communes);
    assert.deepEqual(mapped, { code: "9988773", name: "Fikcyjna gmina miejsko-wiejska", kind: 3, inferred: true });
    const result = createSearchContext({ ...selection, parcel: { id: `998877_${kind}.0001.12/3` }, communes });
    assert.deepEqual(result.gmina, { terc7: "9988773", name: "Fikcyjna gmina miejsko-wiejska", kind: 3 });
    assert.equal(validateContext(result).context.gmina.terc7, "9988773");
  }
  assert.equal(deriveCommuneFromUnitId("998877_6.0001.12/3", communes), null);
  assert.equal(deriveCommuneFromUnitId("invalid", communes), null);
});

test("nazwy województwa, powiatu, gminy i obrębu pochodzą z właściwych źródeł", () => {
  const names = resolveParcelAdministrativeNames({
    id: "981234_6.0001.12/3",
    county: "powiat surowy z ULDK",
    commune: "gmina surowa z ULDK",
    region: "region surowy z ULDK",
  }, {
    powiat: { code: "9812", name: "Testowy powiat z PRG" },
    gmina: { code: "9812346", name: "Testowa gmina z PRG" },
    region: { code: "981234_6.0001", name: "Testowy obręb z ULDK" },
  }, { "98": "Testowe województwo z kodu" });

  assert.deepEqual(names, {
    voivodeshipName: "Testowe województwo z kodu",
    countyName: "Testowy powiat z PRG",
    communeName: "Testowa gmina z PRG",
    regionName: "Testowy obręb z ULDK",
  });
  assert.equal(resolveParcelAdministrativeNames({ county: "powiat surowy" }).countyName, "surowy");
});

test("API używa tylko GET i pokazuje atrapowy czas oczekiwania zimnego startu", async () => {
  let now = 0;
  const waits = [];
  const calls = [];
  const api = createSearchApi({
    now: () => now,
    timeoutMs: 120000,
    setTimeoutFn: () => 1,
    clearTimeoutFn: () => {},
    setIntervalFn: (callback, delay) => {
      assert.equal(delay, 1000);
      now = 22000;
      callback();
      return 2;
    },
    clearIntervalFn: () => {},
    async fetchImpl(url, options) {
      calls.push({ url: String(url), method: options.method });
      return { ok: true, status: 200, text: async () => "0" };
    },
  });
  assert.deepEqual(await api.regions("9988776", { onWait: (seconds) => waits.push(seconds) }), []);
  assert.deepEqual(waits, [22]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "GET");
  assert.match(calls[0].url, /GetRegionByNameOrId/);
});

test("pojedynczy błąd sieci ma jedną automatyczną próbę ponowną", async () => {
  let calls = 0;
  const api = createSearchApi({
    setTimeoutFn: () => 1,
    clearTimeoutFn: () => {},
    setIntervalFn: () => 2,
    clearIntervalFn: () => {},
    async fetchImpl(url, options) {
      calls += 1;
      assert.equal(options.method, "GET");
      if (calls === 1) throw new TypeError("synthetic network failure");
      return { ok: true, status: 200, text: async () => "0" };
    },
  });
  assert.deepEqual(Object.keys(api).sort(), ["communes", "counties", "egib", "parcel", "regions"]);
  assert.equal(api.request, undefined, "API nie udostępnia ogólnego klienta z arbitralnym adresem");
  assert.deepEqual(await api.regions("9988776"), []);
  assert.equal(calls, 2);
});

test("stan formularza i zaznaczenie działki pozostają w pamięci modułu", () => {
  resetDzialkiState();
  updateDzialkiState({
    search: { powiatCode: "9988", parcelNumber: "12/3", powiaty: [{ code: "9988", name: "Fikcyjny powiat" }] },
    selectedParcel: { parcel: { id: "998877_6.0001.12/3" }, geometry: { type: "Polygon", coordinates: [] } },
  });
  const first = getDzialkiState();
  first.search.powiaty[0].name = "zmiana w kopii";
  first.selectedParcel.parcel.id = "zmiana w kopii";
  const second = getDzialkiState();
  assert.equal(second.search.powiaty[0].name, "Fikcyjny powiat");
  assert.equal(second.selectedParcel.parcel.id, "998877_6.0001.12/3");
  resetDzialkiState();
});
