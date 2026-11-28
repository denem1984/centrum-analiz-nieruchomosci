# DECISIONS.md — decyzje i kwestie otwarte

**Data aktualizacji:** 2026-10-26. Ustalenia właściciela z tej daty mają pierwszeństwo przed starszymi zapisami.

## D1 — Źródło danych RCN (2026-10-27)

- **Status:** rozstrzygnięte; potwierdzone przez właściciela.
- **Decyzja:** `źródło danych RCN = r2_parquet` [FAKT: odczyt właściciela z panelu 2026-10-27]. To niesekretna wartość trybu.
- **Wpływ architektury:** moduł RCN planuje się i porównuje z danymi Parquet w R2. Szczegóły pomiaru znajdują się w CONFIG.md.

## D2 — Wspólny słownik lokalizacji (2026-10-27)

- **Status:** katalogi zweryfikowane w M3b na pełnym archiwum GUS z 2026-07-17. Wspólne wyszukiwanie i podłączenie modułów zaplanowano w M3c zgodnie z D39.
- **Decyzja:** [FAKT z kodu] RCN ładuje SIMC z cache, a przy jego braku pobiera SIMC i TERC, z małym `teryt_places.csv` jako fallback. Kod zwraca TERYT gminy i SIMC miejscowości; szczegóły i ograniczenia próbek zapisano w reports/m1c-d2-simc.md.
- **Wpływ architektury:** TERC identyfikuje jednostkę administracyjną, SIMC miejscowość, a para SIMC i ULIC ulicę w danej miejscowości. Kody zachowujemy jako tekst. Wyniki o tej samej nazwie rozróżniamy kodem, rodzajem i położeniem administracyjnym. Obręby ewidencyjne pozostają danymi PRG/ULDK. [Wyniki M3b](reports/m3b-location-dictionaries.md).

## D3 — Miejsce aplikacji (2026-10-26)

- **Status:** rozstrzygnięte; NIEBLOKUJĄCE.
- **Decyzja:** Centrum Analiz Nieruchomości jest samodzielną aplikacją, poza portalem i panelem denem.pl. Nie modyfikujemy repozytorium denem1984/denem.
- **Wpływ architektury:** wcześniejszy wariant powłoki w panelu został odrzucony; sprawdzanie kodu panelu nie jest warunkiem startu.

## D4 — Sposób otwierania modułów (2026-10-26)

- **Status:** rozstrzygnięte dla planowanej architektury; NIEBLOKUJĄCE.
- **Decyzja:** moduły są natywnymi zakładkami aplikacji, a integracja odbywa się przez bezpośrednie wywołania API. Nie zakładamy iframe.
- **Wpływ architektury:** kontrola nagłówków pod kątem osadzania nie jest wymagana. D4 wraca tylko wtedy, gdy właściciel ponownie rozważy iframe.

## D5 — Brak logowania (2026-11-27)

- **Status:** rozstrzygnięte przez właściciela 2026-11-27.
- **Decyzja:** „w ogóle nie będzie logowania do aplikacji”. Brak logowania dotyczy całej aplikacji i wszystkich etapów. Nie przenosić bramek dostępu starych frontów.
- **Wniosek techniczny:** [FAKT: pomiar właściciela 2026-10-27] preflight Ofert, Działek i Podobnych nie dopuszcza nagłówka Authorization; RCN go dopuszcza. [HIP] Nowa aplikacja nie powinna przekazywać tokenów do trzech pierwszych usług. To ograniczenie transportu CORS nie rozstrzyga modelu dostępu aplikacji.
- [FAKT: ustalenie właściciela 2026-10-27] Moduł Gminy korzysta z pliku danych (opcja B) i nie zależy od Supabase ani logowania modułu.
- **Wpływ architektury:** D5 nie blokuje M8. Gminy korzystają z pliku danych. Nie dodawać integracji tożsamości ani przekazywania tokenów do usług. Szczegóły historycznych pomiarów CORS są w CONFIG.md.

## D6 — Technologia i automatyzacja testów (2026-10-27)

- **Status:** przyjęta przez właściciela przez przekazanie zadania.
- **Decyzja:** aplikacja jest statyczna: czysty HTML, moduły ES i CSS, bez kroku budowania i bez zależności npm. Testy uruchamiają się przez `node --test`.
- **Powód:** uproszczone wdrożenie jako Render Static Site z katalogiem publikacji `app/` i bez build command, ograniczona dostępność sieci w środowisku wykonawcy oraz spójność ze starymi aplikacjami opartymi na czystym HTML/JS.
- **Biblioteki zewnętrzne:** w M2 nie ładujemy CDN ani innych zasobów zewnętrznych. Właściciel rozstrzygnął w D15, że potrzebne biblioteki będą lokalnymi, przypiętymi plikami z licencjami, bez CDN i npm. Moduł M4b używa Leaflet 1.9.4. Poprzedni frontend używał też proj4 2.9.0, jsPDF 2.5.1, AutoTable 3.5.31 i html2canvas 1.4.1 [FAKT z kodu: index.html:1,21].
- **Wpływ architektury:** brak build command; testy nie wysyłają żądań do backendów. Jedynymi połączeniami aplikacji M2 są lekkie GET-y zdrowia z konfiguracji.

## D7 — Łączenie backendów źródłowych (2026-10-26)

