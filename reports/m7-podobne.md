# RAPORT dla kierownika — M7 Podobne

## 1. Status

WYKONANE w zakresie portu i lokalnych testów. Odbiór bieżących odpowiedzi API pozostaje do próby ręcznej.

## 2. Repozytorium, gałąź, SHA i PR

- `denem1984/centrum-analiz-nieruchomosci`, gałąź `feat/m7-podobne`. Baza `7c267f9ec3363be8fd1696f37de0c69f68ee49a7` → implementacja `2ae0bfbbb06ee54c96af679f327d41df42b2af4d`. Końcowa rewizja dokumentacji w [otwartym PR #33](https://github.com/denem1984/centrum-analiz-nieruchomosci/pull/33).
- [PR #32](https://github.com/denem1984/centrum-analiz-nieruchomosci/pull/32) scalono za zgodą właściciela, z kontrolą oczekiwanego SHA `35ef135` i dwiema zaliczonymi kontrolami GitHub.

## 3. Zmienione pliki

Moduł Podobne, arkusz stylów, rejestr, powłoka i wersja, ponowne użycie projekcji i geometrii Działek, testy klienta i startu, smoke Edge, decyzje i dokumentacja etapu. Commit implementacji obejmuje 22 pliki, 1318 dodanych i 18 usuniętych linii. [Statystyki per plik](https://github.com/denem1984/centrum-analiz-nieruchomosci/pull/33/files)

## 4. Kryteria akceptacji

| Kryterium | Wynik i dowód |
|---|---|
| Nieruchomość analizowana i wiele porównań po adresie lub działce | Spełnione w Edge. Przykład 1 + 3, obsługa wyboru adresu przy niejednoznaczności. |
| Powiat → gmina → obręb → numer | Spełnione na atrapach. Test dokładnych URL-i i odrzucenia działki w sąsiednim obrębie. |
| Dane transakcji, odległości, przełączniki, przesuwanie etykiet i dwa podkłady | Spełnione na atrapach. Test wyłączenia ceny, przełączenia podkładu, przesunięcia etykiety, popupu oraz dopasowania widoku. |
| Niezależne przewijanie, mobile, awaria i cleanup | Spełnione. Wheel w lewym panelu z zachowaniem pozycji mapy, widok 390 px, ponowienie po HTTP 502, opuszczenie i ponowne wejście do zakładki. |
| Bieżący kontrakt i wynik tras PRG/ULDK z istniejącej usługi | Do ręcznego odbioru. Właściciel może użyć podglądu z rzeczywistymi danymi. |

## 5. Uruchomione komendy i skrót wyników

- `node --test --test-reporter=tap scripts/*.test.mjs tests/*.test.mjs` z dostępem do loopback. 182/182 PASS, w tym uruchomienie z atrapą DOM.
- `node scripts/podobne-browser-smoke.mjs --headed --browser "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"`. PASS. Przechwycono wszystkie obce żądania. Zrzuty i dokładne URL-e są w `.local-results/podobne-browser-smoke/run-UKnpDj/`. Pierwsza próba wykryła niewłaściwą pozycję fikcyjnych punktów, wpływającą na czytelność etykiet. Wersja końcowa ma poprawione punkty i układ etykiet.
- `curl.exe -sSI` dla oficjalnego przykładu UUG. HTTP 200, JSON, `Access-Control-Allow-Origin: *`. Sprawdzono jedną publiczną odpowiedź Marki, Andersa 1 przez przykład z dokumentacji.
- `Invoke-WebRequest` do lokalnego portu 8085 zwrócił HTTP 200.
- `git diff --cached --check`, `node scripts/check-no-secrets.mjs` i `node scripts/check-no-secrets.mjs --history` zaliczone przed publikacją.

## 6. Odstępstwa i założenia

- [FAKT] Zmieniono geokoder adresów na GUGiK UUG. Przy wielu wynikach wybór pozostaje po stronie użytkownika. Przeliczenie EPSG:2180 → EPSG:4326 sprawdzono na publicznym przykładzie. [Macierz](../docs/parity-podobne.md) · [Specyfikacja](https://services.gugik.gov.pl/uug/opis.html)
- [FAKT] Istniejące trasy PRG, obrębów i ULDK zachowano na podstawie starego frontu. Wynik ULDK wymaga dokładnego identyfikatora i poprawnej geometrii. Podkłady rzeczywiste zachowują dwa URL-e Esri, przykładowy podkład jest lokalny i schematyczny.

## 7. Dotknięto zakazanych obszarów?

NIE. Do repozytorium źródłowego dostęp był tylko do odczytu. Bez wdrożenia i operacji na usługach zarządzanych.

## 8. Sekrety

Bez odczytu i zapisu sekretów ani wartości zmiennych środowiskowych.

## 9. Sprzeczności i otwarte pytania

Do odbioru pozostają bieżące dane istniejącego API, rzeczywisty adres i dostępność rzeczywistych podkładów. Plan nowszej ortofotomapy pozostaje w M4b.4. Wspólne wyszukiwanie w Start jest zaplanowane według D39.

## 10. Test ręczny dla właściciela

1. Otwórz [Podobne na danych przykładowych](http://localhost:8085/?podobne=demo#/podobne), kliknij **Wczytaj przykład**. Sprawdź cztery markery (N, 1, 2, 3), trzy odległości i dane działki 12/3. Przeciągnij etykietę ceny i sprawdź, czy łącznik pozostaje przy nieruchomości.
2. Wyłącz **Cena** i **Data transakcji**, przełącz **Satelita**, kliknij **Pokaż wszystkie**. Przewiń listę po lewej, usuń jedną pozycję i sprawdź numerację oraz położenie mapy.
3. Otwórz [tryb rzeczywisty](http://localhost:8085/#/podobne). Porównaj ze starym frontendem adres **Marki, Andersa 1** i znaną działkę, wybierając powiat, gminę, obręb i numer. Sprawdź współrzędne, a dla działki zgodność pełnego identyfikatora. Użyj obu podkładów i dodaj kolejne nieruchomości.

W razie zamknięcia podglądu uruchom z katalogu projektu `node scripts/serve.mjs --port 8085`.

## 11. Następny krok

Odbiór M7. Po zatwierdzeniu rozpocząć M8 Gminy. Szacunkowo **60% wykonane, 40% pozostało**.
