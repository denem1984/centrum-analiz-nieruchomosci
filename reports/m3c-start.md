# Odbiór M3c — wspólna lokalizacja

[Podgląd przykładowy](http://localhost:8087/?start=demo#/start) · [Podgląd z publicznymi mapami i usługami modułów](http://localhost:8087/#/start) · [Opis wdrożenia i kontekst v2](../docs/shared-location-start.md).

## Sprawdzenie w lokalnym podglądzie

1. W podglądzie przykładowym wybierz **Obszar**, wpisz **Olsztyn**, kliknij **Znajdź miejscowość** i wybierz miasto z SIMC **0964465**. Kliknij **Ustal lokalizację**. Start pokaże punkt. Aby sprawdzić granicę gminy, wybierz warmińsko-mazurskie → Olsztyn → Olsztyn gmina miejska i zatwierdź z pustym polem miejscowości.
2. Otwórz RCN, wybierz **Szukaj**. Następnie sprawdź Oferty i Gminy. Dane RCN i Ofert w tym podglądzie są przykładowe. Gminy używają pełnego pliku GUS BDL. Wyszukiwanie Ofert będzie dostępne po ustaleniu miejscowości.
3. W Start wybierz **Adres**, miejski Olsztyn, **Aleja Warszawska**, bez numeru. Na mapie pojawi się punkt orientacyjny. Numer **1** pozwala sprawdzić wariant punktu adresowego w podglądzie przykładowym. RCN przekaże ulicę dla lokali. Oferty użyją samej miejscowości. W Podobnych punkt będzie lokalizacją analizowanego obiektu, a pozycje porównawcze zachowają własne formularze.
4. W trybie **Działka** wklej przykładowe ID **286201_1.0001.12/3**. Otwórz Działki i Podobne z paska nawigacji. Działki pokażą obrys i numer, Podobne pobiorą punkt. Przykładowy obrys nie służy do oceny danych EGiB. W trybie rzeczywistym użyj znanego identyfikatora.
5. Skopiuj adres zakładki zawierający `ctx` i otwórz go w nowej karcie. Następnie szybko przełącz Start → Podobne → Działki, użyj **Wyczyść** i sprawdź, że następny moduł nie pokazuje poprzedniego zakresu.

## Stary front i nowa aplikacja

| Cel | Stary front i rewizja | Nowa aplikacja |
|---|---|---|
| Granica gminy | Działki, `a1aa39d`, `index.html:560`. GET `PRG_gugik_wyszukiwarka/FeatureServer/0/query` z prefiksem powiatu, EPSG:4326 i JSON | Start pobiera jedną granicę. GET `https://mapy.geoportal.gov.pl/wss/ims/maps/PRG_gugik_wyszukiwarka/FeatureServer/0/query?where=teryt%3D%272862011%27&outFields=teryt%2Cnazwa&returnGeometry=true&outSR=4326&f=json`. Pierścienie JSON, EPSG:4326. |
| Obręby | Działki, `a1aa39d`, `index.html:560`. GET `GetRegionByNameOrId`, tekst | Wspólny klient Działek i Startu. GET `https://uldk.gugik.gov.pl/?request=GetRegionByNameOrId&id=020101_5&result=id%2Cteryt%2Cregion%2Ccommune%2Ccounty`, bez geometrii. |
| Działka | Działki, `a1aa39d`, `index.html:560`. GET `GetParcelById`, (E)WKT | Ta sama metoda z pełnym ID. GET `https://uldk.gugik.gov.pl/?request=GetParcelById&id=020101_5.0001.12%2F3&result=id%2Cteryt%2Cparcel%2Ccounty%2Ccommune%2Cregion%2Cgeom_wkt&srid=4326`. Start wymaga zgodności zwróconego identyfikatora. |
| Punkt dla miejscowości, ulicy lub adresu | Podobne, `index.html:629–631` w rewizji opisanej w macierzy M7. GET Nominatim, JSON. W M7 zastąpiony przez UUG według D40. | Start używa tego samego endpointu UUG co Podobne. GET `https://services.gugik.gov.pl/uug/?request=GetAddress&address=Olsztyn%2C+Aleja+Warszawska`. JSON z kodami SIMC i ULIC, EPSG:2180 → EPSG:4326. |
| Dane analityczne | [RCN, `85cb2f9`](../docs/parity-rcn.md) oraz [Oferty, `596451b`](../docs/parity-oferty.md). `location-resolver.js:6` Ofert podaje dla Olsztyna parę TERC **2862011** i SIMC **0964465**. | Dotychczasowe trasy GET. W RCN miasto z TERYT6 i ulicą albo gmina z `gmina_teryt6`. Oferty otrzymują potwierdzone kody w `/api/live/combined`. Wspólny wybór omija dodatkowe listy w RCN oraz podpowiedzi i ponowne rozpoznawanie miasta w Ofertach. |

Test `tests/shared-location.test.mjs` sprawdza dokładne URL-e Startu. Scenariusz `scripts/start-browser-smoke.mjs` sprawdza zakresy przechwyconych zapytań modułów, błąd spóźnionej odpowiedzi, czyszczenie wyboru i widok mobilny. Dane zewnętrzne przechwytują atrapy. Opcjonalna flaga `--public-map` dopuszcza tylko trzy wskazane GET-y do publicznych usług GUGiK i zapisuje ich statusy.

## Stan weryfikacji

- Start z atrapą DOM, zgodność kontraktu v1 i v2, zgodność kodów i adresów usług oraz regresja modułów są objęte zestawem Node.
- Czwarte uruchomienie Edge dotarło do wszystkich asercji przepływu i zrobiło zrzuty desktop oraz mobile. Końcowa kontrola wykryła błąd animacji Leaflet przy przełączaniu widoków. W kodzie wyłączono animację automatycznych zmian kadru. Pełny headed smoke po tej poprawce pozostaje do odbioru z uwagi na limit czterech uruchomień.
- Bezpośredni GET zwrócił granicę Olsztyna w PRG, punkty SIMC dla miejscowości o nazwie Olsztyn, ULIC alei Warszawskiej i obrys z ULDK ze zgodnym ID. Tę ścieżkę z prawdziwymi odpowiedziami trzeba jeszcze przejść w przeglądarce. Testy modułów RCN i Oferty korzystały z atrap.

Pełny test w Edge można uruchomić z terminala w katalogu projektu. Podgląd ręczny działa niezależnie od licznika narzędzia.

```powershell
node scripts/start-browser-smoke.mjs --headed --browser "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
```

Kolejny etap po akceptacji obejmuje dołączenie Ofert do raportu RCN.
