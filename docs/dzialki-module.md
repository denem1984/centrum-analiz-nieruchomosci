# Moduł Działki — M4b/M4c

## Zakres

M4b dodaje natywny widok mapy do zakładki Działki. Używa lokalnego Leaflet 1.9.4 z licencją BSD 2-Clause. Biblioteka jest ładowana lokalnie; moduł nie dodaje CDN ani zależności npm.

Frontend poprzedniej aplikacji zaczyna mapę w centrum [52.07, 19.48], przy zoomie 6, z krokami zoomu 0,1 i limitem 22. [FAKT z kodu: index.html:211] W tym froncie widoczne są bazowe podkłady OpenStreetMap, satelitarne Esri World Imagery i archiwalna ortofotomapa GUGiK; elementy i atrybucje znajdują się w konfiguracji warstw mapy. [FAKT z kodu: index.html:177,211]

## Podkłady i kontrolki

- **OpenStreetMap** — atrybucja „© OpenStreetMap contributors” z linkiem do strony praw autorskich OSM.
- **Satelita – Esri World Imagery** — atrybucja Esri wyświetlana przez kontrolkę Leaflet.
- **Ortofotomapa archiwalna – GUGiK** — suwak „Rok zdjęcia” w zakresie 1995–2025. Podpis: „Dostępne lata: 1995–2025. W danym miejscu może brakować zdjęcia z wybranego roku.”
- Kontrolki przybliżenia mają krok 0,1; skala metryczna pochodzi z kontrolki Leaflet.

Nazwy, zakres lat, podpis suwaka i źródłowe atrybucje podkładów są zgodne z widocznym zachowaniem frontu. [FAKT z kodu: index.html:177,211] Przy zmianie podkładu oraz roku aktywny zestaw prób pobierania kafelków jest anulowany i inicjowany ponownie.

Warstwa archiwalna wysyła z przeglądarki żądania WMS GetMap do `https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolutionTime` bez pośrednictwa backendu. Używa warstwy `Raster`, stylu `default`, WMS 1.3.0, CRS EPSG:3857, formatu `image/png`, przezroczystości oraz parametru czasu: `2025-11-01` dla 2025 i `<rok>-12-01` dla pozostałych lat. Stary publiczny front buduje te parametry w kodzie warstwy archiwalnej. [FAKT z kodu: index.html:211] Moduł nowej aplikacji odtwarza ten zestaw w `layers-base.js` i obejmuje go testem jednostkowym dla lat 1995, 2004, 2015 i 2025.

## Stan i cykl życia

Wybrany podkład, rok, środek mapy i zoom są przechowywane w pamięci modułu. Przełączenie zakładki odmontowuje mapę i sprząta jej zdarzenia i timery; ponowne wejście przywraca widok. Odświeżenie strony czyści ten stan. Jeśli DenemContext zawiera punkt, mapa ustawia go jako środek przy zoomie co najmniej 16; moduł nie zmienia wspólnego kontekstu.

Stan usługi Działki jest odczytywany z pamięci istniejącej sondy powłoki i subskrybowany w jej magazynie stanu. Moduł nie wykonuje własnych żądań do API Działek.

## Błędy kafelków

Domyślnie moduł wykonuje najwyżej dwie ponowne próby danego kafelka po błędzie ładowania albo po załadowaniu obrazu o wymiarach 1×1 (heurystyka pustej odpowiedzi), po około 1,5 s i 4 s, z jitterem do 250 ms. Maksymalnie sześć prób może być zaplanowanych lub aktywnych jednocześnie dla warstwy. Odejście kafelka z widoku, przełączenie podkładu albo roku oraz odmontowanie anuluje oczekujące próby. Po wyczerpaniu prób licznik „Niezaładowane kafelki: N”, komunikat live „Usługa GUGiK nie zwróciła obrazu dla N kafelków mimo ponowień. Spróbuj ponownie później lub zmień rok.” i przycisk „Spróbuj ponownie” informują o stanie. Ustawienie `window.__DZIALKI_TILE_RETRY__` jest przeznaczone wyłącznie do pomiaru, walidowane zakresami i bez niego pozostawia domyślną konfigurację.

### Pomiar niezawodności — M4b.2 (2026-11-03)

W browser-smoke wykonano dwa przebiegi macierzy K0–K3 po trzech wczytaniach na konfigurację; każdy pomiar końcowy następował po 35 s, w stałym widoku testowym Piły przy zoomie 17,6. Pierwszy przebieg posłużył do sprawdzenia macierzy; przed drugim doprecyzowano raportowanie żądań bez odpowiedzi. W skorygowanym przebiegu K0 uzyskał końcową frakcję 58,3%/75,0%/75,0% (min/mediana/maks), K1 33,3%/66,7%/75,0%, K2 0,0%/50,0%/66,7%, a K3 16,7%/33,3%/75,0%. Każda konfiguracja wysłała 36 żądań GetMap. K0–K3 nie osiągnęły 90% ani 95% w żadnym z trzech wczytań skorygowanego przebiegu.

