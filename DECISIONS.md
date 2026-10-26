# DECISIONS.md — decyzje i kwestie otwarte

**Data aktualizacji:** 2026-10-26. Ustalenia właściciela z tej daty mają pierwszeństwo przed starszymi zapisami.

## D1 — Źródło danych RCN (2026-10-26)

- **Status:** wstępne wskazanie; potwierdzenie w M1.
- **Decyzja:** wstępny wybór to Parquet z Cloudflare R2. Właściciel odczyta w M1 niesekretną wartość RCN_DATA_SOURCE, aby potwierdzić rzeczywisty tryb.
- **Wpływ architektury:** brak zmiany statusu; tryb wpływa na interpretację danych i pomiary modułu RCN.

## D2 — Wspólny słownik lokalizacji (2026-10-26)

- **Status:** kandydat do potwierdzenia w M1.
- **Decyzja:** kandydatem jest słownik SIMC z aplikacji RCN. W M1 sprawdzić jego dostępność, wymagane pola i możliwość wykorzystania przez istniejące API.
- **Wpływ architektury:** brak zmiany statusu; TERYT/SIMC pozostaje wspólnym kluczem dla wyszukiwania.

## D3 — Miejsce aplikacji (2026-10-26)

- **Status:** rozstrzygnięte; NIEBLOKUJĄCE.
- **Decyzja:** Centrum Analiz Nieruchomości jest samodzielną aplikacją, poza portalem i panelem denem.pl. Nie modyfikujemy repozytorium denem1984/denem.
- **Wpływ architektury:** wcześniejszy wariant powłoki w panelu został odrzucony; sprawdzanie kodu panelu nie jest warunkiem startu.

## D4 — Sposób otwierania modułów (2026-10-26)

- **Status:** rozstrzygnięte dla planowanej architektury; NIEBLOKUJĄCE.
- **Decyzja:** moduły są natywnymi zakładkami aplikacji, a integracja odbywa się przez bezpośrednie wywołania API. Nie zakładamy iframe.
- **Wpływ architektury:** kontrola nagłówków pod kątem osadzania nie jest wymagana. D4 wraca tylko wtedy, gdy właściciel ponownie rozważy iframe.

## D5 — Logowanie i dostęp (2026-10-26)

- **Status:** otwarte; właściciel rozstrzyga przed M8.
- **Decyzja:** do czasu tej decyzji aplikacja nie ma własnej bramki. Nie wdrażać własnego logowania ani kontroli dostępu w M0–M7.
- **Wpływ architektury:** bez zmiany integracji bezpośrednio z API; dostęp musi być rozstrzygnięty przed rozpoczęciem modułu Gminy.

## D6 — Automatyzacja testów (2026-10-26)

- **Status:** do ponownej oceny w M2.
- **Decyzja:** M2 określi podstawowe lintowanie, build i testy dla nowej aplikacji. Testy ręczne modułów pozostają w macierzy regresji.
- **Wpływ architektury:** brak zmiany statusu.

## D7 — Łączenie backendów źródłowych (2026-10-26)

- **Status:** poza zakresem M0–M10.
- **Decyzja:** nie zmieniamy ani nie łączymy backendów w pięciu repozytoriach źródłowych. Ewentualne prace wymagają osobnego polecenia właściciela.
- **Wpływ architektury:** nowa aplikacja łączy moduły przez API; nie wymaga łączenia usług.

## D8 — Identyfikatory dostępu do modułów (2026-10-26)

- **Status:** otwarte; do decyzji razem z D5 przed M8.
- **Decyzja:** rekomendacja pozostaje: slug nowej aplikacji mega i uprawnienia do zakładek zgodne ze slugami modułów; właściciel potwierdzi to razem z D5 przed M8.
- **Wpływ architektury:** brak zmiany statusu; do tego czasu nie implementować bramki.

## D9 — Mapowanie BDL ↔ TERYT (2026-10-26)

- **Status:** otwarte; sprawdzić w M1, wymagane przed M8.
- **Decyzja:** potwierdzić wiarygodne mapowanie identyfikatora jednostki BDL na TERYT dla modułu Gminy.
- **Wpływ architektury:** pozostaje zależnością modułu Gminy; wspólne wyszukiwanie M3 nadal używa TERYT/SIMC.

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

- CORS `*` dla backendów RCN, Oferty, Działek i Podobnych: [FAKT z audytu kodu AUDIT.md; do potwierdzenia pomiarem w M1].
- Punkt wejścia usługi Ofert `node server.js`: [FAKT: odczyt konfiguracji usługi przez kierownika 2026-10-26; do potwierdzenia w kodzie].
