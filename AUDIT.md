# AUDIT.md — MEGA aplikacja DENEM, etap 1 (audyt techniczny)

Data: 2026-10-26. Źródło: pliki ZIP gałęzi `main` wszystkich pięciu repozytoriów (wgrane przez właściciela). Tylko odczyt: żadnych zmian w kodzie, żadnych operacji na produkcji, żadnych zapytań do usług produkcyjnych.
Legenda: **[KOD]** potwierdzone w kodzie · **[DOC]** tylko z dokumentacji/README · **[HIP]** wniosek do weryfikacji · **[BRAK]** nie ma w repozytorium.
Sekretów nie przepisuję. Skan wzorców (klucze prywatne, service_role, tokeny AWS/OpenAI, JWT) w pięciu repozytoriach nie znalazł żadnych — w kodzie są tylko publiczne klucze „publishable" Supabase (z założenia jawne).

## 1. Podsumowanie

| Repo | Rodzaj | Stack | Linie kodu (ok.) | Backend | Dane | Slug dostępu |
|---|---|---|---|---|---|---|
| rcn-web-app | pełna aplikacja | Python 3.11, FastAPI, DuckDB, JS | main.py 11 880; app.js ok. 120 KB | tak (FastAPI) | RCN: WFS geoportalu lub Parquet w Cloudflare R2; słownik TERYT/SIMC | `rcn` |
| Analizator-cen-ofertowych | pełna aplikacja | Node ≥20 (bez zależności npm), JS | 51 plików | tak (Node http, scraping) | strony portali ogłoszeniowych, GUS FTS | `oferty` |
| analizator-nieruchomosci | pełna aplikacja | Node, proj4, pngjs; Leaflet | index.html 1 294; server.js 1 952 | tak (proxy GUGiK) | usługi państwowe (WFS/WMS) | `dzialki` |
| rozklad-nieruchomosci-podobnych | małe narzędzie | Node ≥18 (bez zależności), Leaflet | index.html 1 222; server.js 231 | tak (cienkie proxy GUGiK) | PRG/ULDiK + dane wpisywane ręcznie | `mapa` |
| gminy | statyczna strona | czysty HTML/JS, supabase-js | index.html 298 | **brak** | tabela Supabase `gus_bdl_commune_wide` | `gminy` |

