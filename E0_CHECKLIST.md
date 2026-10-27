# E0_CHECKLIST.md — checklista pomiarów M1

**Status na 2026-10-27:** M0 wykonane. M1 wykonane warunkowo; D2 i D9 pozostają otwarte i wracają w M3/M8 po otrzymaniu od właściciela plików TERC/SIMC z GUS oraz pełnego eksportu gmin. Pozostałe nieodhaczone pozycje wymagają własnego źródła potwierdzenia.
**Zakres:** checklista pomiarów M1. M1 ma charakter wyłącznie odczytowy; nie zmienia ustawień, danych, wdrożeń ani konfiguracji produkcyjnej.

[FAKT: według ustaleń właściciela z 2026-10-26] Repozytorium jest publiczne. Do CONFIG.md wpisuje się tylko nazwy zmiennych i status ustawienia, nigdy wartości sekretów. Wyjątek stanowi niesekretna wartość RCN_DATA_SOURCE.

D3 (miejsce aplikacji) i D4 (iframe) są NIEBLOKUJĄCE. Samodzielna aplikacja nie wymaga przeglądu panelu ani pomiaru nagłówków pod kątem ramek. D4 wraca tylko po ponownym rozważeniu iframe przez właściciela.

## 1. CORS i preflight czterech API

[FAKT z audytu kodu AUDIT.md; do potwierdzenia pomiarem w M1] Dokumentacja audytu wskazuje CORS `*` dla czterech backendów; rzeczywiste odpowiedzi i preflight pozostają do zmierzenia.

Dla każdego API wykonaj bezpieczne wywołanie z origin spoza domeny usługi i zapisz metodę, origin, datę oraz odpowiedź. Nie wysyłaj sekretów.

- [x] RCN — CORS dla żądania właściwego. [FAKT: pomiar właściciela 2026-10-27; wynik w CONFIG.md]
- [x] RCN — OPTIONS z nagłówkiem Authorization. [FAKT: pomiar właściciela 2026-10-27; wynik w CONFIG.md]
- [x] Oferty — CORS dla żądania właściwego. [FAKT: pomiar właściciela 2026-10-27; wynik w CONFIG.md]
- [x] Oferty — OPTIONS z nagłówkiem Authorization. [FAKT: pomiar właściciela 2026-10-27; wynik w CONFIG.md]
- [x] Działki — CORS dla żądania właściwego. [FAKT: pomiar właściciela 2026-10-27; wynik w CONFIG.md]
- [x] Działki — OPTIONS z nagłówkiem Authorization. [FAKT: pomiar właściciela 2026-10-27; wynik w CONFIG.md]
- [x] Podobne — CORS dla żądania właściwego. [FAKT: pomiar właściciela 2026-10-27; wynik w CONFIG.md]
- [x] Podobne — OPTIONS z nagłówkiem Authorization. [FAKT: pomiar właściciela 2026-10-27; wynik w CONFIG.md]

## 2. Zimny i ciepły start

- [x] Dla RCN, Ofert, Działek i Podobnych zapisano czas dwóch kolejnych wywołań. Status zimnego startu pozostaje [HIP], bo nie potwierdzono 15 minut bezczynności. Wyniki w CONFIG.md.
- [ ] Nie restartować usług ani nie zmieniać ustawień w celu wymuszenia zimnego startu.
- [x] Metoda: dwa kolejne wywołania w odstępie 2 s; status zimnego startu oznaczony [HIP], bo bezczynności ≥15 min nie potwierdzono. Wynik w CONFIG.md.

## 3. D1 — źródło danych RCN

- [x] Właściciel odczytał wartość RCN_DATA_SOURCE; potwierdzone w CONFIG.md [FAKT: odczyt właściciela z panelu 2026-10-27].
- [x] Do CONFIG.md wpisano tryb źródła i źródło potwierdzenia; nie dopisano innych wartości zmiennych.
- [x] Status D1: Parquet/R2 potwierdzone [FAKT: odczyt właściciela z panelu 2026-10-27; CONFIG.md].

## 4. D2 — TERYT/SIMC

[Status: otwarte, przeniesione do M3] Właściciel dostarczy pliki TERC/SIMC z GUS. Do czasu ich otrzymania poniższe punkty pozostają nieodhaczone.

- [ ] Sprawdzić wyłącznie przez odczyt kodu i dostępnych odpowiedzi API, jakie pola słownika są dostępne.
- [ ] Potwierdzić kody TERYT/SIMC i rozróżnianie miejscowości o tej samej nazwie.
- [ ] Zapisać źródło oraz braki w CONFIG.md bez zmieniania repozytoriów źródłowych.

## 5. D9 — mapowanie BDL ↔ TERYT

