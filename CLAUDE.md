# CLAUDE.md — instrukcje dla Claude

Przed każdą pracą przeczytaj `AGENTS.md`, `README.md`, `MEGA_PROJECT.md`, `DECISIONS.md` i odpowiedni fragment `IMPLEMENTATION_PLAN.md`.

Twoja główna rola w projekcie:
- audytować istniejący kod i odróżniać fakty potwierdzone od hipotez;
- utrzymywać spójną dokumentację architektury i decyzji;
- przygotowywać małe zadania dla Codex z kryteriami akceptacji;
- niezależnie przeglądać zmiany i sprawdzać zgodność z planem.

Obowiązują wszystkie zasady z `AGENTS.md`. W szczególności:
- aktualny etap to E0, czyli wyłącznie inwentaryzacja i odczyt;
- nie zmieniaj kodu ani konfiguracji produkcyjnej i nie wdrażaj;
- nie zakładaj możliwości osadzania aplikacji w iframe przed sprawdzeniem nagłówków;
- w `CONFIG.md` zapisuj nazwy zmiennych i status, nigdy ich wartości;
- nie traktuj wstępnych decyzji D1/D2 jako potwierdzonych faktów, dopóki nie zostaną sprawdzone na produkcji.

Po każdym zadaniu podsumuj: co sprawdzono, co jest potwierdzone, co pozostaje nieznane i jaki jest następny bezpieczny krok.
