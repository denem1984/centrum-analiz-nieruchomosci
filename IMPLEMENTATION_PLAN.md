# IMPLEMENTATION_PLAN.md — plan M0–M10

**Status:** plan realizacji samodzielnej aplikacji. M0 jest zakresem bieżącego zadania. Każde twierdzenie o produkcji należy oznaczać [FAKT] albo [HIP]. Repozytoria pięciu istniejących aplikacji pozostają tylko do odczytu.

## Etapy i zależności

| Etap | Zakres i zależności | Kryterium akceptacji | Główne ryzyko |
|---|---|---|---|
| **M0** | Dokumentacja i zasady pracy. Bez kodu aplikacji. | Dokumenty opisują architekturę samodzielnej aplikacji, zakazy, plan i checklistę M1; skaner sekretów przechodzi pozytywny i negatywny przypadek. | Sprzeczności ze starszymi dokumentami; nie dopisywać niepotwierdzonych faktów. |
| **M1** | Pomiary wyłącznie do odczytu: CORS i preflight czterech API, zimny/ciepły start, D1, D2, D9 i punkt wejścia Ofert. Właściciel zapisuje SHA wdrożonych commitów przez odczyt z panelu. Wyniki do CONFIG.md. Zależność: M0. | Zapisano wyniki wraz ze źródłem, czasem i oznaczeniem [FAKT]/[HIP]; nie wykonano operacji zmieniających konfigurację ani dane. | Usługa może nie odpowiadać, a preflight może różnić się od zwykłego GET. |
| **M2** | Szkielet nowej aplikacji: struktura, build, lint i testy; bez wdrożenia. Zależność: M1. | Czysty checkout buduje się, lint przechodzi, minimalne testy przechodzą; brak połączeń z backendami w szkielecie. | Wybór technologii może zwiększyć utrzymanie lub utrudnić natywne zakładki. |
| **M3** | DenemContext v1 i wspólne wyszukiwanie lokalizacji TERYT/SIMC. Zależność: M2; korzysta z wyników D2 z M1. | Testy kodowania, dekodowania i błędnych danych; wyszukiwanie rozróżnia miejscowości i przekazuje poprawne kody. | Niepełne dane lokalizacyjne lub różne znaczenie pól w API. |
| **M4** | Moduł Działki jako natywna zakładka wywołująca istniejące API. Zależność: M3. Przed rozpoczęciem M4 właściciel zapisuje baseline wyników macierzy regresji według `docs/regression-baseline-template.md`. | Podstawowy przepływ działki działa w zakładce i obsługuje kontekst; właściciel zaliczył macierz regresji względem zapisanego przed M4 baseline. | CORS, format geometrii i zachowanie istniejącego API. |
| **M5** | Moduł RCN jako natywna zakładka wywołująca istniejące API. Zależność: M3. | Wyszukiwanie i podstawowe statystyki działają dla przekazanego kontekstu; wyniki zgadzają się z macierzą regresji. | Różny tryb źródła danych lub czas odpowiedzi. |
| **M6** | Moduł Oferty jako natywna zakładka wywołująca istniejące API. Zależność: M3 i potwierdzenie punktu wejścia w M1. | Wyszukiwanie korzysta z potwierdzonego API i kontekstu lokalizacji; podstawowe scenariusze z macierzy regresji działają. | Zmienność odpowiedzi portali i niepotwierdzony sposób uruchamiania usługi. |
| **M7** | Moduł Podobne jako natywna zakładka wywołująca istniejące API. Zależność: M3. | Można wprowadzić lub przekazać nieruchomość analizowaną i zobaczyć wyniki modułu; scenariusz regresji działa. | Dane porównawcze mogą wymagać ręcznego uzupełnienia. |
| **M8** | Moduł Gminy. Wymaga decyzji właściciela o logowaniu/dostępie (D5, D8) oraz potwierdzenia D9. Zależność: M3. | Gmina z TERYT wskazuje właściwą jednostkę BDL; dostęp i zachowanie modułu spełniają decyzję właściciela. | Brak mapowania BDL ↔ TERYT albo niezamknięta decyzja o dostępie. |
| **M9** | Widoki zbiorcze i raport. Zależność: M4–M8; zakres raportu D10 ustalony przed pracą. | Zestawienia są zgodne z wartościami modułów źródłowych; raport odtwarza widoczne wyniki i obsługuje brak danych jednego źródła. | Różne definicje, okresy lub kompletność danych między źródłami. |
| **M10** | Podgląd wdrożeniowy i odbiór. Zależność: M9. | Właściciel odbiera działający podgląd, macierz regresji i instrukcję uruchomienia; ewentualne wdrożenie wymaga osobnej zgody właściciela. | Różnice między lokalnym buildem a środowiskiem podglądowym. |

