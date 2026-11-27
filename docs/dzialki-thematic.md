# M4d.3 — RWDZ, ISOK, KIUT i mapa własności

Źródłem porównania jest wyłącznie publiczny front `denem1984/analizator-nieruchomosci`, `index.html`, rewizja `a1aa39d711b2730dfcf62799e42ab7d79d4bf3d3`. Nie zmieniano źródłowego repozytorium ani usług. Zgodność kodu żądań nie jest dowodem kompletności danych dla całego kraju.

## Stary front vs nowa aplikacja

Wszystkie żądania poniżej są GET. Pełne adresy wraz z kolejnością i kodowaniem parametrów porównuje `tests/dzialki-thematic.test.mjs`; allowlistę i warunek faktycznego przekierowania sprawdza `scripts/thematic-allowlist.test.mjs`. Symbole `bbox`, `size`, `pixel` oznaczają bieżący widok i kliknięcie, nie stały obszar próbki.

| Żądanie i adres | Stary front: parametry / CRS / format | Nowa aplikacja | Dowód źródłowy |
|---|---|---|---|
| RWDZ raster `https://mapy.geoportal.gov.pl/wss/ext/GlownyUrzadNadzoruBudowlanego/RWDZ-WMS` | WMS GetMap 1.3.0, `layers=pozwolenia_pkt,pozwolenia_POLYGON`, `styles=`; EPSG:3857, bbox x/y, 256×256, image/png, transparent=true | Te same parametry; opacity 0,8, maxZoom 22 | `index.html:211` |
| ISOK raster `https://wody.isok.gov.pl/wss/INSPIRE/INSPIRE_NZ_HY_MZPMRP_WMS` | GetMap 1.3.0, `layers=NZ.Fluvial,NZ.SeaWater`, `styles=NZ.HazardArea_r.Default,NZ.HazardArea_sea.Default`; EPSG:3857, bbox x/y, 256×256, image/png, transparent=true | Te same parametry; opacity 0,72, maxZoom 22 | `index.html:211` |
| KIUT raster `https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu` | GetMap, domyślne Leaflet 1.1.1; `layers=gesut,kgesut_dane,przewod_urzadzenia,przewod_specjalny,przewod_niezidentyfikowany,przewod_elektroenergetyczny,przewod_telekomunikacyjny,przewod_gazowy,przewod_cieplowniczy,przewod_kanalizacyjny,przewod_wodociagowy`, `styles=`; SRS EPSG:3857, 256×256, image/png, transparent=true | Te same parametry; opacity 0,9, maxZoom 22; węzły integracja01/02 dopuszczone w smoke wyłącznie jako cel rzeczywistego przekierowania | `index.html:211` |
| Własność `https://analizator-nieruchomosci.onrender.com/api/ownership-national` | `bbox=south,west,north,east` z URLSearchParams, bez rozszerzenia bbox; GeoJSON EPSG:4326, Accept application/json | Ten sam adres, bbox i format; odświeżenie po 350 ms, anulowanie poprzedniego | `index.html:412` |
| Brakujące grupy: KIEG `https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow` | GetFeatureInfo 1.1.1, LAYERS/QUERY_LAYERS=dzialki, STYLES=, SRS EPSG:4326, bbox punkt ±0,0012°, 1000×1000, X/Y=500, INFO_FORMAT=text/xml, FORMAT=image/png, TRANSPARENT=TRUE | Istniejący dokładny builder KIEG; do 60 braków na partię, 4 równoległe; kontrola zwróconego identyfikatora, gdy obecny | `index.html:419–449`; dokładny URL w `tests/dzialki-egib-layers.test.mjs` |
| RWDZ popup `https://analizator-nieruchomosci.onrender.com/api/rwdz-feature-info` | SERVICE=WMS, VERSION=1.3.0, REQUEST=GetFeatureInfo, LAYERS i QUERY_LAYERS=pozwolenia_pkt,pozwolenia_POLYGON; STYLES=default,default; CRS EPSG:3857; BBOX widoku x/y, WIDTH/HEIGHT mapy; FORMAT=image/png, INFO_FORMAT=text/xml, I/J kliknięcia po floor i ograniczeniu do mapy, FEATURE_COUNT=5 | Ten sam adres i parametry; do 5 wpisów i 16 pól, te same etykiety i pomijanie pól geometrii/dodatkowych | `index.html:738–815` |
| Dwie legendy RWDZ — adres WMS powyżej | `version=1.3.0&service=WMS&request=GetLegendGraphic&sld_version=1.1.0&layer=pozwolenia_pkt` albo `pozwolenia_POLYGON`, `format=image/png&STYLE=default`; bez CRS | Te same pełne URL-e, pobranie dopiero po `?` | `index.html:187` |
| Dwie legendy ISOK — adres WMS powyżej | SERVICE=WMS, VERSION=1.3.0, REQUEST=GetLegendGraphic, LAYER=NZ.Fluvial / NZ.SeaWater, STYLE=NZ.HazardArea_r.Default / NZ.HazardArea_sea.Default, FORMAT=image/png; WIDTH/HEIGHT=490/80 i 658/60; bez CRS | Te same pełne URL-e, pobranie po otwarciu dialogu | `index.html:187` |

