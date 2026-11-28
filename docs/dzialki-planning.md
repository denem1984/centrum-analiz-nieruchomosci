# M4d.2 — Planowanie przestrzenne

Źródło parytetu: frontend `denem1984/analizator-nieruchomosci`, rewizja `a1aa39d711b2730dfcf62799e42ab7d79d4bf3d3`, `index.html`. Poniższe ustalenia są [FAKT z kodu], nie pomiarem produkcji. Nie odtwarzamy logowania starego frontu (ostateczna D5).

## Stary front vs nowa aplikacja — żądania

Wszystkie żądania poniżej to **GET**. Adresy dotyczą wyłącznie funkcji widocznych we froncie. Nowe funkcje URL w `planning-services.js` i `planning-projection.js` mają testy pełnych adresów; allowlista przyjmuje je tylko w scenariuszu `--planning-layers`.

| Cel / stary front (plik:linia) | Stary adres | Nowa implementacja | Parametry, CRS i format |
|---|---|---|---|
| MPZP, `index.html:211` | `https://mapy.geoportal.gov.pl/wss/ext/KrajowaIntegracjaMiejscowychPlanowZagospodarowaniaPrzestrzennego` | `PLANNING_LAYERS.mpzp`, `buildPlanningGetMapUrl` | GetMap, WMS 1.1.1 (domyślne Leaflet), `plany,raster,wektor-str,wektor-lzb,wektor-pow,wektor-lin,wektor-pkt,granice`, `styles=`, PNG transparent, EPSG:3857, 1024×1024, bbox west/south/east/north w metrach, opacity 0,6 |
| Linie zabudowy, `index.html:211` | ten sam KIMPZP | `buildingLines` | GetMap, WMS 1.3.0, `wektor-lzb`, `styles=default`, PNG transparent, EPSG:3857, 256×256, opacity 0,95 |
| POG uchwalony, `index.html:211,269` | `https://rejestr-urbanistyczny.gov.pl/uslugi-sieciowe/wms-pog/ows` | `pogAdopted` + opisane niżej uzupełnienie gminne | GetMap, WMS 1.3.0, `APP.POG.PrawnieWiazacyLubRealizowany`, `styles=`, PNG transparent, EPSG:4326, 256×256; kolejność osi BBOX latitude/longitude, opacity 0,6 |
| POG projektowany RU, `index.html:211` | ten sam WMS RU | `pogDraftRu` | GetMap, WMS 1.3.0, `APP.POG.WOpracowaniu,APP.POG.WTrakciePrzyjmowania`, `styles=,`, EPSG:4326 (BBOX latitude/longitude), PNG transparent, 256×256, opacity 0,6 |
| POG projektowany GUGiK, `index.html:211` | `https://mapy.geoportal.gov.pl/wss/ext/ProjektowanePlanyOgolneGmin` | `pogDraftGugik` | GetMap, WMS 1.3.0, `strefaPlanistyczna`, default, EPSG:3857, PNG transparent, 256×256, opacity 0,6 |
| Gmina w środku widoku i identyfikacja klikniętej działki, `index.html:237,562–570,823–825` | KIEG `https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow` | istniejący `buildMapClickFeatureInfoUrl`; planowanie współdzieli wynik kliknięcia EGiB | GetFeatureInfo, WMS 1.1.1, EPSG:4326, bbox ±0,0012°, 1000×1000, X/Y=500, `dzialki`, `INFO_FORMAT=text/xml`, PNG transparent. Szczegóły istniejącej tabeli: `docs/dzialki-module.md` |
| Dostępność gminnego POG, `index.html:219–225` | `https://wms.e-mapa.net/cgi-bin/pog/<teryt6>` | `buildEmapaCapabilitiesUrl` | `SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0`, XML; identyfikator z parceli, nie zgadywany |
| Gminny POG na mapie, `index.html:242–268` | ten sam adres gminny | `emapaTileRequest`, `createEmapaLayer` | GetMap 1.1.1, `app.StrefaPlanistyczna,app.StrefaPlanistyczna-etykiety`, `STYLES=%2C`, SRS EPSG:2180, BBOX minE/minN/maxE/maxN do 2 miejsc, rozmiar 16–1200 wyliczany z narożników, PNG transparent. Proj4 i transformacja afiniczna odtwarzają raster w kafelku EPSG:3857. Od zoomu 13, opacity 0,6 |
| MPZP z gminy, `index.html:320–328` | `https://analizator-nieruchomosci.onrender.com/api/mpzp-gmina-info` | `buildMpzpInfoUrl(point, teryt6)` | `teryt`, `lat`, `lon`; JSON `plans`. Pierwszy wybór dla planów |
| MPZP z RU jako fallback, `index.html:330–340` | `https://analizator-nieruchomosci.onrender.com/api/mpzp-info` | `buildMpzpInfoUrl(point)` | `lat`, `lon`; JSON `found,plany`, użyty gdy gmina nie zwróci planów |
| Szczegóły MPZP działki, `index.html:342–349` | `https://analizator-nieruchomosci.onrender.com/api/dzinfo` | `buildDzinfoUrl` | `id` bez zmiany identyfikatora; JSON `mpzp`, równolegle z wyszukiwaniem planów, nie zamiast niego |
| Uchwalony POG — popup gminny, `index.html:270–318,845–846` | adres gminny e-mapa | `buildEmapaInfoUrl` | GetFeatureInfo 1.1.1, `app.StrefaPlanistyczna,app.AktPlanowaniaPrzestrzennego.POG`, query layers te same, styles przecinek, EPSG:2180, bbox ±20 m od przeliczonego punktu, 101×101, X/Y=50, FEATURE_COUNT=5, text/xml, image/png |
| Projektowana strefa GUGiK — popup, `index.html:710–736,848–853` | WMS projektowanych planów GUGiK | `buildDraftZoneInfoUrl` | GetFeatureInfo 1.3.0, EPSG:3857, bbox widoku, rozmiar mapy, I/J kliknięcia zaokrąglone w dół i ograniczone do obrazu, `strefaPlanistyczna`, default, text/html; bez FEATURE_COUNT |
| Ikona legendy linii, `index.html:187` | `https://opendata.geoportal.gov.pl/Geoportal/ikony/mpzp/mpzp-lzb.png` | `PLANNING_LEGEND_URLS.buildingLines` | PNG; ładowany po otwarciu informacji |
| Legenda projektowanej strefy, `index.html:187` | WMS projektowanych planów GUGiK | `PLANNING_LEGEND_URLS.pogDraftGugik` | `version=1.3.0&service=WMS&request=GetLegendGraphic&sld_version=1.1.0&layer=strefaPlanistyczna&format=image/png&STYLE=default`; PNG |

