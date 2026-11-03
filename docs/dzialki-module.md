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

## Diagnostyka M4b.1

`node scripts/browser-smoke.mjs` uruchamia lokalny serwer i przeglądarkę headless, przechodzi przez podkłady oraz lata archiwum, zapisuje PNG i raport JSON do ignorowanego `.local-results/`. Narzędzie dopuszcza wyłącznie localhost, skonfigurowane health-checki GET oraz wskazane usługi kafelków i pojedyncze WMS GetMap Raster. Testy pomocników są bez sieci; skrypt nie jest uruchamiany w CI. Instrukcja właściciela: `scripts/README-run.md`.
