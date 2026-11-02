# Moduł Działki — M4b/M4c

## Zakres

M4b dodaje natywny widok mapy do zakładki Działki. Używa lokalnego Leaflet 1.9.4 z licencją BSD 2-Clause. Biblioteka jest ładowana lokalnie; moduł nie dodaje CDN ani zależności npm.

Frontend poprzedniej aplikacji zaczyna mapę w centrum [52.07, 19.48], przy zoomie 6, z krokami zoomu 0,1 i limitem 22. [FAKT z kodu: index.html:211] W tym froncie widoczne są bazowe podkłady OpenStreetMap, satelitarne Esri World Imagery i archiwalna ortofotomapa GUGiK; elementy i atrybucje znajdują się w konfiguracji warstw mapy. [FAKT z kodu: index.html:177,211]

## Podkłady i kontrolki

- **OpenStreetMap** — atrybucja „© OpenStreetMap contributors” z linkiem do strony praw autorskich OSM.
- **Satelita – Esri World Imagery** — atrybucja Esri wyświetlana przez kontrolkę Leaflet.
- **Ortofotomapa archiwalna – GUGiK** — suwak „Rok zdjęcia” w zakresie 1995–2025. Podpis: „Dostępne lata: 1995–2025. W danym miejscu może brakować zdjęcia z wybranego roku.”
- Kontrolki przybliżenia mają krok 0,1; skala metryczna pochodzi z kontrolki Leaflet.

Nazwy, zakres lat, podpis suwaka i źródłowe atrybucje podkładów są zgodne z widocznym zachowaniem frontu. [FAKT z kodu: index.html:177,211] Przy zmianie podkładu oraz roku aktywny zestaw prób pobierania kafelków jest anulowany i inicjowany ponownie.

Warstwa archiwalna wysyła z przeglądarki żądania WMS GetMap do `https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolutionTime` bez pośrednictwa backendu. Używa warstwy `Raster`, stylu `default`, WMS 1.3.0, CRS EPSG:3857, formatu `image/png`, przezroczystości oraz parametru czasu: `2025-11-01` dla 2025 i `<rok>-12-01` dla pozostałych lat. Stary publiczny front buduje te parametry w kodzie warstwy archiwalnej. [FAKT z kodu: index.html:211] Moduł nowej aplikacji odtwarza ten zestaw w `layers-base.js` i obejmuje go testem jednostkowym dla lat 1995, 2004, 2015 i 2025.

## Stan i cykl życia

Wybrany podkład, rok, środek mapy i zoom są przechowywane w pamięci modułu. Przełączenie zakładki odmontowuje mapę i sprząta jej zdarzenia i timery; ponowne wejście przywraca widok. Odświeżenie strony czyści ten stan. Jeśli DenemContext zawiera punkt, mapa ustawia go jako środek przy zoomie co najmniej 16; moduł nie zmienia wspólnego kontekstu.

Stan usługi Działki jest odczytywany z pamięci istniejącej sondy powłoki i subskrybowany w jej magazynie stanu. Moduł nie wykonuje własnych żądań do API Działek.

## Błędy kafelków

Na warstwie bazowej moduł wykonuje najwyżej dwie ponowne próby danego kafelka po początkowym błędzie, po około 1,5 s i 4 s, z niewielkim jitterem. Maksymalnie sześć prób może być zaplanowanych lub aktywnych jednocześnie dla warstwy. Odejście kafelka z widoku, przełączenie podkładu albo roku oraz odmontowanie anuluje oczekujące próby. Po wyczerpaniu prób licznik „Niezaładowane kafelki: N” i przycisk „Spróbuj ponownie” informują o stanie.

## Wyszukiwanie działki — M4c

Panel prowadzi użytkownika przez powiat, gminę i obręb, a następnie numer działki. Listy administracyjne pochodzą z publicznego PRG FeatureServer; nazwy obrębów i geometria są pobierane z ULDK. Wyszukiwanie wykonuje wyłącznie GET. Aplikacja zachowuje wybory formularza i wynik w pamięci przy przełączaniu zakładek.

