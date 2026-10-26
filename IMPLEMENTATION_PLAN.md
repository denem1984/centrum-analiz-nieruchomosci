# IMPLEMENTATION_PLAN.md — kolejność etapów, zależności, kryteria akceptacji, testy

Status: PLAN. Żaden etap nie jest rozpoczęty. Zasada nadrzędna: **po każdym etapie wszystkie 5 aplikacji działa dokładnie jak dziś** (obecne linki z panelu DENEM nie przestają działać), a każdą zmianę da się cofnąć przez przywrócenie poprzedniej wersji pliku w repozytorium.

## Zależności między etapami

```
E0 → E1 → E2 → E3 → E4 → E5
              │          └→ E7 → E8
              └→ E6 ──────┘
E9 (opcjonalny, niezależny, po E4)
```

## E0 — Inwentaryzacja produkcji (bez zmian kodu)
Cel: uzupełnić to, czego nie widać w repozytoriach.
- Spisać z paneli hostingowych: plan, regiony, zmienne środowiskowe (tylko nazwy i status ustawione/nieustawione, bez wartości), komendy start/build, domeny — dla wszystkich usług.
- Sprawdzić w rcn: aktualny tryb źródła (`/api/data_source_status`) i czas odpowiedzi.
- Sprawdzić w Supabase: polityki RLS tabeli `gus_bdl_commune_wide`; strukturę tabeli (czy jest TERYT obok `unit_id`).
- Dostarczyć kod panelu `denem.pl/panel` (nie był w audycie) albo opis jego działania.
- Sprawdzić, czy serwisy pozwalają na osadzanie w ramce (nagłówki `X-Frame-Options`/CSP).
**Kryterium akceptacji:** dokument `CONFIG.md` (bez sekretów) + odpowiedzi na D1–D4 w `DECISIONS.md`.
**Testy:** brak (tylko odczyt).
**Zależności:** brak. **Ryzyko:** niskie.

