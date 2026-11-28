# RAPORT dla kierownika — M4f, PDF w Działkach

1. **Status: WYKONANE.** Działki mają listę roboczą i pobierany PDF z danymi działek oraz zapisanymi widokami mapy. D35 zapisuje nowe ustalenie właściciela o osobnym wyszukiwaniu lokalizacji w każdym module. Postęp około 35% wykonane i 65% pozostało (34/97 punktów nakładu, poprzednio 31/100).
2. Repo `denem1984/centrum-analiz-nieruchomosci`, gałąź `feat/dzialki-pdf`, baza `a53934111185a2c3a7f4eb654860242e675d2fdd`. Końcowa rewizja, statystyka i PR w metadanych dostawy.
3. Moduły raportu obejmują listę roboczą, wczytywanie danych działki, zapis obrazu mapy oraz skład PDF. Powiązano je z menu mapy i istniejącym formularzem. Dodano zasoby PDF, scenariusz browser-smoke, test danych z atrapami, test startowy i decyzje D35/D36. Szczegółowy wykaz i sumy +/- są w diffie PR.
4. Kryteria i dowody:

| Kryterium | Wynik |
|---|---|
| Dodawanie z mapy, usuwanie i czyszczenie | TAK, Edge z oknem; przy pustej liście pobieranie jest wyłączone |
| Lista między zakładkami i rozpoczęcie od pustej po odświeżeniu | TAK, Edge |
| PDF A4, dane EGiB, MPZP i polskie znaki | TAK, pobrany rzeczywisty plik i oględziny obu stron po renderowaniu Popplerem |
| Widok mapy z geometrią, skalą i legendami | TAK, render PDF pokazuje raster, obrys EGiB, numer etykiety, skalę, atrybucję, legendę KIUT oraz słownik MPZP. Legenda grup własności korzysta ze wspólnego słownika i kolorów mapy |
| Braki danych | TAK, brak MPZP po awarii oznaczany jako wynik niepełny w teście. Niekompletne lub niedostępne w eksporcie kafelki mają opis w PDF |
| Start, urządzenie mobilne i testy krótsze niż 5 s | TAK, 158/158 w 820,27 ms z testem startowym, Edge 9/9 w tym widok 390 px |
| Publikacja danych w rzeczywistej usłudze i pełny baseline właściciela | Do odbioru ręcznego. Przebieg automatyczny ma fikcyjne dane, w tym fikcyjną geometrię i plany |

