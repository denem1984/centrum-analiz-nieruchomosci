# M4a — analiza i plan portu modułu Działki

## 1. Inwentarz funkcji frontu

| Funkcja widoczna dla użytkownika | Zachowanie | Dowód |
|---|---|---|
| Wyszukiwanie działki | Wybór powiatu, gminy i obrębu, wpisanie numeru działki i uruchomienie wyszukiwania. | [FAKT z kodu: index.html:177,211] |
| Mapa i podkłady | Podkłady OSM, zdjęcia satelitarne Esri i archiwalna ortofotomapa z kontrolką roku; zoom i skala. | [FAKT z kodu: index.html:177,187,211] |
| Ewidencja gruntów | Przełączniki numerów i granic działek oraz konturów budynków; etykiety zależne od widocznego obszaru mapy. | [FAKT z kodu: index.html:177,187,507–560] |
| Informacje o działce | Kliknięcie pokazuje działkę, powierzchnię oraz dostępne informacje ewidencyjne; ponowny klik przełącza zaznaczenie. | [FAKT z kodu: index.html:456–458,817–837] |
| Wspólny numer bazowy i kolory | Można podświetlić działki o wspólnym numerze bazowym, zmienić kolor konturu i zaznaczenia oraz wyczyścić zaznaczenie. | [FAKT z kodu: index.html:458,624–708,861] |
| MPZP i linie zabudowy | Przełączniki warstw planów i linii zabudowy; kliknięcie może pokazać dostępne informacje planu. | [FAKT z kodu: index.html:187,319–410,838–844] |
| Plany ogólne | Oddzielne warstwy dla planu uchwalonego oraz projektów; kliknięcie może pokazać dostępne informacje o strefie. | [FAKT z kodu: index.html:187,212–318,845–854] |
| Pozostałe warstwy | Przełączniki dotyczą KIUT, własności, ryzyka powodziowego i pozwoleń budowlanych; kliknięcie może pokazać dostępne informacje. | [FAKT z kodu: index.html:187,767–815,838–858] |
| Pomiar i menu mapy | Menu kontekstowe uruchamia pomiar odległości lub obszaru, otwiera Street View albo dodaje działkę lub widok warstw do raportu. | [FAKT z kodu: index.html:197–209,1122–1285] |
| Raport PDF | Lista działek i widoków warstw może być edytowana lub wyczyszczona, a następnie wyeksportowana do PDF. | [FAKT z kodu: index.html:189–194,862–965,993–1110] |
| Dostęp użytkownika | Użytkownik widzi ekran logowania z odnośnikiem do panelu. Szczegóły techniczne logowania pominięto. | [FAKT z kodu: index.html:68–74] |

## 2. Trasy API używane przez front

Front wywołuje poniższe trasy przez fetch bez jawnego ustawienia metody, czyli GET. [FAKT z kodu: index.html:324,332,345,536–537,772,863–878]

| Trasa | Metoda i parametry wysyłane przez front | Rodzaj odpowiedzi |
|---|---|---|
| /api/wfs | GET; bbox | GeoJSON z geometriami działek. [FAKT z przeglądu prywatnego repo] |
| /api/ownership-national | GET; bbox | GeoJSON z danymi używanymi do prezentacji grup rejestrowych. [FAKT z przeglądu prywatnego repo] |
| /api/mpzp-info | GET; lat, lon | JSON z informacjami o planie. [FAKT z przeglądu prywatnego repo] |
| /api/mpzp-gmina-info | GET; teryt, lat, lon | JSON z informacjami o planach. [FAKT z przeglądu prywatnego repo] |
| /api/dzinfo | GET; id | JSON z informacją planistyczną dla działki. [FAKT z przeglądu prywatnego repo] |
| /api/rwdz-feature-info | GET; parametry zapytania mapowego: warstwa, CRS, bbox, rozmiar obrazu i pozycja kliknięcia | Odpowiedź informacyjna usługi mapowej, zwykle XML. [FAKT z przeglądu prywatnego repo] |
| /api/report-snapshot | GET; bbox, width, height, layers | JSON z obrazami warstw do raportu. [FAKT z przeglądu prywatnego repo] |

Tabela zawiera tylko trasy wywoływane przez front. Nie opisuje innych tras.

## 3. Biblioteki, usługi i formaty

