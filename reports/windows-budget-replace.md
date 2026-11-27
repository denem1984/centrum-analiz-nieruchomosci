# RAPORT dla kierownika — zapis licznika na Windows

1. **Status: WYKONANE — poprawka i test jednostkowy.** Integracja z kolejnym headed smoke pozostaje w M4d.3.
2. Repozytorium `denem1984/centrum-analiz-nieruchomosci`, gałąź `fix/windows-budget-replace`, baza `ef8c3f5`; końcowy SHA i PR w kolejce `docs/PROJECT_STATE.md`. PR zależy od #18, bez scalania i wdrożenia.
3. Zmienione: dwa pliki licznika i testów, ten raport i kolejka; dokładne +/- linii w PR.
4. Akceptacja: krótkie EPERM/EACCES/EBUSY ponawiają wyłącznie atomową podmianę tego samego pliku; maksymalnie 6 prób, łączne oczekiwanie 775 ms. Trwały błąd i błędy dysku są nadal blokujące. Stary stan nie jest usuwany. Dowód: test w `scripts/smoke-budget.test.mjs`.
5. Uruchomiono `node --test scripts/smoke-budget.test.mjs`: 5/5 PASS, 100,31 ms. Skany i kontrola diff są uruchamiane przed commitem; ich wynik w metadanych PR. Brak zmiany UI i zasobów aplikacji.
6. [FAKT] Drugi start m4d3 zatrzymał EPERM przy rename. Poprzedni stan zachowano, niezapisana rezerwacja nie uprawniała do GET. [HIP] Krótka blokada czytnika lub skanera Windows; przyczyny procesu nie ustalono. Nie resetowano licznika.
7. Zakazane obszary: NIE. Tylko lokalny plik i kod testów.
8. Sekretów ani wartości środowiska nie odczytano i nie zapisano w tej poprawce.
9. Brak decyzji wymaganej od właściciela. Utrzymujący się błąd zapisu ma zatrzymać smoke.
10. Test ręczny: uruchomić test licznika powyżej. Sprawdzenie z prawdziwą przeglądarką jest częścią kolejnego uruchomienia M4d.3 w tym samym liczniku, bez dodatkowej puli startów.
11. Kontynuować M4d.3; licznik ma 2/4 wykorzystane starty. Nie zmieniać pliku stanu ręcznie.