[Status: otwarte, wraca w M3/M8] Właściciel dostarczy pliki TERC/SIMC z GUS oraz pełny eksport gmin. Próbka 100 rekordów nie zamyka D9.

- [ ] Potwierdzić dostępne, zatwierdzone źródło mapowania identyfikatora BDL na TERYT.
- [ ] Nie zakładać, że unit_id zawiera kod TERYT.
- [ ] Zapisać źródło potwierdzenia albo oznaczyć D9 jako nieustalone; D9 pozostaje warunkiem rozpoczęcia M8.

## 5a. Gminy — struktura tabeli przekazana przez właściciela

- [x] Zapisano strukturę `gus_bdl_commune_wide`, pola i liczności `unit_kind` w CONFIG.md [FAKT: odczyt właściciela z panelu 2026-10-27]. Nie oznacza to potwierdzenia mapowania BDL ↔ TERYT; D9 pozostaje otwarte.

## 6. Punkt wejścia Ofert

- [x] Punkt wejścia produkcji `node server.js` potwierdzono w kodzie i porównano z `npm start` [FAKT z kodu: reports/m1a-code-review.md C1].
- [x] Rozbieżność względem AUDIT.md sprawdzono wyłącznie przez odczyt kodu [FAKT z kodu: reports/m1a-code-review.md C1].
- [x] Punkt wejścia zapisano w CONFIG.md; bez zmian ustawień usługi.

## 6a. Podobne — reguły hostingu frontu

- [x] Odczytano z panelu reguły przekierowań/rewrite usługi statycznej frontu Podobnych; brak reguł [FAKT: odczyt właściciela z panelu 2026-10-27; CONFIG.md].

## 7. RCN — odczyt kodu frontendu

- [x] W repozytorium rcn-web-app tylko do odczytu sprawdzono, czy frontend wywołuje data_source_refresh [FAKT z kodu: reports/m1a-code-review.md B2].
- [x] Sprawdzono wywołania tras admin/debug [FAKT z kodu: reports/m1a-code-review.md B2].
- [x] Wynik zapisano w raporcie; repozytorium źródłowe pozostało bez zmian.

## 8. Status RCN_ADMIN_TOKEN

- [ ] Status dopuszczalne wartości: ustawiony / nieustawiony / nieznany.
- [ ] [FAKT: zrzut listy zmiennych przekazany przez właściciela 2026-10-26] na zrzucie RCN_ADMIN_TOKEN jest nieustawiony.
- [ ] [HIP] kompletność zrzutu i to, czy dotyczy właściwej usługi, nie są w pełni potwierdzone; status wymaga weryfikacji.
- [ ] Zapisać wyłącznie status. Nie wpisywać wartości ani szczegółów o skutkach.

## 9. Wyniki M1

- [x] CORS i OPTIONS z Authorization — RCN: wyniki w CONFIG.md [FAKT: pomiar właściciela 2026-10-27].
- [x] CORS i OPTIONS z Authorization — Oferty: wyniki w CONFIG.md [FAKT: pomiar właściciela 2026-10-27].
- [x] CORS i OPTIONS z Authorization — Działki: wyniki w CONFIG.md [FAKT: pomiar właściciela 2026-10-27].
- [x] CORS i OPTIONS z Authorization — Podobne: wyniki w CONFIG.md [FAKT: pomiar właściciela 2026-10-27].
- [x] Dwa kolejne czasy i metoda: wyniki w CONFIG.md; klasyfikacja zimnego startu pozostaje [HIP].
- [x] D1 — źródło danych RCN: potwierdzone w CONFIG.md [FAKT: odczyt właściciela z panelu 2026-10-27].
- [ ] D2 — oczekuje na pliki TERC/SIMC od właściciela; powrót w M3.
- [ ] D9 — oczekuje na pełny eksport gmin i TERC/SIMC; powrót w M3/M8.
- [x] Oferty — punkt wejścia potwierdzono w reports/m1a-code-review.md C1.
- [x] SHA wdrożonych commitów — odczyt właściciela z panelu; lista w CONFIG.md [FAKT: 2026-10-27].
- [x] RCN frontend — wywołania sprawdzono tylko do odczytu; wynik w reports/m1a-code-review.md B2.
- [ ] RCN_ADMIN_TOKEN — status: __________________________________________
- [ ] Otwarte kwestie, źródła i data: ___________________________________

## 10. Ograniczenia

- [ ] Nie zmieniono pięciu repozytoriów źródłowych, konfiguracji ani danych.
- [ ] Nie wykonano operacji na Render, Supabase ani Cloudflare R2 podczas M0.
- [ ] Nie odczytano ani nie zapisano sekretów.
- [ ] D3 i D4 pozostają nieblokujące zgodnie z DECISIONS.md.