- **Status:** poza zakresem M0–M10.
- **Decyzja:** nie zmieniamy ani nie łączymy backendów w pięciu repozytoriach źródłowych. Ewentualne prace wymagają osobnego polecenia właściciela.
- **Wpływ architektury:** nowa aplikacja łączy moduły przez API; nie wymaga łączenia usług.

## D8 — Identyfikatory dostępu do modułów (zamknięte 2026-11-27)

- **Status:** nie dotyczy po decyzji D5.
- **Decyzja:** aplikacja nie będzie miała logowania; nie tworzyć identyfikatorów ani uprawnień dostępu do zakładek.
- **Wpływ architektury:** wszystkie natywne moduły są dostępne bez bramki.

## D9 — Mapowanie BDL ↔ TERYT (2026-10-27)

- **Status:** zweryfikowane w M3b dla publicznego katalogu BDL i pełnego TERC z 2026 r. Każda z 2479 gmin ma jedno dopasowanie. Plik wskaźników modułu Gminy wymaga kontroli przy imporcie w M8.
- **Decyzja:** [FAKT: odczyt właściciela z panelu 2026-10-27] `gus_bdl_commune_wide` nie ma kolumny TERYT. [FAKT z danych] Dołączony CSV zawiera 100 jednostek i tylko jeden kod województwa; wyprowadzona reguła daje 100 unikalnych kandydatów TERC7, ale tylko jeden kandydat można porównać z lokalnym 22-wierszowym fallbackiem RCN. Szczegóły są w reports/m1c-d9-mapping.md.
- **Reguła dla zweryfikowanego zbioru:** z publicznego BDL wybieramy poziom 6 i rodzaje 1–3, wyprowadzamy kandydata TERC7 i potwierdzamy go w TERC z właściwego okresu. Dopasowanie wymaga relacji 1:1. Walidacja odrzuciła 226 rekordów spoza tego wykazu. [Wyniki M3b](reports/m3b-location-dictionaries.md).
- **Wpływ architektury:** dla Gminy w M8 użyć jawnej, wersjonowanej mapy wygenerowanej z rejestrów i sprawdzić pokrycie dla faktycznego pliku wskaźników oraz lat analizy.

## D10 — Zakres raportu zbiorczego (2026-10-26)

- **Status:** częściowo rozstrzygnięte przez D39. Raport RCN ma mieć opcję dołączenia analizy Ofert. Zakres pełnego raportu zbiorczego należy potwierdzić przed M9.
- **Decyzja:** określić odbiorcę, format i wymagane sekcje raportu.
- **Wpływ architektury:** raport pozostaje w M9. Dołączenie Ofert wymaga wspólnej lokalizacji ze Startu.

## D11 — Trwałość analiz (2026-10-26)

- **Status:** otwarte; rozstrzygnąć przed dodaniem zapisu analiz.
- **Decyzja:** ustalić, czy aplikacja ma przechowywać analizy i gdzie.
- **Wpływ architektury:** nie wpływa na moduły M0–M8; nie projektować trwałego zapisu bez decyzji.

## D12 — Zasady prezentowania ofert (2026-10-26)

- **Status:** do rozstrzygnięcia przed udostępnieniem wyników ofert dodatkowym użytkownikom.
- **Decyzja:** właściciel oceni warunki użycia źródeł ofert w planowanym sposobie prezentacji.
- **Wpływ architektury:** bez zmiany integracji API; decyzja dotyczy sposobu użycia wyników.

## D13 — Dokumentacja RCN (2026-10-26)

- **Status:** otwarte; poza zakresem M0.
- **Decyzja:** ustalić, czy aktualizować dokumentację w repozytorium RCN.
- **Wpływ architektury:** brak wpływu. Repozytorium RCN pozostaje tylko do odczytu bez osobnego polecenia.

## D14 — DenemContext v1 (2026-10-27)

- **Status:** przyjęta do czasu M3b; M3b ma zweryfikować kontrakt na plikach TERC/SIMC od właściciela.
- **Decyzja:** wspólny kontekst przekazuje jawnie rozdzielone pola `voivodeship.code`, `powiat.code`, `gmina.terc7`, `place.simc7`, `parcel`, `point` i opcjonalne `bdlUnitId`. Wszystkie kody są tekstem, a kontekst ma wersję `"1"`.
- **Powód:** TERC gminy, SIMC miejscowości i identyfikator jednostki BDL opisują różne klucze; jedno niejednoznaczne pole utrudniłoby walidację i mapowanie. D9 pozostaje otwarte, dlatego `bdlUnitId` nie jest wypełniany w M3a.
- **Zakres M3a:** walidacja, magazyn tylko w pamięci, przekazanie kontekstu w hash URL oraz wyszukiwanie na fiksturach. Brak rzeczywistego słownika; M3b zależy od plików TERC/SIMC od właściciela i walidacji D2/D9.

## D15 — Dostęp i integracja modułu Działki (2026-11-01)

