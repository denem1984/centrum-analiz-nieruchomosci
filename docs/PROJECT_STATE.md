# Stan projektu — Centrum Analiz Nieruchomości

Aktualizacja: 2026-11-28. Bieżące źródło stanu i kolejki akceptacji; starsze raporty są dowodami historycznymi, nie bieżącą listą wykonanych funkcji.

## Obecnie: M5 — moduł RCN

RCN ma natywną zakładkę z istniejącymi formularzami, obliczeniami i eksportami oraz z dotychczasowym API obsługującym źródło R2. [Podgląd RCN na danych przykładowych](http://localhost:8083/?rcn=demo#/rcn), [tryb danych RCN](http://localhost:8083/#/rcn), [test odbioru](../reports/m5-rcn.md) i [macierz parytetu](parity-rcn.md). Kolejka akceptacji obejmuje [PR #30](https://github.com/denem1984/centrum-analiz-nieruchomosci/pull/30) i odbiór właściciela, w tym odpowiedź API, poligon w przeglądarce oraz zawartość eksportów. M6 czeka na zatwierdzenie.

D37 zatwierdzono i scalono w [PR #28](https://github.com/denem1984/centrum-analiz-nieruchomosci/pull/28) jako `5ea366c`. [Raport poprawek Działek](../reports/dzialki-planning-presentation.md).

M3b potwierdził relacje pełnych katalogów TERC, SIMC, ULIC i pokrycie 2479 gmin w publicznym BDL. Właściciel zatwierdził [PR #29](https://github.com/denem1984/centrum-analiz-nieruchomosci/pull/29), scalony jako `bd5ead3`. [Podgląd słowników](http://localhost:8082/.local/m3b/index.html) i [raport M3b](../reports/m3b-location-dictionaries.md).

Właściciel zatwierdził M4f i samodzielne scalenie po testach dla [PR #27](https://github.com/denem1984/centrum-analiz-nieruchomosci/pull/27). Lista działek i widoków mapy, edycja listy i PDF są dostępne w podglądzie 8082. [Raport M4f](../reports/m4f-report-pdf.md). D35 przywraca własne wyszukiwanie lokalizacji w każdym module.

### Historia M4e i poprawki przewijania

Dostawa poprawki: [PR #26](https://github.com/denem1984/centrum-analiz-nieruchomosci/pull/26), `fix/map-panel-scroll`, implementacja `3049421`. Podgląd 8082 przełączono do tej rewizji i potwierdzono HTTP 200 zmienionych zasobów. Końcowy stan merge i SHA w PR; kod podglądu jest taki sam jak w dostawie, późniejsze metadane nie zmieniają UI.

Aktualizacja po uwagach właściciela 2026-11-28 (D34): panel Działek przewija się niezależnie od mapy, również przy jego końcu; na telefonie mapa jest nad panelem. Linie zabudowy zostają po potwierdzeniu rzeczywistych nieprzekraczalnych linii w KIMPZP przy dużym zbliżeniu. 156 testów PASS i końcowy headed smoke 20/20 PASS; dotychczasowe adresy usług bez zmian. [Raport poprawki](../reports/map-panel-scroll.md), [scenariusz i ograniczenia](map-panel-scroll.md). Gałąź `fix/map-panel-scroll`, baza main po scalonym #25 (`4c445b9`); PR i SHA implementacji podaje raport. Agent scala po zielonym CI zgodnie z D33. Podgląd nadal na porcie 8082, aktualizowany do zapisanej poprawki; odświeżyć Ctrl+F5. Postęp bez zmiany: około 31% / 69%. M4f nadal czeka na akceptację kontynuacji.

Właściciel polecił 2026-11-28 „Kontynuuj. I rób sam to merge”. PR-y #13–#24 scalono kolejno do main po zielonych kontrolach; main `0fb6a8f` ma CI push SUCCESS. D33 zezwala na samodzielne merge, bez wdrażania. Ukończono M4e.2: odległość, pole i pełny obwód, menu miejsca i odnośnik Street View. 155 testów PASS i headed Edge offline/mobile 9/9 PASS; PNG obejrzane. Po tym etapie praca zatrzymana do akceptacji kontynuacji M4f.

D30 wymaga wyraźnej akceptacji po każdym większym etapie. Scalenie potwierdza kontrolę kodu. Ręczne porównanie z baseline pozostaje częścią odbioru właściciela.

Jeśli serwer po zamknięciu komputera przestanie działać: w terminalu katalogu projektu uruchomić `node .local/preview-m4d3/scripts/serve.mjs --port 8080`, a następnie otworzyć powyższy adres. Przy zajętym porcie nie uruchamiać drugiej kopii — najpierw sprawdzić działający podgląd.

**Aktualny podgląd M4f działa pod http://localhost:8082/#/dzialki.** Wznowienie z katalogu projektu poleceniem `node .local/preview-m4e2/scripts/serve.mjs --port 8082`. Start korzysta z jawnych fikstur. Następne moduły otrzymają osobne formularze lokalizacji zgodnie z D35.

**Szacunkowo około 46% projektu wykonane, około 54% pozostało.** Port RCN dodaje dziewięć punktów. Do odbioru RCN pozostają rzeczywista odpowiedź API oraz pliki eksportów.

| Obszar | Waga w szacunku | Zrealizowana część w punktach całości |
|---|---:|---:|
| Powłoka, kontekst v1, zdrowie usług, narzędzia i porządek projektu | 10 | 9 |
| Słowniki i wspólne elementy potrzebne wyszukiwaniom modułów | 12 | 5 |
| Działki: mapa, wyszukiwanie, warstwy, narzędzia i PDF | 22 | 21 |
| RCN: adaptacja istniejącego kodu i prezentacja z obecnym R2 | 12 | 10 |
| Oferty | 9 | 0 |
| Podobne | 9 | 0 |
| Gminy i dane wskaźników | 10 | 0 |
| Raporty AI: odczyt mapy, internet, tekst i eksport | 9 | 0 |
| Raport zbiorczy, pełna regresja i odbiór wdrożenia | 4 | 0 |

Suma robocza 45/97, czyli około 46%. Przed M5 było 36/97.

Test właściciela: podgląd 8082 → Działki → wyszukać działkę lub wskazać ją przez PPM → dodać do raportu → zapisać widok mapy → zmienić zakładkę i wrócić → pobrać PDF. [Scenariusz](../reports/m4f-report-pdf.md).

## Cel i zasady odbioru

Jedna samodzielna aplikacja, poza denem.pl, łącząca Działki, RCN, Oferty, Podobne i Gminy. Każda opcja starego frontu musi mieć odpowiednik; poprawki jakości nie mogą odbierać funkcji. Kompletność i poprawność danych są ważniejsze od szybkości. Nie ogłaszamy gotowości niekompletnych wyników.

Agent wykonuje plan, implementację, testy, dokumentację i PR-y oraz sam scala sprawdzone zmiany (D33, polecenie właściciela 2026-11-28). Właściciel podejmuje decyzje produktowe, zatwierdza kontynuację po większych etapach i autoryzuje wdrożenia. Wszystkie pięć źródeł jest tylko do odczytu. Nie wykonujemy operacji zarządzania usługami ani odczytów wartości konfiguracji.

## Architektura i decyzje

- Statyczne `app/`, HTML/CSS/moduły ES; bez npm i budowania. Lokalne, przypięte biblioteki z licencjami; obecnie Leaflet 1.9.4 i testy jego SHA-256. [FAKT: `app/vendor/dzialki/README.md`, `tests/vendor-integrity.test.mjs`]
- Historyczny dostarczony HEAD nie miał `.gitattributes`; M4d.2 dodało ochronę końców linii vendor. Proj4 ma SRI; Leaflet nadal korzysta z testu integralności blobu bez SRI loadera. [FAKT: `.gitattributes`, loader Leaflet i projekcji, testy vendor]
- Router hashowy, sześć natywnych zakładek, rejestr mount/unmount i cztery równoległe sondy GET zdrowia. `DenemContext v1` zawiera osobne tekstowe kody TERC/SIMC/BDL i limit 2048 B; aktualny kształt jest w `docs/denem-context-v1.md`. Przykład w starszym MEGA_PROJECT.md nie jest kontraktem implementacji.
- Kontekst ustawia wyszukiwanie; kliknięcie działki na mapie go nie zmienia. Bez trwałego zapisu analiz; pamięć modułów znika po odświeżeniu.
- D35 (2026-11-28) zastępuje D28. Formularz wyszukiwania jest osobny dla każdego modułu. Słowniki administracyjne można współdzielić, a istniejący kontekst nadal obsługuje odnośniki.
- Backendów nie zmieniamy. Produkcyjny tryb RCN potwierdzony przez właściciela w CONFIG.md. Historyczne pomiary pierwszej odpowiedzi: 22–52 s; hipoteza zimnego startu, nie bieżący pomiar. UI ma obsługiwać do 120 s i licznik oczekiwania.
- Gminy: plik danych (opcja B), bez Supabase. D5 zamknięte: **aplikacja w ogóle nie będzie miała logowania** (właściciel, 2026-11-27). D8 nie dotyczy. Nie jest to tylko zwolnienie na pierwszy odbiór.
- Lista PDF: pamięć aplikacji między zakładkami, czyszczona przy odświeżeniu (D15). TERC7→TERYT6 jest czystą funkcją; R=4/5→3 nadal [HIP] do walidacji na pełnym TERC.

## Potwierdzony punkt startowy

- [FAKT: lokalna historia Git] `main`: `3ebed06717c1732fbb1cb996daccbef987b5d2e2`, scalony PR #12 (M4d.1).
- [FAKT: porównanie plików z HEAD] Dostarczony katalog był bez metadanych Git; odtworzono historię bez nadpisywania plików. Pliki odpowiadały HEAD.
- [FAKT: pierwszy przebieg testów] 119 testów, 117 PASS, 2 FAIL (sandbox blokuje połączenie z lokalnym serwerem: EACCES); czas 40,54 s.
- [FAKT: kod testu] Końcowa mapa w `tests/dzialki-module.test.mjs` pozostawała zamontowana. Monitor konturów utrzymywał licznik przez 40 s.
- Nie wykonywano pomiarów usług zewnętrznych ani operacji zarządzania usługami.

## Historia kolejki #13–#24

Wszystkie poniższe PR-y scalono do main 2026-11-28 po sprawdzeniu oczekiwanego SHA, zielonych check-runs i braku konfliktów. Tabela zachowuje dawne zależności, nie jest listą otwartych PR-ów. SHA merge w [raporcie](../reports/m4e2-map-tools.md).

| Kolejność | Gałąź | Zakres | Status |
|---|---|---|---|
| 1 | `fix/dzialki-test-cleanup` | Odmontowanie map po teście startowym, także przy błędzie asercji | [PR #13](https://github.com/denem1984/centrum-analiz-nieruchomosci/pull/13), 119/119 PASS, 0,69 s |
| 2 | `fix/edge-headed-cdp` | Osobny profil, port z DevToolsActivePort, lokalny sprawdzian Edge | [PR #14](https://github.com/denem1984/centrum-analiz-nieruchomosci/pull/14); baza #13 |
| 3 | `docs/handover` | Stan, zasady autonomii, aktualna D5, plan i procedury | [PR #15](https://github.com/denem1984/centrum-analiz-nieruchomosci/pull/15); baza #14 |
| 4 | `fix/smoke-task-budgets` | Trwały wspólny licznik 4/400/300, blokowanie przekroczeń | [PR #16](https://github.com/denem1984/centrum-analiz-nieruchomosci/pull/16); baza #15 |
| 5 | `feat/m4d2-planning-layers` | Pięć warstw planowania, gminny POG, popupy, monitory i smoke | [PR #17](https://github.com/denem1984/centrum-analiz-nieruchomosci/pull/17); baza #16 |
| 6 | `docs/imagery-freshness-plan` | Porównanie źródeł i plan nowszego podkładu M4b.4 | [PR #18](https://github.com/denem1984/centrum-analiz-nieruchomosci/pull/18); baza #17 |
| 7 | `fix/windows-budget-replace` | Krótkie blokady atomowego zapisu licznika na Windows | [PR #19](https://github.com/denem1984/centrum-analiz-nieruchomosci/pull/19); baza #18 |
| 8 | `feat/m4d3-risks-infrastructure` | RWDZ, ISOK, KIUT, własność i wspólne popupy | [PR #20](https://github.com/denem1984/centrum-analiz-nieruchomosci/pull/20); baza #19; 149 testów PASS |
| 9 | `docs/shared-location-start` | D28: wspólne wyszukiwanie Start i plan M3c | [PR #21](https://github.com/denem1984/centrum-analiz-nieruchomosci/pull/21); baza #20 |
| 10 | `docs/location-map-ai-reports` | Start z mapą, analiza AI, przegląd RCN, D30/D31 i estymacja | [PR #22](https://github.com/denem1984/centrum-analiz-nieruchomosci/pull/22); baza #21 |
| 11 | `feat/m4e1-parcel-appearance` | Kolory i czyszczenie zaznaczeń, bez rodziny numerów | [PR #23](https://github.com/denem1984/centrum-analiz-nieruchomosci/pull/23); baza #22; 149 testów i headed offline 8/8 PASS |

Po #23 scalono także [PR #24](https://github.com/denem1984/centrum-analiz-nieruchomosci/pull/24), `docs/agent-merge-authorization`, zapisujący D33. Dostawa M4e.2: [PR #25](https://github.com/denem1984/centrum-analiz-nieruchomosci/pull/25), `feat/m4e2-map-measurements`, baza main; implementacja `1cb6625`. Po zielonym CI agent scala sam; ostateczny status i SHA w PR. [Pełny raport](../reports/m4e2-map-tools.md). Nie uruchamia wdrożeń; po etapie czeka na akceptację M4f.

## Weryfikacja poprawki testu

[FAKT: przebieg 2026-11-27] `node --test scripts/*.test.mjs tests/*.test.mjs`: 119/119 PASS, 688,88 ms (po dopuszczeniu lokalnych połączeń testowych). Test startowy z atrapą DOM sprawdza usunięcie każdej mapy oraz odłączenie monitorów i retry; hook sprząta również przy błędzie asercji. Nie zmieniono kodu aplikacji. Początkowe skany plików i historii: PASS (78 plików, 58 commitów).

Sprawdzenie właściciela (opcjonalne dla tej poprawki): w PowerShell w folderze projektu wpisać `node --test scripts/*.test.mjs tests/*.test.mjs`; oczekiwane 119 PASS i zakończenie poniżej 5 s, bez 40-sekundowej pauzy.

## Weryfikacja poprawki Edge

[FAKT: pomiar 2026-11-27] `node scripts/browser-smoke.mjs --headed --check-browser`: PASS w rzeczywistym Edge z oknem; CDP połączyło się przez port zapisany w nowym profilu. Zrzut `browser-check.png` obejrzano; poprawny tekst PASS jest widoczny. Wyniki lokalne: `.local-results/browser-smoke-2026-11-27T19-18-25-329Z/`. Nie otwierano mapy ani usług zewnętrznych. To nie jest dowód kompletności KIEG.

`node --test --test-reporter=dot scripts/*.test.mjs tests/*.test.mjs`: PASS (123 testy). Nowe testy obejmują niepełny plik portu, zakończenie launchera, niezgodny/obcy WebSocket, błędy HTTP i limit czasu, bez sieci i rzeczywistego czekania. Instrukcja właściciela: `scripts/README-run.md`, sekcja „Sprawdzenie Edge i diagnostyka mapy”.

## Weryfikacja budżetów smoke

[FAKT: przebieg 2026-11-27] Pełne `node --test --test-reporter=tap scripts/*.test.mjs tests/*.test.mjs`: 127/127 PASS w 758,69 ms. Testy licznika sprawdzają wznowienie stanu, blokadę równoległego procesu, współbieżne rezerwacje na granicy 300/400, limit czterech startów, wspólne liczenie przekierowań i odrzucanie nieczytelnego stanu. `node --check scripts/browser-smoke.mjs`: PASS. Bez ruchu do usług. Pełny przebieg integracji licznika z prawdziwą mapą zostanie sprawdzony w M4d.2; nie wykonano go w poprawce narzędzia.

## Następna praca

1. M4d.2 jest w PR #17: 139 testów PASS, rzeczywisty smoke 11/11, offline + mobile 12/12. Szczegółowy [RAPORT](../reports/m4d2-planning.md) i instrukcja baseline pozostają do odbioru właściciela.
2. Zrealizować dodany plan nowszego podkładu: porównanie źródeł i rekomendacja, bez usuwania opcji.

Przegląd oficjalnych źródeł wskazuje aktualną ortofotomapę GUGiK jako głównego kandydata [HIP do porównania dat w danym miejscu]. [Plan M4b.4, źródła i kryteria](imagery-freshness-plan.md) rozróżnia datę zdjęcia, publikację serwisu i rozdzielczość. Nie zmieniono jeszcze podkładu i nie wykonano dodatkowego ruchu mapowego.
3. Po akceptacji M4e.2 kontynuować M4f, następnie M3b i dalszą roadmapę; każdy podetap osobnym PR, samodzielne merge po kontrolach D33, bez wdrożeń.

## Roadmapa i warunki zakończenia

| Etap | Stan i następna dostawa | Kryterium |
|---|---|---|
| M0/M1 | W `main`; D2 i D9 nadal otwarte | Nie uznawać próbek za pełne potwierdzenie |
| M2/M3a | Powłoka i fikcyjny słownik w `main` | Nadal jawne oznaczenie danych testowych |
| M4a–M4c | Analiza, mapa i wyszukiwanie w `main` | Porównanie z baseline właściciela nie jest domyślnie zaliczone |
| M4d.1 | EGiB, zaznaczanie, popupy i monitor w `main`, PR #12 | Zewnętrzna kompletność KIEG pozostaje ograniczeniem pomiarów |
| M4d.2 | Scalone do main w #17: pięć warstw, gminny POG i monitory | Testy i punktowe smoke opisane w `docs/dzialki-planning.md`; odbiór baseline właściciela pozostaje |
| M4d.3 | Scalone do main w #20: RWDZ, ISOK, KIUT, własność z uzupełnieniem grup | Dowody w `reports/m4d3-thematic.md`; baseline D6 pozostaje do odbioru |
| M4e | M4e.1 w main (#23); M4e.2 ukończone w bieżącym PR: menu, pomiary i Street View | 155 testów i headed offline/mobile 9/9 PASS; odbiór ręczny pozostaje; rodzina numerów pominięta D31 |
| M4f | Lista raportu i PDF w Działkach | Testy startu, raportu i pobierania w Edge. Oględziny PDF z mapą i polskimi znakami |
| M3b | Oficjalne TERC/SIMC i walidacja D9 | Próba pobrania przez agenta; fallback do plików od właściciela tylko przy faktycznej blokadzie; zera wiodące, nazwy powtarzalne, R=4/5 |
| M3c | Dawny plan centralnego wyszukiwania zastąpiony przez D35 | Osobne wyszukiwania zasilane właściwymi danymi w etapach poszczególnych modułów |
| M5–M8 | Plan podetapów poniżej; RCN według D32 | RCN wykorzystuje istniejący kod, obliczenia i bazę R2; poprawki prezentacji według przeglądu. Pozostałe moduły zachowują pełny parytet |
| M9 | Widoki zbiorcze i raport po decyzji D10 | Wyniki zgodne ze źródłami; brakujące moduły oznaczone |
| M10 | Instrukcja wdrożenia podglądowego i odbiór | Wdrożenie wykonuje właściciel; smoke prawdziwej domeny |
| AI | [Analiza możliwości](ai-reports-feasibility.md), implementacja po zatwierdzeniu zakresu etapu i decyzjach kosztowych | Widok mapy + internet, raporty RCN/Działek/Gmin bez bibliografii, bez bazy DENEM i bez generacji obrazów |

## Inwentarz i plan M5–M10

Poniższy inwentarz pochodzi z odczytu frontów we wskazanych rewizjach i historycznych raportów. Jest podstawą planu; przed implementacją każdego modułu powstaje szczegółowa macierz każdej opcji i wszystkich wywołań. Nie wykonano ruchu do starych frontów ani pomiarów ich produkcyjnego zachowania.

| Moduł i dowód | Funkcje wymagane w porcie | Małe podetapy / potrzeby |
|---|---|---|
| RCN, `85cb2f9`, `static/index.html:168–436`; `reports/m1a-code-review.md:B2` | Lokale, grunt niezabudowany i zabudowany; listy województwo/powiat/gmina/miejscowość, cała gmina, ulica; powierzchnia i cena, promień 100–5000 m i polygon z cofaniem, odrzucanie skrajnych, daty/suwaki/12–24 miesiące; rynek, funkcja, użytek, wszystkie typy budynków i prawa; podobne z tolerancją/zakresem i wagami; audyt filtrów, mapa, wykres czasu, tabela, średnie ulic i histogram; XLSX i Word | M5a macierz i klient URL; M5b wszystkie formularze i kontekst; M5c wyniki/mapa/wykresy/statystyki/podobne; M5d eksporty i regresja. Przed M5d ustalić sposób testu eksportów POST: obecne pozwolenie pomiarowe obejmuje GET. Nie usuwać eksportu z powodu ograniczenia testów. Pełną logikę JS i ewentualne dodatkowe opcje sprawdzić przed portem. |
| Oferty, `596451b`, `index.html:73–91`; raport C1 | Cztery rodzaje, podpowiedzi i potwierdzenie miejscowości, promienie 0/1/2/5/10/20/30 km, brak filtra/procent 10–50%/zakres; sześć źródeł, duplikaty i przyjęte wyniki, sortowanie wszystkich kolumn, linki ofert | M6a macierz i klient; M6b wszystkie filtry, wynik wspólny i źródła; M6c sortowanie, błędy częściowe, regresja i weryfikacja eksportu. W odczytanej rewizji HTML nie znaleziono przycisku Excel — wzmiankę załącznika o eksporcie trzeba zweryfikować, nie ogłaszać parytetu bez dowodu. Backend produkcji ma inny punkt wejścia niż `npm start`. Ciężkie wyszukiwanie wyłącznie oszczędnie. |
| Podobne, `a750201`, `index.html:269–317,644–674`; raport B3 | Analizowana nieruchomość i dowolne porównawcze, adres albo działka z listami jednostek, lokalizowanie/usuwanie; cena/data; przełączniki linii/adresu/ceny/daty; mapa/satelita, pokaż wszystkie | M7a macierz i dokładne URL-e; M7b edytor i lokalizowanie; M7c markery/linie/etykiety, błędy i regresja. Przed bezpośrednim geokodowaniem zweryfikować oficjalne zasady Nominatim i ograniczenia. |
| Gminy, `c1b682c`, `index.html:27–30,110–111,195–228`; raport B4 | Gmina docelowa, kraj/województwo, trzy profile, ten sam typ; siedem wskaźników i ich lata, ranking/top20, szczegóły „dlaczego”, zaznaczanie i porównanie, objaśnienia, PDF | M8a pełny plik GUS/BDL z pochodzeniem i walidacją D9; M8b odwzorowanie wag/normalizacji/braków i ranking; M8c wszystkie filtry, porównanie i PDF. Siedem identyfikatorów BDL jest w źródłowym froncie. Spróbować publicznego BDL; pełny eksport właściciela tylko jako fallback. Brak logowania jest już decyzją ostateczną. |
| M9, wymaganie właściciela i D10 | Kontekst lokalizacji, widoki zbiorcze i raport z wynikami modułów | M9a kontrakt wyników i źródeł, M9b widok zbiorczy, M9c raport. D10 nadal otwarte: odpowiedź właściciela z 2026-11-27 rozstrzygnęła logowanie, nie potwierdziła zakresu raportu. Rekomendacja: lokalizacja + wyniki pięciu modułów + źródła + oznaczenie braków. |
| M10, IMPLEMENTATION_PLAN.md | Podgląd statyczny, pełna macierz regresji, działanie z prawdziwego origin | Instrukcja klik po kliku dla właściciela, bez wykonywania wdrożenia przez agenta. Właściciel wybiera nazwę/domenę i ewentualny koszt hostingu. |

## Znane problemy i rzeczy do weryfikacji

- **Nowe zadanie właściciela (2026-11-27): aktualniejsze zdjęcia w podkładzie.** Właściciel ocenia, że Esri może być nieaktualne; rzeczywista data zobrazowania pozostaje do sprawdzenia [HIP]. Bez przerywania bieżących podetapów zaplanowano porównanie alternatywnych zdjęć satelitarnych i aktualnej ortofotomapy. Kryteria: udokumentowana data zdjęcia dla danego obszaru, rozdzielczość przy analizie działki, pokrycie Polski, jakość obrazu, stabilność, dostęp bez ujawniania kluczy, licencja i ewentualny koszt. Wynik ma wskazać rekomendowany nowszy podkład i sposób pokazywania daty/źródła. Nie zastępować szczegółowego obrazu świeższym, ale zbyt mało dokładnym bez jasnego uzasadnienia. Zachować istniejące opcje parytetu; płatny wariant wymaga decyzji właściciela. Kolejność: po zamknięciu bieżącej implementacji M4d.2, równolegle z planowaniem M4d.3, przed docelowym wyborem podkładu w odbiorze.

- Ortofotomapa archiwalna: w historycznym pomiarze 67/144 GET-ów bez odpowiedzi po 35 s. Backlog M4b.3: limit czasu na kafelek i ocena 512 px. Nie uznawać awarii usługi za pusty poprawny wynik.
- KIEG: V0 headless dawał ORB dla węzła 01, a frakcje wynosiły 0/12, 11/12 i 12/12. Wpływ User-Agent pozostaje [HIP]; nie zmieniamy nagłówków. Aktualny sprawdzian Edge/CDP nie testował usług KIEG. [Źródło: D23 i docs/dzialki-module.md]
- Nowy budżet właściciela to 4 pełne smoke, 400 żądań Działek, 300 na usługę. `fix/smoke-task-budgets` dodaje wspólny licznik wymagający `--task`, utrwalany przed wysłaniem żądania; przekierowania KIEG dzielą licznik. Stary licznik M4d.1c jest używany dodatkowo tylko w historycznym eksperymencie, bez kasowania jego stanu. Nie zwiększa nowych limitów. Sprawdzian samego CDP nie zużywa budżetu usług.
- D2/D9: nie ma pełnych plików TERC/SIMC ani pełnego zbioru wskaźników. 100 wierszy BDL i jeden niezależny match nie zamykają D9. Nie zgadywać rodzaju gminy ani mapowania.
- Klik działki a DenemContext: zachowujemy obecne zachowanie do osobnej decyzji. Trwałość analiz D11, zasady wyników ofert D12, zakres raportu D10 i domena/koszty nie są rozstrzygnięte.
- Publiczne warunki usług Esri/GUGiK/Nominatim wymagają sprawdzenia u źródeł przed udostępnieniem nowych integracji. Nie dopisujemy nowych ustaleń bezpieczeństwa starych aplikacji.
- Narzędzie odczytu starego frontu zwróciło także publiczną konfigurację dostępu. Nie kopiowano jej do plików, testów ani dokumentacji; nie wykonywano żadnych operacji z jej użyciem.

## Procedury

1. Przed etapem: źródła prawdy, obecny stan Git/PR-ów, inwentarz frontu i źródłowy SHA. Dla każdego żądania tabela „stary front vs nowa aplikacja”: adres, metoda, parametry, CRS, format, plik:linia. Dokładne testy URL.
2. `node --test scripts/*.test.mjs tests/*.test.mjs`: poniżej 5 s, atrapy fetch/DOM/Leaflet; serwer testowy wyłącznie loopback. Dla UI test uruchomienia całej powłoki, nie tylko funkcji pomocniczych. Cleanup także przy nieudanej asercji.
3. `node scripts/check-no-secrets.mjs` i `node scripts/check-no-secrets.mjs --history`; nowy plik musi wejść do indeksu przed skanem plików. `git diff --check`; lokalne GET 200 dla nowych plików aplikacji.
4. Przed mapowym smoke: tabelka URL, allowlista nie szersza niż funkcja starego frontu, nowe budżety w pliku stanu. Rzeczywisty Edge z oknem; bez zmiany nagłówków, cache-bustingu i POST do usług. Nie obserwuj ruchu starego frontu bez osobnej zgody.
5. Zrzuty obejrzyj, zapisz PASS/FAIL i ograniczenia. Pliki pomiarów i dane właściciela zostają w ignorowanych `.local/` / `.local-results/`; w repo wyłącznie fikcyjne przykłady. Mechanizm jednorazowego lokalnego zestawu danych właściciela jest jeszcze do dodania, nie został ogłoszony wykonanym.
6. Mały commit, osobna gałąź, PR do main lub gałęzi zależności. Uzupełnij ten plik i pełny RAPORT. Sprawdź CI i oczekiwany SHA; scal samodzielnie zgodnie z D33, bez wdrażania. Po większym etapie zatrzymaj pracę do akceptacji kontynuacji.

## RAPORT dla kierownika — przejęcie (historyczny, M4d.2)

1. Status: CZĘŚCIOWO — dwie poprawki techniczne, handover, licznik budżetów i M4d.2 są w otwartych PR-ach; dalsza roadmapa w realizacji.
2. Repozytorium: centrum-analiz-nieruchomosci; początek `3ebed06`; PR #13 (`f49444d`), #14 (`a1f8221`), #15 (`f4ca961`), #16 (`a240d95`), implementacja #17 (`6ff3262`). Końcowe SHA i statystyki aktualnych głów są w PR-ach.
3. Zmiany #13: dwa pliki +45/-0; #14: cztery +170/-44; #15: osiem +152/-23; #16: pięć +203/-4; implementacja #17: 29 +1398/-18, plus aktualizacja metadanych raportu po utworzeniu PR. Szczegóły #17 w reports/m4d2-planning.md i statystyce PR.
4. Kryteria: testy <5 s — TAK (aktualnie 139/139, 0,74 s); Edge headed/CDP — TAK; handover i plan — TAK; M4d.2 — implementacja i punktowy smoke TAK, baseline właściciela NIE; M4d.3–M10 — NIE. Nowy smoke nie zamyka historycznych ograniczeń EGiB/KIEG.
5. Uruchomiono: odczyty dokumentów/kodu, `git clone --bare` i odtworzenie metadanych bez nadpisania plików, status/log/branch/diff, testy, oba skany, `node --check scripts/browser-smoke.mjs`, lokalny `--headed --check-browser`, commity i push dwóch gałęzi; utworzono dwa otwarte PR-y. Weryfikacja dokumentacji dopisywana w jej PR.
6. [FAKT] Załącznik nie odpowiadał w pełni plikom (brak .git i .gitattributes, brak SRI loadera). [HIP] Przyczyna ORB pozostaje niepotwierdzona.
7. Zakazane obszary: NIE — bez zmian źródeł, portalu, usług i wdrożeń.
8. Sekrety: nie odczytywano ani nie zapisywano sekretów lub wartości środowiska. Publiczna konfiguracja starego frontu pojawiła się w odpowiedzi narzędzia; nie utrwalono ani nie używano jej.
9. Otwarte: pełne dane D2/D9, D10 i produktowe kwestie wyżej. D5 zamknięte: aplikacja zawsze bez logowania.
10. Test ręczny: opcjonalnie polecenia testów i `--headed --check-browser` opisane w scripts/README-run.md; mapowe scenariusze wymagają osobnego przebiegu po wdrożeniu nowych limitów.
11. Następny krok: porównanie aktualniejszych podkładów według nowego planu właściciela oraz M4d.3. Nie wykonywać dodatkowego smoke m4d2 po 4/4 startach.
