# Centrum Analiz Nieruchomości — MEGA DENEM

Centralne repozytorium planowania i rozwoju platformy MEGA, która ma połączyć pięć istniejących modułów DENEM bez niepotrzebnego przepisywania działających aplikacji.

## Repozytoria źródłowe

- [RCN Analizator](https://github.com/denem1984/rcn-web-app)
- [Analizator cen ofertowych](https://github.com/denem1984/Analizator-cen-ofertowych)
- [Analizator nieruchomości / działki](https://github.com/denem1984/analizator-nieruchomosci)
- [Rozkład nieruchomości podobnych](https://github.com/denem1984/rozklad-nieruchomosci-podobnych)
- [Gminy](https://github.com/denem1984/gminy)

## Zasada nadrzędna

Repozytorium jest centrum dokumentacji i docelowego kodu nowej powłoki MEGA. Pięć aplikacji źródłowych pozostaje w swoich repozytoriach i musi zachować dotychczasowe działanie oraz adresy.

## Aktualny etap

**E0 — inwentaryzacja produkcji.** Na tym etapie wolno tylko odczytywać i dokumentować konfigurację. Nie wolno zmieniać kodu, ustawień produkcyjnych ani wykonywać wdrożeń.

## Dokumentacja

- `AUDIT.md` — audyt pięciu repozytoriów.
- `MEGA_PROJECT.md` — proponowana architektura i zakres.
- `IMPLEMENTATION_PLAN.md` — etapy, kryteria akceptacji i testy.
- `DECISIONS.md` — decyzje i otwarte kwestie.
- `E0_CHECKLIST.md` — checklista inwentaryzacji produkcji.
- `CONFIG.md` — konfiguracja usług bez sekretów.
- `AGENTS.md` i `CLAUDE.md` — instrukcje pracy agentów.

## Bezpieczeństwo

Nie commituj haseł, tokenów, kluczy API ani wartości zmiennych środowiskowych. W `CONFIG.md` zapisuj wyłącznie nazwy zmiennych i status ich ustawienia. Każda zmiana kodu wymaga osobnego, jasno określonego zadania i testów regresyjnych.
