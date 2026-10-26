# E0_CHECKLIST.md — checklista pomiarów M1

**Zakres:** przygotowanie pomiarów M1. W M0 tę checklistę jedynie aktualizujemy. M1 ma charakter wyłącznie odczytowy; nie zmienia ustawień, danych, wdrożeń ani konfiguracji produkcyjnej.

[FAKT: według ustaleń właściciela z 2026-10-26] Repozytorium jest publiczne. Do CONFIG.md wpisuje się tylko nazwy zmiennych i status ustawienia, nigdy wartości sekretów. Wyjątek stanowi niesekretna wartość RCN_DATA_SOURCE.

D3 (miejsce aplikacji) i D4 (iframe) są NIEBLOKUJĄCE. Samodzielna aplikacja nie wymaga przeglądu panelu ani pomiaru nagłówków pod kątem ramek. D4 wraca tylko po ponownym rozważeniu iframe przez właściciela.

## 1. CORS i preflight czterech API

Dla każdego API wykonaj bezpieczne wywołanie z origin spoza domeny usługi i zapisz metodę, origin, datę oraz odpowiedź. Nie wysyłaj sekretów.

- [ ] RCN — CORS dla żądania właściwego.
- [ ] RCN — OPTIONS z nagłówkiem Authorization.
- [ ] Oferty — CORS dla żądania właściwego.
- [ ] Oferty — OPTIONS z nagłówkiem Authorization.
- [ ] Działki — CORS dla żądania właściwego.
- [ ] Działki — OPTIONS z nagłówkiem Authorization.
- [ ] Podobne — CORS dla żądania właściwego.
- [ ] Podobne — OPTIONS z nagłówkiem Authorization.

## 2. Zimny i ciepły start

- [ ] Dla RCN, Ofert, Działek i Podobnych zapisać czas pierwszego wywołania po bezczynności i czas kolejnego wywołania.
- [ ] Nie restartować usług ani nie zmieniać ustawień w celu wymuszenia zimnego startu.
- [ ] Opisać metodę pomiaru i oznaczyć wynik [FAKT] albo [HIP].

## 3. D1 — źródło danych RCN

- [ ] Właściciel odczytuje wartość RCN_DATA_SOURCE; to wartość niesekretna.
- [ ] Do CONFIG.md wpisać tryb źródła i źródło potwierdzenia; nie dopisywać żadnych innych wartości zmiennych.
- [ ] Status D1: Parquet/R2 potwierdzone / WFS potwierdzone / nieustalone.

## 4. D2 — TERYT/SIMC

- [ ] Sprawdzić wyłącznie przez odczyt kodu i dostępnych odpowiedzi API, jakie pola słownika są dostępne.
- [ ] Potwierdzić kody TERYT/SIMC i rozróżnianie miejscowości o tej samej nazwie.
- [ ] Zapisać źródło oraz braki w CONFIG.md bez zmieniania repozytoriów źródłowych.

## 5. D9 — mapowanie BDL ↔ TERYT

- [ ] Potwierdzić dostępne, zatwierdzone źródło mapowania identyfikatora BDL na TERYT.
- [ ] Nie zakładać, że unit_id zawiera kod TERYT.
- [ ] Zapisać źródło potwierdzenia albo oznaczyć D9 jako nieustalone; D9 pozostaje warunkiem rozpoczęcia M8.

## 6. Punkt wejścia Ofert

- [ ] [FAKT: według kontekstu właściciela z 2026-10-26] usługa na Render ma startować poleceniem node server.js.
- [ ] W AUDIT.md opisano ścieżkę npm start. Sprawdzić wyłącznie przez odczyt kodu, czy wskazany punkt wejścia i ścieżka startu odpowiadają aktualnemu kodowi.
- [ ] Zapisać potwierdzony punkt wejścia w CONFIG.md z oznaczeniem [FAKT] albo [HIP]. Nie zmieniać ustawień usługi.

## 7. RCN — odczyt kodu frontendu

- [ ] W repozytorium rcn-web-app tylko do odczytu sprawdzić, czy frontend wywołuje data_source_refresh.
- [ ] Sprawdzić, czy frontend wywołuje trasy admin/debug.
- [ ] Zanotować znalezione wywołania albo ich brak w zakresie sprawdzonego kodu; nie zmieniać repozytorium.

## 8. Status RCN_ADMIN_TOKEN

- [ ] Status dopuszczalne wartości: ustawiony / nieustawiony / nieznany.
- [ ] [FAKT: zrzut listy zmiennych przekazany przez właściciela 2026-10-26] na zrzucie RCN_ADMIN_TOKEN jest nieustawiony.
- [ ] [HIP] kompletność zrzutu i to, czy dotyczy właściwej usługi, nie są w pełni potwierdzone; status wymaga weryfikacji.
- [ ] Zapisać wyłącznie status. Nie wpisywać wartości ani szczegółów o skutkach.

## 9. Wyniki M1

- [ ] CORS i OPTIONS z Authorization — RCN: ______________________________
- [ ] CORS i OPTIONS z Authorization — Oferty: ___________________________
- [ ] CORS i OPTIONS z Authorization — Działki: __________________________
- [ ] CORS i OPTIONS z Authorization — Podobne: __________________________
- [ ] Zimny/ciepły start i metoda: ________________________________________
- [ ] D1 — źródło danych RCN: ____________________________________________
- [ ] D2 — dostępne pola TERYT/SIMC: _____________________________________
- [ ] D9 — mapowanie BDL ↔ TERYT: _______________________________________
- [ ] Oferty — punkt wejścia: ____________________________________________
- [ ] RCN frontend — wywołania sprawdzone tylko do odczytu: ______________
- [ ] RCN_ADMIN_TOKEN — status: __________________________________________
- [ ] Otwarte kwestie, źródła i data: ___________________________________

## 10. Ograniczenia

- [ ] Nie zmieniono pięciu repozytoriów źródłowych, konfiguracji ani danych.
- [ ] Nie wykonano operacji na Render, Supabase ani Cloudflare R2 podczas M0.
- [ ] Nie odczytano ani nie zapisano sekretów.
- [ ] D3 i D4 pozostają nieblokujące zgodnie z DECISIONS.md.