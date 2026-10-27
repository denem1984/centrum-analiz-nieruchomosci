# M1c D2 — słownik TERYT/SIMC w RCN

## Zakres i źródła

Przeglądano wyłącznie lokalny, czysty checkout `rcn-web-app` o SHA `85cb2f91348e10fc1fa3491c5e4e0c07b4a952bb`. Nie uruchamiano aplikacji, nie pobierano danych z GUS i nie wykonywano żądań do API.

## Pliki i dane obecne w checkoutcie

- [FAKT z kodu: `main.py:852-853`] Ścieżki to `data/teryt_places.csv` (fallback) i `data/simc_cache.csv` (runtime cache).
- [FAKT z danych: `data/teryt_places.csv`] Fallback ma 22 rekordy i 11 kolumn: `city`, `voivodeship`, `powiat`, `gmina`, `teryt`, `lat`, `lon`, `bbox_min_lon`, `bbox_min_lat`, `bbox_max_lon`, `bbox_max_lat`. Wszystkie 22 wartości `teryt` mają 6 cyfr i są unikalne. Ten plik nie zawiera SIMC `sym` ani rodzaju gminy.
- [FAKT z inwentarza checkoutu] W `data/` nie ma `simc_cache.csv` ani osobnego pliku TERC. Kod tworzy cache podczas działania; nie odczytywano cache usług produkcyjnych.

## Budowanie słownika runtime

- [FAKT z kodu: `main.py:1074-1080`] Kolejność źródeł: lokalny cache SIMC, pobranie SIMC oraz TERC, a na końcu mały `teryt_places.csv` jako fallback.
- [FAKT z kodu: `main.py:909-951`] Parser TERC obsługuje format GUS z polami `WOJ;POW;GMI;RODZ;NAZWA;...` oraz alternatywny format z `kod_woj`, `kod_pow` i nazwą powiatu. Dla formatu GUS zapisuje nazwy powiatów i gmin w słownikach pamięciowych; kod nie utrwala pobranego TERC jako lokalnego pliku.
- [FAKT z kodu: `main.py:957-975,981-988`] TERC jest odczytywany z osobnego ZIP/CSV albo z ZIP SIMC, jeśli jest w tym samym archiwum. Kod wypisuje liczbę powiatów i gmin po parsowaniu, ale checkout nie zawiera danych pozwalających ustalić tę liczbę.
- [FAKT z kodu: `main.py:990-1025`] Parser SIMC czyta pola `SYM`, `SYMPOD`, `NAZWA`, `WOJ`, `POW`, `GMI`, `RODZ_GMI`; zachowuje wiersze, gdzie `SYM == SYMPOD`. Tworzy 6-cyfrowy kod gminy jako `WOJ + POW + GMI`, a `RODZ_GMI` i SIMC `SYM` zapisuje osobno [FAKT z kodu: `main.py:994-1025`]. Nie znalazłem jawnego formatowania ani walidacji SIMC do 7 cyfr; kod zachowuje tekst `SYM` z CSV [FAKT z kodu: `main.py:997-1001,1020`]. `teryt` nie jest siedmiocyfrowym TERC: parser buduje siedmiocyfrowy klucz `WOJ+POW+GMI+RODZ_GMI`, ale zwraca osobno sześciocyfrowe `teryt` i `rodz_gmi` [FAKT z kodu: `main.py:1004-1019`]. Kod nie dowodzi semantyki wartości `unit_kind` z tabeli Gminy.
- [FAKT z kodu: `main.py:1054-1069`] Runtime cache ma kolumny `city`, `voivodeship`, `powiat`, `gmina`, `teryt`, `sym`; nie zachowuje `rodz_gmi`.

## Wieloosadnicze gminy i powtarzalne nazwy

- [FAKT z kodu: `main.py:5591-5622`] Lista gmin grupuje rekordy po 6-cyfrowym TERYT, a nie po nazwie. Gdy nazwa gminy występuje więcej niż raz w obrębie wybranego powiatu i województwa, etykieta korzysta z rodzaju gminy; kod mapuje `RODZ_GMI` 1–5 na etykiety.
- [FAKT z kodu: `main.py:5625-5659`] Lista miejscowości filtruje po województwie, powiecie i — jeśli podano — dokładnym `gmina_teryt`; zwraca `teryt` i SIMC `sym`. Jeśli w wybranej gminie występują identyczne nazwy miejscowości, `seen_names` zatrzymuje pierwszą i pomija następne identyczne nazwy.
- [FAKT z kodu: `static/app.js:1013,2433`] Frontend przekazuje `gmina_teryt6` do endpointu miejscowości, gdy kod jest dostępny; odwołuje się tu do sześciocyfrowego kodu gminy, nie pełnego siedmiocyfrowego TERC.
- [FAKT z kodu: `main.py:1400-1419,5581-5588`] Funkcja szukająca TERYT gminy porównuje nazwę gminy, powiat i województwo; parser oddziela sześciocyfrowy kod gminy od `RODZ_GMI`. Etykiety rodzaju gminy obejmują wartości 1–5. Pełny TERC7 nie jest polem `teryt` w tym modelu.

W `data/teryt_places.csv` nie ma pola kodu obrębu; [FAKT z danych] fallback CSV zawiera sześciocyfrowy TERYT gminy i dane punktu/BBOX. W checkoutcie nie ma pełnego pliku TERC/SIMC ani lokalnej listy kodów obrębów [FAKT z inwentarza danych; FAKT z kodu: `main.py:852-853,871-900,909-951`].

## Wniosek dla D2

[FAKT z kodu] RCN ma runtime słownik SIMC z kodem gminy, rodzajem gminy i kodem SIMC oraz mały fallback 22 miejsc. Nie ma w checkoutcie pełnego, statycznego krajowego TERC/SIMC CSV ani potwierdzonej liczby gmin w pobieranym TERC. [HIP] Front nowej aplikacji powinien przechowywać TERYT7 i SIMC jako różne identyfikatory; przy identycznych nazwach wymagać kontekstu województwa, powiatu i gminy. Szczegóły pozostają do testu na pełnej liście i nie zamykają D2 dla wszystkich przypadków.