- **Status:** przyjęte przez właściciela przez przekazanie zadania.
- **1. Dostęp:** zakładka działa bez własnej bramki do czasu decyzji D5 przed M8. Nie przenosi się biblioteki logowania starego frontu ani nie odtwarza jego ekranu logowania. [FAKT: decyzja właściciela 2026-11-01]
- **2. Kod gminy:** dozwolone jest wyprowadzenie sześciocyfrowego `teryt` z `gmina.terc7` przez pominięcie ostatniej cyfry jako osobna, testowana funkcja czysta. Przed użyciem w M4c należy sprawdzić w kodzie frontu, jak budowany jest parametr `teryt` dla właściwej trasy; przy wątpliwości należy się zatrzymać i zapytać. [FAKT: decyzja właściciela 2026-11-01]
- **3. Działka:** `parcel.id` przejmuje identyfikator działki bez zmian. `obrebTeryt` ustawia się wyłącznie przy niezależnie potwierdzonym kodzie obrębu; w innym przypadku pole pomija się. [FAKT: decyzja właściciela 2026-11-01]
- **4. Biblioteki:** używane biblioteki dostarcza się jako lokalne, przypięte pliki w `app/vendor/dzialki/` wraz z licencjami, bez CDN, w wersjach obecnego frontu. [FAKT: decyzja właściciela 2026-11-01]
- **5. Lista PDF:** robocza lista raportu przetrwa przełączanie zakładek w pamięci aplikacji i jest czyszczona po odświeżeniu strony. [FAKT: decyzja właściciela 2026-11-01]

## D16 — Baseline regresji M4 per podetap (2026-11-01)

- **Status:** przyjęte przez właściciela przez przekazanie zadania.
- **Decyzja:** baseline zapisuje się bezpośrednio przed każdym podetapem, osobno dla przypisanych przypadków: M4b→D2; M4c→D1; M4d→D4, D5, D6; M4e→D3; M4f→D7. [FAKT: decyzja właściciela 2026-11-01]

## D17 — Mapa modułu Działki M4b (2026-11-01)

- **Status:** zakres M4b realizowany zgodnie z zadaniem; dostawa biblioteki lokalna na mocy D15.
- **Decyzja implementacyjna:** w M4b zakładka Działki pokazuje trzy podkłady: OpenStreetMap, Esri World Imagery i archiwalną ortofotomapę GUGiK, z pojedynczym aktywnym podkładem, widoczną atrybucją, suwakiem roku 1995–2025, krokiem zoomu 0,1 i skalą metryczną. Poprzedni front definiuje środek początkowy [52.07, 19.48], zoom 6 i limit 22. [FAKT z kodu: index.html:177,211]
- **Polityka błędów kafelków:** do dwóch ponowień dla kafelka, z opóźnieniami około 1,5 s i 4 s, jitterem do 250 ms i limitem sześciu równoczesnych prób na warstwę. Ponowienie uruchamia także obraz o wymiarach 1×1 (heurystyka pustej odpowiedzi). Zmiana warstwy/roku, odłączenie kafelka i odmontowanie anulują oczekujące próby. [FAKT: implementacja M4b.2]
- **Ograniczenie M4b:** nie dodawać wyszukiwania działek ani warstw tematycznych; pozostają oznaczone jako planowane na kolejne etapy. Moduł korzysta z istniejącego stanu sondy zdrowia, nie inicjuje własnych wywołań API Działek.
- **Adnotacja implementacyjna M4b.1 (2026-11-02):** porównanie kodu frontu z rewizji `a1aa39d` potwierdza adres WMS `/wss/service/PZGIK/ORTO/WMS/StandardResolutionTime`, warstwę `Raster`, WMS 1.3.0, EPSG:3857, `image/png`, `transparent: true` i format parametru czasu `<rok>-12-01` z wyjątkiem 2025 (`2025-11-01`). [FAKT z kodu: index.html:211] Nowy moduł został dopasowany do tych parametrów; wyników WMS z prawdziwej przeglądarki nie uzyskano w tym przebiegu.

## D18 — Wyszukiwanie działki M4c

- **Status:** implementacja M4c/M4c.1 scalona w PR #10; porównanie z baseline D1 po zmianach wykonuje właściciel.
- **Decyzja implementacyjna:** zależne listy administracyjne korzystają z publicznego PRG, a wybór obrębu i działki z publicznego ULDK. Żądania są GET, a ich pełne adresy są sprawdzane testami jednostkowymi.
- **Kontekst:** `parcel.id` zachowuje identyfikator z odpowiedzi; `point` jest punktem wewnątrz geometrii WKT w EPSG:4326; kody województwa/powiatu pochodzą z prefiksu identyfikatora jednostki i nazw wybranych list PRG. Rodzaj 1/2/3 daje odpowiadający kod TERC7; rodzaj 4/5 mapuje się na rodzaj 3 [HIP z definicji TERYT do weryfikacji na pełnym TERC w M3b]; pozostałe rodzaje nie ustawiają gminy. `obrebTeryt` jest pomijane bez niezależnego potwierdzenia.
- **Dane EGiB:** stary front pobiera geometrię do EGiB z ULDK, a następnie odpytuje KIEG WMS GetFeatureInfo bezpośrednio z przeglądarki; nie jest to trasa backendu Działek. Nowe adresy i parametry są porównane z `index.html` rewizji `a1aa39d` i testowane na atrapach. [FAKT z kodu: `reports/m4a-dzialki-analysis.md`, `docs/dzialki-module.md`]
- **Zakres:** wybory formularza, wynik i dane EGiB są przechowywane w pamięci aplikacji przy przełączaniu zakładek; stan nie jest utrwalany po odświeżeniu strony.

## D19 — Pełny parytet funkcji modułu Działki (2026-11-02)