W skorygowanym przebiegu 77/144 żądań GetMap otrzymało HTTP 200 z `image/png`; pozostałe 67 nie miało statusu HTTP w chwili pomiaru 35 s. Nie zarejestrowano odpowiedzi błędu ani anulowania dla tych 67 żądań. W DOM nie znaleziono obrazu 1×1; moduł nie odnotował błędów kafelków ani ponowień w żadnej konfiguracji. K0 miał najwyższą medianę; żadna konfiguracja nie poprawiła frakcji o co najmniej 10 p.p. w co najmniej dwóch z trzech porównywanych wczytań. Dlatego liczby domyślne pozostały bez zmian. Wynik bez odpowiedzi w 35 s wskazuje na opóźnienie warstwy usługi lub sieci, ale nie rozstrzyga jego przyczyny. Szczegóły żądań i PNG pozostają w lokalnym, ignorowanym `.local-results/`.

## Wyszukiwanie działki — M4c

Panel prowadzi użytkownika przez powiat, gminę i obręb, a następnie numer działki. Listy administracyjne pochodzą z publicznego PRG FeatureServer; nazwy obrębów i geometria są pobierane z ULDK. Wyszukiwanie wykonuje wyłącznie GET. Aplikacja zachowuje wybory formularza i wynik w pamięci przy przełączaniu zakładek.

| Kolejność | Cel | Stary publiczny front | Nowa aplikacja | Metoda i parametry | CRS i format odpowiedzi |
|---:|---|---|---|---|---|
| 1 | Lista powiatów | `https://mapy.geoportal.gov.pl/wss/ims/maps/PRG_gugik_wyszukiwarka/FeatureServer/1/query` — wywołanie pobierające powiaty [FAKT z kodu: `index.html:560`] | `buildCountiesUrl()` w `app/js/modules/dzialki/search.js` | GET; `where=1=1`, `outFields=teryt,nazwa`, `returnGeometry=false`, `orderByFields=nazwa`, `f=json` | JSON, bez geometrii i CRS |
| 2 | Lista gmin powiatu | `https://mapy.geoportal.gov.pl/wss/ims/maps/PRG_gugik_wyszukiwarka/FeatureServer/0/query` — wywołanie listy gmin [FAKT z kodu: `index.html:560`] | `buildCommunesUrl()` w `app/js/modules/dzialki/search.js` | GET; `where=teryt LIKE '<kod powiatu>%'`, `outFields=teryt,nazwa`, `returnGeometry=true`, `outSR=4326`, `orderByFields=nazwa`, `f=json` | JSON, geometria EPSG:4326 |
| 3 | Lista obrębów gminy | `https://uldk.gugik.gov.pl/?request=GetRegionByNameOrId` — żądanie `GetRegionByNameOrId` [FAKT z kodu: `index.html:560`] | `buildRegionsUrl()` w `app/js/modules/dzialki/search.js` | GET; `id=<gmina ULDK>`, `result=id,teryt,region,commune,county` | Tekst pól `|`, bez geometrii |
| 4 | Geometria działki | `https://uldk.gugik.gov.pl/?request=GetParcelById` — żądanie wyszukujące działkę `GetParcelById` [FAKT z kodu: `index.html:560`] | `buildParcelUrl()` w `app/js/modules/dzialki/search.js` | GET; `id=<obręb>.<numer>`, `result=id,teryt,parcel,county,commune,region,geom_wkt`, `srid=4326` | Tekst pól `|`; geometria WKT EPSG:4326 |

W rewizji `a1aa39d` te cztery wywołania są zapisane w jednym długim fizycznym wierszu `index.html:560`. Tabela wskazuje osobno rozpoznawalne wywołanie dla każdej trasy; nie podaję sztucznych numerów wierszy. Wszystkie cztery są bezpośrednimi żądaniami przeglądarki do publicznych usług. Testy URL porównują pełne adresy i parametry nowej aplikacji z wzorcami odczytanymi z tych wywołań starego frontu.

### Mapowanie pól administracyjnych

