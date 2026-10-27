# AGENTS.md — zasady pracy w repozytorium

## Źródła prawdy

Przed rozpoczęciem zadania przeczytaj README.md, AGENTS.md, CLAUDE.md, AUDIT.md, MEGA_PROJECT.md, IMPLEMENTATION_PLAN.md, DECISIONS.md, E0_CHECKLIST.md i CONFIG.md. Ustalenia właściciela z 2026-10-26 mają pierwszeństwo przed starszymi zapisami. AUDIT.md pozostaje dokumentem historycznym i nie jest zmieniany.

## Zakazy bezwzględne

- Nie zmieniaj portalu denem.pl ani repozytorium denem1984/denem.
- Pięć repozytoriów źródłowych — rcn-web-app, Analizator-cen-ofertowych, analizator-nieruchomosci, rozklad-nieruchomosci-podobnych i gminy — jest tylko do odczytu. Nie zapisuj w nich zmian.
- Wykonawca bez żadnych wyjątków nie wykonuje operacji na panelach ani API zarządzania Render, Supabase i Cloudflare R2. Wykonawca nie odczytuje ani nie zapisuje wartości zmiennych środowiskowych, także niesekretnych. W M1 wykonawca może wysyłać wyłącznie proste żądania HTTP GET, OPTIONS lub HEAD do publicznych adresów API wskazanych w części C zadania; w pozostałych etapach nie wysyła żądań do tych usług.
- Nie wdrażaj ani nie scalaj zmian do main. PR ma pozostać otwarty do decyzji właściciela.
- Nie odczytuj, nie zapisuj ani nie wklejaj wartości sekretów, tokenów, haseł, kluczy ani wartości zmiennych środowiskowych. RCN_DATA_SOURCE jest niesekretną wartością trybu źródła i może zostać odczytana przez właściciela w M1.
- Repozytorium jest publiczne. Nie dodawaj do niego wartości konfiguracji, tokenów, kluczy, danych osobowych ani identyfikatorów kont lub usług. Dozwolone są nazwy zmiennych i status ustawienia; wyjątek stanowi niesekretna wartość RCN_DATA_SOURCE.
- Nie dopisuj nowych opisów luk bezpieczeństwa pięciu starych aplikacji. Ustalenia AUDIT.md pozostają historyczne.
- Nie rozszerzaj zakresu poza pliki dozwolone w zadaniu.

## Zasady pracy

- Pracuj na osobnej gałęzi wskazanej w zadaniu, w małych i czytelnych commitach.
- Otwórz PR do main i pozostaw go bez scalania.
- Nie zgaduj. Twierdzenia o produkcji oznaczaj [FAKT] albo [HIP] i podaj źródło, jeśli jest znane.
- Przy niejasności zatrzymaj zależną część pracy i zapisz konkretne pytanie w raporcie. Kontynuuj niezależną pracę, jeśli to możliwe.
- Raportuj tylko komendy faktycznie uruchomione i wyniki faktycznie sprawdzone.
- Właściciel podejmuje decyzje, scala PR, autoryzuje wdrożenia i wykonuje testy ręczne.

## Raport końcowy

Każde zadanie zakończ blokiem RAPORT dla kierownika w tym formacie:

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
