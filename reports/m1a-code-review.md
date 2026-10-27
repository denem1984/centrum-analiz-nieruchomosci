# M1a — przegląd kodu pięciu repozytoriów źródłowych

Przegląd oparto na checkoutach publicznych repozytoriów w katalogu tymczasowym poza repozytorium projektu. [FAKT z kodu: poniższe lokalne pliki źródłowe; rewizje zapisano w B5]

## B1. Oferty — Analizator-cen-ofertowych

| Plik | Rola / ustalenie |
|---|---|
| package.json | npm start uruchamia node regional-fetch-bootstrap.js; wymagany Node >=20 <26; brak deklaracji dependencies. [FAKT z kodu: package.json:7-14] |
| server.js | Plik istnieje. Nie importuje regional-fetch-bootstrap.js. Importuje moduły wbudowane Node oraz location-resolver, combined-apartment-diagnostics i live-combined-api-v05; uruchamia compat-server.js na wewnętrznym porcie 10001, po czym publiczny wrapper/proxy słucha na PORT lub 10000. Wrapper serwuje frontend, obsługuje podpowiedzi i resolve-location, a pozostałe ścieżki proxy’uje. [FAKT z kodu: server.js:1-2,10-17] |
| regional-fetch-bootstrap.js | Modyfikuje fetch dla regionalnych hostów Nieruchomości-online, dodaje poprawki HTML i podczas ładowania compat-server.js zamienia import live-combined-api-v05 na live-combined-with-counts. [FAKT z kodu: regional-fetch-bootstrap.js:19-54,58-77] |
| compat-server.js | Serwer API nasłuchuje na PORT lub 10000; ma OPTIONS i GET /health. [FAKT z kodu: compat-server.js:1-2,15-16] |
| index.html | Front używa GET /api/location-suggestions, GET /api/resolve-location i GET /api/live/combined. [FAKT z kodu: index.html:87,91] |

Ocena zgodności: istnieją dwie ścieżki. npm start uruchamia bootstrap, natomiast node server.js startuje wrapper z proxy. Zapis audytu o npm start odpowiada skryptowi manifestu, ale nie opisuje ścieżki node server.js. [FAKT z kodu: package.json:7-8; server.js:2,10-17; regional-fetch-bootstrap.js:66-77]

## B2. RCN — rcn-web-app

### Endpointy używane przez frontend

| Endpoint | Metoda |
|---|---|
| /api/geocode | GET, query budowany dynamicznie. [FAKT z kodu: static/app.js:1977-1978,2047-2048] |
| /api/place_suggest | GET. [FAKT z kodu: static/app.js:2068-2070] |
| /api/search | GET. [FAKT z kodu: static/app.js:2239-2240] |
| /api/teryt/voivodeships | GET. [FAKT z kodu: static/app.js:2374] |
| /api/teryt/powiaty | GET. [FAKT z kodu: static/app.js:2396] |
| /api/teryt/gminy | GET. [FAKT z kodu: static/app.js:2413] |
| /api/teryt/miejscowosci | GET. [FAKT z kodu: static/app.js:2433] |
| /api/export_current.xlsx | POST z JSON rekordów. [FAKT z kodu: static/app.js:2513-2517] |
| /api/export_current.docx | POST z JSON rekordów i parametrów raportu. [FAKT z kodu: static/app.js:2555-2559] |