Wiersz „Województwo” i kontekst `voivodeship.name` są budowane z dwucyfrowego kodu województwa pobranego z początku kodu wybranego powiatu; źródłowa mapa nazw województw jest w konfiguracji starego frontu. [FAKT z kodu: `index.html:211`; użycie przy składaniu wyniku: `index.html:560`] Wiersz „Powiat” oraz `powiat.name` korzystają z nazwy wybranego elementu listy powiatów PRG; stary front nie dodaje do niej prefiksu „powiat”. [FAKT z kodu: `index.html:560`] Nazwa gminy pochodzi z wybranego elementu listy PRG, a nazwa obrębu z wybranego elementu listy ULDK; odpowiedź wyszukiwania ULDK zawiera również pola `county`, `commune` i `region`, ale nie są one źródłem nadrzędnym tych nazw w raporcie. [FAKT z kodu: `index.html:560`]

Nowa aplikacja stosuje to mapowanie przez `resolveParcelAdministrativeNames()` przed renderowaniem raportu i ustawieniem DenemContext. Jeśli wybrany element nie jest dostępny, nazwa jednostki może spaść do odpowiedniego pola odpowiedzi ULDK; województwo bez rozpoznanego kodu pozostaje puste zamiast kopiować wartość `region`.

Stary front buduje parametr `teryt` dla informacji o gminie z części identyfikatora przed `_`; ta część ma sześć cyfr. [FAKT z kodu: `index.html:237,321-324`] Funkcja `terc7ToTeryt()` jest czysta i testowana. Kontekst `gmina.terc7` w M4c powstaje wyłącznie z pełnego kodu siedmiocyfrowego. `parcel.id` jest zachowywany bez zmian, a `obrebTeryt` pomijany bez niezależnego potwierdzenia.

Zapytanie ULDK zwraca identyfikator, numer, nazwy jednostek i geometrię; nie zawiera pola powierzchni ewidencyjnej. Obrys jest wyróżniony, widok dopasowany do granic, a numer działki widoczny jako etykieta. Stan formularza i wybrany wynik pozostają w pamięci modułu przy przełączaniu zakładek.

### Raport o działce i dane EGiB — M4c.1

Stary front nie pobiera pól raportu o działce z trasy backendu Działek. Po wyszukaniu wykonuje jeszcze dwa bezpośrednie żądania przeglądarki metodą GET:

| Kolejność | Cel | Stary front | Nowa aplikacja | Metoda i parametry | CRS i odpowiedź |
|---:|---|---|---|---|---|
| 1 | Geometria działki do zapytania EGiB | ULDK `/?request=GetParcelById`, wariant wyniku `id,geom_wkt` [FAKT z kodu: `index.html:560`] | `buildEgibGeometryUrl()` w `app/js/modules/dzialki/egib.js` | GET; `id=<identyfikator działki>`, `result=id,geom_wkt`, `srid=2180` | WKT tekstowy w EPSG:2180 |
| 2 | Powierzchnia ewidencyjna, grupa rejestrowa i klasoużytki | KIEG `/cgi-bin/KrajowaIntegracjaEwidencjiGruntow`, żądanie `GetFeatureInfo` [FAKT z kodu: `index.html:560`] | `buildKiegFeatureInfoUrl()` w `app/js/modules/dzialki/egib.js` | GET WMS `GetFeatureInfo`; `VERSION=1.1.1`, `SRS=EPSG:2180`, `LAYERS=dzialki`, `QUERY_LAYERS=dzialki`, bbox 200×200 m wokół punktu wewnątrz działki, `WIDTH/HEIGHT=1000`, `X/Y=500`, `INFO_FORMAT=text/xml`, `FORMAT=image/png`, `TRANSPARENT=TRUE` | XML z atrybutami EGiB; kolejność: po geometrii ULDK w EPSG:2180 |

Porównanie i testy adresów pochodzą z odczytu starego frontu `index.html` w rewizji `a1aa39d`. Nowy klient akceptuje wyłącznie te dwa dodatkowe kształty GET. Automatyczne testy używają syntetycznych odpowiedzi i nie potwierdzają zachowania usługi produkcyjnej.

Raport pokazuje identyfikator, nazwy jednostek i numer z wybranych list/odpowiedzi oraz powierzchnię, grupę rejestrową i klasoużytki z KIEG. Komunikat po sukcesie brzmi: „Działka została znaleziona. Powierzchnia i klasoużytki pobrane z EGiB.”. Popup prezentuje te same pola EGiB i przełącza zaznaczenie kliknięciem. M4c.1 przełącza tylko wynik wyszukiwania; zaznaczanie wielu działek przez warstwę EGiB należy do M4d.

Kod jednostki na początku identyfikatora parceli służy do wyprowadzenia kodów województwa/powiatu. Dla rodzaju 1/2/3 wyprowadzany jest odpowiadający kod TERC7; dla rodzajów 4/5 budowany jest kod rodzaju 3 [HIP do walidacji na pełnym TERC w M3b]. Nazwy pochodzą z list PRG. Pozostałe rodzaje nie ustawiają `gmina`, a `obrebTeryt` pozostaje pominięte bez niezależnego potwierdzenia.