- **Status:** wymaganie właściciela przekazane w zadaniu M4c.1.
- **Decyzja:** nowa aplikacja ma zachować każdą opcję obecnej aplikacji Działki. Zmiany funkcjonalne względem starej aplikacji wymagają zgody właściciela.
- **Wykonanie:** `docs/parity-dzialki.md` jest macierzą wszystkich elementów z inwentarza M4a i baseline D1–D7. Macierz aktualizuje się w każdym podetapie M4. Status „zrobione” nie zastępuje porównania właściciela w przeglądarce.
- **Baseline:** właściciel dostarczył D1 przed M4c.1. Wartości testowe i zrzuty pozostają poza publicznym repozytorium; do repo trafia opis funkcji i status parytetu, bez wyników konkretnej nieruchomości.

## D20 — Niezawodność kafelków archiwalnych (2026-11-03)

- **Status:** konfiguracja domyślna pozostaje K0 na podstawie kryterium pomiaru M4b.2; decyzja implementacyjna, bez zmiany liczb retry.
- **Pomiar skorygowany:** po trzy wczytania każdej konfiguracji K0–K3, stan po 35 s, widok testowy Piły, zoom 17,6. Mediana końcowej frakcji: K0 75,0%, K1 66,7%, K2 50,0%, K3 33,3%; każda konfiguracja wysłała 36 żądań GetMap. Żadna konfiguracja K1–K3 nie poprawiła K0 o co najmniej 10 p.p. w dwóch z trzech odpowiadających sobie wczytań. Czasy 90% i 95% nie zostały osiągnięte w żadnym z 12 wczytań skorygowanego przebiegu.
- **Odpowiedzi:** 77 z 144 żądań GetMap otrzymało HTTP 200 i `image/png`; 67 nie miało statusu HTTP po 35 s i nie wygenerowało zdarzenia błędu ani anulowania. Nie zaobserwowano obrazu 1×1, błędu kafelka ani ponowienia. Dwa uruchomienia narzędzia wysłały łącznie 288 żądań ortofotomapy; limit 800 nie został przekroczony. [FAKT z przebiegu browser-smoke]
- **Wniosek:** nie ma podstaw z tego pomiaru, by zwiększyć liczbę prób, wydłużyć backoff ani zmienić równoległość. Brak statusu HTTP w chwili pomiaru jest zgodny z opóźnieniem usługi lub sieci, ale jego źródło pozostaje niezweryfikowane [HIP]. UI zachowuje licznik, a po wyczerpaniu prób pokazuje komunikat z prośbą o ponowienie później lub zmianę roku.

## D21 — EGiB i kliknięcia mapy (2026-11-13)

- **Status:** M4d.1 jest w trakcie realizacji; kontrakty zewnętrzne sprawdzane są względem starego publicznego frontu `a1aa39d` i testowane z pełnymi adresami w testach offline.
- **Implementacja:** panel mapy dzieli pracę na numerowane sekcje 1–3 i pamięta w module stan grup oraz warstw. Numery i kontury działek są domyślnie włączone, kontury budynków wyłączone. WFS GeoJSON odświeża widok od zoomu 13; KIEG WMS dostarcza kontury działek i budynków, a GetFeatureInfo dostarcza pola popupu. Żądania są GET, a odświeżenie WFS debounced i poprzednie żądanie jest anulowane.
- **DenemContext:** kliknięcie działki na mapie nie zmienia kontekstu; wyszukiwanie pozostaje jego źródłem w tym etapie.
- **Pytanie otwarte do właściciela:** czy kliknięcie działki na mapie ma ustawiać kontekst lokalizacji?
- **Ograniczenie:** M4d.1 nie implementuje planowania przestrzennego, inwestycji, infrastruktury ani M4b.3. Zakres M4d.2/M4d.3 pozostaje osobny.

## D22 — Ponawianie kafelków KIEG (2026-11-13)

- **Status:** M4d.1b częściowo zmierzone; konfiguracja domyślna pozostaje K0, bo nie uzyskano trzech porównywalnych przebiegów dla każdego wariantu.
- **Stary front:** w `index.html` rewizji `a1aa39d` obie definicje WMS KIEG (`dzialki` i `budynki`) są na jednej fizycznej linii 211. Obie używają 256 px (domyślny rozmiar Leaflet), `image/png`, przezroczystości, opacity 0,95, `maxZoom:22`, `updateWhenZooming:false`, `updateWhenIdle:true` i `keepBuffer:1`; warstwy mają osobne pane. Nie znaleziono obsługi KIEG `tileerror`/`tileload`, ponowienia, `errorTileUrl`, `setUrl`, `redraw` ani cache-bustingu. [FAKT z kodu: `index.html:211`]
- **Decyzja implementacyjna:** nowa aplikacja obejmuje oba kafelkowe overlaye KIEG polityką K0: dwa ponowienia po 1500 i 4000 ms, jitter do 250 ms, równoległość do 6 na warstwę; statystyki KIEG pozostają oddzielone od podkładów. Nie dodaje się query parametru do URL, bo stary front go nie wysyła, a zgodność usługi z dodatkowymi parametrami nie została potwierdzona.
- **Pochodzenie strony:** hipoteza wpływu różnicy `localhost`/hostingu nie jest sprawdzana przez zmianę nagłówków ani podszywanie się pod domenę. Do sprawdzenia po wdrożeniu podglądowym (M10).
- **Wynik przed/po:** wariant bez retry wysłał 100 żądań KIEG, a limit zatrzymał 14 dalszych; selektor DOM w tej wersji narzędzia nie odczytał kafelków IMG, więc końcowej frakcji „przed” nie da się wiarygodnie odtworzyć. Wariant K0 wysłał 100 żądań i zatrzymał 81 dalszych prób; pierwszy 25-sekundowy przebieg osiągnął 2/12 kafelków (16,7%), a kolejne dwa były ograniczone wyczerpaniem limitu. Nie ma podstaw do zmiany K0 na podstawie tych wyników. Pełny łączny budżet nie został przekroczony: przerwane wcześniejsze uruchomienie miało limit 300, a dwa późniejsze wysłały po maksymalnie 100; dokładnej sumy pierwszego uruchomienia nie da się odzyskać.

