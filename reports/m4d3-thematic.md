# RAPORT dla kierownika — M4d.3

1. **Status: WYKONANE w zakresie implementacji i punktowego smoke.** Pełny odbiór baseline D6 właściciela pozostaje do wykonania.
2. **Repozytorium:** `denem1984/centrum-analiz-nieruchomosci`, gałąź `feat/m4d3-risks-infrastructure`, baza `e68603853c507d5306f1a7e6275c8bf5e2c92aa0` → końcowy SHA w PR wskazanym w `docs/PROJECT_STATE.md`. Zależność od PR #19; kolejność #13 → #14 → #15 → #16 → #17 → #18 → #19 → M4d.3. Bez scalania i wdrożenia.
3. **Pliki:** implementacja `86b9226`: 27 plików **+948/-27**; klient tematyczny, panel i monitor rasterów; integracja popupów, pane i stanu; CSS; dokładna allowlista i scenariusz headed; atrapy i testy; wersja M4d3, dokumentacja i macierz. Następnie metadane raportu i linku PR. Pełne +/- linii według plików w statystyce [PR #20](https://github.com/denem1984/centrum-analiz-nieruchomosci/pull/20).
4. **Kryteria akceptacji:**

| Kryterium | Wynik | Dowód |
|---|---|---|
| Cztery domyślnie wyłączone warstwy, style i kolejność pane | TAK w sprawdzonym zakresie | Test startowy z DOM, realny Leaflet w headed smoke; screenshot |
| Dokładne URL-e, metoda, CRS, format i warstwy starego frontu | TAK | Tabela `docs/dzialki-thematic.md`, testy pełnych URL-i oraz allowlisty; brak zablokowanych żądań w udanym live |
| Legendy RWDZ/ISOK, 9 sieci i 16 grup | TAK | Testy URL-i i dialogu; headed offline/live; obejrzane PNG |
| Własność: geometria, grupy i uzupełnianie braków | TAK dla implementacji i punktu próby | Test 61 braków: partia 60, współbieżność 4 i cache; walidacja obcej działki i anulowania; live 83 obiekty, 0 nieustalonych grup |
| Niepełność, puste wyniki i błędy rozróżnione | TAK | Testy empty/incomplete/error; jawne komunikaty; monitory rasterów |
| Wspólny popup RWDZ + MPZP/EGiB | TAK | Test dwóch sekcji przy wyłączonym EGiB i anulowania obu; live RWDZ ready |
| Cleanup i zachowanie wyborów | TAK | Test startowy i rzeczywisty router w smoke |
| Mobile i dostępność dialogu | TAK w sprawdzonym zakresie | 390 px bez poziomego przewijania dokumentu; test Escape/Tab/fokusu, screenshot dialogu i mobile |
| Testy <5 s, nowe zasoby HTTP 200 | TAK | 149/149 PASS, 761,26 ms; trzy nowe pliki JS: GET 200 |
| Pełna zgodność danych baseline D6 i pokrycie kraju | NIE | Jeden publiczny punkt nie zastępuje odbioru właściciela |

5. **Faktycznie uruchomione komendy:** `node --check scripts/browser-smoke.mjs`; ukierunkowane `node --test` klienta, panelu, allowlisty i licznika; pełne `node --test --test-reporter=tap scripts/*.test.mjs tests/*.test.mjs` (ostatnio 149 PASS / 761,26 ms); lokalny `createStaticServer` i GET trzech nowych JS (200); cztery polecenia browser-smoke poniżej. `node scripts/check-no-secrets.mjs` PASS (105 plików), `--history` PASS (67 commitów), `git diff --cached --check` PASS przed commitem. Test startowy aplikacji jest częścią pełnego zestawu.

| Start w liczniku m4d3 | Polecenie po `node scripts/browser-smoke.mjs` | Wynik / katalog lokalny |
|---|---|---|
| 1 | `--headed --thematic-layers --offline-thematic --task m4d3` | PASS 11/11, bez zewnętrznych GET; `2026-11-27T20-20-02-065Z` |
| 2 | `--headed --thematic-layers --task m4d3` | Przerwany EPERM atomowego zapisu licznika; bez kompletnego wyniku; `2026-11-27T20-20-29-010Z` |
| 3 | `--headed --thematic-layers --task m4d3` | PASS 10/10, trzy rastry 20/20, własność 83/0 braków, RWDZ ready, 0 blokad/wyjątków/błędów konsoli; `2026-11-27T20-23-07-154Z` |
| 4 | `--headed --thematic-layers --offline-thematic --task m4d3` | PASS 11/11, bez zewnętrznych GET, desktop/dialog/390 px PNG obejrzane; `2026-11-27T20-25-07-418Z` |

Wszystkie katalogi pod ignorowanym `.local-results/browser-smoke-...`. Obejrzano PNG obu offline i live. Zrzut live pomija treść wpisu RWDZ; statusy w raporcie nie zawierają nazwisk. Auto-pan popupu zmienia bbox i odświeża własność; w screenshot live była ponownie wczytywana, choć stan 83/0 uzyskano i sprawdzono przed kliknięciem. Końcowy scenariusz poprawiono o oczekiwanie po auto-pan; zweryfikowany offline, bez kolejnego ruchu live. Nie twierdzimy, że screenshot dowodzi zakończenia tego dodatkowego odświeżenia.

6. **Odstępstwa [FAKT]/[HIP]:** [FAKT] Naprawa krótkich blokad zapisu Windows jest w osobnym PR #19, licznik nie był zerowany. [HIP] Blokadę mógł powodować czytnik lub skaner, procesu nie zidentyfikowano. [FAKT] Brak grupy jest jawny i możliwy do dalszego uzupełnienia; nie ma obietnicy pełnej publikacji danych źródłowych. W live grupy pochodziły już z odpowiedzi własności; uzupełnianie testowano na fikcyjnych danych.
7. **Zakazane obszary: NIE.** Źródła tylko odczyt. Bez portalu, zarządzania usługami, zmian backendu, merge i deploy. Ruch wyłącznie GET funkcji starego frontu w allowliście.
8. **Sekrety:** w tym etapie nie odczytano ani nie zapisano sekretów lub wartości środowiska. Nie zapisano odpowiedzi zawierających nazwiska. Uwaga historyczna o odpowiedzi narzędzia starego frontu pozostaje w raporcie M4d.2.
9. **Budżet i pytania:** wykorzystano 4/4 starty, 477 rezerwacji GET łącznie (także przerwany start): Działki 8/400, KIEG 151/300, KIUT 85/300, RWDZ 69/300, ISOK 69/300, OSM 89/300, PRG 2/300, pozostałe trzy backendy po 2/300. Dalszy start m4d3 zablokowany. Baseline D6 pozostaje do właściciela. Brak nowej decyzji produktowej dla warstw.
10. **Test ręczny:** kroki 1–6 w `docs/dzialki-thematic.md`; uruchomić lokalną aplikację, sprawdzić warstwy i legendy, znane przypadki D6, popup razem z MPZP i bez EGiB, błędy/ponowienie, router i 390 px. Nie dopisywać rzeczywistych danych do repo. Dodatkowy automatyczny smoke wymaga uzgodnienia budżetu.
11. **Następny krok:** M4e — paleta, kolory, czyszczenie, rodzina numerów, menu mapy, pełne pomiary i Street View; osobny PR. Plan aktualniejszych zdjęć pozostaje w PR #18 i nie zmienił działania podkładu.
