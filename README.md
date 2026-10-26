# Centrum Analiz Nieruchomości

Samodzielna aplikacja do wspólnej pracy z pięcioma modułami analiz nieruchomości: działkami, transakcjami RCN, ofertami, nieruchomościami podobnymi i porównywaniem gmin.

[FAKT: decyzja właściciela z 2026-10-26] To repozytorium jest publiczne. Nowa aplikacja rozwijana jest niezależnie od portalu i panelu denem.pl. Pięć repozytoriów źródłowych pozostaje tylko do odczytu.

## Cel

Udostępnić moduły jako natywne zakładki jednej aplikacji. Każdy moduł będzie bezpośrednio wywoływał istniejący backend przez API. Nie zakładamy iframe i nie przepisujemy backendów. Wspólny kontekst lokalizacji i nieruchomości będzie oparty na DenemContext v1.

## Status

**Etap M0 — dokumentacja i zasady pracy.** Aplikacja nie ma jeszcze kodu. Przed modułem Gminy (M8) właściciel rozstrzygnie sposób logowania i dostępu; do tego czasu aplikacja nie ma własnej bramki.

## Moduły

- **Działki** — mapy, działki i warstwy przestrzenne.
- **RCN** — transakcje.
- **Oferty** — ceny ofertowe.
- **Podobne** — nieruchomości porównawcze.
- **Gminy** — porównywanie gmin.

Repozytoria źródłowe: rcn-web-app, Analizator-cen-ofertowych, analizator-nieruchomosci, rozklad-nieruchomosci-podobnych i gminy. Są tylko do odczytu; zmiany w nich wymagają osobnego polecenia właściciela.

## Struktura repozytorium

- README.md — cel, status i zasady orientacyjne.
- AGENTS.md i CLAUDE.md — role, zakazy oraz sposób współpracy.
- DECISIONS.md — decyzje właściciela i kwestie otwarte.
- MEGA_PROJECT.md — architektura docelowa.
- IMPLEMENTATION_PLAN.md — etapy M0–M10 i macierz regresji.
- E0_CHECKLIST.md — checklista pomiarów M1.
- CONFIG.md — szablon konfiguracji bez sekretów.
- scripts/check-no-secrets.mjs — skaner plików śledzonych przez Git.
- .github/workflows/secret-scan.yml — uruchomienie skanera na push i pull request.

## Pętla pracy

Kierownik przygotowuje prompt z zakresem i kryteriami akceptacji → Codex realizuje zadanie na osobnej gałęzi → Codex przedstawia raport → kierownik wydaje werdykt: ZATWIERDZONE, POPRAWKI albo STOP. Właściciel podejmuje decyzje, scala PR, wdraża i wykonuje testy ręczne.

## Zasady bezpieczeństwa

Repozytorium jest publiczne. Nie zapisuj w nim wartości konfiguracji, tokenów, kluczy ani danych osobowych. Dozwolone są nazwy zmiennych i status ustawienia. Jedyny wyjątek wartościowy to niesekretna wartość trybu RCN_DATA_SOURCE. Nie zapisuj identyfikatorów kont ani usług.