## D23 — Wymagana kompletność konturów KIEG (2026-11-14)

- **Wymaganie właściciela:** „Kontury działek muszą wczytywać się w CAŁOŚCI. Skuteczność (kompletność) ma pierwszeństwo przed szybkością. Niepełne kontury są nieakceptowalne.” Stara aplikacja według właściciela finalnie ładowała pełne kontury.
- **Mechanizm M4d.1c:** panel liczy widoczne kafelki IMG KIEG i ogłasza kompletność wyłącznie dla niepustego widoku, gdy każdy widoczny obraz zakończy dekodowanie i ma wymiary większe niż 1×1. Przez maksymalnie 40 s wykonuje sweep co 3 s dla widocznych obrazów bez poprawnego obrazu; pomija żądania w toku. Po oknie pokazuje liczbę niezaładowanych i przycisk ponowienia. [FAKT z kodu: `egib-layers.js`, `tile-retry.js`]
- **Polityka retry:** konfiguracja K0 pozostaje domyślna (2 próby, 1500/4000 ms, jitter do 250 ms, do 6 równoległych retry na warstwę); dodatkowy sweep powtarza ten sam URL bez nowych parametrów. Nie wdrożono V2 ani V3, ponieważ eksperyment nie objął tych wariantów.
- **Pomiar:** V0 headless w Chrome 157, User-Agent z CDP `HeadlessChrome/157.0.0.0`; trzy końcowe frakcje wyniosły 0/12 (0%), 11/12 (91,7%) i 12/12 (100%, po 8256 ms). Wysłano 112 żądań KIEG, odnotowano 29 ORB. Odpowiedzi 302 rozdzieliły się 32→01 i 27→02; 29 końcowych żądań do 01 zakończyło się ORB (29/29), a 24 trafiły do 02. Korelacja dotyczy wyłącznie V0 headless i nie rozstrzyga przyczyny.
- **Ograniczenie pomiaru:** cztery uruchomienia przeglądarki zakończyły się przed CDP; piąte zebrało V0. W granicy zgody (5 uruchomień, 900 żądań) V1 headed, V2 i V3 nie zostały zbadane. Żaden dostępny wynik nie spełnia kryterium trzech z trzech wczytań do 20 s; wariant zwycięski nie został wybrany. Wpływ trybu przeglądarki, zachowanie sweepu oraz przełączenie węzła pozostają niezweryfikowane [HIP].
- **Fallback WFS [HIP]:** GeoJSON `/api/wfs` daje geometrię parcel dla zwróconego bbox, z której aplikacja rysuje przerywane obrysy i etykiety. Może być częściowym fallbackiem dla tych działek, lecz nie potwierdzono równoważności pokrycia z KIEG; nie zastępuje konturów budynków ani stylu WMS. Nie wdrażać jako pełnego zastępstwa bez porównania.
- **Pochodzenie strony:** hipoteza różnicy localhost/hostingu pozostaje do sprawdzenia po wdrożeniu podglądowym (M10), bez zmiany nagłówków ani podszywania się pod domenę.

## D24 — Przejęcie i małe zależne PR-y (2026-11-27)

- **Status:** polecenie właściciela w zadaniu przejęcia.
- **Decyzja:** agent prowadzi plan, kod, testy, dokumentację i PR-y; właściciel podejmuje decyzje produktowe, scala oraz wdraża. Otwarty PR nie blokuje niezależnej pracy. Zmiana zależna jest PR-em do gałęzi poprzednika, z jawną kolejnością w PROJECT_STATE.md.
- **Powód:** małe zakresy do samodzielnego sprawdzenia przy zachowaniu pełnego parytetu. Alternatywa: jeden zbiorczy PR obejmujący wiele modułów — odrzucona jako trudniejsza do odbioru.
- **Sieć:** obowiązują nowe budżety zadania z AGENTS.md; stare limity eksperymentów nie są ponowną zgodą. Nie wykonuje się operacji zarządzania usługami, wdrożeń ani odczytów wartości konfiguracji.

## D25 — Szybki test startowy i izolowany Edge/CDP (2026-11-27)

- **Decyzja:** test startowy odmontowuje ostatnią mapę także po błędzie asercji, zamiast skracać produkcyjne okno kompletności. PR #13: 119/119 PASS w 0,69 s.
- **Edge:** nowy profil na każdy start, port wybiera przeglądarka, `DevToolsActivePort` wskazuje instancję. Sprawdzenie portu i socketu ogranicza połączenie do lokalnej przeglądarki; wyjście launchera nie kończy od razu oczekiwania. Alternatywa: stały port wybrany przez wcześniejszy test wolnego gniazda — odrzucona, bo tworzy wyścig i nie identyfikuje profilu.
- **Dowód:** PR #14, `--headed --check-browser` PASS w rzeczywistym Edge; zrzut obejrzany. Ten sprawdzian nie otwiera mapy i nie dowodzi dostępności usług.
- **Ograniczenia źródeł:** lokalny checkout nie ma `.gitattributes` ani atrybutów SRI w loaderze Leaflet; istnieją testy SHA-256 plików vendor. Nie opisywać stanu z załącznika jako już wdrożonej ochrony.

