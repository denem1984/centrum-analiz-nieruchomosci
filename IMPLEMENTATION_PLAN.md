# IMPLEMENTATION_PLAN.md — plan M0–M10

**Stan na 2026-11-28.** Działki mają pomiary, niezależny panel i raport PDF M4f. Słowniki M3b i RCN M5 zatwierdzono i scalono. Oferty M6 są gotowe do odbioru lokalnego. [Stan projektu i testy](docs/PROJECT_STATE.md).

## Kolejność dalszej realizacji

**Dodatkowy plan właściciela z 2026-11-27:** po bieżącej implementacji M4d.2 przeanalizować i wskazać aktualniejszy podkład niż obecne Esri. Porównać datę zdjęcia w danym miejscu, szczegółowość obrazu, pokrycie i warunki użycia (także aktualną ortofotomapę). Nie przerywać obecnej pracy; nie usuwać istniejących opcji. Szczegółowe kryteria i kolejność w PROJECT_STATE.md. Nie uznawać hipotezy o nieaktualności Esri za potwierdzoną bez daty zobrazowania.

Plan M4b.4 i przegląd oficjalnych źródeł: [docs/imagery-freshness-plan.md](docs/imagery-freshness-plan.md). Kandydat: aktualna ortofotomapa GUGiK z metadanymi; rekomendacja domyślnego źródła dopiero po porównaniu dat i szczegółu. To zaplanowane rozszerzenie, nie wykonana zamiana podkładu.

M4d.2 → M4d.3 → M4e → M4f → M3b (słowniki) → M5–M8 (moduły) → M3c (wspólne wyszukiwanie w Start, D39) → M9 (w tym RCN z opcjonalną analizą Ofert) → M10. Osobne PR-y dla podetapów. Przed M8 spróbować odtworzyć plik wskaźników z publicznego BDL. D5 ustala aplikację bez logowania.

M3c według D39 obejmuje formularz i mapę Startu, wspólną lokalizację jednostki, adresu lub działki, zachowanie odnośników v1 i podłączenie modułów. Kryterium odbioru to jedno wyszukanie, po którym RCN, Oferty, Działki, Podobne i Gminy użyją potrzebnych im pól. Test powinien objąć powtarzalne nazwy, brak wymaganego pola oraz zmianę lokalizacji po wykonaniu analizy. [Projekt formularza](docs/shared-location-start.md).

D30 wymaga podsumowania, lokalnego podglądu, estymacji i akceptacji po większych etapach. D31 pomija rodzinę działek opartą na wspólnym numerze. D32 ustala wykorzystanie obecnego kodu i danych RCN z R2, z poprawkami prezentacji. Raporty AI (D29) mają czytać mapę i internet oraz redagować tekst bez sekcji źródeł. [Analiza możliwości](docs/ai-reports-feasibility.md).

## Etapy i zależności

