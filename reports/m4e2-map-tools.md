# RAPORT dla kierownika — M4e.2 i uporządkowanie merge

1. **Status: WYKONANE dla M4e.2.** Pomiary, menu miejsca i Street View gotowe; odbiór ręczny pozostaje po stronie właściciela. Zatrzymanie przed kolejnym większym etapem M4f. Szacunkowo 31% wykonane / 69% pozostało (suma wag 31/100; poprzednio 29/100 prezentowane jako około 30%). Sama zgoda na merge nie zwiększa zakresu ani postępu funkcji.
2. Repo `denem1984/centrum-analiz-nieruchomosci`, gałąź `feat/m4e2-map-measurements`, SHA bazowy `0fb6a8ff71359d94aafa2be59064912ff2058a0b` (main po #24). SHA implementacji, PR i podgląd są uzupełniane w metadanych poniżej po zapisaniu commita. Właściciel 2026-11-28: „Kontynuuj. I rób sam to merge” — D33. Zgodnie ze zgodą scalono #13–#24, zachowując merge commity i przenosząc każdą następną bazę na main; każdy miał zielone check-runs dokładnego SHA, nie był draftem i nie miał konfliktu. CI push końcowego main `0fb6a8f` SUCCESS. Nie wdrażano aplikacji.
3. Zmieniono: nowy `map-tools.js`, integrację i blokadę kliknięć EGiB/planowania podczas pomiaru, stan pomiaru, CSS oraz wersję M4e2. Nowy test geometrii/cyklu życia i rozszerzone testy startu, EGiB oraz planowania; atrapy DOM/Leaflet. Nowy scenariusz przeglądarki, dokumentacja narzędzi, macierz parytetu, plan i stan projektu. Dokładna statystyka po zapisaniu commita poniżej; brak zmian backendów i źródeł.
4. Kryteria akceptacji:

| Kryterium | Wynik i dowód |
|---|---|
| Odległość, pole, pełny obwód; wykończenie i usuwanie | TAK — referencyjne wartości geometrii, orientacja odwrotna i południk 180°, test DOM, Edge/Leaflet |
| PPM/menu i Street View | TAK — dokładny URL starego frontu w teście; rel noopener/noreferrer; smoke nie otwiera Google |
| Brak zaznaczania działek/popupów podczas pomiaru | TAK — test EGiB, test samodzielnego planowania i asercja przeglądarki |
| Punkty i wynik między zakładkami, cleanup i wcześniejszy zoom | TAK — testy i smoke; brak globalnej flagi, anulowana klatka animacji |
| Start całej aplikacji i mobile | TAK — test startowy DOM; Edge z oknem, 390 px, PNG obejrzane |
| Testy <5 s, nowy zasób HTTP 200 i skany | TAK — 155 PASS / 778,21 ms, lokalny GET map-tools.js 200; wyniki skanów w metadanych |
| Produkcyjne usługi, baseline i zdjęcia Street View | Nie wykonywano ponownego testu; właściciel ma scenariusz ręczny. Punktowy smoke offline nie dowodzi dostępności danych |

5. Faktycznie uruchomione komendy i wyniki: odczyty Git/status/log/diff i dokumentacji, GitHub GET PR/check-runs/workflow, zmiana baz i merge #13–#24, `git fetch origin main` oraz `git switch -c feat/m4e2-map-measurements FETCH_HEAD`; `node --check app/js/modules/dzialki/map-tools.js`, `node --check scripts/browser-smoke.mjs`, `node --check scripts/map-tools-smoke.mjs`; celowane testy narzędzi i startu 6 PASS / 120,21 ms; pełne `node --test --test-reporter=tap scripts/*.test.mjs tests/*.test.mjs` 155 PASS / 778,21 ms. Lokalny createStaticServer + GET nowego modułu 200. `node scripts/browser-smoke.mjs --headed --map-tools --offline-map-tools --task m4e2`: drugi przebieg 9/9 PASS, zero blokad i wyjątków JS; wszystkie cztery PNG obejrzane. Wyniki Git/skanów, publikacji i podglądu w metadanych.
6. [FAKT] Testy używają atrap, smoke rzeczywistego Edge i Leaflet z odpowiedziami CDP, bez GET do usług publicznych. Budżet m4e2: 2/4 starty, liczniki zewnętrznych żądań puste. Pierwszy smoke: 7/9 PASS; syntetyczne pojedyncze kliknięcia co 120 ms Leaflet interpretował jako dwuklik, więc pomiar kończył się przed kolejnym kliknięciem. Poprawiono odstęp pojedynczych działań do 300 ms i wzmocniono asercję aktywności; ponowienie PASS. Wcześniejsze testy robocze wykryły nieidempotentny cleanup i stare oczekiwane napisy wersji; poprawione przed dostawą. `origin/main` nie było w lokalnej mapie referencji; gałąź utworzono z pobranego i zweryfikowanego FETCH_HEAD. Niezerowane wyniki smoke: `.local-results/browser-smoke-2026-11-28T06-33-30-807Z/` (FAIL) i `...06-34-11-003Z/` (PASS).
7. Zakazane obszary: **NIE**. Nie zmieniano DENEM, pięciu źródeł, baz, backendów, paneli/API zarządzania Render/Supabase/R2 ani produkcji. Merge jest teraz wyraźnie dozwolony D33; nie jest wdrożeniem.
8. Nie odczytano ani nie zapisano sekretów i wartości środowiska. Nie uruchomiono płatnych usług AI, nie generowano obrazów; PNG są zrzutami testowego UI.
9. Sprzeczności: starszy zakaz merge zastąpiony najnowszym poleceniem i D33; historyczne raporty pozostają dowodami dawnego stanu. Otwarte: odbiór tego etapu, baseline i kompletność KIEG; PDF, nowy podkład, słowniki/Start, RCN i dalsze moduły, AI i końcowy odbiór. Rodzina numerów pominięta świadomie D31.
10. Test właściciela: otworzyć lokalny podgląd poniżej → Działki → „Wygląd i narzędzia działek” → odległość: dwa punkty i zakończenie → zmienić zakładkę i wrócić → obszar: PPM i „Mierz obszar stąd”, dwa dalsze punkty, PPM kończy → sprawdzić m², pełny obwód, usunięcie Esc i powrót zaznaczania działek. „Opcje środka mapy” obsłużyć strzałkami i Esc; otworzyć Street View samodzielnie. Powtórzyć 390 px. Szczegóły i tabela URL: [narzędzia mapy](../docs/dzialki-map-tools.md).
11. Proponowany następny krok po wyraźnej akceptacji kontynuacji: M4f — lista elementów raportu i eksport PDF, potem M3b/M3c (słowniki i wspólna lokalizacja Start). Nie rozpoczęto M4f w tej dostawie.

## Historia scalenia zatwierdzonej kolejki

| PR | SHA merge do main |
|---|---|
| #13 | `1ebc3711f0697a1e9cad18e91d94d0110716cd59` |
| #14 | `ac07043b82d2d5973c6a1abac92d61d8f167c2ca` |
| #15 | `a81bdd8ca6901709f864793012a85e355968841a` |
| #16 | `75bdd7b3747ee3e9f672bed5216e6f56cb36285b` |
| #17 | `bf8a234713a592839e484d86cc03d637f90e2db4` |
| #18 | `5a36952680acc81eb10e3b039ced52bb524e40c1` |
| #19 | `a2318dc73d51f519cbd284324aee394bc12beab2` |
| #20 | `cc6861e063b5969b7d326410f90307aa8d81899e` |
| #21 | `8d9b669e01f8e7257e26ee5113be5be7096107a9` |
| #22 | `40ba56699ff52a212c8e66e0ddc41a6c63e7eba6` |
| #23 | `366211990bbf3e941f2a97a233702240449aa859` |
| #24 | `0fb6a8ff71359d94aafa2be59064912ff2058a0b` |

## Metadane dostawy

- SHA bazowy `0fb6a8ff71359d94aafa2be59064912ff2058a0b` → SHA implementacji `1cb6625105d9b30b3ec9ddfe82150e8763f86eff`; późniejszy commit obejmuje wyłącznie metadane tej dostawy. Implementacja: 24 pliki +589/-30. Dokładne końcowe +/- i SHA merge dostępne w [PR #25](https://github.com/denem1984/centrum-analiz-nieruchomosci/pull/25).
- `git diff --cached --check` PASS; skan plików PASS (119), skan historii PASS po implementacji (89 commitów). Nie zmieniono konfiguracji CI ani wdrożeń.
- `git worktree add --detach .local/preview-m4e2 HEAD` przypiął `1cb6625`. Ukryty Start-Process uruchomił serwer lokalny; strona i `/js/modules/dzialki/map-tools.js` HTTP 200, konfiguracja frontu wskazuje M4e2. **Podgląd: http://localhost:8082/#/dzialki**. Restart: `node .local/preview-m4e2/scripts/serve.mjs --port 8082` z katalogu projektu. Podgląd zawiera cały kod funkcji; późniejsze metadane nie zmieniają UI.
- Po zielonym CI dokładnej końcowej głowy PR agent wykonuje merge zgodnie z D33. Ostateczny stan scalenia i SHA są widoczne w podlinkowanym PR; wynik podany też w komunikacie właścicielowi. To nie jest zgoda ani operacja wdrożenia.
