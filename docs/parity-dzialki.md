# Macierz parytetu funkcji Działki

Macierz opisuje widoczne funkcje publicznego frontu Działki i plan ich odtworzenia w natywnej zakładce. Odwołania dotyczą frontu `index.html` z rewizji `a1aa39d`; nie dokumentuje się tras backendu, których ten front nie wywołuje. Baseline D1 przekazał właściciel 2026-11-02. Dane konkretnego przypadku oraz zrzuty pozostają poza repozytorium.

Status „zrobione” oznacza implementację lokalnej funkcji i testy bez sieci; nie potwierdza dostępności usług produkcyjnych. Właściciel wykonuje porównanie przeglądarkowe przed odbiorem każdego podetapu.

| Element | Dowód w starym froncie | Stan nowej aplikacji | Docelowy podetap | Uwagi |
|---|---|---|---|---|
| Dostęp do zakładki bez bramki własnej modułu | [FAKT z kodu: `index.html:68–74`] | zrobione | M4c | Ostateczna D5: aplikacja w ogóle bez logowania (2026-11-27). |
| Lista powiatów z nazwą województwa | [FAKT z kodu: `index.html:560`] | zrobione | M4c | Formularz pokazuje nazwę powiatu i nazwę województwa z kodu PRG. |
| Zależna lista gmin | [FAKT z kodu: `index.html:560`] | zrobione | M4c | Lista zależy od wybranego powiatu. |
| Zależna lista obrębów z numerem obrębu | [FAKT z kodu: `index.html:560`] | zrobione | M4c | Etykieta zawiera nazwę i kod obrębu. |
| Numer działki, walidacja i przycisk wyszukiwania | [FAKT z kodu: `index.html:560`] | zrobione | M4c | Numer pozostaje tekstem; żądania są GET. |
| Komunikat początkowy, błędy, oczekiwanie i ponowienie | [FAKT z kodu: `index.html:560`] | zrobione | M4c | M4c.1 obejmuje również pobieranie EGiB i ręczne ponowienie po błędzie. |
| Geometria wyniku i dopasowanie widoku mapy | [FAKT z kodu: `index.html:560`] | zrobione | M4c | Geometria ULDK; `fitBounds` dopasowuje widok do wyniku. |
| Etykieta numeru wybranej działki | [FAKT z kodu: `index.html:507–560`] | zrobione | M4c | Numer jest widoczny na mapie po wyszukaniu. |
| Raport: identyfikator, województwo, powiat, gmina, obręb i numer | [FAKT z kodu: `index.html:560`] | zrobione | M4c | Wartości pochodzą z odpowiedzi wyszukiwania i wybranych list PRG. |
| Raport: powierzchnia ewidencyjna | [FAKT z kodu: `index.html:560`] | zrobione | M4c.1 | Dodatkowa geometria ULDK w EPSG:2180 i zapytanie KIEG; parsowanie testowane na atrapach. |
| Raport: grupa rejestrowa z opisem | [FAKT z kodu: `index.html:560`] | zrobione | M4c.1 | Krótki słownik opisów grup jest danymi aplikacji. |
| Raport: klasoużytki z opisami kodów | [FAKT z kodu: `index.html:560`] | zrobione | M4c.1 | Słownik opisów jest danymi aplikacji; nie kopiowano implementacji starego frontu. |
| Źródła danych przy statusie wyszukiwania | [FAKT z kodu: `index.html:560`] | zrobione | M4c.1 | Widoczna informacja wymienia GUGiK PRG, ULDK GUGiK oraz EGiB/KIEG. |
| Żądanie listy powiatów PRG — GET `/FeatureServer/1/query` | [FAKT z kodu: `index.html:560`, wywołanie listy powiatów] | zrobione; URL sprawdzany testem | M4c | Wzorzec i kolejność parametrów opisane w `docs/dzialki-module.md`. |
| Żądanie listy gmin — GET `/FeatureServer/0/query` | [FAKT z kodu: `index.html:560`, wywołanie listy gmin po kodzie powiatu] | zrobione; URL sprawdzany testem | M4c | Odpowiedź PRG w EPSG:4326. |
| Żądanie listy obrębów ULDK — GET `GetRegionByNameOrId` | [FAKT z kodu: `index.html:560`, wywołanie listy obrębów] | zrobione; URL sprawdzany testem | M4c | Id gminy ULDK pochodzi z pełnego TERC7. |
| Żądanie geometrii ULDK — GET `GetParcelById` | [FAKT z kodu: `index.html:560`, wywołanie wyszukiwania działki] | zrobione; URL sprawdzany testem | M4c | Wynik w EPSG:4326. |
| Żądanie geometrii do EGiB — GET `GetParcelById`, `srid=2180` | [FAKT z kodu: `index.html:560`, wariant pobrania geometrii dla EGiB] | zrobione; URL sprawdzany testem | M4c.1 | Kolejność przed zapytaniem KIEG. |
| Żądanie danych EGiB — GET WMS `GetFeatureInfo` | [FAKT z kodu: `index.html:560`, wywołanie informacji KIEG] | zrobione; URL sprawdzany testem | M4c.1 | Odpowiedź XML. |
| Województwo z kodu powiatu; powiat, gmina i obręb z wybranych list | [FAKT z kodu: `index.html:211` — mapa nazw województw; `index.html:560` — wykorzystanie nazw w raporcie] | zrobione; fikcyjne odpowiedzi testowe | M4c.2 | `region` z ULDK nie jest nazwą województwa; nazwa powiatu nie ma prefiksu „powiat”. |
| Identyfikator działki bez łamania tokenu | [FAKT z baseline D1 właściciela] | zrobione; wąski widok przenosi wartość pod etykietę | M4c.2 | Test sprawdza strukturę raportu i reguły CSS. |
| Czerwony obrys z półprzezroczystym wypełnieniem | [FAKT z kodu: `index.html:451`] | zrobione | M4c | Reguły stylu należą do CSS nowego modułu. |
| Popup: identyfikator, powierzchnia, grupa i kody klasoużytków | [FAKT z kodu: `index.html:817–837`] | zrobione | M4c.1 | Treść budowana z pól odpowiedzi, bez HTML pochodzącego z usługi. |
| Kliknięcie wyniku przełącza zaznaczenie | [FAKT z kodu: `index.html:817–837`] | zrobione | M4c.1 | W M4c.1 przełącza się wynik wyszukiwania; zaznaczanie wielu działek na mapie jest w M4d. |
| OSM, Esri i archiwalna ortofotomapa z wyborem roku | [FAKT z kodu: `index.html:177,211`] | zrobione | M4b | Browser-smoke archiwum po zmianach uruchamia właściciel. |
| Zoom, skala i nawigacja mapy | [FAKT z kodu: `index.html:177,211`] | zrobione | M4b | Zachowują stan w pamięci przy przełączaniu zakładek. |
| Numery działek i kontury działek domyślnie włączone | [FAKT z kodu: `index.html:177,211`] | zaimplementowane; smoke potwierdził stany domyślne i 168 konturów/etykiet w widoku testowym; monitor kompletności dodany w M4d.1c | M4d.1 | WFS i etykiety pojawiają się od zoomu 13; KIEG WMS jest monitorowany i ponawiany do 40 s. V0 dał 0/12, 11/12 i 12/12; kompletność 3/3 do 20 s niepotwierdzona. |
| Kontury budynków domyślnie wyłączone i włączane osobno | [FAKT z kodu: `index.html:177,211`] | smoke potwierdził stan wyłączony oraz 3 załadowane kafelki po włączeniu; monitor wspólny z KIEG M4d.1c | M4d.1 | Źródłem jest warstwa `budynki` KIEG WMS; nie wykonano osobnych prób V0–V3 dla budynków w M4d.1c. |
| Dynamiczne etykiety numerów zależne od widoku | [FAKT z kodu: `index.html:211,536–549`] | zaimplementowane; URL testowany; smoke pokazał 168 etykiet od zoomu 17,6 | M4d.1 | WFS i etykiety odświeżają się po przesunięciu lub zmianie zoomu; poprzedni GET jest anulowany. |
| Kliknięcie działki z warstwy EGiB i obsługa wielu zaznaczeń | [FAKT z kodu: `index.html:817–837`] | smoke: zaznaczenie i odznaczenie przeszły; wielokrotne zaznaczenie testowane atrapami | M4d.1 | Zaznaczenie ma czerwony obrys i półprzezroczyste wypełnienie; kliknięcia nie zmieniają DenemContext. |
| Popup klikniętej działki: powierzchnia, grupa i klasoużytki | [FAKT z kodu: `index.html:817–837`] | smoke: pola powierzchnia/grupa/klasoużytki przeszły; DOM używa textContent; dwa GetFeatureInfo zwróciły HTTP 200 | M4d.1 | Informacje są pobierane przez WMS GetFeatureInfo; dane wejściowe nie są wstawiane jako HTML. |
| Panel „3. Warstwy mapy” z grupami i zwijaniem | [FAKT z kodu: `index.html:177,187,197`] | zaimplementowane; stany grup i warstw testowane w pamięci; układ widoczny w smoke | M4d.1 | Podkłady, EGiB, zoom, skala i licznik kafelków; trzy kolejne grupy są wyłączone i oznaczone jako planowane. |
| Monitor kompletności kafelków KIEG i ponawianie niepełnych kafelków | Wymaganie właściciela M4d.1c; mechanizm [FAKT z kodu: `egib-layers.js`, `tile-retry.js`] | zaimplementowane i testowane atrapami; browser-smoke V0: 0/12, 11/12, 12/12; 100% we wszystkich trzech próbach do 20 s nieosiągnięte | M4d.1c | V1 headed, V2 i V3 niezmierzone z powodu limitu pięciu uruchomień; kompletność produkcyjna niepotwierdzona. |
| Kolor konturów, paleta kolorów zaznaczenia i czyszczenie | [FAKT z kodu: `index.html:187,861`] | zaimplementowane M4e.1; test startowy i headed offline 8/8 PASS | M4e.1 | Osiem źródłowych kolorów, aktualizacja istniejących geometrii, zachowanie przy zmianie zakładki; czyszczenie nie usuwa raportu i nie przywraca zaznaczeń po powrocie. |
| Działki o wspólnym numerze bazowym | [FAKT z kodu: `index.html:458,638–708`] | świadomie pominięte — decyzja właściciela D31 | poza bieżącym zakresem | Nie odtwarza historii podziałów. Bez zweryfikowanych relacji przed/po opcja nie będzie dodana; `docs/parcel-history-assessment.md`. |
| MPZP oraz linie zabudowy | [FAKT z kodu: `index.html:187,319–410,838–844`] | zaimplementowane; testy URL i startu, Edge headed offline i live PASS w publicznym punkcie testowym | M4d.2 | Pięć warstw, przyciski informacji, fallback gmina→RU i szczegóły działki; pełna tabela żądań i ograniczenia w `docs/dzialki-planning.md`. Baseline właściciela D4 nadal wymaga odbioru. |
| Plan ogólny: warstwa wiążąca oraz warianty projektowane | [FAKT z kodu: `index.html:187,212–318,845–854`] | zaimplementowane; headed live: kafelki 40/40 (uchwalony z uzupełnieniem gminnym), 20/20 RU, 20/20 GUGiK w jednym widoku | M4d.2 | Zachowano uzupełnienie gminne z reprojekcją EPSG:2180. Popup uchwalonego POG wczytany; projektowany GUGiK poprawnie pusty w sprawdzonym miejscu. Nie potwierdza pełnego pokrycia kraju ani wszystkich przypadków D5. |
| Własność, KIUT, ryzyko powodziowe i pozwolenia budowlane | [FAKT z kodu: `index.html:187,211,412–449,767–815,838–858`] | zaimplementowane: cztery opcje off, legendy 9/16, dialog ISOK, wspólny popup RWDZ, uzupełnianie grup 60/4 i cache; headed live PASS w jednym widoku | M4d.3 | Dokładne parametry i instrukcja w `docs/dzialki-thematic.md`; własność 83 obiekty / 0 nieustalonych grup. Baseline D6 i pełne pokrycie kraju niepotwierdzone. |
| Menu mapy, pomiar odległości i powierzchni | [FAKT z kodu: `index.html:197–209,1122–1285`] | zrobione; test startowy i headed offline/mobile PASS | M4e.2 | Pole i pełny obwód, Esc/PPM/dwuklik, wynik między zakładkami; dodawanie do raportu nadal M4f; baseline ręczny pozostaje. |
| Street View z punktu mapy | [FAKT z kodu: `index.html:1270–1275`] | zrobione; dokładny test URL, bez nawigacji do Google w smoke | M4e.2 | Link nowej karty; tabela i test właściciela w `docs/dzialki-map-tools.md`; dostępność zdjęć zależy od Google. |
| Lista elementów raportu: dodawanie, usuwanie i czyszczenie | [FAKT z kodu: `index.html:189–194,862–965`] | zrobione | M4f | Lista zachowana między zakładkami i czyszczona po odświeżeniu (D15). |
| Eksport raportu PDF z działką i widokiem warstw | [FAKT z kodu: `index.html:993–1110`] | zrobione, pobranie w Edge i oględziny PDF | M4f | Lokalne biblioteka i font, mapy i legendy oraz jawne braki. [Dowody i ograniczenia](../reports/m4f-report-pdf.md). |