**Biblioteki frontu:** Leaflet 1.9.4, proj4 2.9.0, jsPDF 2.5.1, jspdf-autotable 3.5.31, html2canvas 1.4.1, Tailwind bez wersji wskazanej w adresie CDN, Supabase JS @2 oraz arkusze Google Fonts. [FAKT z kodu: index.html:1,21,169,1287]

**Biblioteki backendu:** proj4 ^2.15.0 i pngjs ^7.0.0. [FAKT z przeglądu prywatnego repo]

**Publiczne usługi map i danych:** OpenStreetMap, Esri World Imagery, Geoportal/GUGiK, ULDK, KIUT, e-mapa, Rejestr Urbanistyczny, GUNB RWDZ, ISOK oraz Google Maps Street View. [FAKT z kodu: index.html:177,187,211–213,320–345,412,451,767–815,1270–1272]

**Współrzędne:** front korzysta z EPSG:4326, EPSG:3857 i EPSG:2180. [FAKT z kodu: index.html:211,249,272–275,714–715,771] Dodatkowe konwersje wymagane przez odpowiedzi API trzeba zachować podczas integracji. [FAKT z przeglądu prywatnego repo]

Warunki korzystania, dostępność warstw i limity usług publicznych należy potwierdzić przed wdrożeniem portu. [HIP]

## 4. Stan i dane

- Widok mapy, przełączniki warstw, zaznaczenie działek i robocza lista PDF działają w obrębie otwartej strony. [FAKT z kodu: index.html:211,456–458,862–965]
- W przejrzanym froncie nie znaleziono funkcji zapisu analiz użytkownika jako trwałego wyniku. Stan roboczy PDF należy traktować jako tymczasowy. [FAKT z kodu: index.html:862–965]
- DenemContext v1 przewiduje pola parcel, point, gmina i place. Przeniesienie identyfikatora działki i punktu wymaga zachowania kodów jako tekstu. [HIP]
- Proponowany kontekst po wyborze działki: kind=dzialka, source=dzialki, match=exact, parcel.id jako niezmieniony identyfikator zwrócony dla działki; point jako współrzędne wybranego punktu lub geometrii. Gmina i miejscowość tylko wtedy, gdy ich kody są potwierdzone. [HIP]
- Aktualny interfejs pokazuje logowanie i odnośnik do panelu; zgodność tego zachowania z D5 nowej aplikacji wymaga decyzji właściciela. [FAKT z kodu: index.html:68–74] [HIP]

## 5. Projekt integracji z powłoką

- Działki jako natywna zakładka z funkcją mount(container, ctx); bez iframe. [HIP]
- Przy odmontowaniu moduł powinien odłączyć listenery, timery i żądania, usunąć mapę Leaflet i wyczyścić swój element root. Po pokazaniu zakładki mapa powinna wykonać invalidateSize(). [HIP]
- Własne reguły CSS ograniczyć do prefiksu [data-module="dzialki"], by ograniczyć kolizje ze stylami powłoki. [HIP]
- Ustawiać kontekst po wyborze działki przez ctx.setContext. Nie skracać ani nie konwertować kodów TERYT na liczby. [HIP]
- Zimny start obsłużyć istniejącym wzorcem statusu backendu w powłoce; ponowienie powinno używać lekkiej trasy zdrowia, nie tras wyszukiwawczych ani diagnostycznych. [HIP]
- Proponowany podział: app/js/modules/dzialki/index.js, map.js, search.js, state.js, interactions.js, report.js, services.js oraz pliki warstw base.js, egib.js, plans.js i utilities.js. Style w app/css/modules/dzialki.css. [HIP]

## 6. Dostawa bibliotek i CSP

**Rekomendacja [HIP]:** dodać potrzebne, przypięte biblioteki jako statyczne pliki w app/vendor/dzialki/ wraz z licencjami. Pozwala to zachować D6: bez npm i bez builda. Wersje odpowiadają obecnie używanym publicznym bibliotekom wymienionym w sekcji 3. [FAKT z kodu: index.html:1,21] Nie przenosić biblioteki logowania bez decyzji D5. [HIP]

