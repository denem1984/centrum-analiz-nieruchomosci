# Gminy w starym froncie i w Centrum

Punkt odniesienia to rewizja `c1b682c4877553c9978b2942a429c7a9b1f4e54a`. [Repozytorium źródłowe](https://github.com/denem1984/gminy/tree/c1b682c4877553c9978b2942a429c7a9b1f4e54a)

| Funkcja | Stary front | Centrum |
|---|---|---|
| Źródło danych | `index.html:110–111,157–185`, siedem kolumn wskaźników i lata w gotowym eksporcie z bazy | Plik statyczny `app/data/gminy/bdl.json` utworzony z publicznego GUS BDL. Osobne identyfikatory TERC i BDL. Wartości mają wspólny rok referencyjny. |
| Wybór gminy | `index.html:27–29,182,193`, pole z listą nazw i typów | Wyszukiwanie po nazwie, powiecie, województwie i kodzie. Pozycje odróżnia typ, powiat, województwo i TERC. Wiersze z brakami da się zobaczyć w słowniku. |
| Zakres i profil | `index.html:27,74–81,200–210` | Cały kraj lub województwo, opcjonalnie ten sam typ, trzy profile i te same wagi. |
| Algorytm | `index.html:95,174–180,208–223` | Średnie rangi dla remisów, percentyle liczone po odfiltrowaniu puli, wynik wskaźnika `max(0, 100 − 2 × różnica percentyli)` i średnia ważona. Wyklucza gminę docelową oraz wszelkie wiersze bez kompletu. Remis w wyniku porządkuje po nazwie i TERC. |
| Ranking i porównanie | `index.html:224–245`, pierwszych 20, wybór kilku, wyniki cząstkowe | Pierwszych 20, porównanie zaznaczonych, jednostki, rok, wartości, wagi i podobieństwo każdego wskaźnika. |
| Objaśnienia | `index.html:30–66,83–90` | Definicje siedmiu wskaźników, znaczenie dla nieruchomości i odnośniki do metadanych GUS. |
| PDF | `index.html:246–287`, zrzut kart porównania | Własny PDF z tekstem i lokalną czcionką. Jedna strona na gminę, oba kody, profil i zakres oraz tabela wartości i wag. Pobieranie w przeglądarce. |

## Plik i odświeżanie

W czasie pracy modułu przeglądarka czyta plik lokalny. Zapytania do publicznego BDL są wykonywane tylko przez skrypt pozyskiwania danych, z limitem GUS i zapisem stron umożliwiającym wznowienie. [Zasady API GUS BDL](https://api.stat.gov.pl/Home/BdlApi)

| Operacja | Stary front | Centrum |
|---|---|---|
| Odczyt dla rankingu | `index.html:157–185`, stronicowany odczyt z gotowego zestawienia | GET tego samego originu `/data/gminy/bdl.json`, JSON. Test przeglądarkowy sprawdza ścieżkę. |
| Odświeżanie wskaźnika | Dane były już w eksporcie, poza frontendem | GET `https://bdl.stat.gov.pl/api/v1/data/by-variable/60559?year=2025&unit-level=6&page-size=100&format=json&page=0`. Dla pozostałych wskaźników zmienia się identyfikator. Strony od zera do wartości wyliczonej z `totalRecords`. CRS nie dotyczy. |
| Dopasowanie TERC | `index.html:166–175`, typ rekordów i województwo z ID BDL | Wersjonowane połączenie na podstawie pełnego katalogu M3b. Data stanu TERC jest w pliku. Sześć gmin ze zmianą typu od 2026 r. ma jawne powiązanie aktualnego kodu z kodem z 2025 r. Zasięg „ten sam typ” używa klasyfikacji z roku analizy. [Zmiany w TERC](https://dziennikustaw.gov.pl/D2025000157101.pdf) |
| Wygenerowanie PDF | `index.html:246–277`, zasoby biblioteki z CDN | Lokalne jsPDF i Noto Sans z weryfikacją integralności. Wysyłka pliku jest inicjowana przez przeglądarkę, bez serwera raportów. |

## Wskaźniki, rok i prawa do danych

Rok 2025 ma wszystkie siedem serii w metadanych zmiennych. Dla budownictwa użyto bezpośrednio publikowanej średniej trzyletniej dla 2025 r. zamiast liczenia drugiej średniej. Wskaźniki mają identyfikatory `60559`, `458603`, `634067`, `747072`, `60530`, `1548707`, `1728573`. Dane statystyczne pochodzą z GUS, Banku Danych Lokalnych, udostępnionego na licencji CC BY 4.0. Transformacja obejmuje ograniczenie do rodzaju gmin 1–3, połączenie z TERC, wspólny rok i przeliczenie podobieństwa. [Licencja i dokumentacja GUS](https://api.stat.gov.pl/Home/BdlApi) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.pl)

Stan TERC 2026-01-01, rok danych 2025. Zebrano 280 stron, po 40 na zmienną. Każda seria ma 3934 rekordy BDL dla poziomu 6 i po dopasowaniu 2479 gmin. Pozostałe 1455 rekordów każdej serii nie weszły do zbioru gmin. Po uwzględnieniu sześciu zmian kodu wszystkie 2479 gmin ma komplet siedmiu wartości.

Ponowne pobranie wymaga katalogów TERC i stron katalogu jednostek BDL z M3b. Z katalogu projektu uruchom `python -X utf8 scripts/refresh-gminy-data.py --year 2025`. Opcja `--cache-only` buduje ten sam format z zapisanych odpowiedzi bez wysyłania żądań. [Pozyskanie katalogów M3b](../reports/m3b-location-dictionaries.md)
