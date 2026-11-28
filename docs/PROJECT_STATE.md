# Stan projektu — Centrum Analiz Nieruchomości

Aktualizacja: 2026-11-27. Dokument przejęcia jest uzupełniany podczas weryfikacji repozytorium.

## Potwierdzony punkt startowy

- [FAKT: lokalna historia Git] `main`: `3ebed06717c1732fbb1cb996daccbef987b5d2e2`, scalony PR #12 (M4d.1).
- [FAKT: porównanie plików z HEAD] Dostarczony katalog był bez metadanych Git; odtworzono historię bez nadpisywania plików. Pliki odpowiadały HEAD.
- [FAKT: pierwszy przebieg testów] 119 testów, 117 PASS, 2 FAIL (sandbox blokuje połączenie z lokalnym serwerem: EACCES); czas 40,54 s.
- [FAKT: kod testu] Końcowa mapa w `tests/dzialki-module.test.mjs` pozostawała zamontowana. Monitor konturów utrzymywał licznik przez 40 s.
- Nie wykonywano pomiarów usług zewnętrznych ani operacji zarządzania usługami.

## Kolejka akceptacji

| Kolejność | Gałąź | Zakres | Status |
|---|---|---|---|
| 1 | `fix/dzialki-test-cleanup` | Odmontowanie map po teście startowym, także przy błędzie asercji | [PR #13](https://github.com/denem1984/centrum-analiz-nieruchomosci/pull/13), 119/119 PASS, 0,69 s |
| 2 | `fix/edge-headed-cdp` | Osobny profil, port z DevToolsActivePort, lokalny sprawdzian Edge | PR do utworzenia; oparty na #13 |

## Weryfikacja poprawki testu

[FAKT: przebieg 2026-11-27] `node --test scripts/*.test.mjs tests/*.test.mjs`: 119/119 PASS, 688,88 ms (po dopuszczeniu lokalnych połączeń testowych). Test startowy z atrapą DOM sprawdza usunięcie każdej mapy oraz odłączenie monitorów i retry; hook sprząta również przy błędzie asercji. Nie zmieniono kodu aplikacji. Początkowe skany plików i historii: PASS (78 plików, 58 commitów).

Sprawdzenie właściciela (opcjonalne dla tej poprawki): w PowerShell w folderze projektu wpisać `node --test scripts/*.test.mjs tests/*.test.mjs`; oczekiwane 119 PASS i zakończenie poniżej 5 s, bez 40-sekundowej pauzy.

## Weryfikacja poprawki Edge

[FAKT: pomiar 2026-11-27] `node scripts/browser-smoke.mjs --headed --check-browser`: PASS w rzeczywistym Edge z oknem; CDP połączyło się przez port zapisany w nowym profilu. Zrzut `browser-check.png` obejrzano; poprawny tekst PASS jest widoczny. Wyniki lokalne: `.local-results/browser-smoke-2026-11-27T19-18-25-329Z/`. Nie otwierano mapy ani usług zewnętrznych. To nie jest dowód kompletności KIEG.

`node --test --test-reporter=dot scripts/*.test.mjs tests/*.test.mjs`: PASS (123 testy). Nowe testy obejmują niepełny plik portu, zakończenie launchera, niezgodny/obcy WebSocket, błędy HTTP i limit czasu, bez sieci i rzeczywistego czekania. Instrukcja właściciela: `scripts/README-run.md`, sekcja „Sprawdzenie Edge i diagnostyka mapy”.

## Następna praca

1. Potwierdzić pełny zestaw testów poniżej 5 s i wykonać oba skany sekretów.
2. Naprawić połączenie CDP w trybie Edge z oknem; osobny PR.
3. Uzupełnić dokumentację przejęcia i plan M4d.2–M10 w PR `docs: handover`.
4. Zrealizować podetapy według zlecenia właściciela, bez scalania PR-ów i wdrożeń.