Tematyczne warstwy EGiB (numery, granice i kontury budynków), planowanie przestrzenne, inwestycje i zagrożenia, infrastruktura i własność pozostają oznaczone jako „w kolejnych etapach”. Dane EGiB do raportu wyszukanej działki są zakresem M4c.1 i nie oznaczają wdrożenia tematycznych warstw EGiB.

### Weryfikacja pustych kafelków — narzędzie diagnostyczne M4c.2

Właściciel uruchamia `scripts/browser-smoke.mjs`; wykonawca nie wysyła żądań do usług zewnętrznych. Skrypt zapisuje dla GetMap wybrane nagłówki odpowiedzi, `encodedDataLength` i współrzędne; odpowiedź HTTP 200 typu obraz poniżej 128 bajtów jest oznaczana jako pusta. Próg jest heurystyką dla bardzo małego pustego PNG, nie dowodem semantycznej pustki obrazu. Trzy odświeżenia porównują zbiory pustych kafelków, a diagnostyka ponawia dokładnie ten sam GET do najwyżej sześciu kafelków z odstępami 1,5 s i 4 s. Nie zmienia to logiki modułu ani liczby jego ponowień.

Możliwość wykrywania pustych kafelków w aplikacji należy ocenić po wynikach nagłówków od właściciela. Jeśli usługa dopuszcza CORS dla pochodzenia aplikacji, `fetch` z odczytem bajtów może pozwolić klasyfikować odpowiedzi; samo `Timing-Allow-Origin` nie zastępuje zgody CORS. Jeśli CORS nie pozwala odczytać odpowiedzi, obecna warstwa obrazów nie udostępnia kodowi aplikacji rozmiaru transferu ani pikseli do wiarygodnego rozpoznania pustego kafelka. Własna warstwa kafelków byłaby wtedy osobnym projektem wymagającym ponownej oceny kontraktu usługi; na tym etapie nie jest implementowana.

## Warstwy EGiB i panel mapy — M4d.1

Panel mapy ma numerowane sekcje wyszukiwania, raportu i warstw. Grupy podkładów, EGiB, planowania, inwestycji, infrastruktury oraz narzędzi są zwijane; grupy przyszłych etapów pozostają wyłączone i opisane jako „w kolejnych etapach”. Numery i kontury działek są domyślnie włączone, kontury budynków wyłączone. Stan przełączników, grup i zaznaczonych działek pozostaje w pamięci aplikacji. Numery i kontury GeoJSON z WFS pojawiają się od zoomu 13. KIEG WMS działek jest widoczny od domyślnego zoomu Leaflet (0) do maxZoom 22; warstwa budynków ma ten sam zakres po włączeniu. Stary front ustawia dla obu warstw `maxZoom:22` i nie podaje `minZoom`. [FAKT z kodu: `index.html:211` — definicje obu warstw są na tej samej fizycznej linii]

| Cel | Stary publiczny front `a1aa39d` | Nowa aplikacja | Metoda, parametry i format | Kolejność |
|---|---|---|---|---|
| Numery i kontury działek | `https://analizator-nieruchomosci.onrender.com/api/wfs`; WFS uruchamiany dla widoku mapy od zoomu 13, z bbox rozszerzonym o 15% [FAKT z kodu: `index.html:536–549`] | `buildParcelWfsUrl()` w `app/js/modules/dzialki/egib-layers.js` | GET; `bbox=south,west,north,east`; odpowiedź GeoJSON z geometrią w EPSG:4326; obrys rysowany linią niebieską przerywaną, numery jako etykiety | Stary front: debounce po wejściu/przesunięciu/zoomie; nowa aplikacja: po health-checku Działek, od zoomu 13, potem debounce i anulowanie poprzedniego GET |
| Kontury działek | KIEG WMS `/cgi-bin/KrajowaIntegracjaEwidencjiGruntow`, warstwa `dzialki` [FAKT z kodu: `index.html:211` — definicje obu warstw są na tej samej fizycznej linii] | Leaflet WMS w `egib-layers.js` | GET GetMap; WMS 1.1.1, `SRS=EPSG:3857`, kafelek 256×256, `format=image/png`, `transparent=true`, `styles=`; bbox kafelka wyliczany przez Leaflet; brak `minZoom`, `maxZoom=22` | Stary front: kafelkowo w zakresie mapy 0–22; nowa aplikacja: kafelkowo po utworzeniu mapy i przy zmianie widoku |
| Kontury budynków | KIEG WMS `/cgi-bin/KrajowaIntegracjaEwidencjiGruntow`, warstwa `budynki`, domyślnie wyłączona [FAKT z kodu: `index.html:177,211` — definicje obu warstw są na tej samej fizycznej linii] | Leaflet WMS w `egib-layers.js` | GET GetMap; WMS 1.1.1, `SRS=EPSG:3857`, kafelek 256×256, `format=image/png`, `transparent=true`, `styles=`; brak `minZoom`, `maxZoom=22` | Stary front: po włączeniu pola warstwy w zakresie mapy 0–22; nowa aplikacja: dopiero po włączeniu pola, kafelkowo dla bieżącego widoku |
| Informacje o działce klikniętej na mapie | KIEG WMS GetFeatureInfo dla warstwy `dzialki` [FAKT z kodu: `index.html:562–570`] | `buildMapClickFeatureInfoUrl()` w `egib-layers.js` | GET; WMS 1.1.1, `SRS=EPSG:4326`, bbox ±0,0012° od kliknięcia, `WIDTH/HEIGHT=1000`, `X/Y=500`, `INFO_FORMAT=text/xml`, `FORMAT=image/png`, `TRANSPARENT=TRUE`; odpowiedź XML | Po kliknięciu; identyfikator i pola raportu pochodzą z KIEG, geometria zaznaczenia jest wybierana z już pobranego WFS |