**Wspólne dla wszystkich pięciu [KOD]:** ten sam projekt Supabase („denem-auth"), ta sama bramka dostępu w przeglądarce (profil → rola admin albo RPC `get_my_app_access` ze slugiem aplikacji → log zdarzeń `app_open`), tokeny przekazywane z panelu DENEM w hashu URL. To już jest gotowa wspólna powłoka tożsamości i uprawnień.

**Rozbieżność:** adres panelu w bramkach to `https://denem.pl/panel/` (rcn, oferty, działki), `https://denem.pl/` (gminy) i `https://panel.denem.pl/` (rozkład). Do ujednolicenia.

## 2. Wspólne wnioski przekrojowe

1. **Żadne repo nie zawiera konfiguracji wdrożenia** (render.yaml, Dockerfile, Procfile, workflow CI) ani plików blokujących wersje zależności (lockfile). Wdrożenie jest klikane w panelach (prawdopodobnie Render — **[HIP]**, potwierdzają to domyślne porty 10000 i dokumentacja rcn). Konfigurację Render trzeba spisać z panelu przed integracją.
2. **Bramka dostępu działa wyłącznie w przeglądarce.** Żaden backend nie weryfikuje tokenu Supabase, a wszystkie mają CORS `*`. Dla `gminy` ochroną danych jest dopiero polityka RLS w Supabase (poza repo — **[BRAK]**).
3. **Brak testów automatycznych** w każdym repo (poza ręcznymi skryptami diagnostycznymi i dokumentem przypadków testowych w rcn).
4. **Brak wspólnego modelu „nieruchomości/lokalizacji".** Każda aplikacja identyfikuje lokalizację inaczej: TERYT/SIMC (rcn, oferty), parcela ULDiK/WFS (działki, rozkład), nazwa jednostki GUS BDL (gminy).
5. **Wszystkie backendy są bezstanowe** (cache tylko w pamięci procesu). Jedynym trwałym magazynem poza Supabase jest bucket R2 z plikami Parquet (rcn).
6. **Duplikaty kodu:** 5 kopii bramki Supabase, kilka kopii klienta ULDiK/PRG, dwie kopie diagnostyki WMS.

## 3. rcn-web-app

### 3.1 Stan [KOD]
- Wersja w kodzie: **5.3.0-wfs** (`FastAPI(title="RCN Analizator", version="5.3.0-wfs")`). **[DOC vs KOD]** `docs/PROJECT_HANDOFF.md` opisuje wersję 5.2.7 i tryb Parquet jako główny — dokumentacja jest nieaktualna.
- **Domyślne źródło danych w kodzie to `geoportal_wfs`** (zmienna `RCN_DATA_SOURCE`, domyślnie WFS `mapy.geoportal.gov.pl/wss/service/rcn`). Tryby `auto`, `local_parquet`, `r2_parquet` są dostępne po ustawieniu zmiennej środowiskowej. Faktycznie używany tryb na produkcji = **[BRAK]**, trzeba sprawdzić `/api/data_source_status` lub zmienne w Render.
- Struktura: `main.py` (cały backend w jednym pliku, 11 880 linii), `static/` (index.html 68 KB, app.js 121 KB, styles.css), `data/teryt_places.csv`, `docs/`.
- Zależności: fastapi 0.115.6, uvicorn, httpx, lxml, pyproj, openpyxl, reportlab, Pillow, duckdb, pytz, boto3, python-docx, shapely. Python 3.11.9 (przypięty).

### 3.2 Funkcje [KOD]
Moduły Lokale, Grunt niezabudowany, Grunt zabudowany (warstwa `layer`); wyszukiwanie po miejscowości / promieniu / dowolnym polygonie; filtry (ulica, rynek, prawo, funkcja, powierzchnia, cena, daty, cena za m², tryb „podobne"); statystyki (`calc_stats`), odrzucanie wartości skrajnych, jakość ceny/m² dla działek; mapa Leaflet; eksporty CSV/XLSX/DOCX/PDF; analiza otoczenia OSM (Overpass, Overture), atrakcyjność lokalizacji; słownik TERYT/SIMC (ok. 54 tys. miejscowości) z odświeżaniem z GUS.

### 3.3 API [KOD]
`GET /api/search` (jeden endpoint, ok. 35 parametrów; odpowiedź JSON z `records` i `stats`), `/api/teryt/{voivodeships,powiaty,gminy,miejscowosci,search}`, `/api/place_suggest`, `/api/geocode`, `/api/dzialki_schema`, `/api/data_source_status`, `/api/data_source_refresh` (GET/POST), eksporty: `GET /api/export.{csv,xlsx,pdf}`, `POST /api/export_current.{xlsx,docx}`; admin/debug: `/api/admin/{refresh_simc,simc_status,terc_debug,terc_controls_debug,nominatim_area_debug}`, `/api/debug/{buildings,floors,overpass}`.
Format wejścia: parametry GET; wyjścia: JSON (kolumny m.in. lat, lon, teryt, area, date, market, right, function, price_m2_quality).

### 3.4 Konfiguracja i usługi [KOD]
Zmienne środowiskowe: `RCN_DATA_SOURCE`/`DATA_SOURCE`, `RCN_*_PARQUET`, `RCN_*_CACHE_PATH`, `RCN_*_MAX_RECORDS`, `RCN_DUCKDB_THREADS`, `RCN_DUCKDB_MEMORY_LIMIT`, `R2_BUCKET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (obie sekretne — poza kodem), `RCN_ADMIN_TOKEN`, `GEOAPIFY_API_KEY`.
Usługi zewnętrzne: geoportal RCN WFS, eteryt.stat.gov.pl, bdl.stat.gov.pl, Nominatim, Photon, Geoapify, 4 instancje Overpass, Overture (S3), budynki.openstreetmap.org.pl, Cloudflare R2.
Konwencja plików w R2: `raw/<typ>/<kod_woj>_transakcje_ceny_<typ>.parquet` (pliki wojewódzkie).

### 3.5 Ryzyka [KOD]
- Endpointy `/api/admin/*` i `/api/debug/*` **nie mają żadnej ochrony**; `RCN_ADMIN_TOKEN` chroni tylko `data_source_refresh` i tylko jeśli jest ustawiony (`if expected and ...` — przy pustej zmiennej każdy może odświeżać dane).
- Plik 11,9 tys. linii w jednym module — trudny w utrzymaniu; znany wzorzec poprawek punktowych (hotfixy lokalizacji).
- Pamięć: DuckDB + pliki Parquet w `/tmp` na instancji — wymaga odpowiedniego planu hostingu (**[HIP]**).
- Dokumentacja wskazuje identyfikator konta R2 w publicznym pliku docs (nie jest to klucz dostępu, ale warto usunąć).

### 3.6 Do użycia bez zmian / adapter
- **Bez zmian:** cała aplikacja jako samodzielna usługa; endpointy TERYT jako źródło słownika lokalizacji (**[HIP]** do potwierdzenia jakości).
- **Adapter:** przyjęcie kontekstu (TERYT, współrzędne, polygon) z URL; wydzielenie endpointu „statystyki transakcji dla kontekstu" jeśli `/api/search` okaże się zbyt ciężki do użycia z zewnątrz.

## 4. Analizator-cen-ofertowych

### 4.1 Stan [KOD]
- Start: `npm start` → `regional-fetch-bootstrap.js` → `compat-server.js` → `live-combined-api-v05.js` + parsery portali. Pliki w katalogu głównym: 51; z nich **15 plików JS jest nieosiągalnych z punktu startowego** (m.in. `server.js`, `live-api-v05*.js`, `live-combined-with-counts.js`, `portal-counts.js`, `parser-commercial-v06.js`, testy). To martwy lub zapasowy kod.
- **Mechanizmy „łatania w locie" [KOD]:** `regional-fetch-bootstrap.js` nadpisuje globalny `fetch` (przepisuje adresy nieruchomosci-online.pl na subdomeny regionalne) oraz `fs.readFileSync` (wstrzykuje skrypt do `index.html` przy odczycie). Działa, ale jest kruche i trudne do debugowania.
- Zależności npm: **brak** (używa wbudowanego `fetch` Node ≥20). `package.json` wersja 0.6.0.
- **[DOC vs KOD]** README wymienia 5 portali; kod ładuje także **Otodom** (`live-otodom.js`), czyli 6 portali: Nieruchomości-online, Morizon, Domiporta, Gratka, Adresowo, Otodom.

### 4.2 Funkcje [KOD]
Wyszukiwanie ofert dla typów: mieszkanie, dom, działka, komercyjne; filtr powierzchni z tolerancją; promień; łączenie wyników z portali (każdy parser niezależny); rozpoznawanie lokalizacji przez GUS (`geo.stat.gov.pl/api/fts`, TERYT/SIMC) z ręczną listą awaryjną (Olsztyn, Ełk, Pisz); UI z eksportem Excel (patche w HTML).

### 4.3 API [KOD]
`GET /api/live/combined?location&area&tolerance&radius&propertyType`, `GET|POST /api/search-offers`, `GET /api/resolve-location`, `GET /api/location-suggestions`, `/health`, plus 8 tras diagnostycznych (`/diagnostic-*`, `/api/diagnostic-*`, `/test-radius`). Odpowiedź JSON z polami `location`, `propertyType`, `offers`. Frontend woła API pod tym samym adresem (ścieżki względne), czyli backend serwuje własny front.

### 4.4 Konfiguracja i usługi [KOD]
Jedyna zmienna: `PORT`. Usługi: portale ogłoszeniowe (scraping HTML z podszywaniem się pod przeglądarkę — nagłówek User-Agent Mozilla), GUS FTS, Supabase (bramka). Brak bazy danych i cache trwałego.

### 4.5 Ryzyka
- **[KOD]** Scraping 6 portali: kruchość (zmiany HTML), ryzyko blokad IP i naruszenia regulaminów portali — **do oceny prawnej poza zakresem tego audytu**.
- **[KOD]** Mapowanie lokalizacji na adresy portali odbywa się osobno w każdym parserze (slug-i, `slugLocation`, `cityProbe`) — to prawdopodobne źródło znanych problemów z mniejszymi miejscowościami (np. Pisz); bez zgłoszonego przypadku testowego tego **nie potwierdzam**.
- **[KOD]** Brak weryfikacji tokenu po stronie serwera, CORS `*`, publiczne trasy diagnostyczne.
- Duża liczba wersjonowanych plików (`-v05`, `-v06`, `-v07`) bez jasnego wskazania aktualnych.

### 4.6 Do użycia bez zmian / adapter
- **Bez zmian:** cały backend jako samodzielna usługa (`/api/live/combined`).
- **Adapter:** przyjęcie TERYT/SIMC z kontekstu zamiast nazwy tekstowej; uporządkowanie nieosiągalnych plików (dopiero w etapie implementacji).

## 5. analizator-nieruchomosci (działki, mapy, warstwy)

(Repozytorium jest identyczne z wersją sprawdzoną wcześniej w tej rozmowie — potwierdzone porównaniem plików.)

### 5.1 Stan [KOD]
Jeden commit `a1aa39d` z 2026-10-23 (historia spłaszczona). 21 plików: `index.html` (1 294 linii, front w jednym pliku), `api-dzialki/server.js` (1 952 linie, czysty Node `http`), `package.json` (proj4, pngjs), 17 plików `diagnostic-*.html`, wynik jednorazowego przebiegu CI z 2026-09-03. Brak README, testów, lockfile, konfiguracji wdrożenia.

### 5.2 Funkcje [KOD]
Mapa Leaflet (OSM, Esri), wyszukiwanie działki (ULDiK), dynamiczne etykiety numerów działek z WFS, „działki o wspólnym numerze bazowym", pomiary na mapie, warstwy WMS: krajowy MPZP, plany ogólne, RWDZ (GUNB), uzbrojenie terenu, ortofotomapa historyczna, zagrożenie powodziowe; generowanie raportu PDF (jsPDF + html2canvas).

### 5.3 API [KOD]
`/health` + 37 tras `/api/*`; frontend używa 7: `/api/wfs`, `/api/ownership-national`, `/api/mpzp-info`, `/api/mpzp-gmina-info`, `/api/dzinfo`, `/api/rwdz-feature-info`, `/api/report-snapshot`. Pozostałe 26 to trasy diagnostyczne/probe. Wyjście: GeoJSON/JSON w EPSG:4326. Zmienna środowiskowa: tylko `PORT`.

### 5.4 Usługi zewnętrzne [KOD]
GUGiK (integracja, uldk), geoportal.gov.pl, rejestr-urbanistyczny.gov.pl, wody.isok.gov.pl, GUNB, e-mapa.net, igeomap/igeoplan/epodgik, Esri, OSM, Supabase.

### 5.5 Ryzyka [KOD]
Publiczne trasy diagnostyczne bez ochrony (CORS `*`); zależność od zmiennych publicznych usług państwowych (zmiany formatu WFS już raz zepsuły etykiety działek); jeden plik 1 952 linii o zbitej składni; adres backendu zaszyty w 7 miejscach front-endu; brak historii git.

### 5.6 Do użycia bez zmian / adapter
- **Bez zmian:** backend proxy (7 tras) i mapa jako samodzielna aplikacja.
- **Adapter:** odbiór kontekstu (parcela/geometria) z URL; wyeksportowanie wybranej działki (ID + geometria + powierzchnia) jako kontekstu dla pozostałych modułów; konfigurowalny adres backendu.

## 6. rozklad-nieruchomosci-podobnych

### 6.1 Stan [KOD]
3 pliki: `index.html` (1 222 linie), `server.js` (231 linii), `package.json`. Zero zależności npm. Node ≥18. Slug `mapa`.

### 6.2 Funkcje [KOD]
Użytkownik **ręcznie** wpisuje nieruchomość analizowaną i listę nieruchomości podobnych (adres lub numer działki, data, cena); aplikacja lokalizuje je (Nominatim, ULDiK, PRG), pokazuje na mapie (Leaflet) z etykietami i liniami; wybór działki po powiecie/gminie/obrębie/numerze. Nie ma obliczeń statystycznych ani eksportu, nie ma trwałego zapisu (brak localStorage/bazy) — **wprowadzone dane znikają po odświeżeniu strony**.

### 6.3 API [KOD]
`/api/health`, `/api/prg/*` (proxy FeatureServer PRG), `/api/prg-wfs` (proxy WFS granic), `/api/uldk` (proxy ULDiK), `/api/regions?teryt=` (lista obrębów z cache w pamięci). Zmienne: `PORT`, `UPSTREAM_PRG`, `UPSTREAM_WFS`.

### 6.4 Ryzyka
Dane tylko w pamięci strony; nazwa pakietu w `package.json` (`rozkład-nieruchomosci-podobnych`) zawiera polskie znaki — drobnostka; proxy z nagłówkiem CORS `*` (publiczny dostęp do cudzych usług z naszego serwera, ograniczony do 3 stałych hostów).

### 6.5 Do użycia bez zmian / adapter
- **Bez zmian:** całość.
- **Adapter:** „Dodaj z RCN" — zasilanie listy podobnych transakcjami z rcn zamiast ręcznego wpisywania (największa wartość dodana).

## 7. gminy

### 7.1 Stan [KOD]
Jeden plik `index.html` (298 linii) bez backendu. Slug `gminy`. Biblioteki: supabase-js, html2pdf.js. **[DOC vs KOD]** brak README w repo.

### 7.2 Funkcje [KOD]
Porównanie podobieństwa gmin: wybór gminy docelowej, zakres (cały kraj / województwo), profil nieruchomości (działki budowlane, domy, lokale), opcja „tylko ten sam typ gminy"; 7 wskaźników GUS BDL (gęstość zaludnienia, zmiana liczby ludności, obciążenie demograficzne, rozwój budownictwa, REGON, nowe podmioty, wydatki inwestycyjne) z wagami zależnymi od profilu; ranking percentylowy; objaśnienia; eksport do PDF.

### 7.3 Dane [KOD]
Odczyt z przeglądarki tabeli Supabase `gus_bdl_commune_wide` (stronicowanie po 1000 wierszy, do 3000). Identyfikator jednostki to `unit_id` (GUS BDL) i `unit_name`. **Klucza łączenia z TERYT w kodzie nie ma — [HIP]** zależy od struktury tabeli, której nie widziałem.

### 7.4 Ryzyka
Bezpieczeństwo danych zależy wyłącznie od RLS w Supabase (poza repo); logika scoringu i wagi zaszyte w HTML (trudne do wspólnego użycia przez inne moduły); brak jasnej mapy `unit_id` ↔ TERYT.

### 7.5 Do użycia bez zmian / adapter
- **Bez zmian:** cała strona.
- **Adapter:** wyciągnięcie funkcji scoringu do pliku `.js` + przyjęcie gminy (TERYT) z kontekstu; tablica mapowania BDL ↔ TERYT.

## 8. Macierz zależności i konfliktów

| Obszar | Stan | Konflikt / ryzyko |
|---|---|---|
| Tożsamość i dostęp | wspólny Supabase, 5 slugów (`rcn`, `oferty`, `dzialki`, `mapa`, `gminy`) | 5 kopii bramki; różne adresy panelu |
| Identyfikator lokalizacji | rcn/oferty: TERYT/SIMC; działki/rozkład: ULDiK/WFS; gminy: BDL | brak wspólnego klucza |
| Hosting | 3 usługi z backendem + 1 małe proxy + 1 statyczna | brak konfiguracji w repo |
| CORS | `*` wszędzie | otwarte API; ułatwia skład z przeglądarki, ale zero ochrony |
| Wspólne usługi zewnętrzne | ULDiK/PRG (działki, rozkład), Nominatim (rcn, rozkład), TERYT/GUS (rcn, oferty, gminy) | trzy niezależne klienty tego samego |
| Biblioteki front | Leaflet 1.9.4 w 4 aplikacjach; Tailwind CDN w działkach | konflikt tylko jeśli wklejać do jednego HTML-a |

## 9. Co jest potwierdzone, a co nie
**Potwierdzone kodem:** wszystko oznaczone [KOD] powyżej.
**Niepotwierdzone (wymaga sprawdzenia poza repo):** faktyczny tryb źródła danych rcn na produkcji; plan i konfiguracja hostingu; politykę RLS Supabase; kod panelu `denem.pl/panel` (nie jest w żadnym z pięciu repo); zachowanie na produkcji (nie wykonywałem żadnych zapytań do działających usług).