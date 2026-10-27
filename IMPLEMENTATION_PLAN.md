# IMPLEMENTATION_PLAN.md — plan M0–M10

**Status na 2026-10-27:** M0 wykonane; M1 wykonane warunkowo, D2/D9 pozostają otwarte i wracają w M3/M8; M2 w trakcie. Każde twierdzenie o produkcji należy oznaczać [FAKT] albo [HIP]. Pięć repozytoriów źródłowych pozostaje tylko do odczytu.

## Etapy i zależności

| Etap | Zakres i zależności | Kryterium akceptacji | Główne ryzyko |
|---|---|---|---|
| **M0** | **Wykonane.** Dokumentacja, zasady i skaner sekretów. | Dokumenty opisują architekturę samodzielnej aplikacji, zakazy, plan i checklistę M1; skaner przechodzi pozytywne i negatywne przypadki. | Sprzeczności ze starszymi dokumentami; nie dopisywać niepotwierdzonych faktów. |
| **M1** | **Wykonane warunkowo.** Pomiary odczytowe CORS, dwóch czasów, D1, SHA, punkt wejścia Ofert i przegląd kodu. D2 i D9 pozostają otwarte i przechodzą do M3/M8 po dostarczeniu plików przez właściciela. | Wyniki potwierdzone w CONFIG.md i reports; nie wykonano zmian konfiguracji ani danych. | Niepełne źródła TERC/SIMC i próbka zamiast pełnego eksportu gmin. |
| **M2** | **W trakcie.** Statyczna powłoka z natywnymi zakładkami, makietami, kartami zdrowia, serwerem lokalnym i testami Node. Bez build, lint ani zależności npm. Lekkie health-checki to GET-y z allowlisty. Zależność: M1. | Router, rejestr, health-checki, zgodność z allowlistą i path traversal są testowane przez `node --test`; lokalny podgląd działa. | CORS lub czas odpowiedzi mogą uniemożliwić odczyt stanu usługi. |
| **M3** | DenemContext v1 i wspólne wyszukiwanie lokalizacji TERYT/SIMC. Zależność: M2. Właściciel dostarcza pliki TERC/SIMC z GUS do ponownej oceny D2 i walidacji kandydatów D9. | Testy kodowania, dekodowania i błędnych danych; wyszukiwanie rozróżnia miejscowości i przekazuje poprawne kody. | Niepełne dane lokalizacyjne lub różne znaczenie pól w API. |
| **M4** | Moduł Działki jako natywna zakładka wywołująca istniejące API. Zależność: M3. Przed rozpoczęciem M4 właściciel zapisuje baseline wyników macierzy regresji według `docs/regression-baseline-template.md`. | Podstawowy przepływ działki działa w zakładce i obsługuje kontekst; właściciel zaliczył macierz regresji względem zapisanego przed M4 baseline. | CORS, format geometrii i zachowanie istniejącego API. |
| **M5** | Moduł RCN jako natywna zakładka wywołująca istniejące API. Zależność: M3. | Wyszukiwanie i podstawowe statystyki działają dla przekazanego kontekstu; wyniki zgadzają się z macierzą regresji. | Różny tryb źródła danych lub czas odpowiedzi. |
| **M6** | Moduł Oferty jako natywna zakładka wywołująca istniejące API. Zależność: M3 i potwierdzenie punktu wejścia w M1. | Wyszukiwanie korzysta z potwierdzonego API i kontekstu lokalizacji; podstawowe scenariusze z macierzy regresji działają. | Zmienność odpowiedzi portali i niepotwierdzony sposób uruchamiania usługi. Produkcja uruchamia `node server.js`, który nie ładuje `regional-fetch-bootstrap.js`; zachowanie Ofert do porównania w M6 i baseline należy brać z produkcji, nie z `npm start` [FAKT z kodu, patrz reports/m1a-code-review.md C1]. |
| **M7** | Moduł Podobne jako natywna zakładka wywołująca istniejące API. Zależność: M3. | Można wprowadzić lub przekazać nieruchomość analizowaną i zobaczyć wyniki modułu; scenariusz regresji działa. | Dane porównawcze mogą wymagać ręcznego uzupełnienia. |
| **M8** | Moduł Gminy z plikiem danych (opcja B); bez zależności od Supabase i logowania modułu. Właściciel dostarcza pełny eksport gmin; D9 musi być zwalidowane. D5 dotyczące logowania całej aplikacji rozstrzyga się przed M8. Zależność: M3. | Gmina z TERYT wskazuje właściwą jednostkę BDL; sposób dostępu do całej aplikacji spełnia decyzję właściciela. | Brak mapowania BDL ↔ TERYT albo niezamknięta decyzja D5. |
| **M9** | Widoki zbiorcze i raport. Zależność: M4–M8; zakres raportu D10 ustalony przed pracą. | Zestawienia są zgodne z wartościami modułów źródłowych; raport odtwarza widoczne wyniki i obsługuje brak danych jednego źródła. | Różne definicje, okresy lub kompletność danych między źródłami. |
| **M10** | Podgląd wdrożeniowy i odbiór. Zależność: M9. | Właściciel odbiera działający podgląd, macierz regresji i instrukcję uruchomienia; ewentualne wdrożenie wymaga osobnej zgody właściciela. | Różnice między lokalnym buildem a środowiskiem podglądowym. |

M1 jest pomiarem tylko do odczytu. Wartości sekretów nie są odczytywane ani zapisywane. Właściciel odczytuje w M1 niesekretną wartość RCN_DATA_SOURCE, aby zamknąć D1. M0 nie wykonuje żadnych czynności na usługach zewnętrznych.

## Zakres pomiarów M1

- Zmierzyć CORS oraz odpowiedź na OPTIONS z nagłówkiem Authorization dla backendów RCN, Ofert, Działek i Podobnych z origin spoza ich domen.
- Zmierzyć zimny i ciepły start; zapisać metodę, czas i oznaczenie [FAKT]/[HIP].
- D2 pozostaje otwarte; właściciel dostarcza pliki TERC/SIMC z GUS do analizy i testów w M3.
- D9 pozostaje otwarte; w M3/M8 zweryfikować mapowanie na podstawie pełnego eksportu gmin oraz plików TERC/SIMC od właściciela.
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
