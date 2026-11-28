# RAPORT dla kierownika

## 1. Status

WYKONANE w zakresie implementacji i lokalnych testów na danych przykładowych. Odbiór z istniejącym API pozostaje po stronie właściciela.

## 2. Repozytorium, gałąź, SHA i PR

- `denem1984/centrum-analiz-nieruchomosci`, `feat/m6-oferty`, baza `b7c2210a196fda8065a642ec6546aab86cbb0007`. SHA dostawy i PR są w metadanych Git.
- Zgodnie z dyspozycją scalono w kolejności [#30](https://github.com/denem1984/centrum-analiz-nieruchomosci/pull/30) → `1347ebc3f5c97429ee721534cbc9dca2ade17928`, następnie [#31](https://github.com/denem1984/centrum-analiz-nieruchomosci/pull/31) → `b7c2210a196fda8065a642ec6546aab86cbb0007`. Kontrole PR-ów i końcowego main miały wynik SUCCESS.

## 3. Zmienione pliki

- Moduł `app/js/modules/oferty/`, styl `app/css/modules/oferty.css`, wpis w rejestrze, wersja, przekazanie trybu przykładowego w powłoce.
- SheetJS 0.20.3 mini i licencja w `app/vendor/oferty/`.
- Testy klienta i startu zakładki, aktualizacja testów powłoki, scenariusz `scripts/oferty-browser-smoke.mjs`.
- [Macierz Ofert](../docs/parity-oferty.md), [stan projektu](../docs/PROJECT_STATE.md) i [plan](../IMPLEMENTATION_PLAN.md). Liczby zmienionych linii są w statystyce PR.

## 4. Kryteria akceptacji

| Kryterium | Wynik i dowód |
|---|---|
| Formularz Ofert uruchamia się w Centrum | Spełnione. Test startu aplikacji z atrapą DOM oraz otwarcie zakładki w Edge. |
| Istniejące wywołania i wszystkie typy i filtry | Spełnione na poziomie klienta. Macierz i asercje dokładnego URL-a, polskiego kodowania i zer wiodących. Edge sprawdził 4 typy i 3 sposoby filtrowania. |
| Wyniki obejmują źródła, duplikaty i sygnalizują problem z portalem | Spełnione na atrapach. Edge pokazał błąd jednego portalu, ograniczony zasięg i pozostałe wyniki. |
| Tabela pozwala sortować i porównywać oferty oraz pobierać XLSX | Spełnione. Edge pobrał arkusz. Ponowny odczyt sprawdził jeden zaznaczony wiersz, wartość liczbową i polskie znaki. |
| Obsługa awarii, anulowania, wąskiego ekranu i opuszczenia zakładki | Spełnione. Próby błędu HTTP 502, anulowania i widoku 390 px bez przewijania poziomego całej strony. |
| Bieżące odpowiedzi starego frontu i API | Do odbioru właściciela zgodnie z pkt 10. |

## 5. Uruchomione komendy i skrót wyników

- `node --test --test-reporter=tap scripts/*.test.mjs tests/*.test.mjs` z dostępem do loopback. 177/177 PASS. W sandboxie dwa testy lokalnego serwera otrzymały EACCES.
- `node scripts/oferty-browser-smoke.mjs --headed --browser "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"`. PASS. Trzy obrazy `oferty-porownanie.png`, `oferty-wyniki-zrodel.png` i `oferty-mobile.png` oraz zapis żądań w `.local-results/oferty-browser-smoke/run-VXQ4j1/`. Pierwszy przebieg ujawnił problem odczytu zapisanego XLSX w teście. Końcowy przebieg odczytał bufor pobranego pliku.
- `Invoke-WebRequest` do podglądu 8084. HTTP 200 dla strony, konfiguracji, klienta, widoku, eksportu, CSS i biblioteki XLSX.

## 6. Odstępstwa i założenia

- [FAKT z kodu] Eksport i porównanie starej aplikacji powstają przez dodatki w serwerowym punkcie wejścia. Port uwzględnia te dodatki. [Macierz](../docs/parity-oferty.md)
- [FAKT z kodu] Dla domów, działek i nieruchomości komercyjnych istniejący kolektor opiera wyszukiwanie na nazwie miejscowości. Centrum pokazuje ostrzeżenie po rozpoznaniu powtarzającej się nazwy. [Ograniczenie lokalizacji](../docs/parity-oferty.md#rozróżnianie-miejscowości)
- [FAKT z testów] Tryb przykładowy jest dostępny wyłącznie na loopback i ma jawnie fikcyjne wyniki. Próby Edge były przechwytywane lokalnie.

## 7. Dotknięto zakazanych obszarów?

NIE. Repozytorium źródłowe odczytano. Bez operacji zarządzania usługami, zmian w portalu, źródłach i wdrożeniach. Scalenia #30 i #31 wykonano według polecenia właściciela.

## 8. Sekrety

Nie odczytano ani nie zapisano sekretów lub wartości zmiennych środowiskowych.

## 9. Sprzeczności i otwarte pytania

D12 pozostaje decyzją właściciela przed udostępnieniem wyników dodatkowym użytkownikom. Próba z danymi z portali ma potwierdzić bieżące odpowiedzi i realny zakres wyników przy powtarzającej się nazwie.

## 10. Test ręczny dla właściciela

1. Otwórz [podgląd Ofert na danych przykładowych](http://localhost:8084/?oferty=demo#/oferty). Wpisz **Olsztyn**, wybierz podpowiedź i uruchom wyszukiwanie mieszkania z domyślną powierzchnią. Oczekiwane jest pięć wierszy i informacja o braku wyników z Adresowo w tym wyszukiwaniu.
2. Posortuj wyniki po cenie za m², zaznacz dwie oferty, wpisz cenę i powierzchnię własnej nieruchomości. Sprawdź średnią, różnicę i pobierz XLSX. Otwórz arkusz i sprawdź dwa wybrane wiersze i typ komórek z ceną.
3. Wpisz **Testowo** i od razu uruchom wyszukiwanie. Wybierz jedną z dwóch podpowiedzi. Zmień rodzaj na **Działka**, wybierz przedział i promień. Sprawdź komunikat o powtarzającej się nazwie.
4. Otwórz [podgląd z istniejącym API](http://localhost:8084/#/oferty). Wybierz tę samą miejscowość, typ, powierzchnię i promień co w starym froncie. Porównaj podpowiedź, listę portali, duplikaty i przykładowe oferty. Przy różnicy zapisz typ, filtry, portal i widoczne komunikaty. Wyniki portali mogą zmienić się pomiędzy wywołaniami.

W razie zamknięcia serwera uruchom z katalogu projektu `node scripts/serve.mjs --port 8084`, a następnie otwórz jeden z powyższych adresów.

## 11. Proponowany następny krok

Odbiór M6 i decyzja o scaleniu. Po zatwierdzeniu rozpocząć M7 Podobne. Szacunkowy postęp całego projektu to **55% wykonane i 45% pozostało**.