W definicji WMS starego frontu opcje warstwy `dzialki` i `budynki` są zapisane na jednej fizycznej linii `index.html:211`; tabela podaje dwa osobne zestawy parametrów. WFS jest osobnym GET-em do backendu używanym przez stary frontend, a KIEG GetMap/GetFeatureInfo są bezpośrednimi żądaniami przeglądarki do publicznej usługi. Nie są używane inne endpointy backendu dla grupy EGiB. Testy `tests/dzialki-egib-layers.test.mjs` oraz `scripts/browser-smoke.test.mjs` sprawdzają pełny wzorzec URL i blokują metody inne niż GET.

Kliknięcie działki przełącza jej zaznaczenie, pozwala zostawić zaznaczonych kilka działek i pokazuje popup z identyfikatorem, powierzchnią, grupą rejestrową oraz klasoużytkami. Treść popupu jest składana jako tekst w elementach DOM. Kliknięcie na mapie nie zmienia DenemContext; otwarte pozostaje pytanie, czy właściciel chce zmienić tę regułę.

Zimny start korzysta z istniejącego health-checku powłoki: warstwy czekają do 120 s, pokazują licznik oczekiwania i wykonują jedną próbę ponowną WFS po błędzie sieci. Po kolejnym błędzie dostępny jest przycisk „Spróbuj ponownie”.

Browser-smoke M4d.1 użył ogólnego widoku testowego w Pile; właściciel zatwierdził dwa hosty przekierowania KIEG wyłącznie dla ścieżki EGiB. W ostatnim z czterech przebiegów (2026-11-13) WFS dostarczył obiekty, a po 5 638 ms widoczne były 168 konturów i 168 etykiet; po włączeniu budynków w DOM były 3 załadowane kafelki. Wszystkie 7 asercji smoke przeszło, popup z powierzchnią, grupą i klasoużytkami oraz ponowne kliknięcie odznaczające działkę działały, a konsola nie zgłosiła błędów. Backend był już gotowy, więc komunikatu zimnego startu nie dało się zaobserwować. KIEG dla warstw mapy odpowiedział 302 na 56 żądań GetMap; przekierowane żądania zakończyły się 27 odpowiedziami HTTP 200 `image/png` i 29 błędami przeglądarki `net::ERR_BLOCKED_BY_ORB` bez kodu HTTP. Dwa GetFeatureInfo zwróciły HTTP 200 `text/xml`. WFS wykonał 3 GET-y, z których jeden zwrócił HTTP 200, jeden został anulowany przy zmianie widoku, a jeden nie miał statusu w chwili zamknięcia przeglądarki. Łącznie cztery uruchomienia wygenerowały 14 żądań do hosta backendu Działek (health-check i WFS), poniżej limitu 400; allowlista zablokowała 0 żądań w ostatnim przebiegu. Raporty i zrzuty pozostają w ignorowanym `.local-results/`.

### Stary front vs nowa aplikacja — opcje i obsługa błędów warstw KIEG

