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

Do porównania parametrów warstwy archiwalnej przed i po zmianie możesz wskazać wcześniejszy commit, np. `node scripts/browser-smoke.mjs --before-ref 9aee6e776697f1b067da05593bd8db374a9afd4f`. Skrypt uruchomi w tej samej przeglądarce lokalną kopię z `layers-base.js` z podanego ref, następnie bieżącą aplikację; zapisze oba zestawy wyników. `--compare-before` bez wartości używa bieżącego `HEAD` i nadaje się do porównania przed commitem.

Skrypt używa wyłącznie lokalnego adresu aplikacji, czterech tras zdrowia GET z `app/js/config.js`, kafelków OpenStreetMap, Esri World Imagery oraz żądań WMS GetMap dla warstwy archiwalnej GUGiK. Pozostałe adresy i metody blokuje przed wysłaniem. Scenariusze używają testowego punktu w Pile, zoom 17,6, gdy współrzędne baseline nie zostały podane. Każdy scenariusz czeka maksymalnie 25 sekund. Narzędzie nie jest uruchamiane w CI.

### Wyszukanie działki w scenariuszu właściciela M4c

Scenariusz wyszukiwania jest opcjonalny i wymaga wartości z przygotowanego przez właściciela przypadku testowego. Wpisz je tylko do polecenia w swoim terminalu; nie dopisuj ich do plików repozytorium ani do dokumentacji. Dla wartości zawierających spacje użyj cudzysłowów:

```powershell
node scripts/browser-smoke.mjs --powiat "<powiat z przypadku testowego>" --gmina "<gmina z przypadku testowego>" --obreb "<obręb z przypadku testowego>" --numer "<numer z przypadku testowego>"
```

Możesz dopisać `--browser "C:\Program Files\Microsoft\Edge\Application\msedge.exe"` lub `--port 8090`. Skrypt sam uruchomi lokalną aplikację i przejdzie do formularza, wybierze podane jednostki, wykona wyszukiwanie oraz zapisze czas, adresy i statusy odpowiedzi, liczbę obrysów i zrzut ekranu. Dozwolone są wyłącznie GET-y do list PRG i dwóch zapytań ULDK wyszukiwania oraz adresy lokalne, skonfigurowane trasy zdrowia i kafelki mapy. Inne hosty, ścieżki i metody są blokowane przed wysłaniem.

Wynik terminala pokazuje liczbę obrysów i lokalizację raportu. Szczegóły i zrzut są w `.local-results/browser-smoke-<czas>/report.json` oraz plikach PNG. Katalog jest ignorowany przez Git; nie commituj go. Baseline D1 nie jest jeszcze gotowy — porównanie wyniku z obecną aplikacją pozostaje do uzupełnienia przez właściciela.
