# Centrum Analiz Nieruchomości

Samodzielna aplikacja do pracy z modułami analiz nieruchomości: Działki, RCN, Oferty, Podobne i Gminy. Moduły są natywnymi zakładkami i będą korzystać z istniejących usług przez API.

## Status

**M3a — kontrakt lokalizacji i wyszukiwanie na fiksturach w trakcie.** M2 dostarczył statyczną powłokę i makiety. M3a dodaje DenemContext v1, pasek lokalizacji oraz wyszukiwanie na jawnie fikcyjnych danych. Nadal nie ma logowania, zapisu trwałego ani logiki analitycznej modułów. Na stronie Start aplikacja sprawdza lekkie trasy zdrowia czterech usług metodą GET.

[FAKT: ustalenie właściciela 2026-10-27] Moduł Gminy ma korzystać z pliku danych, bez zależności od Supabase ani logowania modułu. Logowanie całej aplikacji pozostaje osobną decyzją D5 przed M8.

## Uruchomienie lokalne

Instrukcja krok po kroku znajduje się w [scripts/README-run.md](scripts/README-run.md). Node.js 20 lub nowszy wystarczy; nie instaluj npm ani pakietów.

## Struktura repozytorium

- `app/` — statyczna aplikacja: HTML, CSS i moduły ES.
- `tests/` — testy routera, kontekstu lokalizacji, fikstur, rejestru modułów, sond zdrowia, konfiguracji i serwera lokalnego.
- `scripts/` — narzędzia pomiarowe i lokalny serwer statyczny.
- `reports/` — raporty przeglądów i decyzji technicznych.
- `docs/` — specyfikacja DenemContext v1 i dokumentacja etapów.
- `README.md`, `DECISIONS.md`, `IMPLEMENTATION_PLAN.md` — opis projektu, decyzje i etapy.

Aplikacja nie ma kroku budowania ani zależności npm. Lokalny podgląd serwuje katalog `app/`; ścieżki usług są w `app/js/config.js`.

