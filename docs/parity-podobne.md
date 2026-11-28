# Podobne w starym froncie i w Centrum

Punkt odniesienia to rewizja `a75020163912d23dbd5e48bfdc2fbcf2134e0931`. [Repozytorium źródłowe](https://github.com/denem1984/rozklad-nieruchomosci-podobnych/tree/a75020163912d23dbd5e48bfdc2fbcf2134e0931)

## Funkcje

| Funkcja | Stary front | Centrum |
|---|---|---|
| Nieruchomość analizowana | `index.html:269–291,1111–1137`, adres albo działka | Pole adresu lub powiat, gmina, obręb i numer działki. Ustalony punkt jest oznaczony literą N. |
| Nieruchomości porównawcze | `index.html:644–758,1169–1191,1218`, trzy początkowe pola, dodawanie i usuwanie, adres albo działka, cena i data | Wszystkie pola, numery markerów aktualizowane po usunięciu. Lokalizowanie adresu jest jawnie wyzwalane przez użytkownika. Wieloznaczne adresy wymagają wskazania wyniku. Zmiana lokalizacji usuwa stary punkt i jego linie. |
| Odległość i etykiety | `index.html:348–357,768–1096`, odległość w linii prostej, opcjonalne linie, osobne przełączniki adresu, ceny i daty, przesuwane etykiety i łączniki | Odległość Leaflet dla każdej pary z nieruchomością analizowaną. Przełączniki rysują linie i etykiety, a po przeciągnięciu łącznik nadal prowadzi do punktu lub linii. |
| Interakcje z mapą | `index.html:1098–1104,1192–1216`, wybór karty z mapy, pokaż wszystkie, mapa i satelita | Markery wskazują karty, przycisk dopasowuje widok do punktów, mapa pozostaje na miejscu podczas przewijania panelu. |

## Żądania HTTP

W trybie rzeczywistym zapytania administracyjne i ULDK używają istniejącej usługi Podobne. Wszystkie wiersze to GET. Ścieżki i parametry poniżej są sprawdzone w testach klienta i przeglądarki na przechwyconych odpowiedziach. Kodowanie list i parametrów parceli odpowiada `URLSearchParams`. [Scenariusz odbioru](../reports/m7-podobne.md)

| Zadanie | Stary front | Centrum | CRS i format |
|---|---|---|---|
| Powiaty | `index.html:367–379` | `/api/prg/1/query?where=1%3D1&outFields=teryt%2Cnazwa&returnGeometry=false&f=json` | CRS nie dotyczy, JSON ArcGIS |
| Gminy | `index.html:381–387` | `/api/prg/0/query?where=teryt+LIKE+%272862%25%27&outFields=teryt%2Cnazwa&returnGeometry=false&f=json` dla kodu powiatu 2862 | CRS nie dotyczy, JSON ArcGIS |
| Obręby | `index.html:487–505` | `/api/regions?teryt=2862011` dla wybranej gminy | CRS nie dotyczy, JSON z `ok` i `regions` |
| Działka | `index.html:554–560,579–613` | `/api/uldk?request=GetParcelByIdOrNr&id=286201_1.0001.12%2F3&result=id%2Cparcel%2Cregion%2Ccommune%2Ccounty%2Cvoivodeship%2Cgeom_wkt&srid=4326`. W zapytaniu awaryjnym zmienia się tylko `id` na nazwę obrębu i numer. Odpowiedź musi zawierać dokładny wybrany identyfikator. | EPSG:4326, tekst i (E)WKT |
| Lokalizacja adresu | `index.html:629–631`, Nominatim `/search?format=jsonv2&limit=1&countrycodes=pl&q=…` | Zmiana dostawcy w D40. `https://services.gugik.gov.pl/uug/?request=GetAddress&address=Marki%2C+Andersa+1`. Nadawanie żądania po zatwierdzeniu formularza. [Specyfikacja UUG](https://services.gugik.gov.pl/uug/opis.html) | UUG JSON z `results`, `x` i `y` z EPSG:2180 do EPSG:4326 |
| Kafle mapy | `index.html:333–334` | Esri `https://server.arcgisonline.com/ArcGIS/rest/services/{World_Street_Map lub World_Imagery}/MapServer/tile/{z}/{y}/{x}` | EPSG:3857, kafle rastrowe |

Stary moduł wybierał pierwszą odpowiedź dla pełnego ID i oceniał podobieństwo nazw przy wyniku awaryjnym. Centrum przyjmuje tylko działkę o identyfikatorze wybranym w formularzu, a punkt liczy z geometrii. Adresy bez numeru mogą wskazywać punkt orientacyjny ulicy albo miejscowości i mają takie oznaczenie. [Dokumentacja ULDK](https://uldk.gugik.gov.pl/opis.html)
