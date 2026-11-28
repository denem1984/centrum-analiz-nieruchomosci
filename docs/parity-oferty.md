# Oferty w starym froncie i w Centrum

[FAKT z kodu] Porównanie wykorzystuje rewizję `596451bae3af76790c0b96b0c5927191ced7add8` repozytorium źródłowego. Punktem odniesienia jest front składany przez `node server.js`. Wiersz 11 dołącza skrypty wyboru miejscowości, wyboru ofert, eksportu i kalkulatora do oryginalnego HTML. Punkt wejścia został zapisany w CONFIG.md podczas M1. [Kod źródłowy](https://github.com/denem1984/Analizator-cen-ofertowych/tree/596451bae3af76790c0b96b0c5927191ced7add8)

## Żądania HTTP

Wszystkie trzy żądania z Centrum to GET do istniejącego hosta Ofert. `client.js` koduje wartości przez `encodeURIComponent` i zachowuje puste parametry oraz zera wiodące. Powierzchnia jest w m², promień w km. Front nie przesyła współrzędnych.

| Operacja | Stary front | Centrum i dowód |
|---|---|---|
| Podpowiedzi | `/api/location-suggestions?q=…`. `index.html:87` oraz skrypt wyboru miejscowości wstrzykiwany w `server.js:11` | Ta sama ścieżka i parametr. Test klienta i przechwycony URL w Edge. |
| Potwierdzenie | `/api/resolve-location?location=…&teryt=…&simc=…`. `index.html:88–91` oraz `server.js:11` | Ta sama ścieżka i kolejność parametrów. Test kodów z zerami wiodącymi i wykrycia innego SIMC w odpowiedzi. |
| Pobranie wyników | `/api/live/combined?location=…&teryt=…&simc=…&area=…&tolerance=…&radius=…&propertyType=…`. `index.html:84–91`, `server.js:12–16` | Ta sama ścieżka, kolejność, kodowanie i rodzaje. Tryb bez filtra zachowuje `area=100&tolerance=9999`, przedział używa środka i połowy szerokości w procentach. Test URL-i także dla `działka` i `Nieruchomość komercyjna`. |
| Pobranie XLSX | `excel-export-patch.html` dołączany przez `server.js:11`, plik tworzony w przeglądarce | Plik tworzony w przeglądarce i pobierany z zaznaczonych wierszy. Lokalna biblioteka SheetJS z SRI i licencją Apache 2.0. Test ponownie odczytuje plik. [Dokumentacja biblioteki](https://docs.sheetjs.com/docs/getting-started/installation/standalone/) |

## Funkcje

| Funkcja | Stary front | Centrum |
|---|---|---|
| Formularz | `index.html:73–74`, cztery typy, promień, procent od 10% do 50%, przedział lub bez filtra | Samodzielny formularz zakładki, te same typy i filtry. Walidacja przedziału oraz potwierdzenie powtarzalnej nazwy przed wyszukaniem. |
| Wyniki | `index.html:84–91`, po filtrze, duplikaty i przyjęte, statusy portali, zasięg, tabela, linki | Liczniki i deduplikacja z istniejącej odpowiedzi. Sortowanie wszystkich kolumn z brakami na końcu. Pokazuje błędy portali i ograniczony zasięg. |
| Selekcja i kalkulator | `ui-patch.html`, `comparison-calc-fix.html`, `excel-export-patch.html` | Wybór i usuwanie z tabeli. Średnia dodatnich cen za m² z wybranych ofert oraz różnica procentowa stawki własnej nieruchomości. XLSX zachowuje typy liczb i polskie znaki. |
| Oczekiwanie i błędy | Front wyświetla postęp i status komunikacji | Licznik czasu, anulowanie, komunikat błędu całego wyszukiwania i osobny komunikat częściowego braku danych. Sprawdzono w Edge na atrapach. |

## Rozróżnianie miejscowości

[FAKT z kodu] Nowy front przekazuje TERYT i SIMC również dla domów, działek i nieruchomości komercyjnych. W starym serwerze ścieżka mieszkań przekazuje oba kody do `combined-apartment-diagnostics`. `compat-server.js:4,15` sprowadza zapytanie domów i nieruchomości komercyjnych do nazwy miejscowości i filtrów. Ścieżka działek przekazuje TERYT do funkcji bazowej w `server.js:15`, a plik `live-combined-api-v05.js` nie odczytuje tego parametru. Centrum ostrzega, gdy podpowiedzi zwrócą powtarzającą się nazwę, a wynik dotyczy jednego z tych trzech typów. [Punkt wejścia źródła](https://github.com/denem1984/Analizator-cen-ofertowych/blob/596451bae3af76790c0b96b0c5927191ced7add8/server.js)

Przechwycone żądania potwierdzają kontrakt klienta. Porównanie rzeczywistych odpowiedzi, zasięgu i świeżości ofert obejmuje próbę właściciela. [Scenariusz odbioru](../reports/m6-oferty.md#10-test-ręczny-dla-właściciela)
