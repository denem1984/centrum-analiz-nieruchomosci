# RAPORT dla kierownika — poprawki mapy i PDF Działek

1. **Status: WYKONANE.** Własność, popup, informacje MPZP, legendy PDF i osobne akcje zaznaczenia wdrożono w lokalnej aplikacji. Zgłoszenie rozszerzyło bieżącą poprawkę o PPM. Projekt orientacyjnie 35% wykonany i 65% pozostało. Zaokrąglony szacunek po poprawkach M4f pozostaje ten sam.
2. Repo `denem1984/centrum-analiz-nieruchomosci`, gałąź `fix/dzialki-planning-presentation`, baza `03e785218c2d0b443d020d7df88771d3e11f4c87`. Końcowy commit i PR w metadanych.
3. Zmiany obejmują styl i wspólną legendę własności, rozmiar Leaflet popup, tekst MPZP i link punktu, odrębne legendy PDF, interakcje EGiB i PPM, testy, scenariusz Edge oraz dokumentację. Statystyka plików i wierszy w metadanych.
4. Kryteria i dowody:

| Kryterium | Wynik |
|---|---|
| Kolor własności odpowiada legendzie także przy zaznaczeniu | TAK. Kryjący kolor z palety jest równy próbce w Edge. Obejrzano żółtą działkę i żółtą próbkę grupy 7. Nad kolorem pozostaje czerwony obrys |
| Popup mieści się w granicach mapy | TAK dla sprawdzonego 390×560. Otwarty przy górnej krawędzi, z długą treścią i przewijaniem wewnętrznym |
| Pusty MPZP odróżniony od niepełnego sprawdzenia i od obecności rysunku | TAK. Testy obu stanów i dokładnego adresu. Odnośnik prowadzi do punktu w źródle rysunku. Dostępność szczegółów zgłoszonej działki wymaga ręcznego sprawdzenia |
| PDF z osobnymi legendami MPZP i POG | TAK. Testy POG w wariancie uchwalonym i obu projektowanych oraz kombinacji. Obejrzano pobrany PDF ze stroną MPZP i stroną POG. Oznaczenia POG według GUGiK |
| Lewy klik zachowuje stan zaznaczeń, PPM zmienia wyłącznie wskazaną działkę | TAK. Edge i test wielu zaznaczeń, w tym odznaczenia wcześniej wyszukanej działki po jej zapisanej geometrii |
| Start aplikacji i regresja | TAK. Pełny test z atrapą DOM oraz headed Edge 14/14, w tym faktyczne pobranie PDF |