| Element | Stary publiczny front `a1aa39d` | Nowa aplikacja po M4d.1b |
|---|---|---|
| Żądanie GetMap | GET do publicznego endpointu KIEG; `SERVICE=WMS`, `REQUEST=GetMap`, warstwa `dzialki` albo `budynki`, `FORMAT=image/png`, `TRANSPARENT=true`, kafelek domyślnie 256×256, WMS domyślnie 1.1.1 i CRS mapy EPSG:3857. BBOX pochodzi z kafelka Leaflet. Brak dodatkowego czasu, losowego parametru i cache-bustingu. [FAKT z kodu: `index.html:211` — obie definicje są na tej samej fizycznej linii] | GET na ten sam endpoint i te same parametry efektywne; wersja 1.1.1, EPSG:3857, puste `styles`, rozmiar 256×256 i BBOX podawane jawnie. Retry powtarza ten sam URL bez dodatkowych parametrów; test URL w `tests/dzialki-egib-layers.test.mjs`. |
| Definicja KIEG `dzialki` i `budynki` | Obie warstwy tworzy `L.tileLayer.wms` z `image/png`, `transparent:true`, `opacity:0.95`, `maxZoom:22`, `updateWhenZooming:false`, `updateWhenIdle:true`, `keepBuffer:1`; osobne pane dla działek i budynków. [FAKT z kodu: `index.html:211` — obie definicje są na tej samej fizycznej linii] | Te same opcje rastra; nowa aplikacja jawnie podaje `version`, CRS i pusty styl oraz używa wspólnego `overlayPane` z własną klasą kafelków. Retry K0 jest dołączony oddzielnie do obu warstw. |
| Domyślne ładowanie i przełączanie | `layers.egibParcels` jest dodawana do mapy przy inicjalizacji. [FAKT z kodu: `index.html:451`] Plik zawiera kontrolkę `egibBuildings` i definicję `layers.egibBuildings` [FAKT z kodu: `index.html:177,211`], ale w badanej rewizji nie znaleziono wiązania tej kontrolki z warstwą. | Włączanie/wyłączanie obu WMS jest powiązane z polami wyboru; usunięcie warstwy z mapy anuluje oczekujące retry. |
| Ustawienia domyślne Leaflet | `tileSize`, `crossOrigin`, `minZoom`, `updateInterval`, `errorTileUrl`, WMS `version`, CRS i `styles` nie są jawnie ustawione w definicjach KIEG. Tile size 256 px, CRS mapy i WMS 1.1.1 wynikają z domyślnych opcji Leaflet. Nie ustawiono `crossOrigin` ani cache-bustingu. [FAKT z kodu: `index.html:211`] | Tile size pozostaje domyślne 256 px; WMS 1.1.1, EPSG:3857 i pusty `styles` są jawnie ustawione. Nowy URL nie dodaje losowego parametru ani parametru czasu. |
| Błędy i ponowne pobieranie | Przegląd całego `index.html` w rewizji `a1aa39d` nie znalazł obsługi zdarzeń `tileerror`/`tileload`, `errorTileUrl`, ponowienia, `setUrl`, `redraw` dla warstw KIEG ani opóźnionego odświeżenia tego samego kafelka. Nie znaleziono też dodatkowych parametrów cache-bustingu. Zmiana widoku mapy powoduje standardowe pobieranie kafelków dla nowego widoku; nie jest to ponowienie tego samego URL. Definicje warstw: [FAKT z kodu: `index.html:211`; dodanie działek: `index.html:451`]. | Błąd/obraz pusty uruchamia maksymalnie dwa ponowienia dla danego kafelka po 1500 i 4000 ms, z jitterem K0 do 250 ms i maksymalnie sześcioma zaplanowanymi/pracującymi retry na warstwę. Ponowienie używa tego samego URL. Liczniki KIEG są oddzielone od podkładu i ortofotomapy; główny przycisk ponowienia obejmuje aktywne warstwy KIEG. |

W starym froncie nie znaleziono jawnej polityki ponawiania, którą można odtworzyć. `moveend`/`zoomend` uruchamiają w pliku odświeżenie etykiet wektorowych, a KIEG korzysta ze standardowego zachowania `updateWhenIdle`; nowe położenie/zoom generuje kafelki dla widoku, ale nie wymusza ponownego pobrania tego samego URL. [FAKT z kodu: `index.html:451,560`] Możliwe wyjaśnienia obserwacji właściciela to różnice opcji/pane, standardowe pobieranie kafelków dla nowego widoku oraz różnica pochodzenia strony. Ostatniej hipotezy nie sprawdzano przez podszywanie się pod `Origin`/`Referer`; pozostaje do sprawdzenia po wdrożeniu podglądowym M10. Nowa aplikacja nie dodaje cache-bustingu, ponieważ nie występuje on w starym froncie i nie ma potwierdzenia, że usługa go dopuszcza. Browser-smoke wyłącza cache przez CDP, aby próbne powtórzenia były nowymi żądaniami; to ustawienie dotyczy wyłącznie narzędzia.

### Niezawodność KIEG M4d.1b