Wszystkie pięć warstw ma maxZoom 22, `updateWhenZooming:false`, `updateWhenIdle:true`, `keepBuffer:1`, jak stary front (`index.html:211`). Obie definicje RU są w EPSG:4326 mimo mapy EPSG:3857; zamiana na inną usługę lub CRS nie jest dozwoloną „optymalizacją”. Kafle wylicza Leaflet, a testy sprawdzają ich parametry i pełne przykładowe URL-e. GetMap z Leaflet używa małego `bbox`; ręcznie budowane GetFeatureInfo i gminny WMS używają dużego `BBOX`. Odróżnienie potwierdzono w rzeczywistej przeglądarce, a błąd pierwszej wersji allowlisty poprawiono przed jakimkolwiek ruchem do usług.

## Zachowanie i różnice jakościowe

Aktualizacja 2026-11-28 (D34): warstwę linii zachowano po rzeczywistym teście w publicznym przykładzie GUGiK: widoczne linie z pustymi i pełnymi trójkątami oraz zgodna legenda. Opis i status informują o wymaganym dużym zbliżeniu i publikacji wektorowej przez gminę. Nie zmieniono URL-i ani parametrów WMS. [Dowody i ograniczenia](map-panel-scroll.md); same kompletne kafelki nie dowodzą obecności danych w dowolnym miejscu.

