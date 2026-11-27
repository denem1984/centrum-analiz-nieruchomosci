# RAPORT dla kierownika — M4d.2

1. **Status: WYKONANE w zakresie implementacji M4d.2 i punktowego smoke.** Odbiór wszystkich przypadków baseline właściciela nie został wykonany; cała roadmapa pozostaje częściowo zrealizowana.
2. **Repozytorium i rewizje:** `denem1984/centrum-analiz-nieruchomosci`, gałąź `feat/m4d2-planning-layers`, baza `a240d95adbd5e28e7babdd4419cd80e4e02738f1` (PR #16). Końcowe SHA i link PR zostaną dopisane po utworzeniu. Kolejność: #13 → #14 → #15 → #16 → M4d.2. Nie scalono i nie wdrożono.
3. **Zmienione pliki:** nowy klient, panel, renderer i projekcja planowania; integracja z popupem EGiB i powłoką; stan pięciu warstw; lokalny proj4 z licencją i atrybuty vendor; testy, allowlista, atrapy i scenariusz smoke; numer etapu M4d2; macierz parytetu, stan, instrukcje i plan nowszego podkładu dodany przez właściciela. Dokładny wykaz +/- linii w statystyce PR.
4. **Kryteria akceptacji i dowody:**

| Kryterium | Wynik | Dowód |
|---|---|---|
| Pięć warstw, domyślnie wyłączonych; trzy informacje `?` | TAK | Test startowy DOM + headed live i offline |
| Parametry źródłowych usług, oba źródła uchwalonego POG | TAK | `docs/dzialki-planning.md`, testy pełnych URL-i, rzeczywisty Leaflet w smoke |
| Wspólny popup, MPZP gmina→RU i szczegóły działki | TAK | Test priorytetu/fallbacku; live: MPZP i POG wczytane, GUGiK poprawnie pusty |
| Dokładne komunikaty braku danych; błędy nie udają braku planu | TAK | Test pustego i niepełnego wyniku, renderer, parsery |
| Monitory, K0, ręczne ponowienie i błędy canvas | TAK | Testy timeout/retry/cancel, live: 4/4, 20/20, 40/40, 20/20, 20/20 kafelków |
| Zimny backend z sekundami | TAK na atrapie | Test 17 s, bez zapytań planu przed ready; nie twierdzimy, że zaobserwowano realny zimny start |
| Anulowanie, cleanup i zachowanie wyborów | TAK | Atrapy spóźnionych odpowiedzi i rzeczywisty router w smoke |
| Bezpieczny DOM, dostępność informacji i mobile | TAK w sprawdzonym zakresie | TextContent i HTTPS; aria-live/expanded/controls; 390 px bez przewijania dokumentu w bok, PNG obejrzany |
| Start aplikacji, testy <5 s, lokalne HTTP 200 | TAK | 139/139 PASS, 735,31 ms; sześć nowych zasobów HTTP 200 |
| Skany plików i historii, diff --check | Skany PASS; kontrola formatu po zachowaniu vendor | Przed commitem skany 93 plików / 62 commitów; własne pliki bez błędów whitespace. Oryginalny vendor zachowuje bajty i jest wyłączony z korekt whitespace |
| Pełne porównanie danych z baseline D4/D5 właściciela | NIE | Scenariusz gotowy; pojedynczy publiczny punkt nie zastępuje odbioru wszystkich planów |

5. **Uruchomione komendy i wyniki:** `node --test` dla nowych testów, następnie pełne `node --test --test-reporter=tap scripts/*.test.mjs tests/*.test.mjs` (139 PASS, 735,31 ms); `node --check scripts/browser-smoke.mjs` i modułu planowania (PASS); lokalny serwer `createStaticServer` i sześć GET-ów (200); `node scripts/check-no-secrets.mjs` i `--history` (PASS); `git diff --check` / `--cached --check` (oryginalna licencja vendor ma trailing whitespace, pozostawione bajty chroni atrybut vendor); trzy `--headed --planning-layers --offline-planning --task m4d2` (FAIL, PASS, PASS+mobile) i jeden `--headed --planning-layers --task m4d2` (PASS). Obejrzano wszystkie wynikowe PNG.
6. **Odstępstwa i założenia:** [FAKT] Pierwszy offline smoke złapał błędną wielkość liter `bbox`, poprawioną przed ruchem zewnętrznym. [FAKT] Live WFS EGiB miał HTTP 502; planowanie zadziałało niezależnie. PASS dotyczy planowania, nie odbioru EGiB. [FAKT] Data publikacji obrazu nie jest datą kompletności danych gminy; UI tego nie utożsamia. [HIP] Wrażenie nieaktualnego Esri wymaga sprawdzenia metadanych, wpisano osobne zadanie do planu.
7. **Zakazane obszary: NIE.** Pięć źródeł tylko odczyt; nie dotykano portalu ani zarządzania usługami. Tylko publiczne GET-y frontu po testach URL i w allowliście.
8. **Sekrety:** nie odczytywano ani nie zapisywano sekretów lub wartości środowiska. Odpowiedź narzędzia odczytu starego frontu wcześniej zawierała publiczną konfigurację dostępu; nie kopiowano jej do plików ani nie używano. Licencja biblioteki zachowuje wymagane przypisanie autorstwa.
9. **Sprzeczności i pytania:** 4/4 uruchomienia m4d2 wykorzystane (3 offline, 1 live), licznika nie resetowano. Wszystkie usługi poniżej 300 żądań, backend Działek 5/400; łącznie 379 rezerwacji rzeczywistego ruchu. Nie potwierdzono całego kraju ani baseline właściciela. D5 jest ostatecznie zamknięte — aplikacja bez logowania; D2/D9 i D10 pozostają otwarte.
10. **Test ręczny dla właściciela:** instrukcja krok po kroku w `docs/dzialki-planning.md`. Po pobraniu zaakceptowanych zmian: uruchomić `node scripts/serve.mjs`, otworzyć wskazany lokalny adres, wybrać Działki, rozwinąć Planowanie, sprawdzić pięć wyłączonych opcji, trzy informacje, włączyć warstwy i kliknąć znane miejsce. Porównać potrzebne przypadki D4/D5. Przy błędzie oczekiwać niepełności i przycisku ponowienia; nie wysyłać danych właściciela do repo. Automatyczny smoke dopiero w osobnym jawnym budżecie.
11. **Proponowany następny krok:** wskazanie aktualniejszego podkładu w osobnym planie (zgodnie z nowym poleceniem), a następnie M4d.3 bez usuwania opcji parytetu. Nie scalać PR-ów automatycznie.