W `index.html` rewizji `a1aa39d` wywołania wyszukiwania i przypisania pól raportu znajdują się na jednej długiej fizycznej linii `560`. Wiersze macierzy rozróżniają te wywołania po ich celu; nie podaję nieistniejących osobnych numerów linii.

## Weryfikacja baseline D1

Właściciel przekazał zrzuty i opis D1 przed M4c.1. Nowa zakładka ma odtwarzać formularz z etykietami zależnymi od administracji, zielonym przyciskiem wyszukiwania, czerwonym obrysem, raportem EGiB i popupem z przełączanym zaznaczeniem. Konkretne wartości wejściowe, identyfikatory, pomiary i zrzuty nie są utrwalane w repozytorium. Wynik porównania nowego frontu z działającymi usługami musi dostarczyć właściciel po swoim przebiegu browser-smoke.

## Diagnostyka pustych kafelków M4c.2

Właściciel uruchamia narzędzie diagnostyczne. Metryki obejmują wybrane nagłówki i rozmiar transferu, trzy zbiory pustych kafelków, ich przecięcie i sumę, współrzędne zmienne oraz wskaźnik zmienne/suma pustych. Odpowiedź HTTP 200 typu obraz poniżej 128 B jest heurystycznie klasyfikowana jako pusta. Ponowienie diagnostyczne wysyła ten sam GET dwa razy dla najwyżej sześciu pustych adresów; nie zmienia kodu ani polityki ponowień aplikacji.

Przyszłą klasyfikację po stronie aplikacji należy oprzeć na nagłówkach z przebiegu właściciela. Odczyt odpowiedzi przez `fetch` wymaga dozwolonego CORS dla pochodzenia aplikacji; `Timing-Allow-Origin` samo nie wystarcza. Jeśli CORS nie umożliwia odczytu danych, wiarygodna klasyfikacja może wymagać osobnej warstwy pobierania i dekodowania kafelków, co pozostaje poza M4c.2. Wyniki nowego przebiegu nie zostały jeszcze zebrane.

## Utrzymanie

Aktualizacja 2026-11-28, D34: osobne przewijanie panelu Działek i wyniku pomiaru, mapa nad kontrolkami na telefonie. Linie `wektor-lzb` pozostają po rzeczywistym teście zbliżenia i legendy, bez zmiany parametrów źródła; nie oznacza to pokrycia każdej gminy. 156 testów i końcowy headed smoke 20/20 PASS; [raport](../reports/map-panel-scroll.md).

Aktualizuj tę macierz w każdym podetapie M4. Zmieniaj status dopiero po przejrzeniu implementacji i testów danego elementu; nie oznaczaj funkcji zewnętrznej jako działającej produkcyjnie na podstawie atrap.