Warstwy KIEG używają retry K0 niezależnie od retry podkładu: 2 próby, 1500/4000 ms, równoległość 6 i jitter do 250 ms. Panel pokazuje osobne liczniki „Kontury działek: N kafelków niezaładowanych” oraz „Kontury budynków: N kafelków niezaładowanych”; istniejący przycisk „Spróbuj ponownie” obejmuje oba kontrolery. Zmiana widoku/warstwy i odmontowanie anulują zaplanowane próby. Testy w `tests/dzialki-egib-layers.test.mjs`, `tests/tile-retry.test.mjs` i `tests/dzialki-module.test.mjs` sprawdzają K0, liczniki, anulowanie i oddzielenie statystyk od ortofotomapy.

Tryb diagnostyczny `scripts/browser-smoke.mjs --kieg-reliability` zapisuje dla każdego GET host, status, typ odpowiedzi, błąd sieci, `Content-Type`, `Content-Length`, `Cache-Control` i końcowy stan obrazu kafelka. Wariant bazowy może ponowić do sześciu niezaładowanych URL-i dokładnie po 1,5 i 4 s. Wariant `after` wykonuje trzy niezależne wczytania, czeka 25 s i oznacza asercję PASS tylko wtedy, gdy każde osiągnie co najmniej 90% załadowanych kafelków. Narzędzie wymaga jawnego `--max-kieg-requests` (maks. 500), ogranicza się do KIEG EGiB i dozwolonych health-checków/WFS, nie uruchamia innych scenariuszy i zapisuje szczegóły w ignorowanym `.local-results/`.

Pomiar przed/po M4d.1b (widok Piła, zoom 17,6, ustalenie 25 s):

| Wariant i host | Wysłane odpowiedzi KIEG | Żądania zablokowane limitem | Końcowy stan DOM |
|---|---|---:|---|
| Bez retry — `integracja.gugik.gov.pl` | 51 × HTTP 302 (przekierowanie) | 12 | Brak wiarygodnej frakcji: selektor tej wersji narzędzia nie odczytał kafelków IMG z kontenera Leaflet. |
| Bez retry — `integracja01.gugik.gov.pl` | 25 × `net::ERR_BLOCKED_BY_ORB`, bez statusu HTTP/MIME | 2 | Jak wyżej. |
| Bez retry — `integracja02.gugik.gov.pl` | 24 × HTTP 200, MIME `image/png` | 0 | Jak wyżej. |
| K0 — `integracja.gugik.gov.pl` | 50 × HTTP 302 (przekierowanie) | 81 | — |
| K0 — `integracja01.gugik.gov.pl` | 39 × `net::ERR_BLOCKED_BY_ORB`, bez statusu HTTP/MIME | 0 | — |
| K0 — `integracja02.gugik.gov.pl` | 11 × HTTP 200, MIME `image/png` | 0 | Pierwsze wczytanie: 2/12 (16,7%). |

W obu uruchomieniach liczba wysłanych żądań wyniosła 100; liczby w kolumnie blokady to dodatkowe próby zatrzymane przez licznik przed wysłaniem. W metadanych CDP nagłówki `Content-Type` i `Content-Length` były puste/niedostępne; MIME pochodzi z pola `mimeType` przeglądarki. K0 w drugim i trzecim wczytaniu osiągnął budżet przed końcem 25 s; odczyty 0/12 są więc niekompletne, a nie porównywalnym wynikiem usługi. Bez retry nie wykonano osobnych powtórzeń tych samych URL-i po 1,5 i 4 s: selektor nie dostarczył listy błędnych kafelków, a limit zatrzymał dalsze żądania. Nie ma wiarygodnej trójki końcowych frakcji dla wariantu bez retry ani K0 i nie ma podstaw do zmiany domyślnej polityki.

Ostatnie dwa uruchomienia narzędzia wysłały łącznie dokładnie 200 żądań KIEG. Wcześniejsze przerwane uruchomienie miało limit 300 i nie pozostawiło raportu; rzeczywistej liczby w nim nie da się odzyskać. Łączny ruch pozostaje więc ograniczony od góry do 500. Nie uruchomiono dalszych pomiarów w ramach tej zgody. Wcześniejszy, pojedynczy przebieg M4d.1 odnotował 56 odpowiedzi GetMap HTTP 302, po czym 27 odpowiedzi HTTP 200 `image/png` przez `integracja02` i 29 błędów ORB przez `integracja01`; nie jest to wariant bazowy M4d.1b.

### Kompletność konturów KIEG — M4d.1c

