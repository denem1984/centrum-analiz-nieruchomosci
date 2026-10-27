# Centrum Analiz Nieruchomości

Samodzielna aplikacja do pracy z modułami analiz nieruchomości: Działki, RCN, Oferty, Podobne i Gminy. Moduły są natywnymi zakładkami i będą korzystać z istniejących usług przez API.

## Status

**M2 — szkielet aplikacji w trakcie.** Powłoka i makiety modułów są statyczne. W M2 nie ma logowania, zapisu danych ani logiki analitycznej modułów. Na stronie Start aplikacja sprawdza lekkie trasy zdrowia czterech usług metodą GET.

[FAKT: ustalenie właściciela 2026-10-27] Moduł Gminy ma korzystać z pliku danych, bez zależności od Supabase ani logowania modułu. Logowanie całej aplikacji pozostaje osobną decyzją D5 przed M8.

## Uruchomienie lokalne

Instrukcja krok po kroku znajduje się w [scripts/README-run.md](scripts/README-run.md). Node.js 20 lub nowszy wystarczy; nie instaluj npm ani pakietów.

## Struktura repozytorium

- `app/` — statyczna aplikacja: HTML, CSS i moduły ES.
- `tests/` — testy routera, rejestru modułów, sond zdrowia, konfiguracji i serwera lokalnego.
- `scripts/` — narzędzia pomiarowe i lokalny serwer statyczny.
- `reports/` — raporty przeglądów i decyzji technicznych.
- `README.md`, `DECISIONS.md`, `IMPLEMENTATION_PLAN.md` — opis projektu, decyzje i etapy.

Aplikacja nie ma kroku budowania ani zależności npm. Lokalny podgląd serwuje katalog `app/`; ścieżki usług są w `app/js/config.js`.
