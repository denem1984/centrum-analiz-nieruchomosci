# Lokalny podgląd M2

Aplikacja działa jako statyczne pliki. Nie trzeba instalować npm ani pobierać bibliotek.

## Krok po kroku

1. Zainstaluj Node.js w wersji 20 lub nowszej.
2. Otwórz terminal w katalogu głównym repozytorium.
3. Wpisz `node scripts/serve.mjs` i naciśnij Enter.
4. Poczekaj na komunikat z adresem podglądu.
5. Otwórz w przeglądarce [http://localhost:8080](http://localhost:8080).
6. Powinna pojawić się strona „Centrum Analiz Nieruchomości”, zakładki Start, Działki, RCN, Oferty, Podobne i Gminy oraz cztery karty stanu usług.
7. Pierwsze wywołanie usługi może chwilę potrwać. Karta pokazuje stan oczekiwania i czas. W razie potrzeby użyj przycisku „Sprawdź ponownie”.
8. Aby zakończyć podgląd, wróć do terminala i naciśnij Ctrl+C.

## Inny port

Możesz podać port jako argument, na przykład `node scripts/serve.mjs --port 8090`, albo ustawić zmienną środowiskową `PORT`. Argument ma pierwszeństwo. Domyślny port to 8080.

Serwer udostępnia tylko pliki z katalogu `app/`; nie ma kroku build ani zależności npm.

## Diagnostyka mapy w przeglądarce headless

Skrypt `scripts/browser-smoke.mjs` uruchamia lokalny serwer, Edge w trybie headless i zapisuje zrzuty ekranu oraz raport. Wymaga Node.js 22 lub nowszego (globalny `WebSocket`) i zainstalowanego Microsoft Edge. Chrome może być użyty jako wariant awaryjny.

1. Otwórz terminal w katalogu głównym repozytorium.
2. Jeśli Edge jest w typowej lokalizacji Windows, uruchom `node scripts/browser-smoke.mjs`. Skrypt sam wybiera Edge, a potem Chrome.
3. Jeśli przeglądarka jest zainstalowana w innym miejscu, podaj pełną ścieżkę: `node scripts/browser-smoke.mjs --browser "C:\Program Files\Microsoft\Edge\Application\msedge.exe"`. Możesz też ustawić `EDGE_PATH` przed uruchomieniem. Argument `--browser` ma pierwszeństwo.
4. Opcjonalnie wybierz port lokalnego serwera, np. `node scripts/browser-smoke.mjs --port 8090`.
5. Po zakończeniu odczytaj tabelę w terminalu. Szczegółowy `report.json`, `summary.txt` oraz zrzuty PNG znajdziesz w najnowszym katalogu `.local-results/browser-smoke-<czas>/`. Katalog jest ignorowany przez Git.

Przebieg obejmuje trzy niezależne wczytania archiwalnej ortofotomapy 2025. Podsumowanie pokazuje liczbę pustych kafelków w każdym wczytaniu, przecięcie i sumę współrzędnych, kafelki puste w jednym przebiegu i załadowane w innym oraz wskaźnik `zmienne / suma pustych`. Odpowiedź 200 typu obraz o treści mniejszej niż 128 bajtów jest oznaczana jako pusta — próg wynika z 68-bajtowego transparentnego PNG 1×1 z zapasem 60 bajtów na formatowanie; jest heurystyką, nie potwierdzeniem zawartości obrazu. Do klasyfikacji używa się `Content-Length` lub bajtów ciała z CDP, jeśli są dostępne. Dla maksymalnie sześciu kafelków pustych w pierwszym przebiegu skrypt wysyła ten sam adres GET jeszcze dwa razy, po 1,5 s i 4 s. W tabeli i podsumowaniu zobaczysz liczbę odpowiedzi, które stały się niepuste, oraz wniosek „pomaga”, „nie pomaga” albo „niejednoznaczne” z uzasadnieniem liczbowym. Szczegóły nagłówków `Access-Control-Allow-Origin`, `Timing-Allow-Origin`, `Content-Type`, `Content-Length`, `Cache-Control`, `Age`, `Via` i `X-Cache`, a także `encodedDataLength` z końcowego zdarzenia CDP, są zapisywane tylko w lokalnym `report.json` dla odpowiedzi archiwalnego WMS.

Do porównania parametrów warstwy archiwalnej przed i po zmianie możesz wskazać wcześniejszy commit, np. `node scripts/browser-smoke.mjs --before-ref 9aee6e776697f1b067da05593bd8db374a9afd4f`. Skrypt uruchomi w tej samej przeglądarce lokalną kopię z `layers-base.js` z podanego ref, następnie bieżącą aplikację; zapisze oba zestawy wyników. `--compare-before` bez wartości używa bieżącego `HEAD` i nadaje się do porównania przed commitem.

Skrypt używa wyłącznie lokalnego adresu aplikacji, czterech tras zdrowia GET z `app/js/config.js`, kafelków OpenStreetMap, Esri World Imagery oraz żądań WMS GetMap dla warstwy archiwalnej GUGiK. Pozostałe adresy i metody blokuje przed wysłaniem. Scenariusze używają testowego punktu w Pile, zoom 17,6, gdy współrzędne baseline nie zostały podane. Każdy scenariusz czeka maksymalnie 25 sekund. Narzędzie nie jest uruchamiane w CI.

### Eksperyment niezawodności kafelków archiwalnych

Tryb `--experiment-tiles` wykonuje po trzy niezależne wczytania dla K0–K3. Wymaga jawnego limitu żądań do ortofotomapy:

```powershell
node scripts/browser-smoke.mjs --experiment-tiles --max-ortho-requests 800 --settle-ms 35000
```

Limit obejmuje każde żądanie WMS GetMap, również automatyczne ponowienia; narzędzie zatrzymuje dalszą wysyłkę po osiągnięciu limitu. Używaj tylko budżetu zatwierdzonego przez właściciela. Każde wczytanie używa punktu testowego w Pile, zoomu 17,6 i stałego widoku 833×620 pikseli, by ograniczyć liczbę kafelków bez zmiany miejsca i skali. Wynik końcowy jest pobierany po wskazanym czasie (domyślnie 35 s od wyboru roku 2025); raport osobno pokazuje obrazy poprawne, puste, błędne, nadal ładujące się, retry wyczerpane/oczekujące i żądania GetMap bez odpowiedzi HTTP. Tabele K0–K3, czasy dojścia do 90%/95%, liczba żądań i zrzuty trafiają do ignorowanego `.local-results/browser-smoke-<czas>/`.

### Wyszukanie działki w scenariuszu właściciela M4c

Scenariusz wyszukiwania jest opcjonalny i wymaga wartości z przygotowanego przez właściciela przypadku testowego. Wpisz je tylko do polecenia w swoim terminalu; nie dopisuj ich do plików repozytorium ani do dokumentacji. Dla wartości zawierających spacje użyj cudzysłowów:

```powershell
node scripts/browser-smoke.mjs --powiat "<powiat z przypadku testowego>" --gmina "<gmina z przypadku testowego>" --obreb "<obręb z przypadku testowego>" --numer "<numer z przypadku testowego>"
```

Aby dodatkowo automatycznie sprawdzić wartości w raporcie i pasku lokalizacji, podaj razem `--expect-voivodeship "<oczekiwane województwo>"` oraz `--expect-county "<oczekiwany powiat>"`. Oba argumenty są opcjonalne, ale muszą wystąpić łącznie i mieć niepuste wartości. Skrypt wypisze tabelę sześciu asercji PASS/FAIL. W lokalnym `report.json` zapisuje tylko wyniki oraz długości tekstów, bez jawnych wartości oczekiwanych. Wpisuj dane testowe wyłącznie w poleceniu; nie zapisuj ich w repozytorium, dokumentacji ani opisie PR.

Wartość powiatu może być początkiem pełnej etykiety listy. Skrypt porównuje etykiety po normalizacji polskich znaków, najpierw szuka jednego dokładnego dopasowania, potem jednego dopasowania początku, a na końcu jednego dopasowania zawierania. Jeśli na dowolnym etapie pasuje więcej niż jedna pozycja, skrypt przerywa wybór i podaje wyłącznie dostępne etykiety; nie wybiera pierwszej z brzegu.

Możesz dopisać `--browser "C:\Program Files\Microsoft\Edge\Application\msedge.exe"` lub `--port 8090`. Skrypt sam uruchomi lokalną aplikację i przejdzie do formularza, wybierze podane jednostki, wykona wyszukiwanie oraz zapisze czas do obrysu i danych EGiB, kody odpowiedzi, adresy żądań, obecność tekstów raportu/statusu, liczbę obrysów i zrzut ekranu. Dodatkowe GET-y raportu to geometria ULDK `result=id,geom_wkt&srid=2180` oraz dokładne zapytanie WMS GetFeatureInfo do KIEG opisane w `docs/dzialki-module.md`. Dozwolone są wyłącznie GET-y do list PRG, dwóch wariantów zapytań ULDK używanych w wyszukiwaniu/raporcie, tego jednego zapytania KIEG, adresy lokalne, skonfigurowane trasy zdrowia i kafelki mapy. Inne hosty, ścieżki i metody są blokowane przed wysłaniem.

Wynik terminala pokazuje czas wyszukiwania, czas do odpowiedzi EGiB, stan raportu, liczbę obrysów i lokalizację raportu. Szczegóły adresów/kodów oraz zrzut są w `.local-results/browser-smoke-<czas>/report.json` i pliku `m4c-search.png`. Katalog jest ignorowany przez Git; nie commituj go. Argumenty właściciela mogą zawierać rzeczywiste dane nieruchomości: podawaj je wyłącznie w terminalu, nigdy w repo, raporcie PR ani zgłoszeniu. Porównaj rezultat ze swoim baseline D1 i przekaż do raportu wyłącznie zanonimizowane wyniki.

### Scenariusz warstw EGiB M4d.1

Scenariusz sprawdza domyślne warstwy „Numery działek” i „Kontury działek”, włącza „Kontury budynków”, klika środek mapy dwa razy i zapisuje zrzut. Używa ogólnego widoku testowego w Pile przy zoomie 17,6; nie wymaga danych przypadku właściciela.

1. Otwórz terminal w katalogu głównym repozytorium i uruchom `node scripts/browser-smoke.mjs --egib-layers`.
2. Skrypt sam uruchamia lokalny serwer i Edge headless. Wysyła wyłącznie GET do lokalnej aplikacji, czterech tras zdrowia z konfiguracji, kafelków OSM/Esri, trasy WFS używanej przez stary front oraz KIEG WMS GetMap/GetFeatureInfo dla EGiB. Dla przekierowań KIEG dopuszcza też hosty `integracja01.gugik.gov.pl` i `integracja02.gugik.gov.pl`, tylko ścieżkę `/cgi-bin/KrajowaIntegracjaEwidencjiGruntow` i dokładny zestaw parametrów GetMap warstw EGiB; pozostałe hosty, ścieżki, query i metody blokuje. To ograniczenie wynika ze zgody właściciela dla M4d.1. Każde żądanie do hosta backendu Działek podlega limitowi ustawionemu w uruchomieniu (maksymalnie 400).
3. W tabeli terminala sprawdź asercje PASS/FAIL, czas do pierwszych danych, czas do popupu, liczbę żądań i kody HTTP. Jeśli zimny start nie wystąpi, raport zaznaczy, że usługa była już gotowa.
4. Otwórz najnowszy katalog `.local-results/browser-smoke-<czas>/`. `summary.txt` zawiera tabelę; `report.json` listę adresów, statusy i czasy; `egib-layers.png` zrzut końcowego widoku. Katalog jest ignorowany przez Git.
5. Porównaj ręcznie z baseline M4d zapisanym przez właściciela. Wklej do odbioru asercje, liczniki, kody HTTP i zrzut; usuń z raportu identyfikatory działek, jeśli wystąpią.

Tryb `--egib-layers` działa niezależnie od scenariuszy wyszukiwania i nie przyjmuje numeru działki ani obrębu jako argumentu. Nie rozszerzaj allowlisty o dalsze hosty, ścieżki, parametry ani metody bez odrębnej zgody właściciela.
