# Instrukcja pomiaru M1

Skrypt jest narzędziem do samodzielnego uruchomienia przez właściciela. Wykonawca nie uruchamia go na usługach produkcyjnych. Skrypt nie przyjmuje dowolnych ścieżek ani metod.

## 1. Wymagania

1. Zainstaluj Node.js w wersji 20 lub nowszej.
2. W terminalu sprawdź wersję poleceniem: node --version.
3. Przejdź do katalogu głównego repozytorium.

## 2. Podanie adresów i limitu czasu

Wszystkie cztery adresy bazowe są wymagane. Podaj origin bez ścieżki, parametrów i danych logowania. Możesz przekazać je argumentami:

    node scripts/m1-probe.mjs --rcn https://adres-rcn --oferty https://adres-ofert --dzialki https://adres-dzialek --podobne https://adres-podobnych

Albo przez zmienne M1_RCN_BASE_URL, M1_OFERTY_BASE_URL, M1_DZIALKI_BASE_URL i M1_PODOBNE_BASE_URL. Nie zapisuj rzeczywistych adresów w repozytorium ani plikach projektu.

Adres Podobnych musi wskazywać host backendu obsługujący ścieżkę /api/health. Adres statycznego frontendu nie wystarczy, chyba że jego konfiguracja routingu przekazuje /api/* do backendu. Jeśli /api/health zwróci 404 albo przekierowanie, zapisz status i zatrzymaj pomiar Podobnych. Nie próbuj innych ścieżek ani hostów; najpierw właściciel powinien potwierdzić właściwy adres backendu i regułę routingu.

Limit czasu dotyczy każdego żądania osobno. Domyślnie wynosi 120000 ms. Możesz podać go argumentem --timeout-ms albo zmienną M1_TIMEOUT_MS; dozwolone są całkowite wartości od 5000 do 300000 ms. Przykład:

    node scripts/m1-probe.mjs --rcn https://adres-rcn --oferty https://adres-ofert --dzialki https://adres-dzialek --podobne https://adres-podobnych --timeout-ms 60000

## 3. Zakres żądań

Skrypt wysyła wyłącznie GET i OPTIONS z nagłówkiem Origin: https://example.org do następujących ścieżek:

- RCN: GET / i OPTIONS /; dodatkowo tylko OPTIONS /api/export_current.xlsx oraz OPTIONS /api/export_current.docx. Dwa preflighty eksportu deklarują Access-Control-Request-Method: POST i Access-Control-Request-Headers: content-type. Skrypt nie wysyła POST, a GET do ścieżek eksportu jest blokowany.
- Oferty: GET i OPTIONS /health.
- Działki: GET i OPTIONS /health.
- Podobne: GET i OPTIONS /api/health.

OPTIONS dla pozostałych ścieżek zawiera Access-Control-Request-Method: GET oraz Access-Control-Request-Headers: authorization. Skrypt nie podąża za przekierowaniami i nie odczytuje treści odpowiedzi. Po pierwszej serii czeka 2 sekundy i wykonuje serię drugą. Wiarygodny pomiar zimnego startu wymaga co najmniej 15 minut bezczynności usługi przed pierwszą serią; sama pauza skryptu tego nie zapewnia.

## 4. Odczyt wyników

1. W terminalu zobaczysz tabelę gotową do wklejenia do CONFIG.md. Błąd sieci i przekroczenie limitu mają typ odpowiednio network lub timeout; dla timeout tabela zachowuje zmierzony czas.
2. Pełne wyniki znajdziesz w pliku .local-results/m1-probe-<data>.json. Katalog jest ignorowany przez Git.
3. Wyniki nie zawierają adresów bazowych, treści odpowiedzi ani nagłówka Set-Cookie. Zapisywane są wyłącznie czas, status HTTP, znaczniki czasu i nagłówki Access-Control-* oraz Cache-Control.
4. W CONFIG.md ręcznie uzupełnij wyniki i źródło pomiaru. Sam skrypt nie zmienia dokumentacji.

## 5. Testy lokalne bez sieci

Uruchom:

    node --test scripts/*.test.mjs

Testy używają atrap odpowiedzi. Sprawdzają parsowanie nagłówków, Origin dla GET, oba rodzaje preflightów RCN, blokadę zabronionych metod i ścieżek, limit czasu i wynik timeout bez połączenia z siecią.
