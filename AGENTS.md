# AGENTS.md — zasady pracy w repozytorium

## Źródła prawdy

Przed rozpoczęciem zadania przeczytaj README.md, AGENTS.md, CLAUDE.md, AUDIT.md, MEGA_PROJECT.md, IMPLEMENTATION_PLAN.md, DECISIONS.md, E0_CHECKLIST.md i CONFIG.md. Ustalenia właściciela z 2026-10-26 mają pierwszeństwo przed starszymi zapisami. AUDIT.md pozostaje dokumentem historycznym i nie jest zmieniany.

Aktualizacja właściciela z 2026-11-27 (zadanie przejęcia) ma pierwszeństwo przed wcześniejszym podziałem ról w CLAUDE.md i starszymi ograniczeniami pomiarów. Czytaj także `docs/PROJECT_STATE.md`, macierze parytetu, dokumentację modułu, raporty i kod dotyczący zadania.

## Zakazy bezwzględne

- Nie zmieniaj portalu denem.pl ani repozytorium denem1984/denem.
- Pięć repozytoriów źródłowych — rcn-web-app, Analizator-cen-ofertowych, analizator-nieruchomosci, rozklad-nieruchomosci-podobnych i gminy — jest tylko do odczytu. Nie zapisuj w nich zmian.
- Agent nie wykonuje operacji na panelach ani API zarządzania Render, Supabase i Cloudflare R2. Nie odczytuje ani nie zapisuje wartości zmiennych środowiskowych, także niesekretnych. Dopuszczone przez właściciela testy frontu korzystają wyłącznie z GET do publicznych hostów i ścieżek rzeczywiście używanych przez starą funkcję, objętych allowlistą browser-smoke i budżetem poniżej. Nie jest to zgoda na operacje zarządzania usługami.
- Nie wdrażaj zmian. Aktualizacja właściciela 2026-11-28 („Kontynuuj. I rób sam to merge”) zezwala agentowi na samodzielne scalanie PR-ów do main po sprawdzeniu testów, skanów i zależności. Nie oznacza zgody na wdrożenia ani operacje zarządzania usługami.
- Nie odczytuj, nie zapisuj ani nie wklejaj wartości sekretów, tokenów, haseł, kluczy ani wartości zmiennych środowiskowych. RCN_DATA_SOURCE jest niesekretną wartością trybu źródła i może zostać odczytana przez właściciela w M1.
- Repozytorium jest publiczne. Nie dodawaj do niego wartości konfiguracji, tokenów, kluczy, danych osobowych ani identyfikatorów kont lub usług. Dozwolone są nazwy zmiennych i status ustawienia; wyjątek stanowi niesekretna wartość RCN_DATA_SOURCE.
- Nie dopisuj nowych opisów luk bezpieczeństwa pięciu starych aplikacji. Ustalenia AUDIT.md pozostają historyczne.
- Nie rozszerzaj zakresu poza pliki dozwolone w zadaniu.
- Nie zapisuj w publicznym repo kodu starych backendów, opisów ich tras nieużywanych przez frontend ani danych testowych właściciela. Można dokumentować zachowanie frontów i ich publiczne żądania. Nie dodawaj nowych nazw zmiennych konfiguracyjnych starych usług.

## Zasady pracy