M1 jest pomiarem tylko do odczytu. Wartości sekretów nie są odczytywane ani zapisywane. Właściciel odczytuje w M1 niesekretną wartość RCN_DATA_SOURCE, aby zamknąć D1. M0 nie wykonuje żadnych czynności na usługach zewnętrznych.

## Zakres pomiarów M1

- Zmierzyć CORS oraz odpowiedź na OPTIONS z nagłówkiem Authorization dla backendów RCN, Ofert, Działek i Podobnych z origin spoza ich domen.
- Zmierzyć zimny i ciepły start; zapisać metodę, czas i oznaczenie [FAKT]/[HIP].
- Sprawdzić dostępność słownika TERYT/SIMC i jego pola potrzebne dla wspólnego wyszukiwania (D2).
- Potwierdzić mapowanie BDL ↔ TERYT potrzebne przed M8 (D9).
- Sprawdzić w kodzie punkt wejścia Ofert i rozbieżność opisaną w AUDIT.md.
- Sprawdzić wyłącznie przez odczyt kodu rcn-web-app, czy frontend wywołuje data_source_refresh lub trasy admin/debug.
- Właściciel odczytuje niesekretną wartość RCN_DATA_SOURCE. Status RCN_ADMIN_TOKEN jest osobną pozycją checklisty i jest zapisywany tylko jako ustawiony / nieustawiony / nieznany, bez komentarza o skutkach.
- Zapisać wyniki i źródła w CONFIG.md. Nie odczytywać wartości sekretów ani nie wykonywać zmian konfiguracji.

## Macierz testów regresyjnych

Właściciel wykonuje testy ręczne przed i po odpowiednich etapach. Do macierzy można dodać przypadki, nie usuwając istniejących bez decyzji kierownika.

| Moduł | Przypadek | Oczekiwanie |
|---|---|---|
| RCN | Lokale, Olsztyn (gmina miejska) | wyniki, statystyki i eksport XLSX |
| RCN | Lokale, Pisz, Biała Piska, Piecki (gminy wieloosadnicze) | tylko transakcje z wybranej miejscowości |
| RCN | grunt niezabudowany, polygon i promień | jakość ceny/m² oznaczona |
| Oferty | Olsztyn, Pisz, dom i działka, tolerancja 10% | oferty z co najmniej jednego portalu; błąd jednego portalu nie blokuje reszty |
| Oferty | resolve-location dla miejscowości spoza listy awaryjnej | poprawny TERYT/SIMC |
| Działki | działka w powiecie piskim, gmina Pisz, obręb Łupki | etykiety numerów działek widoczne; MPZP/POG się ładują |
| Działki | raport PDF | plik generuje się |
| Podobne | 1 analizowana i 3 podobne (adres i działka) | markery i linie na mapie |
| Gminy | gmina docelowa, zakres kraj / województwo, 3 profile | ranking i PDF |
| Wszystkie | wejście bez kontekstu | zachowanie zgodne z kryterium danego modułu |

Testy ręczne wykonuje właściciel. Automatyczne testy nowej aplikacji rozwijane są od M2. D6 dotyczy zakresu automatyzacji; nie oznacza testowania ani modyfikowania backendów źródłowych.