## D26 — Pełne źródła planowania i jawna niepełność (2026-11-27)

- **Decyzja:** M4d.2 zachowuje pięć warstw oraz uzupełniający gminny POG w EPSG:2180, rysowany po przeliczeniu w lokalnym proj4 2.9.0. Sam raster krajowy byłby utratą funkcji; tego wariantu nie przyjęto. Biblioteka ma licencję, SRI, test blobu i ochronę końców linii vendor.
- **Popup:** wspólny z EGiB; planowanie działa również po błędzie danych EGiB. MPZP zachowuje priorytet gmina→RU oraz równoległe szczegóły działki. Niepowodzenie jednego źródła oznacza niepełny wynik, a nie brak planu.
- **Kompletność:** otrzymanie wszystkich widocznych obrazów WMS nie dowodzi pełnej publikacji danych przez gminę. Etykiety to „Kafelki wczytane” z informacją o tym ograniczeniu. Canvas nie ukrywa błędów jako poprawnego pustego kafelka.
- **Testy przeglądarki:** najpierw prawdziwy Leaflet z odpowiedziami CDP bez wysyłania żądań, potem jeden pomiar usług w Edge z oknem; ostatni przebieg offline obejmuje 390 px. Cztery starty zużywają limit zadania m4d2; licznik nie został wyzerowany. Szczegóły i ograniczenia: docs/dzialki-planning.md.

## D27 — Warstwy tematyczne i uzupełnienie własności (2026-11-27)

- M4d.3 zachowuje RWDZ, ISOK, KIUT i własność z parametrami starego frontu; wszystkie domyślnie wyłączone. Przywrócono źródłową kolejność pane, aby kontury i zaznaczenia pozostały nad rastrami. RWDZ współdzieli popup z EGiB i planowaniem.
- Własność nie kończy się na kolorowaniu braków: do 60 brakujących grup na partię, cztery GET-y równolegle, punkt wewnątrz geometrii oraz kontrola identyfikatora odpowiedzi. Cache w pamięci i ręczne ponowienie pozwalają kontynuować dalsze partie. Alternatywę „zawsze szare braki” odrzucono jako utratę funkcji. Pozostałe braki są jawnie niepełnym wynikiem.
- Headed smoke zapisuje statusy, nie treść wpisów RWDZ; szczegóły mogą zawierać nazwiska i są pomijane w screenshot live. Atrapy używają wyłącznie fikcyjnych pól. Nie wykonuje się zmian backendu ani odczytów konfiguracji.
- Trzeci start zadania m4d3 uzyskał live PASS po naprawieniu atomowego zapisu licznika w osobnym PR #19. Drugi start przerwano przy EPERM, bez zerowania stanu. Pojedynczy widok nie zastępuje odbioru baseline D6.

## D28 — Wspólne wyszukiwanie lokalizacji w Start (2026-11-27)

- **Decyzja właściciela:** jedno wyszukiwanie w Start; zakładki pobierają potrzebny zakres tej samej lokalizacji, bez powtarzania kaskady. Województwo, powiat, gmina, obręb, miejscowość i ulica są osobnymi polami. Nie przerywa to bieżącej pracy.
- **Realizacja:** po M4e/M4f i słownikach M3b wykonać M3c — kontrakt v2 z migracją v1, wspólny formularz i adaptery. V1 nie przechowuje osobnej ulicy i obrębu niezależnego od działki. Szczegółowy plan i kryteria: `docs/shared-location-start.md`.
- Filtry analizy pozostają w modułach. Podobne korzysta ze wspólnej lokalizacji dla nieruchomości analizowanej; nieruchomości porównawcze zachowują własne adresy. Zmiana kontekstu unieważnia stare wyniki, nie uruchamia automatycznie ciężkich zapytań i czyści zależne pola. Nie utożsamiamy obrębu z miejscowością.
- Alternatywę powielania pełnej kaskady w każdej zakładce odrzucono. Działający formularz Działek zastąpić dopiero wraz z gotowym Start i adapterem, bez przejściowej utraty funkcji.

## D29 — AI czyta mapę i internet, raport bez źródeł (2026-11-27)

- **Wymaganie właściciela:** profesjonalne raporty RCN, Działek i podobieństwa gmin, z odczytem istniejącej mapy i rzeczywistym internetem, bez wewnętrznej bazy wiedzy DENEM, bez sekcji źródeł/odnośników w raporcie i bez generowania obrazów. Odczyt screenshotu jest osobnym kosztem wejścia, nie generacją obrazu.
- **Analiza, nie aktywacja:** `docs/ai-reports-feasibility.md`. Preferencja Gemini wymaga osobnej usługi serwerowej i limitów kosztów przy zachowaniu braku logowania. Wbudowane Google Grounding ma warunki wyświetlania linków; osobne wyszukiwanie jest rekomendowanym kierunkiem do weryfikacji dla raportu bez przypisów. Nie kupiono usług, nie wywołano modelu, nie dotknięto DENEM ani infrastruktury.

## D30 — Odbiór większych etapów i lokalny podgląd (2026-11-27)