| Kolejność | Cel | Stary publiczny front | Nowa aplikacja | Metoda i parametry | CRS i format odpowiedzi |
|---:|---|---|---|---|---|
| 1 | Lista powiatów | `https://mapy.geoportal.gov.pl/wss/ims/maps/PRG_gugik_wyszukiwarka/FeatureServer/1/query` [FAKT z kodu: `index.html:560`] | `buildCountiesUrl()` w `app/js/modules/dzialki/search.js` | GET; `where=1=1`, `outFields=teryt,nazwa`, `returnGeometry=false`, `orderByFields=nazwa`, `f=json` | JSON, bez geometrii i CRS |
| 2 | Lista gmin powiatu | `https://mapy.geoportal.gov.pl/wss/ims/maps/PRG_gugik_wyszukiwarka/FeatureServer/0/query` [FAKT z kodu: `index.html:560`] | `buildCommunesUrl()` w `app/js/modules/dzialki/search.js` | GET; `where=teryt LIKE '<kod powiatu>%'`, `outFields=teryt,nazwa`, `returnGeometry=true`, `outSR=4326`, `orderByFields=nazwa`, `f=json` | JSON, geometria EPSG:4326 |
| 3 | Lista obrębów gminy | `https://uldk.gugik.gov.pl/?request=GetRegionByNameOrId` [FAKT z kodu: `index.html:560`] | `buildRegionsUrl()` w `app/js/modules/dzialki/search.js` | GET; `id=<gmina ULDK>`, `result=id,teryt,region,commune,county` | Tekst pól `|`, bez geometrii |
| 4 | Geometria działki | `https://uldk.gugik.gov.pl/?request=GetParcelById` [FAKT z kodu: `index.html:560`] | `buildParcelUrl()` w `app/js/modules/dzialki/search.js` | GET; `id=<obręb>.<numer>`, `result=id,teryt,parcel,county,commune,region,geom_wkt`, `srid=4326` | Tekst pól `|`; geometria WKT EPSG:4326 |

Wszystkie cztery wywołania są bezpośrednimi żądaniami przeglądarki do publicznych usług. Testy jednostkowe porównują pełne adresy z parametrami wynikającymi ze starego frontu. [FAKT z kodu: `index.html:560`]

Stary front buduje parametr `teryt` dla informacji o gminie z części identyfikatora przed `_`; ta część ma sześć cyfr. [FAKT z kodu: `index.html:237,321-324`] Funkcja `terc7ToTeryt()` jest czysta i testowana. Kontekst `gmina.terc7` w M4c powstaje wyłącznie z pełnego kodu siedmiocyfrowego. `parcel.id` jest zachowywany bez zmian, a `obrebTeryt` pomijany bez niezależnego potwierdzenia.

Zapytanie ULDK zwraca identyfikator, numer, nazwy jednostek i geometrię; nie zawiera pola powierzchni ewidencyjnej. Popup pokazuje dane dostępne z list administracyjnych i odpowiedzi. Obrys jest wyróżniony, widok dopasowany do granic, a numer działki widoczny jako etykieta. Stan formularza i wybrany wynik pozostają w pamięci modułu przy przełączaniu zakładek.

Pozostałe funkcje, w tym EGiB, planowanie przestrzenne, inwestycje i zagrożenia, infrastruktura i własność, pozostają oznaczone jako „w kolejnych etapach”.

## Diagnostyka M4b.1

`node scripts/browser-smoke.mjs` uruchamia lokalny serwer i przeglądarkę headless, przechodzi przez podkłady oraz lata archiwum, zapisuje PNG i raport JSON do ignorowanego `.local-results/`. Narzędzie dopuszcza wyłącznie localhost, skonfigurowane health-checki GET oraz wskazane usługi kafelków i pojedyncze WMS GetMap Raster. Testy pomocników są bez sieci; skrypt nie jest uruchamiany w CI. Instrukcja właściciela: `scripts/README-run.md`.