W całych plikach frontu nie znaleziono literalnych wywołań data_source_refresh, /api/admin/* ani /api/debug/*. [FAKT z kodu: static/app.js:1-2627; static/index.html:1-465; sprawdzenie literalnych nazw w całych plikach]

### Handler statusu źródła danych

GET /api/data_source_status nie ma parametrów i bezpośrednio wywołuje data_source_status(). [FAKT z kodu: main.py:8520-8522] Handler nie jest lekkim statusem: rozwiązuje lokalne ścieżki, sprawdza konfigurację źródła i wylicza cache wojewódzkie. [FAKT z kodu: main.py:565-579] Dla obecnych plików sprawdza metadane; przy braku cache daty otwiera DuckDB i odczytuje MAX(dok_data) z Parquet, a wynik przechowuje w pamięci procesu. [FAKT z kodu: main.py:414-439,546-562] W ścisłym sensie nie jest wolny od skutków ubocznych, bo aktualizuje cache w pamięci procesu; nie stwierdzono w tym handlerze wywołania endpointu odświeżania. [FAKT z kodu: main.py:426-438,565-606,8520-8522]

Nie ma parametrów ograniczających status do lekkiej odpowiedzi. Do pomiaru w skrypcie wybrano GET /, które zwraca statyczny index.html. [FAKT z kodu: main.py:5425-5428,8520-8522] Front wykonuje również reverse-geocoding GET do Nominatim. [FAKT z kodu: static/app.js:856-862]

## B3. Działki i Podobne — trasy frontu i backendy

### Działki — analizator-nieruchomosci

| Trasa frontu | Metoda | Źródło |
|---|---|---|
| /api/mpzp-gmina-info | GET; query zawiera TERYT i współrzędne. [FAKT z kodu: index.html:320,324] |
| /api/dzinfo | GET; query zawiera identyfikator działki. [FAKT z kodu: index.html:342-345] |
| /api/ownership-national | GET z bbox. [FAKT z kodu: index.html:412] |
| /api/wfs | GET jako URL warstwy WFS. [FAKT z kodu: index.html:451] |
| /api/mpzp-info | GET z latitude/longitude. [FAKT z kodu: index.html:332,451] |
| /api/rwdz-feature-info | GET z query string. [FAKT z kodu: index.html:772] |
| /api/report-snapshot | Nie znaleziono wywołania frontu; `reportSnapshotApi` jest tylko zadeklarowane. [FAKT z kodu: index.html:863; wyszukanie wszystkich użyć w pliku] |

Wywołania frontu do API używają fetch bez jawnego pola method ani body, czyli domyślnego GET; nie znaleziono POST/PUT. [FAKT z kodu: index.html:320-345,412,451,772; HIP: wniosek o metodzie domyślnej fetch] Trzy wywołania ustawiają nagłówek Accept: application/json; nie znaleziono nagłówka Content-Type ani innych nagłówków w żądaniach do API. [FAKT z kodu: index.html:412,539,676; wyszukanie method/headers w całym pliku] Front ma zaszyty host backendu analizator-nieruchomosci.onrender.com. [FAKT z kodu: index.html:320,342,412,451,772]. `reportSnapshotApi` jest stałą bez wywołania fetch.

### Podobne — rozklad-nieruchomosci-podobnych

| Trasa używana przez front | Metoda |
|---|---|
| /api/prg/{layer}/query | GET z parametrami. [FAKT z kodu: index.html:359,369] |
| /api/regions?teryt= | GET. [FAKT z kodu: index.html:488-493] |
| /api/uldk | GET z parametrami ULDK. [FAKT z kodu: index.html:360,557] |
| https://nominatim.openstreetmap.org/search | GET bezpośrednio z frontu. [FAKT z kodu: index.html:630] |

Backend ma też /api/prg-wfs, nieznalezione jako wywołanie frontu. [FAKT z kodu: server.js:210; wyszukanie w index.html] Front korzysta ze ścieżek względnych /api/prg, /api/regions i /api/uldk. [FAKT z kodu: index.html:359-360,369,493,557] Serwer domyślnie kieruje PRG i WFS do mapy.geoportal.gov.pl, a ULDK do uldk.gugik.gov.pl; adresy dwóch upstreamów PRG mogą być nadpisane zmiennymi środowiskowymi, których wartości nie odczytywano. [FAKT z kodu: server.js:9-12]

W kodzie znajduje się też stała PRG_OGC_BASE wskazująca host ogcapi.geoportal.gov.pl, ale przegląd index.html nie znalazł jej użycia przez fetch. [FAKT z kodu: index.html:361, wyszukanie użyć stałej]

## B4. Gminy — źródła i kolumny

Frontend używa supabase-js 2 z CDN, a dane gmin pobiera przez select z tabeli gus_bdl_commune_wide, sortuje po unit_name i stronicuje range. [FAKT z kodu: index.html:72,157-160] Odczytywane są kolumny unit_id, unit_name, unit_kind, siedem nazw z COLS oraz siedem pól rocznych z YEAR_COLS. [FAKT z kodu: index.html:110-111,157-160] Przed odczytem tabeli frontend wywołuje RPC get_my_profile i, dla nieadministracyjnych kont, get_my_app_access. [FAKT z kodu: index.html:130,145-146] Nie wykonano żadnych zapytań do Supabase; źródłem tych ustaleń jest tylko kod. [FAKT: lokalny odczyt index.html; brak połączenia z Supabase]

## B5. Frontendy, zależności i konfiguracja

| Moduł / checkout | Struktura i technologia | Zależności | Backend |
|---|---|---|---|
| RCN, 85cb2f91348e10fc1fa3491c5e4e0c07b4a952bb | static/index.html 68 814 B, static/app.js 123 352 B, static/styles.css 15 843 B; HTML/CSS/JavaScript. [FAKT z kodu: wymienione pliki, rozmiary] | Python 3.11.9; requirements zawiera FastAPI, Uvicorn, httpx, lxml, pyproj, openpyxl, reportlab, Pillow, DuckDB, pytz, boto3, python-docx i shapely. [FAKT z kodu: runtime.txt:1; requirements.txt:1-15] | Front używa ścieżek względnych /api/ na originie aplikacji. [FAKT z kodu: static/app.js:1977-1978,2239] |
| Oferty, 596451bae3af76790c0b96b0c5927191ced7add8 | index.html 66 261 B; statyczny HTML/JavaScript i serwer Node. [FAKT z kodu: index.html i server.js, rozmiary; server.js:10-17] | Node >=20 <26; npm start wskazuje bootstrap; brak deklaracji dependencies. [FAKT z kodu: package.json:7-14] | Front korzysta ze ścieżek względnych; bezpośredni server.js startuje wrapper. [FAKT z kodu: index.html:87,91; server.js:2,10-17] |
| Działki, a1aa39d711b2730dfcf62799e42ab7d79d4bf3d3 | index.html 183 901 B; API w api-dzialki/server.js 129 915 B; HTML/JavaScript i Node. [FAKT z kodu: pliki i rozmiary] | package.json deklaruje proj4 i pngjs; nie deklaruje start ani engines. [FAKT z kodu: package.json:1] | Front wskazuje host analizator-nieruchomosci.onrender.com. [FAKT z kodu: index.html:320,342,412,451,772,863] |
| Podobne, a75020163912d23dbd5e48bfdc2fbcf2134e0931 | index.html 100 720 B; server.js 9 752 B; frontend HTML/JavaScript i Node. [FAKT z kodu: pliki i rozmiary] | npm start uruchamia node server.js; Node >=18; brak deklaracji dependencies. [FAKT z kodu: package.json:5-11] | Front ścieżkami względnymi woła API; backend konfiguruje PRG/WFS/ULDK, z możliwością nadpisania dwóch upstreamów PRG. [FAKT z kodu: index.html:359-360; server.js:9-12] |
| Gminy, c1b682c4877553c9978b2942a429c7a9b1f4e54a | Jeden plik index.html 75 475 B z HTML/JavaScript; html2pdf.js i supabase-js 2 są ładowane z CDN. [FAKT z kodu: index.html:71-73; rozmiar pliku] | Brak package.json i requirements.txt w katalogu głównym; lokalny manifest zależności nie jest zadeklarowany. [FAKT z kodu: inwentarz plików repozytorium] | Klient Supabase konfiguruje się w pliku źródłowym; identyfikator projektu pominięto. [FAKT z kodu: index.html:96,100] |

Nie odczytywano wartości zmiennych środowiskowych ani nie wysyłano żądań HTTP do usług wskazanych w kodzie. [FAKT: lokalny przegląd checkoutów; klient HTTP nie był uruchamiany]


## C1. Oferty — relacja entrypointów

- `npm start` uruchamia `node regional-fetch-bootstrap.js`. Bootstrap modyfikuje globalny `fetch` dla hostów Nieruchomości-online, podmienia odczyt index.html i przekierowuje import live-combined w compat-server; następnie ładuje compat-server. [FAKT z kodu: package.json:7-8; regional-fetch-bootstrap.js:40-54,58-77]
- `node server.js` jest odrębną ścieżką: plik ustawia wewnętrzny port 10001, ładuje compat-server i uruchamia publiczny wrapper/proxy. Importuje też location-resolver, combined-apartment-diagnostics i live-combined-api-v05. Nie uruchamia regional-fetch-bootstrap. [FAKT z kodu: server.js:2,10-17]
- Wniosek: audyt opisujący `npm start` nie dowodzi, że `node server.js` jest równoważnym entrypointem; te polecenia uruchamiają różne ścieżki kodu. [FAKT z kodu: package.json:7-8; server.js:2,10-17; regional-fetch-bootstrap.js:66-77]

## C2. Podobne — konfiguracja tras API

- Backend Node definiuje `/api/health`, `/api/prg`, `/api/regions`, `/api/prg-wfs` i `/api/uldk`; front wywołuje względne ścieżki `/api/*`. [FAKT z kodu: server.js:192-214; index.html:359-360,369,493,557]
- W publicznym inwentarzu repo są `index.html`, `server.js` i `package.json`; nie znaleziono repozytoryjnego pliku konfiguracji rewrite/redirect. [FAKT z kodu: inwentarz `rg --files` repozytorium]
- Czy hosting statycznego frontu przekazuje `/api/*` do backendu, pozostaje niepotwierdzone bez odczytu jego konfiguracji. [HIP] Dodano punkt E0 dla właściciela: odczyt reguł rewrite/redirect z panelu bez zmian.

## C3. Działki — handler report-snapshot

- Handler pobiera bbox i listę warstw, a dla zaznaczonych warstw pobiera obrazy mapowe z zewnętrznych usług, składa wynik w JSON i oczekuje na równoległe zadania. Przy wszystkich rozpoznawanych warstwach obrazu może uruchomić do siedmiu pobrań. [FAKT z kodu: api-dzialki/server.js:162-226]
- W ciele handlera nie znaleziono zapisu do pliku ani bazy danych; jego widocznym skutkiem są żądania obrazów do usług mapowych. [FAKT z kodu: api-dzialki/server.js:162-226]
- Front deklaruje `reportSnapshotApi`, ale sprawdzenie wystąpień w `index.html` znalazło tylko deklarację i brak wywołania tej zmiennej. [FAKT z kodu: index.html:863; przeszukanie wszystkich wystąpień `reportSnapshotApi`]

## C4. Zewnętrzne zależności uruchamiane w przeglądarce

| Moduł | Bezpośrednie połączenia z przeglądarki i częstotliwość |
|---|---|
| Oferty | Podpowiedzi idą do własnego `/api/location-suggestions` po debounce 250 ms przy wpisywaniu; kliknięcie wyszukiwania wykonuje `/api/resolve-location` i `/api/live/combined`. Nie znaleziono bezpośredniego fetchu frontu do zewnętrznego portalu. [FAKT z kodu: index.html:87,91] |
| RCN | Mapa używa kafli OpenStreetMap i Esri; reverse geocoding Nominatim jest wywoływany przy wskazanych zdarzeniach zmiany/ustawienia centrum analizy. [FAKT z kodu: static/app.js:704-711,792,806,824-826,856-860] |
| Działki | Front ładuje zależności Leaflet/proj4 i generatory raportu z CDN; warstwy mapy pobierają kafle/WMS, a wybór działki odpytuje ULDK. Własność WFS jest odświeżana przy zmianie widoku mapy po debounce 350 ms, jeżeli warstwa jest włączona. [FAKT z kodu: index.html:1,21,211-212,412,451,557,567] |
| Podobne | Mapa pobiera kafle Esri; Nominatim geokoduje adres komparatora przy jego lokalizowaniu oraz adres główny po akcji wyszukania. [FAKT z kodu: index.html:333-334,629-631,735-738,1127-1130] |
| Gminy | Front ładuje supabase-js z CDN; podczas inicjalizacji odczytuje profil przez RPC, warunkowo sprawdza dostęp przez RPC, a następnie stronicuje odczyt tabeli po 1000 wierszy. Nie wykonano żadnego zapytania do Supabase w ramach przeglądu. [FAKT z kodu: index.html:72,130,145-160; brak połączenia z Supabase] |

Żaden kod ani konfiguracja pięciu repozytoriów źródłowych nie został zmieniony. Wszystkie ustalenia powyżej pochodzą z lokalnego odczytu zapisanych checkoutów; nie wykonano połączeń HTTP do ich usług. [FAKT: checkouty lokalne; skrypt pomiarowy nie był uruchamiany]

## A4 — potwierdzenie tras sond

| Usługa | Trasa sondy | Dowód z kodu | Status |
|---|---|---|---|
| Działki | GET /health | [FAKT z kodu: api-dzialki/server.js:1951] | Potwierdzona: stały JSON, bez upstreamu i skutków ubocznych. |
| Oferty | GET /health | [FAKT z kodu: server.js:2,10-17; compat-server.js:15] | Potwierdzona: wrapper przekazuje przez proxy do compat-server; handler zwraca lekki JSON. |
| Podobne | GET /api/health | [FAKT z kodu: server.js:192] | Potwierdzona: lokalny JSON statusu, bez upstreamu. |
| RCN | GET / | [FAKT z kodu: main.py:5425-5428] | Potwierdzona: statyczny FileResponse dla index.html, bez DuckDB/Parquet. |

Wszystkie cztery trasy sondy zgadzają się z ALLOWLIST w scripts/m1-probe.mjs; nie zmieniano allowlisty, README ani testów.


## M1c — porównanie rewizji i metody frontu

### B1. Checkouty a wdrożone SHA

| Usługa | HEAD checkoutu przeglądanego wcześniej | SHA wdrożenia odczytany przez właściciela | Wynik |
|---|---|---|---|
| RCN | `85cb2f91348e10fc1fa3491c5e4e0c07b4a952bb` | `85cb2f9` | zgodny |
| Oferty | `596451bae3af76790c0b96b0c5927191ced7add8` | `596451b` | zgodny |
| Działki | `a1aa39d711b2730dfcf62799e42ab7d79d4bf3d3` | `a1aa39d` | zgodny |
| Podobne | `a75020163912d23dbd5e48bfdc2fbcf2134e0931` | `a750201` | zgodny |
| Gminy | `c1b682c4877553c9978b2942a429c7a9b1f4e54a` | `c1b682c` | zgodny |

[FAKT: lokalne `git rev-parse HEAD` dla pięciu checkoutów oraz odczyt właściciela z panelu 2026-10-27]. Wszystkie pięć SHA wdrożeń pokrywa się z checkoutami w B5, więc nie było różnic do porównania przez `git diff --stat`.

### B2. Podobne — serwowanie frontu i metody

- Backend Node zwraca zawartość `index.html` dla `/` i `/index.html`; kod nie montuje katalogu statycznego ani osobnych plików assetów. [FAKT z kodu: rozklad-nieruchomosci-podobnych/server.js:6-7,218-224; inwentarz repozytorium]
- Front wywołuje `/api/prg/{layer}/query`, `/api/regions?teryt=` i `/api/uldk`; żądania nie ustawiają pola `method` ani `body`, więc są GET. Bezpośrednie wyszukiwanie w Nominatim również jest GET i ustawia tylko `Accept-Language`. [FAKT z kodu: index.html:359-360,369,493,557,630; HIP: metoda domyślna fetch]
- W pliku frontu nie znaleziono POST ani PUT. [FAKT z kodu: wyszukanie method/fetch w całym index.html]
- Właściciel potwierdził, że osobna usługa statyczna nie ma reguł rewrite ani redirect. [FAKT: odczyt właściciela z panelu 2026-10-27]. Front używa ścieżek względnych, a źródło nie zawiera hostname usługi backendu; routing między usługami pozostaje poza kodem i wymaga decyzji hostingu. [FAKT z kodu: index.html:359-360,369,493,557; HIP: skutek ścieżek względnych przy braku rewrite]

### B3. Oferty i Działki — metody oraz nagłówki frontu

- Oferty: front wywołuje `/api/location-suggestions`, `/api/resolve-location` i `/api/live/combined`; wszystkie `fetch` nie podają `method`, `body` ani nagłówków i domyślnie używają GET. Nie znaleziono POST/PUT ani `Content-Type` w żądaniach frontu. [FAKT z kodu: Analizator-cen-ofertowych/index.html:87,91; HIP: metoda domyślna fetch]
- Działki: rzeczywiste trasy frontu to `/api/mpzp-gmina-info`, `/api/dzinfo`, `/api/ownership-national`, `/api/wfs`, `/api/mpzp-info` i `/api/rwdz-feature-info`. Wszystkie używają domyślnego GET; nie znaleziono POST/PUT. `/api/report-snapshot` jest zadeklarowane jako stała, ale nieużyte. [FAKT z kodu: analizator-nieruchomosci/index.html:320,324,332,342-345,412,451,772,863; wyszukanie wszystkich wystąpień]
- W trzech wywołaniach Działek front ustawia `Accept: application/json`; żadne żądanie API nie ustawia `Content-Type` ani innego nagłówka. [FAKT z kodu: analizator-nieruchomosci/index.html:412,539,676; wyszukanie headers w całym pliku]
- Działki zaszywają publiczny host `analizator-nieruchomosci.onrender.com`; Oferty używają ścieżek względnych obsługiwanych przez wrapper; Podobne używają ścieżek względnych. [FAKT z kodu: analizator-nieruchomosci/index.html:320,342,412,451,772; Analizator-cen-ofertowych/index.html:87,91; rozklad-nieruchomosci-podobnych/index.html:359-360,493,557]
- Wykonawca nie wysyłał żądań HTTP do API produkcyjnych. [FAKT: zakres wykonanych czynności]
