# DECISIONS.md — podjęte decyzje i kwestie do rozstrzygnięcia

Status: po wstępnych decyzjach właściciela; E0 nie jest jeszcze zakończony.

## A. Decyzje właściciela projektu

1. Etap E0 obejmuje wyłącznie inwentaryzację i odczyt konfiguracji. Bez zmian kodu, konfiguracji produkcyjnej i wdrożeń.
2. Zachowujemy obecne technologie i działające rozwiązania, o ile nie ma uzasadnionej przyczyny zmiany.
3. Nie zakładamy jednego wspólnego backendu. Wstępny kierunek to niezależne usługi połączone wspólną powłoką i kontraktem kontekstu.
4. Sekretów nie kopiujemy do dokumentacji ani promptów. W `CONFIG.md` zapisujemy wyłącznie nazwy zmiennych oraz status: ustawiona/nieustawiona; bez wartości.
5. **D1 — źródło danych RCN:** wstępna decyzja: Parquet z Cloudflare R2. Podczas E0 należy potwierdzić, że produkcja rzeczywiście działa w tym trybie i sprawdzić status źródła przez dostępny endpoint lub ustawienia hostingu.
6. **D2 — słownik lokalizacji:** wstępna decyzja: wykorzystać słownik SIMC z aplikacji RCN jako podstawę wspólnego słownika. W E0 należy sprawdzić dostępność i jakość potrzebnych pól oraz potwierdzić sposób wykorzystania przez pozostałe moduły.
7. **D3 — miejsce powłoki MEGA:** bez decyzji. Najpierw trzeba przejrzeć kod panelu DENEM i ustalić, czy powłokę dodać do istniejącego panelu, czy uruchomić obok niego.
8. **D4 — sposób otwierania modułów:** bez decyzji. Najpierw trzeba sprawdzić nagłówki bezpieczeństwa i zachowanie usług na produkcji. Do czasu weryfikacji nie zakładamy możliwości osadzania w ramkach.

## B. Rekomendacje architektoniczne do potwierdzenia

- R1. Zachować pięć niezależnych modułów i dodać lekką powłokę MEGA.
- R2. Użyć TERYT/SIMC jako wspólnego klucza lokalizacji, po potwierdzeniu mapowania dla modułu Gminy.
- R3. Wdrażać etapami: najpierw przekazywanie kontekstu przez linki, później powłoka z zakładkami.
- R4. Wstępna kolejność adapterów: gminy → rozkład → działki → RCN → oferty.

## C. Kwestie do rozstrzygnięcia po E0

### Blokujące rozpoczęcie implementacji

- **D3. Miejsce powłoki:** wymaga przeglądu kodu panelu `denem.pl/panel` i potwierdzenia, jak panel obsługuje aplikacje, logowanie, role i slugi.
- **D4. Osadzanie modułów:** sprawdzić `X-Frame-Options` oraz `Content-Security-Policy` na produkcyjnych adresach. Jeśli osadzanie nie jest dozwolone lub jest niepewne, rozpocząć od osobnych kart z kontekstem.
- **D9. Mapowanie BDL ↔ TERYT:** potwierdzić strukturę tabeli Supabase `gus_bdl_commune_wide`; nie zakładać, że `unit_id` zawiera kod TERYT.
- **Konfiguracja hostingu:** potwierdzić dostawcę, nazwy usług, domeny, komendy start/build, plany/regiony oraz status zmiennych środowiskowych. Nie zapisywać wartości sekretów.

### Do rozstrzygnięcia przed odpowiednimi późniejszymi etapami

- **D5. Weryfikacja tokenów w backendach:** ustalić docelowy zakres ochrony API. Nie wdrażać zmian autoryzacji w E0.
- **D6. Testy automatyczne:** wstępnie testy ręczne do E4; ponownie ocenić automatyzację przed E5.
- **D7. Scalenie proxy rozkładu z backendem działek:** odłożyć do etapu E9.
- **D8. Slugi dostępu:** rekomendacja: własny slug powłoki `mega` i uprawnienia do poszczególnych zakładek zgodne ze slugami modułów; potwierdzić przed implementacją bramki.
- **D10. Raport zbiorczy:** przed E8 określić odbiorcę, format PDF/Word i wymagane sekcje.
- **D11. Trwałość analiz:** przed projektowaniem zapisu wyników zdecydować, czy potrzebne są „teczki analiz” przechowywane w Supabase.
- **D12. Regulaminy portali:** przed udostępnianiem wyników innym użytkownikom ocenić dopuszczalność pobierania i prezentowania ofert.
- **D13. Dokumentacja RCN:** ustalić, czy aktualizować nieaktualną dokumentację w ramach pierwszych prac implementacyjnych.

## D. Kryterium zakończenia E0

E0 można uznać za zakończony dopiero, gdy:
1. Powstanie `CONFIG.md` bez sekretów.
2. Potwierdzony zostanie rzeczywisty tryb danych RCN na produkcji.
3. Przejrzany zostanie kod panelu DENEM albo zostanie dostarczony wiarygodny opis jego działania.
4. Zapisane zostaną wyniki kontroli nagłówków bezpieczeństwa dla modułów.
5. Sprawdzona zostanie struktura tabeli `gus_bdl_commune_wide` i dostępność mapowania BDL ↔ TERYT.
6. Odpowiedzi i nierozstrzygnięte kwestie zostaną wpisane do tego pliku.
7. Właściciel projektu zatwierdzi przejście do E1.

W trakcie E0 nie zmieniać kodu, konfiguracji produkcyjnej, danych ani wdrożeń.