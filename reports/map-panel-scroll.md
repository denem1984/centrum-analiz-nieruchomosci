# RAPORT dla kierownika — przewijanie panelu i linie zabudowy

1. **Status: WYKONANE.** Mapa pozostaje w miejscu podczas przewijania panelu, także na jego końcu. Linie zabudowy pozostają po rzeczywistym potwierdzeniu warstwy z nieprzekraczalnymi liniami (D34). Odbiór właściciela i M4f nadal oczekują. Szacunek bez zmiany: około 31% wykonane / 69% pozostało; to poprawka istniejącego zakresu.
2. Repo `denem1984/centrum-analiz-nieruchomosci`, gałąź `fix/map-panel-scroll`; SHA początkowy `4c445b92e8e1cc552bcd27fd603bfa3155ee2435` (main po #25). SHA implementacji i PR w metadanych poniżej po zapisaniu commita. Zgodnie z D33 agent sam scala po zielonym CI, bez wdrażania.
3. CSS obszaru roboczego, osobne przewijanie panelu i wyniku pomiaru, kolejność na telefonie, fokus panelu i ResizeObserver z cleanup; opis linii; test startowy i testy planowania. Rozszerzony browser-smoke obejmuje kółko myszy, granicę panelu i rzeczywiste linie. Poprawiona obsługa anulowanego identyfikatora fikstury CDP, z osobnym testem. Dokumentacja i decyzja D34; pełne +/- w statystyce commita/PR.
4. Kryteria i dowody:

| Kryterium | Wynik |
|---|---|
| Panel przewija się, mapa nie zmienia położenia, także przy końcu panelu | TAK — rzeczywiste zdarzenia mouseWheel CDP, porównanie scrollY i prostokąta mapy; 1280×800, 390×844, 390×600 |
| Telefon i dostępność wyniku pomiaru | TAK — mapa nad panelem, brak poziomego przewijania, przycisk usuwania osiągalny po przewinięciu wyniku |
| Start i cleanup aplikacji | TAK — test DOM całej powłoki, obserwacja rozmiaru, odłączenie obserwatora |
| Zachowanie działającej warstwy z nieprzekraczalnymi liniami | TAK — istniejące KIMPZP `wektor-lzb`, rzeczywisty obraz z pełnymi/pustymi trójkątami i legenda obejrzane; opis zbliżenia i publikacji gminnej |
| Testy <5 s, skany i CI | Testy TAK: 156 PASS / 769,44 ms. Skany i CI w metadanych; nie utożsamiać ich z testem pokrycia danych |
| Pełne pokrycie kraju | Nie potwierdzono; brak linii w konkretnym widoku nie oznacza braku ograniczeń w planie |

5. Uruchomiono: odczyty dokumentów i kodu, `git status/log/diff`, `git switch -c fix/map-panel-scroll`; `node --check scripts/browser-smoke.mjs` i `node --check scripts/map-layout-smoke.mjs`; pełne testy Node (ostatnio 156 PASS / 769,44 ms). Ignorowany `.local/lines-research.mjs` wykonał łącznie pięć GET-ów istniejącego WMS w dozwolonej allowliście z trwałą rezerwacją budżetu. `node scripts/browser-smoke.mjs --headed --map-layout --verify-building-lines --task map-panel-scroll`: cztery starty. Ostatni **20/20 PASS**, zero blokad, consoleErrors i wyjątków JS. `git diff --check` PASS. Komendy skanów, Git i aktualizacji podglądu w metadanych.
6. [FAKT] Cztery starty: pierwsze dwa 19/19 PASS; trzeci zakończył się błędem narzędzia `Fetch.fulfillRequest: Invalid InterceptionId` po anulowaniu kafelka przy nawigacji/zmianie rozmiaru; czwarty 20/20 PASS po poprawce wymagającej zarówno tego konkretnego błędu, jak i potwierdzonego anulowania w Network. Nie ignorujemy innych błędów. Cały trwały budżet: 4/4 starty, 119 GET WMS KIMPZP (w tym pięć sond Node) i trzy GET legendy; pozostałe usługi były atrapami. Nie zerowano licznika. Próba analizy PNG przez Python/Pillow nie powiodła się z powodu braku biblioteki; nie instalowano jej, obraz i legendę oceniono w przeglądarce. Opaque atrapy EGiB zasłaniały linie w pierwszych PNG — wyłączono je tylko w scenariuszu dowodowym, bez zmiany produkcyjnej warstwy EGiB.
7. Zakazane obszary: **NIE**. Nie zmieniano pięciu źródeł, DENEM, backendów, baz, paneli/API zarządzania ani wdrożeń. Żądania linii i legendy mają dotychczasowe adresy i parametry, opisane w [tabeli stary front vs nowa aplikacja](../docs/map-panel-scroll.md); dokładne URL-e nadal przechodzą testy.
8. Nie odczytano ani nie zapisano sekretów lub wartości środowiska. Publiczny przykład pochodzi z instrukcji GUGiK, nie z danych właściciela. Wyniki i obrazy tylko w ignorowanych katalogach. Bez płatnych wywołań AI i generacji obrazów; PNG są zrzutami UI lub obrazami istniejącej usługi WMS.
9. Sprzeczności i pytania: warunkowe polecenie właściciela pozwala zachować potwierdzone linie; D34 zapisuje wynik. Nie znaleziono podstaw do twierdzenia, że krajowa warstwa zawsze jest pusta. Nie potwierdzono pokrycia każdej gminy ani publikacji wszystkich planów. Nie uruchamiać dodatkowego smoke w tym zadaniu (4/4). Brak blokujących pytań; akceptacja kontynuacji M4f pozostaje osobna.
10. Test ręczny: odświeżyć podgląd na porcie 8082 (Ctrl+F5), przewijać lewy panel w dół, dalej na jego końcu i w górę; mapa ma zachować położenie. Powtórzyć Tab/PageDown i telefon. Wykonać pomiar, przewinąć wynik do przycisku usuwania. Linie: włączyć Planowanie → Linie zabudowy i mocno przybliżyć plan publikowany wektorowo; przeczytać opis i legendę. W publicznym przykładzie próby potwierdzono widoczne linie. Scenariusz i ograniczenia w dokumentacji.
11. Następny krok po akceptacji kontynuacji: M4f — lista elementów raportu i PDF; następnie słowniki i wspólny Start. Ta poprawka nie rozpoczyna kolejnego etapu.

## Dowody lokalne

- Ostatni PASS: `.local-results/browser-smoke-2026-11-28T06-54-17-373Z/`, `report.json` i `summary.txt`.
- Obejrzano końcowe `map-layout-1280-800.png`, `map-layout-390-600.png`, `m4e2-mobile.png` i `building-lines-live.png`, a także wcześniejszy 390×844 i obraz z legendą.
- Nieudany trzeci przebieg zachowano: `...06-52-53-197Z/`; pierwsze PASS `...06-49-57-177Z/` i `...06-51-30-448Z/`.
- [Publiczny przykład i dokumentacja GUGiK, str. 26](https://www.geoportal.gov.pl/wp-media/2023/10/PodstawoweUslugiDanychPrzestrzennychDlaSystemowInformatycznychPanstw-ver.-1.12.pdf). Obraz bieżącej usługi sprawdzono osobno; sam starszy podręcznik nie dowodzi jej aktualnej dostępności.

## Metadane dostawy

Uzupełnienie po zapisaniu implementacji i aktualizacji przypiętego podglądu.