5. Komendy faktycznie uruchomione obejmują odczyty Git i źródła, `git switch -c feat/dzialki-pdf`, pobranie zasobów z GitHub, `git hash-object` i SHA-256, `node --check scripts/report-pdf-smoke.mjs`, `node --test --test-reporter=tap scripts/*.test.mjs tests/*.test.mjs` (158 PASS, 820,27 ms), `node scripts/browser-smoke.mjs --headed --report-pdf --task m4f` (dwa starty, oba 9/9), `pdfinfo` oraz `pdftoppm -r 96 -png` obu pobranych dokumentów. Końcowy PDF to dwie strony A4 i 89 457 bajtów. Obie strony i zrzuty UI obejrzano. Końcowy zestaw dowodów znajduje się w ignorowanym `.local-results/browser-smoke-2026-11-28T07-15-58-195Z/`. Git, skany i HTTP podglądu w metadanych.
6. [FAKT] Pierwszy render miał ostatnią linię legendy na trzeciej stronie. Zmieniono limit wysokości obrazu i utrzymano blok legendy w całości, po czym ponownie pobrano i obejrzano PDF. Budżet testu m4f to 2/4 starty i zero wysłanych żądań do zewnętrznych usług. Eksport w aplikacji zapisuje realnie dostępne elementy aktualnego widoku. Przeglądarka może odmówić odczytu pikseli niektórych kafelków przez CORS. Takie braki są oznaczane w dokumencie. Rysunek mapy obejmuje warstwy, z wyłączeniem otwartych popupów i menu.
7. Zakazane obszary: **NIE**. Źródłowe repozytoria, DENEM, usługi produkcyjne, konfiguracja zewnętrzna i dane pozostają w zakresie wcześniejszych zasad. Żądania produktu to GET do dotychczasowych tras, a test wykonano na atrapach.
8. Nie odczytano ani nie zapisano sekretów i wartości zmiennych środowiskowych. Przykładowy PDF i zrzuty zawierają fikcyjne dane i znajdują się wyłącznie w ignorowanym katalogu.
9. Otwarte: odbiór na działce właściciela i sprawdzenie rastrów używanych na co dzień. D35 zastępuje koncepcję jednego obowiązkowego wyszukiwania w Start. Moduły otrzymają właściwe formularze we własnych etapach.
10. Test ręczny: otworzyć [Działki lokalnie](http://localhost:8082/#/dzialki) i odświeżyć przez Ctrl+F5. Wyszukać działkę i wybrać „Dodaj wyszukaną działkę” w sekcji „Raport PDF” na dole panelu albo użyć PPM na mapie i „Dodaj działkę do raportu”. Włączyć wybrane warstwy i po wczytaniu użyć „Dodaj widok mapy”. Przełączyć zakładkę, wrócić i wybrać „Pobierz PDF”. Sprawdzić obrys, legendy, polskie znaki, usunięcie pozycji, czyszczenie i pustą listę po odświeżeniu. Automatyczny scenariusz fikcyjny wymaga Node 22+ i używa tego samego trwałego budżetu: `node scripts/browser-smoke.mjs --headed --report-pdf --task m4f`.
11. Następny etap po akceptacji kontynuacji to weryfikacja słowników M3b, a następnie port RCN z własnym wyszukiwaniem i istniejącymi danymi R2.

## Stary front vs nowa aplikacja

Stary front pochodzi z `denem1984/analizator-nieruchomosci`, SHA `a1aa39d711b2730dfcf62799e42ab7d79d4bf3d3`. Istniejące testy sprawdzają pełne URL-e dla poniższych tras. Nowy test obejmuje sekwencję żądań przy dodaniu działki do raportu.

| Funkcja | Stary front | Nowa aplikacja | Adres, metoda, parametry, CRS i format |
|---|---|---|---|
| Identyfikacja punktu | `index.html:237,562–570,885–896` | `buildMapClickFeatureInfoUrl`, istniejący builder | GET `https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow`, WMS 1.1.1 GetFeatureInfo `dzialki`, bbox ±0,0012°, EPSG:4326, XML |
| Dane administracyjne i geometria | `index.html:560,867–883`; raport pobierał same nazwy, wyszukiwanie pobierało również geometrię | Powtórne użycie żądania wyszukiwania, jeśli raport nie ma danych wyszukanej działki | GET `https://uldk.gugik.gov.pl/`, `request=GetParcelById&id=<id>&result=id,teryt,parcel,county,commune,region,geom_wkt&srid=4326`, tekst z WKT. Dokładne kodowanie testowane w `tests/dzialki-search.test.mjs` |
| Uzupełnienie EGiB dla wyszukanej działki | `index.html:560` | Powtórzenie istniejącego `createSearchApi.egib`, jeśli wynik formularza jeszcze nie zawiera danych | GET ULDK GetParcelById dla geometrii EPSG:2180, potem GET KIEG GetFeatureInfo w EPSG:2180 (XML). Dokładne adresy w `tests/dzialki-search.test.mjs` oraz `docs/dzialki-module.md` |
| MPZP | `index.html:320–349,891–896` | Kolejność gmina → RU i równoległe szczegóły działki z `loadMpzp` | GET `/api/mpzp-gmina-info?teryt=<kod>&lat=<lat>&lon=<lon>`, `/api/mpzp-info?lat=<lat>&lon=<lon>`, `/api/dzinfo?id=<id>` na istniejącym backendzie Działek. WGS84 dla punktu i JSON. [Pełna tabela](../docs/dzialki-planning.md) oraz `tests/dzialki-planning.test.mjs` |
| Obraz i PDF | `index.html:899–946,991–1110`, html2canvas z CORS i jsPDF | Skład obrazu z elementów widoku Leaflet i lokalny jsPDF | Ewentualny odczyt CORS tych samych URL-i widocznych kafelków GET, bez nowych hostów, parametrów, formatów lub CRS. PDF i font z lokalnych plików. Brak wywołania `report-snapshot`, które w sprawdzonym fragmencie starego frontu jest zadeklarowane, a eksport składa dokument lokalnie |

Lokalna biblioteka i font są przypięte i mają dołączone licencje. [Pochodzenie plików](../app/vendor/dzialki/pdf/README.md).

## Metadane dostawy

Do uzupełnienia po zapisaniu implementacji i aktualizacji podglądu.