- Agent sam planuje, implementuje, testuje, dokumentuje i otwiera PR-y. Nie wymaga osobnego kierownika ani zatwierdzenia rutynowych wyborów technicznych. Wybory zapisuje w DECISIONS.md.
- Aktualizacja właściciela 2026-11-27: pracuj samodzielnie **wewnątrz bieżącego etapu**. Po większym etapie zatrzymaj pracę, podsumuj wykonane i pozostałe zadania, podaj szacunkowy procent ukończenia i pozostałej pracy oraz udostępnij lokalny podgląd. Następny etap dopiero po wyraźnym zatwierdzeniu właściciela. Nowe polecenia aktualizują zakres i estymację; nie są automatycznie akceptacją poprzedniego etapu.
- Pracuj na osobnej gałęzi `feat/...`, `fix/...` lub `docs/...`, w małych i czytelnych commitach.
- Otwórz PR do main; po pozytywnych kontrolach agent może go sam scalić (D33).
- Gdy zmiana zależy od otwartego PR, oprzyj ją na jego gałęzi i otwórz PR do tej gałęzi. Zapisz kolejność scalania w „Kolejce akceptacji” w docs/PROJECT_STATE.md; aktualizuj ten dokument przy każdym PR.
- Nie zgaduj. Twierdzenia o produkcji oznaczaj [FAKT] albo [HIP] i podaj źródło, jeśli jest znane.
- Przy niejasności zatrzymaj zależną część pracy i zapisz konkretne pytanie w raporcie. Kontynuuj niezależną pracę, jeśli to możliwe.
- Raportuj tylko komendy faktycznie uruchomione i wyniki faktycznie sprawdzone.
- Właściciel podejmuje decyzje produktowe, autoryzuje wdrożenia i wykonuje testy ręczne. Agent scala sprawdzone PR-y; zatrzymanie po większych etapach i akceptacja kontynuacji nadal obowiązują.
- Pełny parytet wszystkich opcji jest wymagany. Kompletność i poprawność danych mają pierwszeństwo przed szybkością. Alternatywę opisz w DECISIONS.md i macierzy; utrata funkcji wymaga decyzji właściciela.
- Wyjątek właściciela: nie przenoś „rodziny działek” opartej na wspólnym numerze bazowym. Funkcja wróci wyłącznie po znalezieniu i zweryfikowaniu wiarygodnych danych historii podziałów; brak takiego źródła oznacza pominięcie opcji (D31).
- Raporty AI: widok mapy + bieżący internet, bez wewnętrznej bazy wiedzy DENEM i bez sekcji źródeł w raporcie. Nie generuj obrazów. Nie uruchamiaj płatnych wywołań ani nowej infrastruktury w ramach samej analizy możliwości. D5 bez logowania pozostaje w mocy.
- D5 (ostateczna decyzja właściciela 2026-11-27): aplikacja w ogóle nie będzie miała logowania. Nie implementuj bramek dostępu ani nie przenoś ich ze starych frontów. D8 nie dotyczy.
- Każde zadanie dotyczące interfejsu musi zawierać test startowy aplikacji (z atrapą DOM) oraz opis ręcznego sprawdzenia; zielone testy jednostkowe same nie dowodzą, że strona się uruchamia.
- Zadania z mapą/zewnętrznymi usługami wymagają scenariusza browser-smoke uruchamianego przez właściciela; raport nie może twierdzić, że żądania odpowiadają starej aplikacji bez tabeli „stary front vs nowa aplikacja” i testu URL.
- Dla każdego nowego żądania tabela obejmuje adres, metodę, parametry, CRS i format oraz plik:linia starego frontu w wskazanej rewizji. Test ma porównywać dokładny URL, nie tylko host.
- Każdy PR: testy z atrapami poniżej 5 s, oba skany sekretów (pliki i historia), lokalne GET 200 dla nowych zasobów. Dla UI obowiązuje test startowy, scenariusz browser-smoke z asercjami i zrzutami oraz opis sprawdzenia ręcznego. Oglądaj zrzuty.

## Browser-smoke i dane lokalne

- Najpierw porównuj kod starego frontu; jego ruch sieciowy obserwuj dopiero po wyraźnej zgodzie właściciela.
- Wykonuj smoke z oknem (`--headed`); brak takiej możliwości i wpływ headless na wyniki muszą być jawne. Nie zmieniaj User-Agent, Origin ani Referer i nie obchodź blokad usług.
- Budżet jednego zadania: maksymalnie 4 pełne uruchomienia, 400 GET-ów do backendu Działek i 300 GET-ów do każdej usługi zewnętrznej. Zliczaj w lokalnym pliku stanu; ponowienia też zużywają budżet. Stare eksperymenty z większymi limitami nie nadają nowej zgody.
- Bez cache-bustingu. Dodatkowy parametr retry wymaga wcześniejszego pomiaru, że usługa go ignoruje. Nie wysyłaj POST do usług zewnętrznych.
- Dane testowe właściciela i wyniki pomiarów zapisuj wyłącznie w ignorowanych `.local/` i `.local-results/`. W testach i fiksturach używaj danych fikcyjnych. Nie zapisuj prawdziwych danych osobowych zwracanych przez usługi.
- Problemy własnego kodu naprawiaj sam. Pytaj zbiorczo tylko o decyzje produktowe, koszty, produkcję, rzeczy nieodwracalne i brakujące dane dostępne wyłącznie właścicielowi. Kontynuuj niezależne prace.

## Raport końcowy

Zgodnie z zadaniem przejęcia z 2026-11-27 komunikat dla właściciela ma być krótki (około 15 linii): wynik, dowody, PR-y w kolejności, konieczne czynności krok po kroku, ograniczenia i następny krok. Pełny poniższy blok RAPORT zachowuj w dokumentacji zadania, z linkiem w komunikacie:

    RAPORT dla kierownika
    1. Status: WYKONANE / CZĘŚCIOWO / ZABLOKOWANE
    2. Repozytorium, gałąź, SHA początkowy → końcowy, link do PR
    3. Zmienione pliki (+/- linii)
    4. Kryteria akceptacji: każde spełnione/nie oraz dowód
    5. Uruchomione komendy i skrót wyników
    6. Odstępstwa i założenia [FAKT]/[HIP]
    7. Dotknięto zakazanych obszarów? TAK/NIE
    8. Sekrety: potwierdzenie, że żadnych nie odczytano ani zapisano
    9. Sprzeczności i otwarte pytania
    10. Test ręczny dla właściciela
    11. Proponowany następny krok
