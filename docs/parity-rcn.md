# RCN w Centrum i aplikacja źródłowa

Port korzysta z frontu `denem1984/rcn-web-app` w rewizji `85cb2f91348e10fc1fa3491c5e4e0c07b4a952bb`. [Kod źródłowy interfejsu](https://github.com/denem1984/rcn-web-app/tree/85cb2f91348e10fc1fa3491c5e4e0c07b4a952bb/static).

| Funkcja | Stary front | Centrum i sprawdzenie |
|---|---|---|
| Typ nieruchomości | `static/index.html:168–436`, `static/app.js:23–129` | Lokale, grunt niezabudowany i grunt zabudowany. Zachowano przełączenia filtrów, etykiet i obliczeń. Edge sprawdził każdy typ. |
| Własna lokalizacja | `static/app.js:1969–2150,2374–2481` | Województwo, powiat, gmina, miejscowość, cała gmina, ulica dla lokali i pomocniczy opis obrębu dla gruntów. Kod TERYT z API RCN jest przekazywany w formacie wymaganym przez to API. Wybór w RCN odbywa się w jego formularzu zgodnie z D35. |
| Filtry rynku i cech | `static/index.html:185–375`, `static/app.js:945–1017` | Daty, suwak, 12/24 miesiące, cena, powierzchnia, rynek, prawa, funkcje lokali, sposób użytkowania gruntów, wszystkie typy budynków, odrzucanie skrajnych cen. Pola i opcje z szablonu źródłowego. Daty suwaka i pól porównano w strefie Europe/Warsaw. |
| Promień i rysowanie obszaru | `static/app.js:466–628,771–842,945–1017` | Promień 100–5000 m, punkt na mapie, poligon, przeciąganie wierzchołków, cofnięcie i wyczyszczenie. Dopełniono zamknięcie przez kliknięcie pierwszego wierzchołka. Edge potwierdził parametry promienia. Test z atrapą Leaflet sprawdza domknięcie, dokładną serializację trzech punktów i czyszczenie. |
| Znajdź podobne | `static/index.html:366–391`, `static/app.js:945–1017,1029–1239` | Powierzchnia i wartość, tolerancja lub zakres, przedział ceny/m², wagi powierzchni, lokalizacji i rynku; dotychczasowe przeliczenia. Edge odróżnia `similar_mode=true` od zwykłego wyszukiwania. |
| Wyniki | `static/app.js:1029–1850` | Diagnostyka, obliczenia źródłowe i lokalne, rozróżnienie cen i powierzchni, pełne tabele, przypisanie markera do wiersza, odrzucanie ręczne. Licznik wyjaśnia różnicę pomiędzy analizą, rekordami z położeniem i mapą z istniejącym limitem 1500. Kolumny można sortować klawiaturą, braki znajdują się na końcu. |
| Wykresy | `static/app.js:1835–1909` | Średnia i mediana w czasie, histogram, średnie ulic. Chart.js przypięty lokalnie. Pokazano krótsze etykiety i utrzymano osobne opisy podstaw ceny dla każdego typu. |
| Eksporty | `static/app.js:2502–2574` | XLSX i raport Word wykorzystują istniejące trasy POST i zestaw aktywny po wykluczeniach. Atrapa potwierdza metodę, ciało JSON i pobranie obu plików w ukończonym przebiegu. Rzeczywista treść plików pozostaje do odbioru właściciela. |
| Źródło transakcji | D1, D32 i publiczne API RCN | [FAKT od właściciela z M1] Istniejące API korzysta z aktualizowanych przez właściciela plików Parquet w R2. Centrum pobiera wyniki przez to API. [CONFIG.md](../CONFIG.md). |

## Tabela wywołań

Ścieżki RCN są rozwiązywane względem istniejącego publicznego originu z `app/js/config.js`. Parametry i metody pochodzą z portowanego frontu. Testy nie wysyłają wywołań do usług.

| Stary front | Wywołanie w Centrum, parametry, format i CRS |
|---|---|
| `static/app.js:2374` | GET `/api/teryt/voivodeships`. Tablica JSON, bez CRS. |
| `static/app.js:2396` | GET `/api/teryt/powiaty?voivodeship=…`. Tablica JSON, bez CRS. |
| `static/app.js:2413` | GET `/api/teryt/gminy?voivodeship=…&powiat=…`. Tablica JSON z kodem `teryt6`, bez CRS. |
| `static/app.js:2433` | GET `/api/teryt/miejscowosci?voivodeship=…&powiat=…&gmina=…&gmina_teryt=…`. Tablica JSON, bez CRS. |
| `static/app.js:1977–1978,2009–2010,2040–2047,2143` | GET `/api/geocode`. `city, teryt, gmina, powiat, voivodeship` zależnie od ścieżki użytkownika. JSON z punktem i opcjonalnym `bbox4326` w EPSG:4326. |
| `static/app.js:2069` | GET `/api/place_suggest?q=…`. JSON z miejscowościami i ewentualnym punktem EPSG:4326. |
| `static/app.js:945–1017,2239` | GET `/api/search`. `layer, property_kind, land_record_mode, city, teryt, street, market, right, function, date_from, date_to, land_use, building_type, area_min, area_max, price_min, price_max, subject_area, subject_value, subject_area_filter_mode, subject_area_min, subject_area_max, area_tolerance, price_m2_min, price_m2_max, w_area, w_location, w_market, similar_mode, only_with_price, exclude_outliers, area_mode, use_radius, center_lat, center_lon, radius_m, polygon, area_admin_level, gmina, powiat, voivodeship, gmina_teryt6`. JSON z rekordami i diagnostyką. Punkt i ciąg `lat,lon\|…` używają EPSG:4326, promień jest w metrach. |
| `static/app.js:2513–2517` | POST `/api/export_current.xlsx`. Ciało JSON `{ records }`, zwraca XLSX. Współrzędne, jeśli występują w rekordach, pozostają EPSG:4326. |
| `static/app.js:2555–2559` | POST `/api/export_current.docx`. Ciało JSON `{ records, params }`, zwraca DOCX. Przeglądarka obsługuje wymaganą sondę OPTIONS. |
| `static/app.js:859–860` | GET `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=…&lon=…&zoom=10&addressdetails=1`. JSON, EPSG:4326. |
| `static/app.js:704–711` | GET `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` i `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`. Raster w EPSG:3857. |

Pełne URL-e do list, geokodowania, sugestii, przykładowego wyszukiwania, eksportów i reverse są testowane w `tests/rcn.test.mjs`. `scripts/rcn-browser-smoke.mjs` porównuje przechwycone dokładne adresy list i geokodowania oraz sprawdza parametry wyszukiwania i treść POST. CORS dla JSON i eksportów jest jawnie dopuszczony w kodzie `main.py:85–88` oraz w historycznym pomiarze właściciela. [CONFIG.md](../CONFIG.md).