Wariant CDN z przypiętą wersją i SRI wymaga dozwolenia CDN w CSP oraz integrity/crossorigin dla skryptów i arkuszy. Pliki lokalne pozwalają ograniczyć skrypty i style do własnego origin; connect-src i img-src nadal muszą dopuszczać zatwierdzone usługi map i API. Style inline i kafelki Leaflet wymagają osobnej weryfikacji CSP. [HIP]

## 7. Przypadki baseline dla właściciela

Do docs/regression-baseline-template.md dodano siedem przypadków bez wyników. Każdy ma miejsce na datę, SHA usługi, wynik i zanonimizowany zrzut.

1. Wyszukiwanie działki i popup w lokalizacji Pisz/Łupki. [FAKT z kodu: index.html:177,817–837]
2. Podkłady mapowe, ortofotomapa archiwalna, zoom i przesunięcie. [FAKT z kodu: index.html:177,211]
3. Warstwy EGiB, zaznaczanie, kolory i działki o wspólnym numerze bazowym. [FAKT z kodu: index.html:177,187,456–560,638–708,861]
4. MPZP i linie zabudowy, w tym widoczne informacje planu. [FAKT z kodu: index.html:187,319–410,817–844]
5. Plan ogólny uchwalony i warianty projektu. [FAKT z kodu: index.html:187,212–318,845–854]
6. Własność, sieci, ryzyka powodziowe i pozwolenia budowlane. [FAKT z kodu: index.html:187,767–815,838–858]
7. Pomiary, Street View i generowanie PDF z działką oraz warstwami. [FAKT z kodu: index.html:193–209,885–943,993–1110,1270–1275]

## 8. Plan podetapów M4

Szacunki są orientacyjne [HIP]. Każdy interfejsowy podetap zaczyna się testem z atrapą DOM i atrapami fetch.

| Podetap | Zakres i kryteria | Ryzyko | Test startowy | Rozmiar |
|---|---|---|---|---|
| M4b — mapa w powłoce | Widoczna natywna zakładka z mapą, podkładem i stanem usługi; mount i cleanup działają. To najmniejszy podetap dający działający rezultat. | D6 i cykl życia Leaflet. | Atrapa DOM: mount tworzy mapę, odmontowanie ją usuwa; fetch atrapiony. | M, 1–2 dni [HIP] |
| M4c — wyszukiwanie i kontekst | Wybór powiat/gmina/obręb/numer; geometria, zaznaczenie i przekazanie parcel/point. | Mapowanie identyfikatora działki oraz kodu gminy. | Atrapy DOM/fetch; błędna odpowiedź nie nadpisuje kontekstu. | L, 3–5 dni [HIP] |
| M4d — warstwy i popupy | EGiB, plany, własność, infrastruktura, ryzyka i informacje mapowe. | Różne układy współrzędnych i dostępność usług. | Przełączniki i popupy działają na atrapach; bez sieci. | L, 3–5 dni [HIP] |
| M4e — narzędzia mapy | Selekcja, kolory, rodzina działek, pomiary i menu kontekstowe. | Czyszczenie zdarzeń przy odmontowaniu. | Atrapa DOM testuje kliknięcia, Escape, anulowanie i cleanup. | M, 2–3 dni [HIP] |
| M4f — raport i regresja | Lista działek/warstw, PDF oraz porównanie z zapisanym baseline przez właściciela. | Zależność zrzutów od usług mapowych i ręczny odbiór PDF. | Atrapy DOM/canvas/PDF; bez sieci; właściciel wykonuje 7 przypadków. | L, 3–5 dni [HIP] |

## 9. Otwarte pytania do właściciela

1. Czy nowa zakładka ma działać bez bramki do czasu decyzji D5 przed M8, czy decyzję o dostępie należy rozstrzygnąć przed M4b?
2. Czy dla trasy /api/mpzp-gmina-info wolno wyprowadzić 6-cyfrowy teryt z 7-cyfrowego gmina.terc7 przez pominięcie ostatniej cyfry? Wymaga to potwierdzenia przed implementacją.
3. Czy parcel.id ma przejmować identyfikator działki bez zmian, a obrebTeryt pozostawać pusty, jeśli front nie dostarczy potwierdzonego kodu?
4. Czy zaakceptować lokalne pliki bibliotek, czy wybrać CDN z przypiętymi wersjami i SRI?
5. Czy robocza lista PDF ma przetrwać przełączenie zakładki w pamięci sesji, czy może być czyszczona po opuszczeniu Działek?