Wymaganie właściciela: „Kontury działek muszą wczytywać się w CAŁOŚCI. Skuteczność (kompletność) ma pierwszeństwo przed szybkością. Niepełne kontury są nieakceptowalne.” Moduł liczy widoczne, bieżące kafelki IMG w warstwach KIEG; obraz uznaje za wczytany po zakończonym dekodowaniu i wymiarach większych niż 1×1. Status „Kontury kompletne” pojawia się tylko, gdy co najmniej jeden widoczny kafelek istnieje i wszystkie widoczne obrazy spełniają tę kontrolę. W innym przypadku panel pokazuje `x/y`; po 40 s pokazuje liczbę brakujących kafelków i udostępnia „Spróbuj ponownie”. Do 40 s moduł co 3 s ponawia widoczne obrazy bez poprawnego obrazu, z ograniczeniem współbieżności istniejącego retry. Aktywnych żądań nie dubluje. [FAKT z kodu: `app/js/modules/dzialki/egib-layers.js`, `app/js/modules/dzialki/tile-retry.js`]

Nie zmieniono konfiguracji domyślnego retry K0 (2 próby, 1500/4000 ms, jitter do 250 ms, do 6 retry jednocześnie na warstwę). Sweep kompletności jest dodatkowym ponawianiem tego samego URL bez parametru cache-busting. Konfiguracja wzmocniona V2 i bezpośrednie przełączenie węzła V3 nie zostały wdrożone.

Eksperyment M4d.1c zebrał tylko trzy wczytania V0 (obecny kod, headless) w widoku testowym. Uruchomienie wykonano w Chrome 157 jako fallback po błędach startu Edge; User-Agent z CDP zawiera `HeadlessChrome/157.0.0.0`. Wyniki końcowego widoku po 40 s:

| Wczytanie V0 | Kafelki | Frakcja | Czas do 100% | Żądania KIEG | ORB |
|---|---:|---:|---:|---:|---:|
| 1 | 0/12 | 0,0% | nieosiągnięto | 51 | 24 |
| 2 | 11/12 | 91,7% | nieosiągnięto | 28 | 1 |
| 3 | 12/12 | 100,0% | 8256 ms | 33 | 4 |

Min/mediana/maks frakcji V0 wyniosły 0,0%/91,7%/100,0%; łącznie wysłano 112 żądań KIEG i zarejestrowano 29 błędów ORB. W odpowiedziach przekierowujących 32 wskazały węzeł `integracja01.gugik.gov.pl`, a 27 — `integracja02.gugik.gov.pl`; zarejestrowano 29 końcowych żądań do węzła 01 i 24 do węzła 02. Wszystkie 29 końcowych żądań do 01 zakończyły się ORB w tym pomiarze headless. To obserwacja współwystępowania w V0, nie dowód przyczyny.

Pierwsze cztery uruchomienia przeglądarki zakończyły się przed zestawieniem CDP; piąte zebrało V0. Wobec limitu pięciu uruchomień nie zebrano poprawnego V1 (headed), V2 ani V3. Żaden zmierzony wariant nie spełnił kryterium 100% w każdym z trzech wczytań do 20 s. Nie wybrano więc zwycięskiego wariantu ani nie zmieniono domyślnego K0; monitor i sweep z 3-sekundowym interwałem wdrożono jako wymagany mechanizm obserwacji i ponawiania, ale efekt sweepu nie został zmierzony w browser-smoke. Wynik pozostaje niepełny i nie jest podstawą do uznania niezawodności za potwierdzoną.

#### Możliwość awaryjnego rysowania z WFS

WFS `/api/wfs` zwraca GeoJSON geometrii działek dla bbox bieżącego widoku; aplikacja już rysuje z tych geometrii przerywane obrysy i etykiety numerów. Ciągłe, rasterowe linie konturów działek pochodzą z KIEG WMS `dzialki`, a kontury budynków — z KIEG WMS `budynki`. WFS może więc służyć jako częściowy, wektorowy fallback dla geometrii działek obecnych w jego odpowiedzi. Nie potwierdzono, że zasięg i kompletność danych WFS pokrywają wszystkie kontury prezentowane przez KIEG. WFS nie dostarcza w obecnej implementacji konturów budynków ani rasterowego wyglądu linii KIEG; tych elementów nie zastąpi. Rekomendacja: traktować WFS jako wyraźnie oznaczony fallback tylko dla obiektów z bieżącego GeoJSON, a pełny parytet danych KIEG potwierdzić osobnym porównaniem przed uznaniem fallbacku za równoważny. [FAKT z kodu: `app/js/modules/dzialki/egib-layers.js`; kompletność pokrycia WFS względem KIEG [HIP]]

## Diagnostyka M4b.1

`node scripts/browser-smoke.mjs` uruchamia lokalny serwer i przeglądarkę headless, przechodzi przez podkłady oraz lata archiwum, zapisuje PNG i raport JSON do ignorowanego `.local-results/`. Narzędzie dopuszcza wyłącznie localhost, skonfigurowane health-checki GET oraz wskazane usługi kafelków i pojedyncze WMS GetMap Raster. Testy pomocników są bez sieci; skrypt nie jest uruchamiany w CI. Instrukcja właściciela: `scripts/README-run.md`.
