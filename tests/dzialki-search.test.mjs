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
  terc7ToTeryt,
} from "../app/js/modules/dzialki/search.js";
import { resetDzialkiState, getDzialkiState, updateDzialkiState } from "../app/js/modules/dzialki/state.js";

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

test("kontekst działki nie dopisuje obrębTeryt i nie zgaduje kodu gminy", () => {
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
  assert.equal(validateContext(context).context.source, "dzialki");

  context = createSearchContext({ ...selection, gmina: { code: "9988776", name: "Fikcyjna gmina" } });
  assert.deepEqual(context.gmina, { terc7: "9988776", name: "Fikcyjna gmina", kind: null });
  assert.equal(validateContext(context).context.gmina.terc7, "9988776");
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
  assert.deepEqual(Object.keys(api).sort(), ["communes", "counties", "parcel", "regions"]);
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
