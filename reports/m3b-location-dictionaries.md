# RAPORT dla kierownika — M3b, weryfikacja słowników lokalizacji

1. **Status: WYKONANE.** Pełne katalogi urzędowe przeszły weryfikację, a dopasowanie gmin sprawdzono na publicznym BDL. Lokalny podgląd czeka na odbiór właściciela.
2. Repozytorium `denem1984/centrum-analiz-nieruchomosci`, gałąź `feat/m3b-location-dictionaries`, baza `5ea366c0a3f8abfefe68764d2ce1c6f8dfbbbb6c`. Zatwierdzony [PR #28](https://github.com/denem1984/centrum-analiz-nieruchomosci/pull/28) scalono przed M3b. Metadane PR etapu znajdują się poniżej.
3. Zmieniono decyzje D2/D9, plan, stan projektu i ten raport. Dodano skrypt weryfikacji oraz szablon podglądu lokalnego w `scripts/`. Eksporty i wygenerowany podgląd są ignorowane przez Git. Liczby dla plików znajdują się w diffie PR.
4. Kryteria sprawdzone:

| Kryterium | Wynik |
|---|---|
| Pełny TERC i hierarchia | TAK. 4360 unikalnych jednostek, w tym 16 województw, 380 jednostek powiatowych i 2479 gmin rodzaju 1–3. Każda z 1448 części rodzaju 4/5 ma właściwą gminę rodzaju 3. Istniejący adapter Działek potwierdził to na wszystkich parach przy identyfikatorach parcel syntetycznie zbudowanych z kodów urzędowych. 37 jednostek 8/9 przypisano w podglądzie do unikalnych gmin miejskich w odpowiadających miastach na prawach powiatu. |
| Pełny SIMC i powtarzalne nazwy | TAK. 101 865 unikalnych wpisów. Każdy wskazuje istniejącą jednostkę TERC i miejscowość podstawową w SIMC. Zidentyfikowano 2870 grup powtórzeń nazwy w tej samej jednostce TERC. W Edge filtrowanie wyświetliło 11 pozycji „Stara Wieś” z różnymi kodami w gminie Kazimierza Wielka. |
| Pełny ULIC | TAK. 308 609 unikalnych par SIMC i ULIC. Każda ma miejscowość w SIMC i tę samą jednostkę TERC. Nazwa ulicy w podglądzie łączy cechę, człon dopełniający i nazwę w kolejności prezentacji. |
| Zachowanie identyfikatorów | TAK. Wszystkie kody są tekstem i mają urzędową długość. Kontrola przejścia przez kodowanie i dekodowanie v1 zachowała TERC `0201011` i SIMC `0935989`; Edge wyświetlił także ULIC `09282`. |
| BDL względem TERC | TAK w zakresie publicznych jednostek BDL. 47 stron i 4694 rekordy. Z 2705 jednostek poziomu 6 rodzaju 1–3 reguła przyporządkowała po jednym rekordzie każdej z 2479 gmin w TERC. Pozostałe 226 kandydatów nie występuje w bieżącym dla archiwum TERC. |
| Start i lokalny podgląd | TAK. 160 testów wraz ze startem aplikacji z atrapą DOM. Test w Edge z oknem obejmował filtr administracyjny, wybór miejsca, ulicę, powtórzenia, części gmin i pusty wynik. Sprawdzone zasoby HTTP 200. |

5. Uruchomiono GET do strony e-TERYT, GET czterech archiwów PSP, `Expand-Archive`, `Get-FileHash -Algorithm SHA256` oraz GET do 47 stron BDL. `python -X utf8 scripts/verify-location-dictionaries.py .local/m3b .local/preview-m4e2/app/.local/m3b --snapshot 2026-07-17` zweryfikował katalogi i zbudował stronę. `node --input-type=module -` porównał adapter Działek i kontekst v1. `node --test --test-reporter=tap scripts/*.test.mjs tests/*.test.mjs` dał 160/160 w 1,28 s. `node .local/m3b/preview-smoke.mjs` przeszedł w Edge z oknem. Obejrzano dwa zrzuty w `.local-results/m3b-location/`. `Invoke-WebRequest` zwrócił HTTP 200 dla aplikacji, strony podglądu, indeksu, katalogu województwa i modułu normalizacji.
6. [FAKT] Użyto oryginalnych archiwów GUS opublikowanych przez PSP z datą 2026-07-17, ponieważ przyciski pobierania e-TERYT na sprawdzonej stronie są realizowane przez wysłanie formularza. Sumy SHA-256 czterech użytych ZIP-ów odpowiadają publikacji PSP. Pole `STAN_NA` zawiera 2026-01-01 w TERC/SIMC i 2026-07-16 w ULIC. Katalog BDL pobrano 2026-11-28. [Archiwa PSP](https://github.com/KGPSP/SGR-ANALIZA/tree/main/materialy_referencyjne/teryt-referencyjny-2026-07-17/archiwa), [struktury GUS](https://eteryt.stat.gov.pl/eTeryt/rejestr_teryt/udostepnianie_danych/baza_teryt/uzytkownicy_indywidualni/pobieranie/pliki_pelne_struktury.aspx), [dokumentacja API BDL](https://api.stat.gov.pl/Home/BdlApi).
7. **Zakazane obszary: NIE.** PR #28 scalono zgodnie z poleceniem właściciela. Dla M3b użyto GitHub i publicznych odczytów danych. Bez wdrożenia oraz operacji na usługach zarządzanych i repozytoriach źródłowych.
8. Nie odczytano ani nie zapisano wartości sekretów albo zmiennych środowiskowych.
9. Identyfikator BDL ma 12 cyfr; kandydat TERC składa się ze znaków 3–4 i 8–12 w numeracji od 1. Filtr poziomu i rodzaju poprzedza dopasowanie do TERC. Porównano także nazwy. Dwa dopasowania różnią się nazwą między rejestrami: Wałbrzych od 2013 i M.st.Warszawa od 2002. W M8 trzeba sprawdzić wersję rzeczywistego pliku wskaźników i dopasowanie jednostek dla lat analizy. Obręby oraz numery domów nie są polami tego katalogu. Źródłem obrębów w Działkach pozostają obecne usługi, opisane w [zestawieniu wywołań](../docs/dzialki-module.md).
10. [Otworzyć podgląd lokalny](http://localhost:8082/.local/m3b/index.html). Wybrać dolnośląskie i wpisać `0935989`, wybrać Bolesławiec, potem wpisać `09282`. Wynik powinien pokazać ul. Mikołaja Kopernika i pełne kody. Wybrać świętokrzyskie, powiat kazimierski, gminę Kazimierza Wielka i wpisać `stara wies`. Powinno być 11 pozycji z osobnymi SIMC. Wrócić do [Działek](http://localhost:8082/#/dzialki) linkiem nad tytułem. Podgląd słowników korzysta z lokalnych JSON i jest oddzielony od formularzy aplikacji.
11. Po odbiorze rozpocząć M5 zgodnie z planem. Ten etap zwiększa szacunek ukończenia z 35% do około 37%. Około 63% pozostaje, w tym powiązanie słowników z wyszukiwaniem poszczególnych modułów.

## Zakres danych i adresy

| Funkcja | Stary front lub dane | M3b |
|---|---|---|
| Odczyt miejscowości w RCN | Front korzysta z własnego filtrowania i TERYT6, a backend przechowuje też SIMC. [Kod i dokładne pola](m1c-d2-simc.md) | Niezależna weryfikacja katalogu GUS. Lokalny podgląd używa tylko GET `/.local/m3b/index.json` oraz `/.local/m3b/region-<woj>.json`. Ruch aplikacji RCN pozostaje poza tą weryfikacją. |
| Jednostka BDL | Wcześniejsza kontrola obejmowała próbkę 100 rekordów. [Wynik porównania](m1c-d9-mapping.md) | GET `https://bdl.stat.gov.pl/api/v1/units?unit-level=6&page-size=100&format=json&page=N` dla stron 0–46. Zasób zwraca JSON z identyfikatorami administracyjnymi i metadanymi bez CRS. Żądania wykonywano na potrzeby weryfikacji, poza aplikacją. |
| Obręb Działek | PRG/ULDK według obecnego formularza. [Porównanie adresów](../docs/dzialki-module.md) | API wyszukiwania Działek nie wymaga zmiany. Dane słownikowe nie służą do wyprowadzania numeru obrębu z nazw. |

## Metadane dostawy

Otwarty PR i końcowy SHA zostaną podane przy dostawie.