- Pięć przełączników jest domyślnie wyłączonych; stan grupy i wyborów pozostaje w pamięci przy przełączaniu zakładek. Trzy przyciski `?` mają etykiety, aria-expanded i aria-controls; legendy nie wykonują żądań przed otwarciem.
- Gminny POG uzupełnia uchwalony POG z RU, jak `index.html:269`; nie jest usunięty na rzecz jednego krajowego rastra. Zmiana widoku anuluje poprzednie sprawdzanie, usuwa stary raster gminny i z opóźnieniem 500 ms ustala właściwą gminę.
- Każda opcja ma monitor obrazów widocznych kafelków: 0/0 nie jest sukcesem. Standardowe błędy podlegają K0 (2 ponowienia); monitor do 40 s sprawdza kompletność co 3 s i daje ręczne ponowienie. Źródło w toku nie jest uruchamiane drugi raz. Dla rysowanego POG gminnego błąd, timeout i błąd canvas są jawne — stary front kończył błędny kafelek jako poprawny pusty canvas (`index.html:261–264`).
- „Kafelki wczytane” oznacza otrzymanie obrazu, nie kompletność publikacji gminy ani obecność strefy w każdym pikselu. HTTP 404 gminnego WMS jest jawnie opisanym brakiem usługi, inne błędy pozostawiają stan niepełny i ponowienie.
- Popup działki jest wspólny: zachowuje dane EGiB i dodaje sekcje planowania. Kliknięcie przy wyłączonym EGiB nadal może pokazać planowanie. Zmiana widoku, kolejne kliknięcie i unmount anulują poprzednie żądania. Odpowiedź nie może nadpisać nowszego miejsca.
- Dokładny komunikat `Szczegóły planu miejscowego niedostępne (brak w Rejestrze Urbanistycznym i w usłudze gminnej).` jest używany po poprawnym pustym wyniku planów i szczegółów, jak `index.html:841–843`. Błąd jednego źródła oznacza wynik niepełny, nie brak planu.
- `Brak danych projektowanej strefy w tym miejscu.` oznacza poprawną odpowiedź GUGiK bez rekordu, jak `index.html:851–853`. Błąd transportu lub odpowiedź WMS Exception ma osobny stan błędu i przycisk ponowienia.
- Popup zachowuje nazwy/statusy/daty/odnośniki planów, szczegóły uchwały, strefy i dokumenty, profile oraz parametry zabudowy. Teksty usług są renderowane przez textContent. Odnośniki są dopuszczane tylko jako HTTPS bez danych uwierzytelniających. Nie montujemy HTML usługi.
- Przed żądaniem backendu używana jest sonda zdrowia do 120 s i wspólny licznik sekund. Nie dodajemy osobnego cyklicznego pingowania.

## Biblioteka

Proj4js 2.9.0 pochodzi z `proj4js/proj4js`, tag `2.9.0`, `dist/proj4.js`, blob `4d4a5b5cbab4242e124feb6680ad65822fcee1cb`; plik ma 89 888 B, SHA-256 `tsjlDiRXDSAsuQALr13ta74LzDw1fOf0yfPGMB2FmfU=`. Jest lokalny, z licencją MIT w `app/vendor/dzialki/proj4-2.9.0/LICENSE.md`. Loader sprawdza SRI i ładuje go dopiero przy potrzebie gminnego POG. `.gitattributes` wyłącza konwersję końców linii w vendor; test porównuje blob i SHA-256. Aplikacja nadal nie korzysta z npm ani CDN.

## Weryfikacja i instrukcja właściciela

Test startowy: `tests/dzialki-module.test.mjs`, pełna powłoka i Leaflet/DOM/fetch z atrap. Testy żądań, fallbacków, bezpieczeństwa renderowania, niepełności i cleanup: `tests/dzialki-planning.test.mjs`; kontrola allowlisty: `scripts/planning-allowlist.test.mjs`.

Polecenia (PowerShell otwarty w folderze projektu):

1. `node --test scripts/*.test.mjs tests/*.test.mjs` — oczekiwane wszystkie PASS, czas poniżej 5 s.
2. `node scripts/browser-smoke.mjs --headed --planning-layers --offline-planning --task m4d2` — prawdziwa przeglądarka i Leaflet, ale wszystkie odpowiedzi usług to fikcyjne atrapy dostarczone przez CDP; żadnych żądań do usług. Nie dowodzi działania produkcji.
3. `node scripts/browser-smoke.mjs --headed --planning-layers --task m4d2` — rzeczywiste dozwolone GET-y z trwałym budżetem; wynik i PNG w wskazanym folderze `.local-results/`. Nie usuwaj licznika ani nie zmieniaj task przy ponowieniu.
4. W aplikacji otwórz Działki, rozwiń Planowanie przestrzenne. Każda opcja powinna być wyłączona; otwórz trzy informacje `?`. Włącz każdą warstwę osobno, poczekaj na licznik. Powiększ do zoomu co najmniej 13 dla uzupełnienia gminnego POG i odpowiednio bliżej dla linii zabudowy.
5. Kliknij znane miejsce w planie. Sprawdź sekcje wspólnego popupu, nazwy/statusy/odnośniki i komunikaty braku danych. Przy błędzie powinien pojawić się przycisk ponowienia, nigdy komunikat o kompletnym sprawdzeniu wszystkich źródeł.
6. Podczas ładowania przesuń mapę, kliknij inne miejsce i przejdź do RCN, potem wróć. Wybory powinny pozostać, a poprzednie żądania nie mogą zmieniać nowszego popupu. Odświeżenie strony czyści wybory.

