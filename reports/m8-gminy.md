# RAPORT dla kierownika — M8 Gminy

## 1. Status

WYKONANE. Siedem wskaźników za 2025 r. dla wszystkich 2479 gmin, lokalny ranking, porównanie i PDF. Etap czeka na odbiór właściciela.

## 2. Repozytorium, gałąź, SHA i PR

- `denem1984/centrum-analiz-nieruchomosci`, `feat/m8-gminy`, baza `ee1c113164c64ca4bb81aaf4830eeb92f5dfa340`.
- [PR #33](https://github.com/denem1984/centrum-analiz-nieruchomosci/pull/33) scalono po zatwierdzeniu Podobnych i sprawdzeniu zielonych kontroli dla `ffe115e`.

## 3. Zmienione pliki

Dodano moduł Gmin, style, plik danych, skrypt pobierania wskaźników BDL, testy algorytmu, startu i scenariusz Edge. Powłoka rejestruje moduł i podgląd. Eksport Gmin używa istniejącej lokalnej biblioteki PDF oraz czcionki.

## 4. Kryteria akceptacji

| Kryterium | Wynik i dowód |
|---|---|
| Wyszukiwanie gminy według nazwy, kodów i jednostek nadrzędnych | Test modelu, test DOM i wybór klawiaturą w Edge. |
| Trzy profile, kraj / województwo, ten sam typ i Top 20 | Test metody percentyli i wag oraz wybór filtrów w Edge. |
| Porównanie wielu gmin i wyjaśnienia siedmiu wskaźników | Test zaznaczenia dwóch gmin i 14 pozycji w szczegółach. |
| PDF z polską czcionką, wartościami, wagami i rokiem | Test pobrania PDF w Edge, render Poppler i odczyt obu stron w `pypdf`. |
| Wersjonowany zbiór BDL oraz kontrola identyfikatorów TERC | 280 stron API. Skrypt potwierdził 2479 gmin z kompletem danych. Test sprawdza także sześć historycznych kodów w pliku. |

## 5. Uruchomione komendy i skrót wyników

- `python -X utf8 scripts/refresh-gminy-data.py --year 2025`. Siedem publicznych serii pobrano z zachowaniem limitu 100 zapytań na 15 min. Pierwsze przerwanie połączenia obsłużono przez ponowienia i wznowienie z zachowanych stron. Alternatywny eksport portalu nie zakończył się w narzędziu przeglądarki i nie był użyty do budowy pliku.
- `python -X utf8 scripts/refresh-gminy-data.py --year 2025 --cache-only`. Ponowne złożenie z 280 zapisanych stron z pełną kontrolą TERC i historycznych kodów. `Get-FileHash` potwierdził dla pliku z końcami LF SHA-256 `05576cd16c3ce427da756c6983d787f522979deff3d07276f644d76cb8f2bc30` i rozmiar 222928 bajtów.
- `node --test --test-reporter=tap scripts/*.test.mjs tests/*.test.mjs`. 189/189 PASS, także na rzeczywistym pliku.
- `node scripts/gminy-browser-smoke.mjs --headed --browser "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --bdl`. PASS na danych przykładowych i rzeczywistych. Sprawdzono mobilny układ, zaznaczanie, filtry, dokładną ścieżkę lokalnego pliku i pobranie PDF.
- `pdfinfo`, `pdftoppm`, `pypdf`. Obejrzano jedną stronę rzeczywistego raportu Olsztyna i dwie strony przykładowego raportu. Sprawdzono odczyt tekstu, polskie znaki, numery stron i odnośnik atrybucji GUS. Zrzuty w `.local-results/gminy-browser-smoke/run-JL45QV/`.
- `Invoke-WebRequest` do portu 8086 dał HTTP 200 dla strony, trybu przykładowego, pliku wskaźników, modułu i stylów.

## 6. Odstępstwa i założenia

- [FAKT] Siedem wskaźników ma w publicznym BDL rok 2025. Wskaźnik 747072 jest publikowany jako średnia trzyletnia.
- [FAKT] TERC z 2026 r. i kody danych z 2025 r. różnią się dla sześciu gmin. Jawne powiązanie łączy oba okresy. Typ w porównaniu pochodzi z roku danych. [Wykaz zmian TERC](https://dziennikustaw.gov.pl/D2025000157101.pdf)
- [FAKT z kodu] Wagi, relatywna miara percentylowa, filtrowanie puli i pomijanie wierszy z brakami odpowiadają regułom źródła. Remisy rozstrzyga nazwa i TERC. Wyszukiwanie wyświetla również gminy z brakami i sygnalizuje je przed obliczeniem. [Macierz](../docs/parity-gminy.md)
- [FAKT] Wskaźniki są z licencjonowanych danych GUS BDL. Dane liczbowe zostały połączone z katalogiem TERC, przeglądarka pobiera statyczny plik tego samego originu. [API i licencja GUS](https://api.stat.gov.pl/Home/BdlApi)

## 7. Dotknięto zakazanych obszarów?

NIE. Repozytorium źródłowe odczytano. Bez operacji na Supabase, usługach zarządzanych i wdrożeniach.

## 8. Sekrety

Bez odczytu i zapisu wartości sekretów lub zmiennych środowiskowych. Publiczne API BDL używane anonimowo.

## 9. Sprzeczności i otwarte pytania

Wyniki mogą różnić się od starej aplikacji, gdy jej eksport opisuje inny rok lub inny zestaw gmin. Porównanie powinno używać identycznych danych, profilu i zakresu. Wspólne wyszukiwanie w Start pozostaje w następnym etapie.

## 10. Test ręczny dla właściciela

1. Otwórz [Gminy na danych przykładowych](http://localhost:8086/?gminy=demo#/gminy). Wpisz **Żurawin**, wybierz gminę i uruchom analizę. Oczekiwane są 23 porównania i 20 widocznych pozycji. Dla zakresu województwa i tego samego typu pozostają cztery porównania.
2. Zaznacz dwie pozycje i kliknij **Porównaj zaznaczone**. Sprawdź siedem wskaźników dla każdej gminy, wagi i podany rok, potem pobierz **PDF**. Powinien mieć dwie strony.
3. Otwórz [Gminy z danymi GUS BDL](http://localhost:8086/#/gminy). Wpisz **2862011** lub wybierz miejski **Olsztyn**. Przy profilu „Działki budowlane” i zasięgu kraju bez ograniczenia do typu oczekiwanych jest 2478 porównań, z pierwszą pozycją **Nowy Sącz, 93,8%**. Zmień profil i zakres.

W razie zamknięcia serwera uruchom w katalogu projektu `node scripts/serve.mjs --port 8086`.

## 11. Następny krok

Lokalny odbiór Gmin, następnie wspólne wyszukiwanie w Start według D39. **Około 70% wykonane, 30% pozostało.**
