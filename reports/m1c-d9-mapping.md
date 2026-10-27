# M1c D9 — próbka mapowania BDL ↔ TERYT

## Zakres danych

[FAKT z danych] Lokalny plik `bdl-gminy-units.csv.csv` ma 100 rekordów i trzy kolumny: `unit_id`, `unit_name`, `unit_kind`. Każdy `unit_id` ma 12 cyfr; identyfikatory są unikalne. Wszystkie rekordy w próbce mają znaki 3–4 równe `12`. Próbka obejmuje jeden kod województwa i nie jest pełnym eksportem tabeli.

[FAKT: odczyt właściciela z panelu 2026-10-27] Pełna tabela `gus_bdl_commune_wide` ma 2479 rekordów według liczności `unit_kind`: 1 — 302, 2 — 1459, 3 — 718. `unit_id` jest tekstem o długości 12 znaków, a tabela nie ma kolumny TERYT. Analiza niżej nie odczytywała Supabase; używa wyłącznie przekazanego CSV i lokalnego `rcn-web-app/data/teryt_places.csv`.

## Hipotezy i obserwacje

- [FAKT z danych] W próbce `unit_kind` występuje jako 1 w 8 rekordach, 2 w 66 i 3 w 26.
- [FAKT z danych] Ostatnia cyfra `unit_id` jest równa `unit_kind` w 100/100 rekordów.
- [HIP] Wartości 1, 2 i 3 oznaczają odpowiednio gminę miejską, wiejską i miejsko-wiejską. CSV nie zawiera etykiet tych kategorii. RCN mapuje własne pole `RODZ_GMI` 1–3 na etykiety odpowiadające tym rodzajom [FAKT z kodu: `rcn-web-app/main.py:5581-5588`], ale nie dowodzi to samo w sobie, że źródłowe `unit_kind` ma identyczną semantykę.
- [FAKT z danych] Znaki 3–4 każdego `unit_id` w tej próbce to `12`; kod RCN mapuje symbol województwa 12 na małopolskie [FAKT z kodu: `rcn-web-app/main.py:858-863`]. [HIP] Zgodność wspiera interpretację znaków 3–4 jako kodu województwa, lecz próbka z jednym województwem nie potwierdza wszystkich 16 kodów.
- [HIP] Kandydat 7-cyfrowego TERC można wyprowadzić z nieciągłych fragmentów `unit_id`: znaki 3–4 + 8–9 + 10–12 (w zapisie Python: `unit_id[2:4] + unit_id[7:9] + unit_id[9:12]`). Daje to 100 różnych 7-cyfrowych kodów, a ostatnia cyfra jest zgodna z `unit_kind` we wszystkich rekordach. Wzór nie został potwierdzony dla pełnego zbioru.
- [FAKT z kodu] RCN buduje 6-cyfrowe TERYT gminy z pól `WOJ+POW+GMI` i przechowuje `RODZ_GMI` osobno [`main.py:1004-1020`]. Jego lokalny fallback ma 22 kody sześciocyfrowe [`data/teryt_places.csv`]. Z próbki BDL tylko rekord Kraków daje unikalne dopasowanie nazwy i województwa do fallbacku; wygenerowany kandydat TERC7 `1261011` ma prefiks sześciocyfrowy `126101`, zgodny z rekordem RCN. To jedyne porównanie kodu z dostępnym lokalnie słownikiem.
- [FAKT z danych] Nazwa występuje w próbce wielokrotnie w pięciu grupach, po jednym rekordzie z `unit_kind=1` i `unit_kind=2`; nie ma powtórzeń pary `(unit_name, unit_kind)`. RCN fallback obejmuje 22 wybrane miejscowości/gminy, więc brak dopasowania w tym pliku nie oznacza braku TERYT.

## Liczności dopasowań

| Rodzaj | Liczba | Znaczenie |
|---|---:|---|
| Unikalne dopasowania automatyczne nazwa + województwo do lokalnego fallbacku RCN | 1/100 | Kraków; zgodność kandydata sześciocyfrowego z kodem fallbacku. |
| Unikalne kandydaty reguły z `unit_id` | 100/100 | 100 różnych kodów TERC7; [HIP] do czasu walidacji pełnym źródłem TERC. |
| Kandydaty kodowe obecne w 22-wierszowym fallbacku | 1/100 | Ten sam rekord Kraków; plik nie jest pełnym słownikiem. |
| Grupy niejednoznaczne przy użyciu samej nazwy | 5 grup / 10 rekordów | Każda para rozróżnia się przez `unit_kind` w próbce. |
| Nierozstrzygnięte wobec lokalnego fallbacku | 99/100 | Brak odpowiedniego wiersza w ograniczonym fallbacku; nie jest dowodem braku jednostki w TERYT. |
| Powtórzenia `(unit_name, unit_kind)` w próbce | 0 | Nie wyklucza duplikatów w pełnej tabeli. |

### Przykłady niejednoznacznej nazwy

Poniższe kody są kandydatami z reguły, nie indywidualnie potwierdzonymi w pełnym TERC.

| Nazwa | unit_kind 1 | unit_kind 2 |
|---|---|---|
| Bochnia | 1201011 | 1201022 |
| Gorlice | 1205011 | 1205042 |
| Limanowa | 1207011 | 1207072 |
| Mszana Dolna | 1207021 | 1207092 |
| Grybów | 1210011 | 1210042 |

## Opcje i rekomendacja

| Opcja | Koszt | Ryzyko | Trwałość |
|---|---|---|---|
| Statyczna mapa `unit_id → TERYT7` w nowej aplikacji | Średni: plik i generator/walidator dla pełnego zbioru. | Wersja mapy może się zestarzeć; wymaga wykrywania nowych jednostek. | Dobra audytowalność i odtwarzalność, bez zmian schematu źródła. |
| Wyliczanie TERYT7 z `unit_id` | Niski po walidacji; wymaga testów granicznych i kontroli formatu. | Błędna interpretacja fragmentów ID mapowałaby wiele rekordów systematycznie źle. | Dobra, jeśli format BDL pozostaje stabilny; nie wymaga utrzymywania dużej mapy. |
| Dodanie kolumny TERYT do Supabase | Średni/wysoki: migracja, backfill i aktualizacja procesu zasilania. | Błędny lub nieodświeżony backfill trafia do wszystkich klientów. | Dobra przy utrzymywanym źródle mapowania, lecz wymaga decyzji i obsługi schematu. |

**Rekomendacja [HIP]:** preferować wyliczanie z `unit_id` dopiero po walidacji wszystkich 2479 rekordów względem pełnego, autorytatywnego TERC i potwierdzeniu semantyki `unit_kind`. Kandydat jest kompaktowy i pozwala uniknąć ręcznej mapy oraz migracji Supabase, ale obecne 100 rekordów i jeden niezależny punkt porównania nie zamykają D9. Jeśli walidacja całego zbioru wykryje wyjątki albo format nie będzie stabilny, zastosować wersjonowaną mapę statyczną. Kolumnę Supabase pozostawić jako opcję wymagającą odrębnej decyzji właściciela.