## E1 — Higiena i bezpieczeństwo bez zmiany funkcji
- rcn: ustawić `RCN_ADMIN_TOKEN` (konfiguracja, nie kod) i dodać wymóg tokenu dla `/api/admin/*` i `/api/debug/*`.
- działki: usunąć lub ukryć za tokenem 26 tras diagnostycznych; zostawić 7 używanych przez front + `/health`.
- oferty: usunąć lub ukryć trasy `/diagnostic-*` i `/api/diagnostic-*`.
- ujednolicić adres panelu w bramkach (`denem.pl/panel/`).
- wypisać do `.gitignore` i dopisać README minimum (uruchomienie, zmienne) w każdym repo; dodać lockfile.
**Kryteria akceptacji:** wszystkie funkcje z macierzy testów (sekcja „Testy regresyjne") przechodzą bez zmian; przed zmianą potwierdzono, że żaden front nie woła usuwanych tras (przeszukanie kodu).
**Zależności:** E0. **Ryzyko:** niskie (usuwanie nieużywanych tras).

## E2 — Kontrakt DenemContext i wspólny moduł (nowe repo statyczne `denem-platform`)
- Zdefiniować `DenemContext v1` (patrz MEGA_PROJECT §5), funkcje `encodeContext/decodeContext/readFromUrl`.
- Wspólny moduł bramki Supabase (jedna kopia, wersjonowana) — na razie nieużywany przez istniejące aplikacje.
**Kryteria akceptacji:** testy jednostkowe kodowania/dekodowania (poprawny, pusty, uszkodzony, zbyt duży kontekst); moduł bramki odtwarza obecne zachowanie (profil aktywny, rola admin lub slug, log `app_open`).
**Zależności:** E1. **Ryzyko:** niskie.

## E3 — Adaptery kontekstu w modułach (jeden moduł = jeden mały wydawany pakiet)
Kolejność: **gminy → rozkład → działki → rcn → oferty** (od najprostszych i statycznych; oferty na końcu, bo mają najwięcej łatania).
Dla każdego modułu: przy starcie odczyt `ctx` (jeśli jest) i ustawienie lokalizacji/parametrów; brak `ctx` = zachowanie dotychczasowe; tam gdzie sensowne emisja kontekstu.
- gminy: gmina z TERYT → wybór jednostki (wymaga mapowania BDL↔TERYT z E0).
- rozkład: wstępne wypełnienie nieruchomości analizowanej (adres/działka).
- działki: odbiór parceli lub lokalizacji; emisja wybranej działki jako kontekstu.
- rcn: odbiór TERYT/współrzędnych/polygonu (`area_mode`, `polygon`, `use_radius`, `center_lat/lon` już istnieją w `/api/search`).
- oferty: odbiór TERYT/SIMC zamiast nazwy tekstowej (funkcja `resolveLocation` w kodzie przyjmuje już opcjonalne `teryt` i `simc`, ale endpoint `/api/resolve-location` przekazuje do niej tylko nazwę — wymaga drobnej zmiany).
**Kryteria akceptacji:** (a) otwarcie modułu z `ctx` ustawia oczekiwany stan; (b) otwarcie bez `ctx` identyczne jak przed zmianą; (c) macierz regresji przechodzi.
**Zależności:** E2. **Ryzyko:** średnie (pojedyncze moduły, każdy cofalny).

## E4 — Powłoka MEGA
- Wspólne wyszukiwanie lokalizacji/działki, zakładki modułów, wspólny `DenemContext`.
- Osadzanie w ramce lub otwieranie w nowej karcie — zależnie od wyniku E0 (D4).
- Panel DENEM linkuje do powłoki obok dotychczasowych aplikacji (nie zamiast).
**Kryteria akceptacji:** po wskazaniu lokalizacji każda zakładka otwiera moduł z właściwym kontekstem; użytkownik bez uprawnień do danego modułu widzi komunikat o braku dostępu tylko w tej zakładce; stare adresy modułów działają.
**Zależności:** E3, E0 (D3, D4). **Ryzyko:** średnie.

## E5 — Weryfikacja tokenu po stronie backendów i zawężenie CORS
- Backendy sprawdzają token Supabase (nagłówek `Authorization`) oraz slug dostępu; CORS ograniczony do domen DENEM.
- Front modułów dołącza token do wywołań API.
**Kryteria akceptacji:** żądanie bez ważnego tokenu dostaje 401/403; z tokenem użytkownika bez slugu — 403; z poprawnym — jak dziś; trasa `/health` nadal otwarta.
**Zależności:** E4, decyzja D5. **Ryzyko:** średnie–wysokie (dotyka wszystkich wywołań; wdrażać po jednym backendzie, z możliwością wyłączenia przełącznikiem środowiskowym).

## E6 — Wspólny serwis lokalizacji (TERYT/SIMC)
- Jedno źródło prawdy o miejscowościach i kodach (kandydat: słownik SIMC z rcn, ok. 54 tys. pozycji — D2).
- Podmiana mapowania lokalizacji w ofertach z „nazwa → slug w każdym parserze" na „TERYT/SIMC → slug portalu" przez wspólną funkcję.
**Kryteria akceptacji:** lista miejscowości testowych (sekcja „Testy") zwraca poprawne wyniki we wszystkich modułach; brak wyjątków wpisywanych ręcznie dla pojedynczych miast.
**Zależności:** E3 (oferty, rcn), D2. **Ryzyko:** średnie (znane wcześniejsze problemy z Piszem i gminami wieloosadniczymi).

## E7 — Widoki łączone
Kolejność: (1) „Dodaj z RCN" w module Podobne, (2) transakcje vs oferty (mediany, rozrzut) dla jednego kontekstu, (3) profil gminy w karcie nieruchomości.
**Kryteria akceptacji:** wartości w widoku łączonym zgodne z wartościami w modułach źródłowych dla tego samego kontekstu (różnica 0 dla tych samych rekordów); komunikat o braku danych z jednego źródła nie blokuje pozostałych.
**Zależności:** E3, E6. **Ryzyko:** średnie.

## E8 — Raport zbiorczy
PDF/Word łączący sekcje z modułów. Wejście: kontekst + wyniki widoków. **Kryterium:** raport odtwarza liczby widoczne w modułach; brak wycieku nazw technicznych. **Zależności:** E7. **Ryzyko:** wysokie zakresowo — wymaga osobnej specyfikacji.

## E9 — Porządki opcjonalne (po E4)
- oferty: usunięcie lub archiwizacja 15 nieosiągalnych plików JS po potwierdzeniu, że nie są wywoływane; zastąpienie łatania `fetch`/`readFileSync` zwykłą zmianą kodu.
- scalenie proxy rozkładu z backendem działek (jedna usługa mniej) — D7.
**Zależności:** E4. **Ryzyko:** niskie–średnie.

## Testy regresyjne (macierz minimalna, do uruchamiania po każdym etapie)

| Moduł | Przypadek | Oczekiwanie |
|---|---|---|
| rcn | Lokale, Olsztyn (gmina miejska) | wyniki, statystyki, eksport XLSX |
| rcn | Lokale, Pisz, Biała Piska, Piecki (gminy wieloosadnicze) | tylko transakcje z wybranej miejscowości (przypadki z `docs/TEST_CASES.md`) |
| rcn | grunt niezabudowany, polygon i promień | jakość ceny/m² oznaczona |
| oferty | Olsztyn, Pisz, dom i działka, tolerancja 10% | oferty z ≥1 portalu; błąd jednego portalu nie blokuje reszty |
| oferty | `/api/resolve-location` dla miejscowości spoza listy awaryjnej | poprawny TERYT/SIMC |
| działki | działka w powiecie piskim, gmina Pisz, obręb Łupki | etykiety numerów działek widoczne; MPZP/POG się ładują |
| działki | raport PDF | plik generuje się |
| rozkład | 1 analizowana + 3 podobne (adres i działka) | markery i linie na mapie |
| gminy | gmina docelowa, zakres: kraj / województwo, 3 profile | ranking i PDF |
| wszystkie | użytkownik bez uprawnień do slugu | ekran „brak dostępu" |
| wszystkie | wejście bez `ctx` | zachowanie jak przed zmianą |

Test przed i po każdym etapie wykonuje właściciel w przeglądarce według tej tabeli; do czasu E5 nie ma automatycznych testów e2e (D6: czy je dodać).