Raster własności nie jest nowym żądaniem: kolorowanie wykonuje lokalnie GeoJSON. Style: obrys #555, 0,8 px, fillOpacity 0,55 i 16 kolorów źródła; nieustalona grupa szara. Cache w pamięci pozwala ręcznym ponowieniem uzupełnić kolejną partię. Jeśli pozostają braki albo usługa zgłasza partial/truncated, wynik ma stan „niepełny”. Puste FeatureCollection jest poprawnym pustym wynikiem; niepoprawny format i błędy HTTP są błędem.

Kolejność pane zachowuje źródło: własność/ISOK 400, KIUT 410, RWDZ 420, kontury 430, budynki 435, zaznaczenia 440, etykiety 450. KIUT zachowuje filtr kontrastu źródła. Legendy mają 9 pozycji sieci i 16 grup rejestrowych. Dialog ISOK obsługuje zamknięcie, Escape, Tab/Shift+Tab i powrót fokusu; obrazy można przewijać w jego wnętrzu.

Popup RWDZ współdzieli okno z EGiB i planowaniem, także po błędzie EGiB lub przy wyłączonym EGiB. Treść jest tekstem DOM, nie HTML-em usługi. Błąd RWDZ nie udaje braku wpisu. Czas oczekiwania na backend jest widoczny w sekundach; gest mapy, zamknięcie i odmontowanie anulują pracę. Trzy monitory rasterów stosują istniejące K0 i okno 40 s; brak kompletu obrazów daje ponowienie tego samego URL bez cache-bustingu.

## Sprawdzenie właściciela

1. Po pobraniu kolejki PR uruchomić `node scripts/serve.mjs`, otworzyć lokalny adres i Działki. Sprawdzić cztery domyślnie wyłączone opcje w Inwestycjach oraz Infrastrukturze.
2. Włączyć warstwy pojedynczo w znanych miejscach baseline D6. Porównać symbole, obrysy, kolejność rysowania i legendy ze starym frontem; porównać własność także dla działek o początkowo nieznanej grupie. Nie uznawać braku symbolu za brak sprawy lub zagrożenia.
3. Otworzyć obie informacje `?`, przejść klawiaturą przez dialog ISOK i zamknąć Escape. Sprawdzić 390 px i większy widok; obrazy legend mają własne przewijanie.
4. Włączyć RWDZ i MPZP, kliknąć mapę z włączonym oraz wyłączonym EGiB. Obie sekcje mają pozostać w jednym oknie; porównać dane, brak wpisu i przypadek błędu. Podczas oczekiwania przesunąć mapę, zamknąć popup i zmienić zakładkę — odpowiedź nie ma odtworzyć starego okna.
5. Zmienić zakładkę i wrócić: wybory pozostają, stara mapa i dialog są usunięte. Przy problemie usługi oczekiwać jawnej niepełności i ponowienia, nie fałszywego sukcesu.
6. Scenariusz z atrapami: `node scripts/browser-smoke.mjs --headed --thematic-layers --offline-thematic --task <uzgodniony-identyfikator>`. Z usługami: bez `--offline-thematic`. Oba zużywają start. Nie resetować wykorzystanego m4d3; dodatkowe uruchomienie wymaga osobnego uzgodnienia budżetu. Wyniki pozostają w ignorowanym `.local-results/`; screenshot live pomija szczegóły RWDZ, które mogą zawierać nazwiska.

Wyniki faktycznie wykonanych prób i ograniczenia znajdują się w `reports/m4d3-thematic.md`. Punktowy smoke nie zastępuje porównania baseline ani dowodu pokrycia całego kraju.
