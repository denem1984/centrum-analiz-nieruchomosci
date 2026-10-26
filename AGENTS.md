# AGENTS.md — instrukcje dla agentów pracujących nad MEGA DENEM

## Źródło prawdy
1. Przed pracą przeczytaj `README.md`, `MEGA_PROJECT.md`, `DECISIONS.md` oraz właściwy etap `IMPLEMENTATION_PLAN.md`.
2. Kod pięciu istniejących aplikacji jest w osobnych repozytoriach. Przed zmianami sprawdź aktualny kod w GitHub; nie polegaj wyłącznie na audycie.
3. Dokumentacja tego repo opisuje zamiary i decyzje, ale nie zastępuje weryfikacji rzeczywistego kodu i konfiguracji.

## Zasady bezpieczeństwa i zmian
- Do czasu formalnego zamknięcia E0 wykonuj wyłącznie odczyt i dokumentację. Bez zmian kodu, konfiguracji produkcyjnej, danych ani wdrożeń.
- Nie kopiuj do plików, promptów ani logów sekretów, tokenów, haseł i kluczy API.
- Nie przebudowuj działających funkcji i nie zmieniaj UI bez uzasadnionej potrzeby oraz zatwierdzonego zakresu.
- Nie modyfikuj pięciu repozytoriów źródłowych bez osobnego zadania.
- Nie wdrażaj na produkcję bez wyraźnej zgody właściciela.
- Pracuj w małych, odwracalnych zmianach i na osobnej gałęzi, gdy rozpocznie się implementacja.
- Nie usuwaj tras diagnostycznych ani plików, dopóki analiza referencji w kodzie nie potwierdzi, że nie są używane.

## Weryfikacja
- Dla każdego zadania podaj zakres, pliki zmienione, testy uruchomione i wynik.
- Nie twierdź, że test przeszedł, jeśli faktycznie go nie uruchomiono.
- Jeśli dokumenty są sprzeczne, kod zachowuje się inaczej niż opis, lub zadanie wymaga decyzji architektonicznej, zatrzymaj się i przedstaw problem.
- Po każdej zmianie oceniaj regresje w istniejących modułach i zachowuj kompatybilność starych adresów oraz uruchomienia bez kontekstu.

## Współpraca agentów
- Claude: analiza, plan, decyzje, niezależny przegląd.
- Codex: realizacja zatwierdzonych zadań, testy i raport zmian.
- Nie zlecaj dwóm agentom równoczesnej edycji tych samych plików.
- Zadanie implementacyjne musi zawierać kryteria akceptacji.