- **Decyzja właściciela:** po większym etapie agent zatrzymuje pracę, podsumowuje wykonane i pozostałe zadania, publikuje zaktualizowaną estymację procentową i udostępnia lokalną aplikację do testów. Kontynuacja następnego etapu dopiero po wyraźnym zatwierdzeniu. Zastępuje wcześniejsze polecenie pracy nieprzerwanej do końca roadmapy; rutynowe wybory wewnątrz etapu pozostają samodzielne.
- Bieżący odbiór: M4d.2/M4d.3, podgląd M4d.3 z rewizji `9c07bb4` w oddzielnym ignorowanym katalogu, bez rozpoczętego szkicu M4e.1. Szkic jest nieukończony, nie podlega teraz odbiorowi. Stan i estymacja w `docs/PROJECT_STATE.md`.

## D31 — Bez heurystycznej „rodziny działek” (2026-11-27)

- Właściciel odrzucił rozpoznawanie po wspólnym numerze bazowym. Sprawdzony opis publicznych danych nie dał potwierdzonej relacji podziału; nie dodajemy tej opcji. Rozpoczęty szkic usunięto przed dostawą. To jawna zgoda na odstępstwo od historycznego parytetu, nie zadanie do przywrócenia przez kolejną heurystykę.
- Wiarygodny powrót wymaga danych zdarzeń przed/po z datą i geometrią lub zweryfikowanej dokumentacji. Sama zbieżność numerów, sąsiedztwo lub AI nie wystarcza. Ocena: `docs/parcel-history-assessment.md`.

## D32 — RCN wykorzystuje obecny kod i dane R2 (2026-11-27)

- **Decyzja właściciela:** wykorzystać bazę i kod `rcn-web-app`; właściciel aktualizuje pliki RCN Geoportalu w Cloudflare R2. Nie zmieniamy danych, importu ani istniejącego backendu. Przegląd dotyczy możliwych poprawek prezentacji i adaptacji do wspólnej aplikacji.
- Źródło pozostaje tylko do odczytu; wszystkie przyszłe zmiany UI w repo Centrum. Zachować obecne filtry, obliczenia i eksporty. `docs/rcn-presentation-review.md` zawiera przegląd z liniami dowodowymi, bez twierdzenia o wykonanym teście produkcji lub odczycie konfiguracji R2.

## D33 — Agent sam scala sprawdzone PR-y (2026-11-28)

- **Decyzja właściciela:** „Kontynuuj. I rób sam to merge”. Agent może sam scalać PR-y do main po pozytywnych kontrolach i sprawdzeniu zależności. Zastępuje wcześniejszy zakaz merge w AGENTS.md oraz podział tej czynności w D24.
- Najpierw zielone testy i skany, potem scalenia w kolejności zależności, z kontrolą oczekiwanego SHA. Zależne PR-y przenosić na main po scaleniu poprzednika; zachować historię stosu przez merge commit.
- D30 nadal obowiązuje: po większym etapie podsumowanie, lokalny podgląd, estymacja i zatrzymanie do akceptacji dalszej pracy. Merge nie oznacza odbioru danych produkcyjnych, zgody na wdrożenie, koszty AI ani zarządzanie usługami. Pięć źródeł i DENEM pozostają tylko do odczytu.

## D34 — Oddzielne przewijanie i sprawdzone linie zabudowy (2026-11-28)

- Właściciel wymaga nieruchomej mapy podczas przewijania lewego menu. Opcja linii ma pozostać po potwierdzeniu działającej warstwy z nieprzekraczalnymi liniami.
- Obszar roboczy ma ograniczoną wysokość okna, osobne przewijanie panelu i blokadę przekazywania jego przewijania na stronę. Na telefonie mapa jest nad panelem. ResizeObserver aktualizuje Leaflet; wysoki wynik pomiaru ma własne przewijanie.
- `wektor-lzb` KIMPZP zostaje: rzeczywisty test w publicznym przykładzie GUGiK pokazał linie z pełnymi i pustymi trójkątami oraz zgodną legendę. Dodano opis wymaganego zbliżenia i danych wektorowych gminy. Nie dodano nowej usługi ani parametrów i nie potwierdzono pokrycia każdej gminy. Dowody: `docs/map-panel-scroll.md`, `reports/map-panel-scroll.md`.
- Poprawka nie rozpoczyna M4f. Po dostawie nadal akceptacja kontynuacji; postęp pozostaje około 31% / 69%.

## D35 — Własne wyszukiwanie lokalizacji w każdym module (2026-11-28)

- Właściciel polecił kontynuować PDF i zapisać, że wyszukiwanie lokalizacji będzie osobno dla każdego modułu. To ustalenie zastępuje D28 i rozbudowę Start o centralny formularz lokalizacji.
- Moduły dobierają pola, filtry i sposób wyszukiwania do własnych danych. Mogą korzystać z tych samych słowników oraz pomocniczego kodu. Wybór w Start nie stanowi warunku użycia modułu.
- Zachowanie istniejących linków DenemContext v1 nie wymaga wdrożenia centralnego formularza. Dalsza realizacja po M4f obejmuje weryfikację słowników i formularze poszczególnych modułów.

## D36 — Raport PDF w przeglądarce (2026-11-28)

