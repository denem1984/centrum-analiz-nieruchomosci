# DECISIONS.md — decyzje i kwestie otwarte

**Data aktualizacji:** 2026-10-26. Ustalenia właściciela z tej daty mają pierwszeństwo przed starszymi zapisami.

## D1 — Źródło danych RCN (2026-10-27)

- **Status:** rozstrzygnięte; potwierdzone przez właściciela.
- **Decyzja:** `RCN_DATA_SOURCE = r2_parquet` [FAKT: odczyt właściciela z panelu 2026-10-27]. To niesekretna wartość trybu.
- **Wpływ architektury:** moduł RCN planuje się i porównuje z danymi Parquet w R2. Szczegóły pomiaru znajdują się w CONFIG.md.

## D2 — Wspólny słownik lokalizacji (2026-10-27)

- **Status:** otwarte; do ponownego podjęcia w M3 z plikami TERC/SIMC z GUS od właściciela.
- **Decyzja:** [FAKT z kodu] RCN ładuje SIMC z cache, a przy jego braku pobiera SIMC i TERC, z małym `teryt_places.csv` jako fallback. Kod zwraca TERYT gminy i SIMC miejscowości; szczegóły i ograniczenia próbek zapisano w reports/m1c-d2-simc.md.
- **Wpływ architektury:** TERYT/SIMC pozostaje kandydatem wspólnego klucza. Właściciel dostarczy pliki TERC/SIMC z GUS do M3; pełna lista i zachowanie przy nazwach powtarzalnych wymagają potwierdzenia.

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
- **Biblioteki zewnętrzne:** w M2 nie ładujemy CDN ani innych zasobów zewnętrznych. W M4 właściciel/kierownik zdecyduje, czy przypinać wersje CDN, czy dodać pliki do repo.
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

- **Status:** otwarte; wraca w M3/M8 po otrzymaniu przez właściciela pełnego eksportu gmin i plików TERC/SIMC.
- **Decyzja:** [FAKT: odczyt właściciela z panelu 2026-10-27] `gus_bdl_commune_wide` nie ma kolumny TERYT. [FAKT z danych] Dołączony CSV zawiera 100 jednostek i tylko jeden kod województwa; wyprowadzona reguła daje 100 unikalnych kandydatów TERC7, ale tylko jeden kandydat można porównać z lokalnym 22-wierszowym fallbackiem RCN. Szczegóły są w reports/m1c-d9-mapping.md.
- **Rekomendacja [HIP]:** dla M3 rozważyć wyliczanie TERC7 z `unit_id` po walidacji całego zbioru 2479 jednostek z autorytatywnym TERC. Nie zamykać D9 na podstawie próbki.
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

## Zasady repozytorium

[FAKT: decyzja właściciela z 2026-10-26] Repozytorium jest publiczne. Nie zapisujemy w nim wartości sekretów, konfiguracji, tokenów, kluczy, danych osobowych ani identyfikatorów kont lub usług. Wyjątkiem jest niesekretna wartość trybu RCN_DATA_SOURCE. Pięć repozytoriów źródłowych jest tylko do odczytu.

## Źródła do potwierdzenia w M1

- CORS `*` dla backendów RCN, Oferty, Działek i Podobnych: [FAKT: pomiar właściciela 2026-10-27; wynik w CONFIG.md].
- Punkt wejścia usługi Ofert `node server.js`: [FAKT z kodu: server.js:1-2,10-17; przegląd checkoutu zgodnego z wdrożonym SHA; reports/m1a-code-review.md C1].