Brak opublikowanego planu nie jest dowodem błędu aplikacji. Błąd usługi nie jest dowodem braku planu. Test właściciela porównuje tylko potrzebne przypadki D4/D5 z własnym baseline; nie zapisuj prawdziwych danych wejściowych ani zrzutów do repozytorium.

## Wyniki

[FAKT: weryfikacja 2026-11-27] Pełny zestaw: **139/139 PASS, 735,31 ms**. Testuje dokładne URL-e, priorytet/fallback MPZP, pusty wynik a niepełność, licznik 17 s zimnego backendu na atrapie, anulowanie i spóźnione odpowiedzi, blob i SRI proj4, timeout/retry/cancel canvas, bezpieczny renderer i allowlistę. Test startowy obejmuje całą powłokę z atrapą DOM. Wszystkie sześć nowych zasobów aplikacji uzyskało lokalne HTTP 200.

Wykonano cztery uruchomienia Edge z oknem w ramach zadania `m4d2`:

| Przebieg | Wynik | Zakres i dowód |
|---|---|---|
| 1, offline, 19:44 UTC | FAIL | Pierwsza wersja allowlisty myliła `bbox` z `BBOX`; 540 prób zablokowano lokalnie. Zero żądań do usług; błąd poprawiono. |
| 2, offline, 19:47 UTC | PASS, 11/11 | Rzeczywisty Leaflet, fikcyjne odpowiedzi CDP; pięć monitorów i trzy sekcje popupu, cleanup i powrót. Zero żądań do usług. |
| 3, rzeczywiste usługi, 19:47 UTC | PASS, 11/11 | W publicznym punkcie testowym w Pile: MPZP 4/4 kafelki, linie 20/20, uchwalony POG 40/40 (dwa źródła), projektowany RU 20/20, projektowany GUGiK 20/20. Popup MPZP i uchwalonego POG wczytany; GUGiK poprawnie pusty. Zero blokad allowlisty i wyjątków JS. |
| 4, offline + mobile, 19:49 UTC | PASS, 12/12 | Dodatkowo widok 390 px bez poziomego przewijania dokumentu. Zero żądań do usług. |

Zrzuty desktop, popupu i mobile obejrzano; po poprawce aktualizacji układu popup mieści się w mapie i ma przewijanie. Raporty/PNG znajdują się wyłącznie lokalnie: `.local-results/browser-smoke-2026-11-27T19-44-57-650Z/`, `...19-47-10-570Z/`, `...19-47-42-269Z/`, `...19-49-46-801Z/`.

Trwały licznik: **4/4 starty**; rzeczywisty ruch tylko w przebiegu 3: backend Działek 5/400, KIEG z przekierowaniami 97/300, KIMPZP 51/300, RU 90/300, GUGiK projektowany 47/300, gminny POG 27/300, OSM 57/300, PRG 1/300, ikona legendy 1/300; pozostałe trzy sondy zdrowia po 1/300. Łącznie 379 rezerwacji zewnętrznych. Nie resetowano licznika i nie przekroczono limitów.

**Ograniczenia:** pojedynczy widok nie jest porównaniem wszystkich planów z baseline D4/D5 właściciela ani potwierdzeniem pokrycia kraju. W realnym przebiegu istniejący WFS EGiB otrzymał HTTP 502; panel pokazał błąd, a planowanie działało niezależnie. Wynik PASS dotyczy scenariusza planowania, nie odbioru EGiB ani usunięcia problemów historycznych KIEG. Część żądań anulowano przy zmianie widoku i przełączaniu modułów. Nie badano starego frontu ruchem sieciowym.
