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
| /api/report-snapshot | GET pobierający snapshot. [FAKT z kodu: index.html:863,875] |

Wywołania używają fetch bez jawnego pola method, czyli domyślnego GET. [FAKT z kodu: index.html:324-345,412,451,772,863-875; HIP: wniosek o metodzie domyślnej fetch] Front ma zaszyty host backendu analizator-nieruchomosci.onrender.com. [FAKT z kodu: index.html:320,342,412,451,772,863]

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