| Etap | Zakres i zależności | Kryterium akceptacji | Główne ryzyko |
|---|---|---|---|
| **M0** | **Wykonane.** Dokumentacja, zasady i skaner sekretów. | Dokumenty opisują architekturę samodzielnej aplikacji, zakazy, plan i checklistę M1; skaner przechodzi pozytywne i negatywne przypadki. | Sprzeczności ze starszymi dokumentami; nie dopisywać niepotwierdzonych faktów. |
| **M1** | **Wykonane warunkowo.** Pomiary odczytowe CORS, dwóch czasów, D1, SHA, punkt wejścia Ofert i przegląd kodu. D2 i D9 pozostają otwarte i przechodzą do M3b/M8 po dostarczeniu plików przez właściciela. | Wyniki potwierdzone w CONFIG.md i reports; nie wykonano zmian konfiguracji ani danych. | Niepełne źródła TERC/SIMC i próbka zamiast pełnego eksportu gmin. |
| **M2** | **Wykonane.** Statyczna powłoka z natywnymi zakładkami, makietami, kartami zdrowia, serwerem lokalnym i testami Node. Bez build, lint ani zależności npm. Lekkie health-checki to GET-y z allowlisty. Zależność: M1. | Router, rejestr, health-checki, zgodność z allowlistą i path traversal są testowane przez `node --test`; lokalny podgląd działa. | CORS lub czas odpowiedzi mogą uniemożliwić odczyt stanu usługi. |
| **M3a** | **Wykonane.** DenemContext v1, pamięciowy magazyn, pasek lokalizacji i wyszukiwanie na jawnie fikcyjnych danych. Zależność: M2; bez prawdziwego słownika. | Testy walidacji, kodowania/dekodowania, routera i fikstur; wybór rozróżnia powtarzalne nazwy. | Kontrakt użycia pól przez istniejące API wymaga potwierdzenia w M4–M8. |
| **M3b** | Weryfikacja pełnych katalogów TERC, SIMC i ULIC z archiwum GUS oraz publicznego BDL wykonana. [Raport i podgląd lokalny](reports/m3b-location-dictionaries.md). | Zgodność relacji, identyfikatory z zerami wiodącymi, powtarzalne nazwy, połączenie 2479 gmin i zachowanie dotychczasowego kontekstu. | Archiwum ma datę 2026-07-17. Przy M8 sprawdzić okres oraz pokrycie faktycznego pliku wskaźników. |
| **M4** | **M4a:** analiza i plan portu w PR #8; wykonane po scaleniu. **M4b:** mapa, podkłady i stan usługi — wykonane; baseline D2 zapisany przez właściciela 2026-11-01. **M4b.1:** parametry archiwalnego WMS dopasowane do publicznego frontu; browser-smoke i testy offline są dostępne. **M4b.2:** pomiar K0–K3 wykonany; K0 zachowano jako domyślny po wyniku bez istotnej poprawy. **M4b.3 — backlog:** niezawodność ortofotomapy: limit czasu na kafelek, kafelki 512 px; powód: 67/144 żądań WMS bez odpowiedzi w 35 s. **M4c/M4c.1:** implementacja scalona w PR #10; porównanie baseline po zmianach pozostaje do wykonania przez właściciela. **M4d.1 (scalone, PR #12):** grupa EGiB, zaznaczanie działek kliknięciem, popupy i układ panelu „3. Warstwy mapy”. **M4d.2:** Planowanie przestrzenne. **M4d.3:** Inwestycje i zagrożenia oraz Infrastruktura i własność. Baseline właściciel zapisuje osobno przed każdym podetapem: M4b→D2; M4c→D1; M4d→D4, D5, D6; M4e→D3; M4f→D7. D6 i decyzje z reports/m4a-dzialki-analysis.md stosuje się przed zależnymi pracami. | M4b: wybór podkładu, lata archiwum, zoom, atrybucja i cleanup mapy działają. M4c/M4c.1: formularz prowadzi przez powiat, gminę, obręb i numer; wynik ma obrys, popup, raport EGiB, kontekst i zachowuje stan; wszystkie nowe URL-e są porównane ze starym frontem i testowane. M4d.1: panel EGiB, przełączanie wielu działek, popup i porównanie każdego URL-a ze starym frontem; browser-smoke oraz test startowy z atrapą DOM/fetch. Każdy interfejsowy podetap ma test startowy z atrapą DOM/fetch; właściciel porównuje przypisane baseline przed i po podetapie. | Dostępność podkładów, PRG/ULDK i KIEG; różnice odpowiedzi należy sprawdzić przez browser-smoke; identyfikatory muszą pozostać zgodne z DenemContext i cyklem życia listy PDF. |
| **M5** | Pełny moduł RCN: trzy typy nieruchomości, wszystkie filtry i tryby przestrzenne, statystyki, podobne, mapa, wykresy, tabela i eksporty. Zależność: M3b. | Wszystkie opcje zinwentaryzowanego frontu są odwzorowane i sprawdzone; samo wyszukiwanie i podstawowe statystyki nie wystarczają. Plan podetapów w PROJECT_STATE.md. | Różny tryb źródła danych lub czas odpowiedzi; eksporty starego frontu używają POST, obecna zgoda sieciowa obejmuje GET. |
| **M6** | Natywna zakładka Oferty z własnym formularzem, kalkulatorem i XLSX. [Raport i próba ręczna](reports/m6-oferty.md). | Test klienta porównuje adresy z istniejącym API. Test z atrapą DOM i Edge sprawdza wyniki, wybór ofert, porównanie i plik XLSX. | Odpowiedzi portali, zasięg geograficzny i zgodność wyników ze starym frontem pozostają do próby właściciela. D12 przed udostępnieniem dodatkowym użytkownikom. |
| **M7** | Moduł Podobne jako natywna zakładka wywołująca istniejące API. Zależność: M3. | Można wprowadzić lub przekazać nieruchomość analizowaną i zobaczyć wyniki modułu; scenariusz regresji działa. | Dane porównawcze mogą wymagać ręcznego uzupełnienia. |
| **M8** | Gminy z plikiem danych (opcja B); bez Supabase i bez logowania (ostateczna D5). Agent próbuje odtworzyć dane z publicznego BDL; eksport właściciela jest wariantem awaryjnym. D9 musi być zwalidowane. Zależność: M3b. | Wszystkie filtry, profile, ranking, objaśnienia, porównania i PDF mają parytet; TERC wskazuje właściwą jednostkę BDL. | Brak pełnych wskaźników i lat lub niepotwierdzone mapowanie D9. |
| **M9** | Raport RCN z opcją dołączenia Ofert oraz widoki zbiorcze. Zależność od M3c i modułów źródłowych. Pozostały zakres D10 do ustalenia przed pracą. | RCN i Oferty są powiązane z tą samą lokalizacją. W raporcie widać osobne ceny transakcyjne i ofertowe, liczebności prób oraz filtry. Generowanie raportu RCN działa także przy pominięciu Ofert. | Różne zasięgi, okresy i kompletność danych. Zakres załącznika do ustalenia w M9, D12 przed szerszym udostępnieniem. |
| **M10** | Podgląd wdrożeniowy i odbiór. Zależność: M9. | Właściciel odbiera działający podgląd, macierz regresji i instrukcję uruchomienia; ewentualne wdrożenie wymaga osobnej zgody właściciela. | Różnice między lokalnym buildem a środowiskiem podglądowym. |

