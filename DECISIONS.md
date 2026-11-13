# DECISIONS.md — decyzje i kwestie otwarte

**Data aktualizacji:** 2026-10-26. Ustalenia właściciela z tej daty mają pierwszeństwo przed starszymi zapisami.

## D1 — Źródło danych RCN (2026-10-27)

- **Status:** rozstrzygnięte; potwierdzone przez właściciela.
- **Decyzja:** `źródło danych RCN = r2_parquet` [FAKT: odczyt właściciela z panelu 2026-10-27]. To niesekretna wartość trybu.
- **Wpływ architektury:** moduł RCN planuje się i porównuje z danymi Parquet w R2. Szczegóły pomiaru znajdują się w CONFIG.md.

## D2 — Wspólny słownik lokalizacji (2026-10-27)

- **Status:** otwarte; do ponownego podjęcia w M3b z plikami TERC/SIMC z GUS od właściciela.
- **Decyzja:** [FAKT z kodu] RCN ładuje SIMC z cache, a przy jego braku pobiera SIMC i TERC, z małym `teryt_places.csv` jako fallback. Kod zwraca TERYT gminy i SIMC miejscowości; szczegóły i ograniczenia próbek zapisano w reports/m1c-d2-simc.md.
- **Wpływ architektury:** TERYT/SIMC pozostaje kandydatem wspólnego klucza. Właściciel dostarczy pliki TERC/SIMC z GUS do M3b; pełna lista i zachowanie przy nazwach powtarzalnych wymagają potwierdzenia.

## D3 — Miejsce aplikacji (2026-10-26)

- **Status:** rozstrzygnięte; NIEBLOKUJĄCE.
- **Decyzja:** Centrum Analiz Nieruchomości jest samodzielną aplikacją, poza portalem i panelem denem.pl. Nie modyfikujemy repozytorium denem1984/denem.
- **Wpływ architektury:** wcześniejszy wariant powłoki w panelu został odrzucony; sprawdzanie kodu panelu nie jest warunkiem startu.

## D4 — Sposób otwierania modułów (2026-10-26)

- **Status:** rozstrzygnięte dla planowanej architektury; NIEBLOKUJĄCE.
- **Decyzja:** moduły są natywnymi zakładkami aplikacji, a integracja odbywa się przez bezpośrednie wywołania API. Nie zakładamy iframe.
- **Wpływ architektury:** kontrola nagłówków pod kątem osadzania nie jest wymagana. D4 wraca tylko wtedy, gdy właściciel ponownie rozważy iframe.

## D5 — Logowanie i dostęp (2026-10-27)

- **Status:** otwarte; właściciel rozstrzyga przed M8.
- **Decyzja:** do czasu tej decyzji aplikacja nie ma własnej bramki. Nie wdrażać własnego logowania ani kontroli dostępu w M0–M7.
- **Wniosek techniczny:** [FAKT: pomiar właściciela 2026-10-27] preflight Ofert, Działek i Podobnych nie dopuszcza nagłówka Authorization; RCN go dopuszcza. [HIP] Nowa aplikacja nie powinna przekazywać tokenów do trzech pierwszych usług. To ograniczenie transportu CORS nie rozstrzyga modelu dostępu aplikacji.
- [FAKT: ustalenie właściciela 2026-10-27] Moduł Gminy korzysta z pliku danych (opcja B) i nie zależy od Supabase ani logowania modułu.
- **Wpływ architektury:** logowanie całej aplikacji pozostaje odrębną decyzją D5 do rozstrzygnięcia przed M8; szczegóły pomiaru są w CONFIG.md.

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

## D8 — Identyfikatory dostępu do modułów (2026-10-26)

- **Status:** otwarte; do decyzji razem z D5 przed M8.
- **Decyzja:** rekomendacja pozostaje: slug nowej aplikacji mega i uprawnienia do zakładek zgodne ze slugami modułów; właściciel potwierdzi to razem z D5 przed M8.
- **Wpływ architektury:** brak zmiany statusu; do tego czasu nie implementować bramki.

## D9 — Mapowanie BDL ↔ TERYT (2026-10-27)

- **Status:** otwarte; wraca w M3b/M8 po otrzymaniu przez właściciela pełnego eksportu gmin i plików TERC/SIMC.
- **Decyzja:** [FAKT: odczyt właściciela z panelu 2026-10-27] `gus_bdl_commune_wide` nie ma kolumny TERYT. [FAKT z danych] Dołączony CSV zawiera 100 jednostek i tylko jeden kod województwa; wyprowadzona reguła daje 100 unikalnych kandydatów TERC7, ale tylko jeden kandydat można porównać z lokalnym 22-wierszowym fallbackiem RCN. Szczegóły są w reports/m1c-d9-mapping.md.
- **Rekomendacja [HIP]:** dla M3b rozważyć wyliczanie TERC7 z `unit_id` po walidacji całego zbioru 2479 jednostek z autorytatywnym TERC. Nie zamykać D9 na podstawie próbki.
- **Wpływ architektury:** właściciel dostarczy pełny eksport gmin do M8 oraz pliki TERC/SIMC z GUS; zależność mapowania pozostaje otwarta do walidacji. Wspólne wyszukiwanie M3 nadal używa TERYT/SIMC.

## D10 — Zakres raportu zbiorczego (2026-10-26)

- **Status:** otwarte; rozstrzygnąć przed M9.
- **Decyzja:** określić odbiorcę, format i wymagane sekcje raportu.
- **Wpływ architektury:** raport pozostaje w M9; bez zmiany statusu.

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

## Zasady repozytorium

[FAKT: decyzja właściciela z 2026-10-26] Repozytorium jest publiczne. Nie zapisujemy w nim wartości sekretów, konfiguracji, tokenów, kluczy, danych osobowych ani identyfikatorów kont lub usług. Wyjątkiem jest niesekretna wartość trybu źródło danych RCN. Pięć repozytoriów źródłowych jest tylko do odczytu.

## Źródła do potwierdzenia w M1

- CORS `*` dla backendów RCN, Oferty, Działek i Podobnych: [FAKT: pomiar właściciela 2026-10-27; wynik w CONFIG.md].
- Punkt wejścia usługi Ofert `node server.js`: [FAKT z kodu: server.js:1-2,10-17; przegląd checkoutu zgodnego z wdrożonym SHA; reports/m1a-code-review.md C1].


