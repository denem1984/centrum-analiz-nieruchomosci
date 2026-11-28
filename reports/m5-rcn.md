# RAPORT dla kierownika — M5, moduł RCN

1. **Status: WYKONANE do odbioru.** Port istniejącego frontu RCN działa w Centrum, z lokalnym podglądem i oddzielnym trybem rzeczywistych danych. Odbiór na wystawionym API jest po stronie właściciela.
2. Repo `denem1984/centrum-analiz-nieruchomosci`, gałąź `feat/m5-rcn`, baza `bd5ead3e8eb2425b9fb159d4325ee22485e1b89b`. Zatwierdzony [PR #29](https://github.com/denem1984/centrum-analiz-nieruchomosci/pull/29) scalono przed M5. Końcowy commit i PR w metadanych.
3. Port obejmuje szablon, style i kod źródłowego frontu, montowanie natywnego modułu, klienta API, podgląd demonstracyjny, lokalny Chart.js, testy startu i adaptera, scenariusz Edge oraz dokumentację. Statystyki plików w diffie PR.
4. Kryteria akceptacji i dowód:

| Kryterium | Wynik |
|---|---|
| Ponowne użycie istniejącego kodu i danych R2 | TAK w integracji. Zachowano zewnętrzne API i obliczenia z dotychczasowej aplikacji, wykorzystując istniejący origin RCN. Dotychczasowe źródło Parquet R2 potwierdził właściciel w M1. Aktualna odpowiedź produkcji nie była mierzona w M5. [CONFIG.md](../CONFIG.md). |
| Natywny moduł z trzema typami i własnymi filtrami | TAK. Port pełnych formularzy, potwierdzony na widokach Lokale, Grunt niezabudowany i Grunt zabudowany. W Edge potwierdzono miejscowość, ulicę, całą gminę, promień i uruchomienie podobieństwa. Typy filtrów i adresy wyszczególnia [macierz parytetu](../docs/parity-rcn.md). |
| Wyniki i prezentacja | TAK w lokalnym teście. Tabela, aktywne transakcje, wykresy, koszyki, liczniki mapy, podział według ulic i diagnostyka pozostają dostępne. Sortowanie ma przyciski, `aria-sort` oraz oddzielną regułę dla wartości brakujących. Mapę, wykres i widok 390 px obejrzano w Edge. |
| Poligon | TAK w teście z atrapą Leaflet. Test odtwarza kliknięcia, domknięcie na pierwszym wierzchołku, dokładny parametr trzech punktów i czyszczenie. Zmieniony scenariusz Edge wymaga ponowienia przez właściciela. |
| Eksport | TAK dla kontraktu i pobrania przez Edge w ukończonym przebiegu 2. Oba POST-y przechwycono, a odpowiedzi zastąpiono krótkimi treściami testowymi. Potwierdzono 11 aktywnych rekordów po wykluczeniu jednego, nazwy plików i parametry Worda. Rzeczywisty XLSX i DOCX do sprawdzenia w odbiorze. |
| Start aplikacji i sprzątanie po zmianie zakładki | TAK. Test startu powłoki z atrapą DOM, osobny test pełnego startu frontu RCN w atrapach oraz ponowny montaż w Edge. |

5. `git clone --depth 1 --no-checkout` oraz `git show` posłużyły do porównania rewizji źródłowej. `node --test --test-reporter=tap scripts/*.test.mjs tests/*.test.mjs` i `git diff --check` wykonano na porcie. Do sprawdzenia zasobów użyto `Invoke-WebRequest`. Scenariusz `node scripts/rcn-browser-smoke.mjs --headed --browser "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"` wykonał cztery starty Edge, w tym dwa zakończone powodzeniem. Wyniki i obejrzane PNG w `.local-results/rcn-browser-smoke/run-rsc72p/`. Aktualny scenariusz czeka na powstanie pliku po pobraniu i testuje dodatkowo poligon.
6. [FAKT] W ukończonych przebiegach przechwycono cały ruch od strony testowanej, bez kontaktu z backendami, kaflami, reverse geocoderem i trasami produkcyjnego eksportu. Trzeci przebieg przerwał się przy asercji zamknięcia obszaru. Dodano bezpośrednią obsługę pierwszego wierzchołka oraz test mapy z atrapą. Czwarty przebieg odczytał plik Word przed zapisem. Dodano oczekiwanie na faktyczne pobranie. Budżet automatyzacji tego zadania to 4/4 starty. [FAKT] Tryb przykładowy pokazuje umowne transakcje i punkty na pustym podkładzie oraz oznacza wyłączony eksport. [FAKT] Chart.js 4.5.1 dodano lokalnie z licencją MIT i sprawdzeniem sumy. Leaflet jest już częścią Centrum. [Chart.js](https://github.com/chartjs/Chart.js/releases/tag/v4.5.1).
7. **Zakazane obszary: NIE.** Scalenie #29 jest objęte poleceniem właściciela. Na etapie RCN operacje obejmują kod Centrum, GitHub i lokalny podgląd. R2 obsługuje istniejące API RCN. Bez wdrożenia i bez zmian w projektach źródłowych.
8. Żadnych wartości sekretów i zmiennych środowiskowych nie odczytano ani nie zapisano w repo. Do portu dołączono wyłącznie formularz, style i frontend bez kodu logowania, z fikcyjnymi rekordami do testów.
9. [FAKT] RCN ma własny formularz lokalizacji decydujący o zapytaniu zgodnie z D35. Istniejący kontrakt linków v1 zachowano w powłoce. Dane SIMC/ULIC z przykładowego podglądu M3b nie zastępują słownika API RCN. Obsługa produkcyjna danych, kompletność odpowiedzi i treść eksportów wymagają potwierdzenia na rzeczywistych wynikach.
10. Test ręczny właściciela:
    - [Dane przykładowe](http://localhost:8083/?rcn=demo#/rcn). Wybrać warmińsko-mazurskie → Olsztyn → Olsztyn → Olsztyn i kliknąć „Szukaj”. Zobaczyć 12 transakcji, 11 na mapie. Wpisać `Testowa`, ponowić i sprawdzić sześć wyników.
    - Przełączyć na oba rodzaje gruntów. Wybrać „dowolny obszar”, kliknąć trzy punkty, a potem pierwszy. Sprawdzić komunikat, przesunąć wierzchołek i użyć „Wyczyść obszar”.
    - [Tryb danych RCN](http://localhost:8083/#/rcn). Wybrać Olsztyn lub Pisz, sprawdzić wynik dla miejscowości i ulicy, porównać ceny z własnym frontendem RCN. Pominiętą transakcję sprawdzić w obu eksportach, w tym parametry filtra w raporcie Word.
    - Po zamknięciu serwera uruchomić `node scripts/serve.mjs --port 8083` z katalogu projektu. [Macierz i URL-e](../docs/parity-rcn.md).
11. Po odbiorze i decyzji o PR może zacząć się M6 — Oferty. Postęp około 46% i 54% pozostałych prac. Integrację RCN oszacowano na 10 z 12 przypisanych punktów. Różnica obejmuje ręczny odbiór rzeczywistego API i eksportów.

## Metadane dostawy

- [PR #30 otwarty do odbioru](https://github.com/denem1984/centrum-analiz-nieruchomosci/pull/30). Implementacja `2ebf2b6f073d2de0d85fefe60bb1da92b8026f90` obejmuje 21 plików, +4226 / −12 linii. [Końcowy SHA i zmiany per plik](https://github.com/denem1984/centrum-analiz-nieruchomosci/pull/30/files).
- Końcowe testy 165/165 w 0,78 s, `git diff --cached --check`, `node scripts/check-no-secrets.mjs` i `node scripts/check-no-secrets.mjs --history` przeszły. `git push -u origin feat/m5-rcn` opublikował gałąź. GitHub potwierdził zieloną kontrolę `main` po #29.
- Podgląd na porcie 8083 potwierdził HTTP 200 dla strony, wersji M5, szablonu, stylów, klienta, frontu, danych przykładowych i Chart.js.