M1 jest pomiarem tylko do odczytu. Wartości sekretów nie są odczytywane ani zapisywane. Właściciel odczytuje w M1 niesekretną wartość źródło danych RCN, aby zamknąć D1. M0 nie wykonuje żadnych czynności na usługach zewnętrznych.

## M4b.2 — wynik pomiaru niezawodności ortofotomapy (2026-11-03)

Skorygowany przebieg browser-smoke wykonał po trzy wczytania K0–K3 po 35 s w stałym widoku Piły przy zoomie 17,6. Mediany końcowej frakcji wyniosły: K0 75,0%, K1 66,7%, K2 50,0%, K3 33,3%; wszystkie wysłały po 36 żądań GetMap. Żadna konfiguracja K1–K3 nie spełniła kryterium poprawy co najmniej 10 p.p. w dwóch z trzech porównywanych wczytań, więc parametry K0 pozostały domyślne. Spośród 144 żądań GetMap 77 uzyskało HTTP 200 `image/png`, a 67 nie otrzymało statusu HTTP w 35 s; nie zarejestrowano błędów kafelków ani ponowień. Dwa przebiegi eksperymentu wysłały łącznie 288 żądań wobec limitu 800. Szczegóły i ograniczenia pomiaru: `docs/dzialki-module.md` oraz D20 w `DECISIONS.md`.

## Zakres pomiarów M1

- Zmierzyć CORS oraz odpowiedź na OPTIONS z nagłówkiem Authorization dla backendów RCN, Ofert, Działek i Podobnych z origin spoza ich domen.
- Zmierzyć zimny i ciepły start; zapisać metodę, czas i oznaczenie [FAKT]/[HIP].
- D2 pozostaje otwarte; właściciel dostarcza pliki TERC/SIMC z GUS do analizy i testów w M3.
- D9 pozostaje otwarte; w M3b/M8 zweryfikować mapowanie na podstawie pełnego eksportu gmin oraz plików TERC/SIMC od właściciela.
- Sprawdzić w kodzie punkt wejścia Ofert i rozbieżność opisaną w AUDIT.md.
- Sprawdzić wyłącznie przez odczyt kodu rcn-web-app, czy frontend wywołuje data_source_refresh lub trasy admin/debug.
- Właściciel odczytuje niesekretną wartość źródło danych RCN. Status token administratora jest osobną pozycją checklisty i jest zapisywany tylko jako ustawiony / nieustawiony / nieznany, bez komentarza o skutkach.
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