- Lista działek i zapisanych widoków pozostaje w pamięci zgodnie z D15. Działkę można dodać z wyniku wyszukania lub menu mapy. Widok utrwala geometrię, etykiety i dostępne rastry. PDF wymienia ograniczenia widoku, a dane działki obejmują wynik sprawdzenia MPZP.
- Do pobierania PDF użyto lokalnych jsPDF i Noto Sans z weryfikacją integralności. PDF zachowuje polskie znaki, a aktualną mapę zapisuje do obrazu PNG w chwili dodawania widoku. Kafelki z ograniczeniami CORS mogą zostać pominięte z informacją w raporcie.

## D37 — Informacja o działce, zaznaczenie i legendy (2026-11-28)

- Lewy klik pokazuje informacje. Prawy przycisk udostępnia osobne „Zaznacz działkę” i „Odznacz działkę”, również dla działki wskazanej wcześniej w wyszukiwaniu. Odznaczenie dotyczy obrysu na mapie. Wyszukany wynik nadal jest dostępny w formularzu i raporcie.
- Mapa własności i obie legendy (panel i PDF) używają wspólnej palety. Własność ma kryjące wypełnienie. Zaznaczenie nad nią jest obrysem. Aby zobaczyć rysunki warstw pod działkami, można wyłączyć mapę własności.
- Popup dopasowuje wymiary do mapy. Pusty wynik szczegółów MPZP pozostawia informację o rysunku i odnośnik do sprawdzenia wskazanego miejsca bezpośrednio w KIMPZP. Przejście do usługi jest inicjowane przez użytkownika.
- Każdy zapisany widok PDF dobiera legendy do własnych warstw. MPZP ma przykładowe kody rysunku, POG ma słownik 13 stref z rozróżnieniem włączonych warstw uchwalonych i projektowanych. Widok z oboma rodzajami dostaje obie legendy.

## D38 — Porównywalność stawek RCN w Centrum (2026-11-28)

- Dla gruntu niezabudowanego do statystyk ceny/m² trafia bezpośrednia cena działki, potwierdzona powierzchnia z konturu i zgodny iloraz. Cena aktu lub nieruchomości o niepotwierdzonym zakresie, udział oraz niepotwierdzona jednostka powierzchni pozostają oznaczone w tabeli.
- Dla gruntu zabudowanego wskaźnik dotyczy całej transakcji. Wymaga powiązania po ID transakcji, pełnej podstawy powierzchniowej dla budynków, bezpiecznej ceny aktu i zgodnego ilorazu. Stwierdzona niepełna suma działek wyłącza wskaźnik. Osobno oznaczamy podstawę z powierzchni użytkowej i ze szacunku kondygnacji.
- Zakres wdrożenia obejmuje Centrum. [Weryfikacja kodu, testy i ograniczenia po stronie API](reports/m5-rcn-review.md).

## D39 — Wspólna lokalizacja ze Startu oraz Oferty w raporcie RCN (2026-11-28)

- Właściciel przywrócił wspólne wyszukiwanie. Start ustala lokalizację i pokazuje ją na mapie. Moduły odczytują potrzebne im identyfikatory z tego samego wyboru. D39 zastępuje D35 jako docelowy sposób wyszukiwania.
- W M3c przewidziano wybór jednostki administracyjnej, adresu lub działki według posiadanych danych. RCN korzysta z miejscowości i ulicy, Oferty z miejscowości i jej kodów, Działki z gminy, obrębu i działki, Podobne z działki lub adresu, a Gminy z gminy. Formularze zachowują własne filtry analizy, między innymi okres, powierzchnię i promień.
- Wynik wyszukiwania powinien rozróżniać powtarzalne nazwy przez kody i jednostki nadrzędne. Moduł pokazuje, jakiej części lokalizacji używa, jakiej jednostki mu brakuje i czy jego API obsługuje mniej dokładny zasięg. Zmiana lokalizacji oznacza wcześniejszy wynik jako pochodzący z poprzedniej lokalizacji.
- W M9 raport RCN otrzyma opcjonalną sekcję z wynikami Ofert dla tej samej lokalizacji. Podczas dołączania trzeba sprawdzić powiązanie identyfikatorów, pokazać zastosowane filtry i przedstawić ceny transakcyjne RCN oraz ceny ofertowe w osobnych sekcjach z własnymi statystykami. Wynik z innej lokalizacji lub brak wyników trzeba pokazać przed wygenerowaniem raportu. Zakres dołączanych wierszy i format załącznika są do potwierdzenia w M9. Udostępnianie wyników Ofert nadal podlega decyzji D12.
- Kolejność robocza to odbiór M6, pozostałe moduły M7–M8, wspólne wyszukiwanie M3c i raport M9. Ten zapis aktualizuje plan bieżącego etapu.

## Zasady repozytorium

[FAKT: decyzja właściciela z 2026-10-26] Repozytorium jest publiczne. Nie zapisujemy w nim wartości sekretów, konfiguracji, tokenów, kluczy, danych osobowych ani identyfikatorów kont lub usług. Wyjątkiem jest niesekretna wartość trybu źródło danych RCN. Pięć repozytoriów źródłowych jest tylko do odczytu.

## Źródła do potwierdzenia w M1

- CORS `*` dla backendów RCN, Oferty, Działek i Podobnych: [FAKT: pomiar właściciela 2026-10-27; wynik w CONFIG.md].
- Punkt wejścia usługi Ofert `node server.js`: [FAKT z kodu: server.js:1-2,10-17; przegląd checkoutu zgodnego z wdrożonym SHA; reports/m1a-code-review.md C1].

