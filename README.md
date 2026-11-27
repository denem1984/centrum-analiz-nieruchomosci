# Centrum Analiz Nieruchomości

Samodzielna aplikacja do pracy z modułami analiz nieruchomości: Działki, RCN, Oferty, Podobne i Gminy. Moduły są natywnymi zakładkami i będą korzystać z istniejących usług przez API.

## Status

**Stan na 2026-11-27:** M0–M3a, M4a–M4c oraz M4d.1 są w `main` (PR #12). M4d.2, kolejne narzędzia Działek i pozostałe moduły wymagają implementacji. Kompletność KIEG nie została potwierdzona dla wszystkich historycznych pomiarów; scalenie nie oznacza odbioru usług zewnętrznych.

Aktualny stan, dowody, plan i **kolejka PR-ów do akceptacji**: [docs/PROJECT_STATE.md](docs/PROJECT_STATE.md). Agent sam planuje, implementuje, testuje i otwiera PR-y. Właściciel podejmuje decyzje produktowe, scala i wykonuje wdrożenia.

[FAKT: ustalenia właściciela] Gminy korzystają z pliku danych (2026-10-27). Cała aplikacja nigdy nie będzie miała logowania (D5, 2026-11-27); nie przenosimy bramek dostępu starych frontów.

## Uruchomienie lokalne

Instrukcja krok po kroku znajduje się w [scripts/README-run.md](scripts/README-run.md). Node.js 20 lub nowszy wystarczy; nie instaluj npm ani pakietów.

## Struktura repozytorium

- `app/` — statyczna aplikacja: HTML, CSS i moduły ES.
- `tests/` — testy routera, kontekstu lokalizacji, fikstur, rejestru modułów, sond zdrowia, konfiguracji i serwera lokalnego.
- `scripts/` — narzędzia pomiarowe i lokalny serwer statyczny.
- `reports/` — raporty przeglądów i decyzji technicznych.
- `docs/` — specyfikacja DenemContext v1, dokumentacja etapów i macierz parytetu Działek.
- `README.md`, `DECISIONS.md`, `IMPLEMENTATION_PLAN.md` — opis projektu, decyzje i etapy.

Aplikacja nie ma kroku budowania ani zależności npm. Lokalny podgląd serwuje katalog `app/`; ścieżki usług są w `app/js/config.js`.

## Sprawdzenie zmian

W PowerShell w katalogu projektu uruchom `node --test scripts/*.test.mjs tests/*.test.mjs`, następnie `node scripts/check-no-secrets.mjs` i `node scripts/check-no-secrets.mjs --history`. Zestaw testów korzysta z atrap usług; testy serwera łączą się tylko lokalnie. Wymagany czas zestawu: poniżej 5 s.

Samo uruchomienie Edge z oknem, bez map ani usług zewnętrznych: `node scripts/browser-smoke.mjs --headed --check-browser` (Node 22+). Instrukcje i interpretacja wyników są w [scripts/README-run.md](scripts/README-run.md). Test startowy z atrapą DOM jest obowiązkowy przy zmianie interfejsu; zgodność usług wymaga tabeli „stary front vs nowa aplikacja”, testów pełnych URL-i i browser-smoke.

