# Instrukcja pomiaru M1

Skrypt jest narzędziem dla właściciela. Nie uruchamiaj go w ramach przeglądu kodu. Samodzielnie wykonuje wyłącznie GET i OPTIONS do czterech stałych, lekkich ścieżek; nie przyjmuje dowolnych ścieżek ani metod.

## 1. Wymagania

1. Zainstaluj Node.js w wersji 20 lub nowszej.
2. W terminalu sprawdź wersję poleceniem: node --version.
3. Przejdź do katalogu głównego repozytorium.

## 2. Podanie adresów

Przekaż adres bazowy każdego API jako origin bez ścieżki, parametrów ani danych logowania. Można użyć argumentów:

    node scripts/m1-probe.mjs --rcn https://adres-rcn --oferty https://adres-ofert --dzialki https://adres-dzialek --podobne https://adres-podobnych

Albo zmiennych środowiskowych M1_RCN_BASE_URL, M1_OFERTY_BASE_URL, M1_DZIALKI_BASE_URL i M1_PODOBNE_BASE_URL. Nie zapisuj rzeczywistych adresów w repozytorium ani w plikach projektu. Wszystkie cztery adresy są wymagane.

## 3. Zakres żądań

Skrypt wysyła GET i OPTIONS do następujących stałych ścieżek:
- RCN: /
- Oferty: /health
- Działki: /health
- Podobne: /api/health

OPTIONS zawiera Origin https://example.org, Access-Control-Request-Method GET oraz Access-Control-Request-Headers authorization. Odpowiedź nie jest przekierowywana ani czytana jako treść. Po pierwszej serii skrypt czeka 2 sekundy i wykonuje serię drugą. Wiarygodny pomiar zimnego startu wymaga co najmniej 15 minut bezczynności usługi; sama pauza skryptu tego nie zapewnia.

## 4. Odczyt wyników

1. W terminalu zobacz tabelę gotową do wklejenia do CONFIG.md.
2. Pełne wyniki znajdziesz w pliku .local-results/m1-probe-<data>.json. Katalog jest ignorowany przez Git.
3. Tabela zawiera czas UTC, czas odpowiedzi, status HTTP oraz wyłącznie nagłówki Access-Control-* i Cache-Control. Nie zapisuje adresów bazowych, treści odpowiedzi, Set-Cookie ani innych nagłówków.
4. W CONFIG.md uzupełnij wyniki i źródło pomiaru ręcznie. Sam skrypt nie zmienia dokumentacji.

## 5. Testy lokalne bez sieci

Uruchom:

    node --test scripts/*.test.mjs

Testy używają atrap odpowiedzi. Sprawdzają parsowanie nagłówków, preflight i odrzucenie zabronionej ścieżki bez wykonania połączenia.