5. Faktycznie uruchomiono odczyty repozytorium i źródeł GUGiK, `git switch -c fix/dzialki-planning-presentation`, `node --test --test-reporter=tap scripts/*.test.mjs tests/*.test.mjs` (160 PASS, końcowe 805 ms z dostępem do 127.0.0.1), dwukrotnie `node scripts/browser-smoke.mjs --headed --planning-presentation --task dzialki-feedback` (oba 14/14), `pdfinfo` i `pdftoppm`. W ostatnim pliku obejrzano wszystkie 3 strony A4. Test i dowody w `.local-results/browser-smoke-2026-11-28T07-38-07-383Z/`. Polecenia skanów, Git i weryfikacji podglądu poniżej.
6. [FAKT] Warstwa własności używała krycia 55%, a zaznaczenie dodawało osobne wypełnienie 42%. Teraz własność kryje rysunek znajdujący się pod działką, a zaznaczenie nad własnością ma krycie wypełnienia 0. W pierwszym teście standardowa fikstura EGiB była nieprzezroczysta, więc obraz oddawał mieszanie z atrapą rastra. W drugim zastosowano przezroczystą fiksturę EGiB z geometrią i obejrzano końcowy obraz. Budżet 2/4 starty, zero wysłanych żądań do usług zewnętrznych w Edge. Nagłówki usług i wyniki dla zgłoszonej działki pozostają do sprawdzenia ręcznego.
7. Zakazane obszary: **NIE**. Zmiany w repo Centrum i podglądzie lokalnym. Projekt źródłowy odczytano jako punkt porównania. Poniżej zestawienie żądań i nawigacji.
8. Nie odczytano ani nie zapisano sekretów lub wartości środowiska. Dane z załączników nie trafiły do repozytorium. Dowody testu zawierają dane fikcyjne i są ignorowane przez Git.
9. Pytanie o źródło MPZP: popup pyta o wynik gminę, następnie RU, oraz osobno o szczegóły działki. Raster KIMPZP pochodzi z usługi mapowej. Odpowiedzi mogą się różnić dla tego samego miejsca. Opublikowany przykład GUGiK zwrócił informację o braku wyniku, dlatego odnośnik nie gwarantuje dostępu do opisu planu. [Dokumentacja usługi KIMPZP](https://mapy.geoportal.gov.pl/wss/ext/krajowaintegracjamiejscowychplanowzagospodarowaniaprzestrzennego).
10. Test ręczny. Odświeżyć [Działki](http://localhost:8082/#/dzialki), włączyć mapę własności i porównać kolor środka działki z próbką. Lewym kliknięciem otworzyć dane, prawym dodać obrys i go usunąć. Powtórzyć odznaczenie dla wyniku wyszukiwania. Wyłączyć własność, włączyć MPZP i sprawdzić punkt ze zgłoszenia oraz link w razie pustego wyniku. Zmniejszyć okno i przewinąć treść popupu. Dodać widok tylko z MPZP, potem drugi tylko z POG i porównać legendy w PDF. Scenariusz automatyczny `node scripts/browser-smoke.mjs --headed --planning-presentation --task dzialki-feedback` używa fikstur i wspólnego limitu.
11. Następny etap po odbiorze pozostaje M3b, weryfikacja słowników lokalizacji.

## Stary front i obecne wywołania

Punkt porównania to `denem1984/analizator-nieruchomosci`, SHA `a1aa39d711b2730dfcf62799e42ab7d79d4bf3d3`.

| Funkcja | Stary front | Obecna aplikacja i sprawdzenie |
|---|---|---|
| Okno i zaznaczanie | `index.html:562–570,817–837`, KIEG GetFeatureInfo w EPSG:4326, XML | Ten sam GET z lewej i po wybraniu akcji PPM, gdy trzeba ustalić ID. Znana geometria pozwala usunąć zaznaczenie bez żądania. W razie brakującej geometrii dla PPM używany jest znany GET ULDK GetParcelById, EPSG:4326, tekst WKT z polami administracyjnymi ze ścieżki wyszukiwania (`index.html:560`). [Pełne parametry i adresy](../docs/dzialki-module.md), test `tests/dzialki-search.test.mjs`. |
| Rysunek MPZP i szczegóły | `index.html:211,320–349`, integracja WMS GetMap i GET gmina/RU/dzinfo | [Istniejąca tabela dokładnych adresów](../docs/dzialki-planning.md). Zmiana komunikatu pustego wyniku. |
| Sprawdzenie w źródle rysunku | `index.html:211` korzysta z KIMPZP do rysowania. Sprawdzony stary kod popupu używał tras gminnych i RU | Odnośnik inicjowany przez użytkownika. GET do KIMPZP pod adresem `https://mapy.geoportal.gov.pl/wss/ext/KrajowaIntegracjaMiejscowychPlanowZagospodarowaniaPrzestrzennego`, WMS 1.1.1 `GetFeatureInfo`, warstwy `granice,raster,wektor-str,wektor-lzb,wektor-lin,wektor-pow,wektor-pkt`, te same `QUERY_LAYERS`, `SRS=EPSG:2180`, bbox ±50 m, 101×101, X/Y 50, mapa PNG transparent, odpowiedź text/html. Dokładny adres w `tests/dzialki-planning.test.mjs`. Zbudowanie linku nie wysyła tego GET. |
| Legenda POG | Eksport starego frontu używał słownika MPZP dla planowania (`index.html:1090–1110`) | Własna tekstowa legenda dla typów stref, na podstawie [listy GUGiK](https://www.geoportal.gov.pl/aktualnosci/uchwalone-plany-ogolne-gmin-pog-w-serwisie-www-geoportal-gov-pl/). Bez dodatkowego GET z raportu. |

## Metadane dostawy

- Implementacja `e031f164d38ffce57bfe16266003875210ba7312`, otwarty [PR #28 do main](https://github.com/denem1984/centrum-analiz-nieruchomosci/pull/28). Końcowy SHA gałęzi jest w PR. Do decyzji właściciela zgodnie z instrukcją przekazaną w rozmowie.
- `git diff --cached --check` przeszedł. `node scripts/check-no-secrets.mjs` i `node scripts/check-no-secrets.mjs --history` przeszły przed commitem. Commit implementacji obejmuje 26 plików, +412 / −98 linii. Liczby per plik z dodatkiem niniejszych metadanych pokazuje [pełny diff PR](https://github.com/denem1984/centrum-analiz-nieruchomosci/pull/28/files).
- `git push -u origin fix/dzialki-planning-presentation` udostępnił gałąź do otwarcia PR. Lokalny worktree `.local/preview-m4e2` przełączono na `e031f16`. `Invoke-WebRequest` na porcie 8082 zwrócił HTTP 200 dla `/`, `map-popup.js`, `index.js` i `report-data.js`. Zweryfikowano obecność obsługi `setSelectionAt` w zwracanym `index.js`.
