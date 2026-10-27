# Lokalny podgląd M2

Aplikacja działa jako statyczne pliki. Nie trzeba instalować npm ani pobierać bibliotek.

## Krok po kroku

1. Zainstaluj Node.js w wersji 20 lub nowszej.
2. Otwórz terminal w katalogu głównym repozytorium.
3. Wpisz `node scripts/serve.mjs` i naciśnij Enter.
4. Poczekaj na komunikat z adresem podglądu.
5. Otwórz w przeglądarce [http://localhost:8080](http://localhost:8080).
6. Powinna pojawić się strona „Centrum Analiz Nieruchomości”, zakładki Start, Działki, RCN, Oferty, Podobne i Gminy oraz cztery karty stanu usług.
7. Pierwsze wywołanie usługi może chwilę potrwać. Karta pokazuje stan oczekiwania i czas. W razie potrzeby użyj przycisku „Sprawdź ponownie”.
8. Aby zakończyć podgląd, wróć do terminala i naciśnij Ctrl+C.

## Inny port

Możesz podać port jako argument, na przykład `node scripts/serve.mjs --port 8090`, albo ustawić zmienną środowiskową `PORT`. Argument ma pierwszeństwo. Domyślny port to 8080.

Serwer udostępnia tylko pliki z katalogu `app/`; nie ma kroku build ani zależności npm.
