# M4e.2 — pomiary i menu mapy

Źródło tylko do odczytu: `denem1984/analizator-nieruchomosci`, SHA `a1aa39d711b2730dfcf62799e42ab7d79d4bf3d3`, `index.html:197–209,1112–1285`. Nie zmieniono starej aplikacji.

## Zachowanie

- „Wygląd i narzędzia działek”: odległość, obszar i menu środka mapy. Menu również pod prawym przyciskiem myszy / zdarzeniem contextmenu (przytrzymanie na urządzeniu dotykowym zależy od przeglądarki). Menu udostępnia pomiary od wskazanego punktu i Street View w nowej karcie.
- Pomiar odległości sumuje odcinki; obszar podaje m² oraz obwód ze wszystkimi bokami, łącznie z domknięciem. Tak jak źródło: sfera R=6371000 m, z normalizacją różnicy długości geograficznej przy południku 180°. Wyniki są orientacyjne, nie zastępują powierzchni EGiB ani pomiaru geodezyjnego.
- Zakończenie: przycisk, podwójne kliknięcie lub PPM; wymagane co najmniej dwa/trzy punkty. Esc / „Usuń pomiar” czyści; nowy pomiar zastępuje poprzedni. Kursor pokazuje podgląd bez zapisania wierzchołka. Duplikaty poniżej 5 cm i drugie kliknięcie dwukliku są pomijane.
- Podczas pomiaru EGiB i samodzielny popup planowania nie obsługują kliknięć; poprzednie żądania popupów są anulowane. DoubleClickZoom wraca do wcześniejszego stanu. Warstwa pomiarowa w pane 475 nie przechwytuje interakcji.
- Punkty i wynik pozostają w pamięci między zakładkami, znikają po odświeżeniu. Cleanup usuwa listener mapy i okna, grafikę i oczekującą klatkę animacji. Panel wyniku znajduje się pod mapą, również na telefonie.
- Menu obsługuje strzałki, Home/End, Tab i Esc; po zamknięciu Esc zwraca fokus. Dodawanie działki i widoku warstw do raportu jest nadal zakresem M4f, nie jest udawane w tym menu.

## Stary front vs nowa aplikacja — żądania

| Funkcja | Stary front (powyższy SHA) | Nowa aplikacja | Metoda, parametry, CRS, format | Dowód |
|---|---|---|---|---|
| Street View | `index.html:1270–1275`, `https://www.google.com/maps?layer=c&cbll=${lat},${lng}` przez window.open | Ten sam URL w odnośniku, target `_blank`, rel `noopener noreferrer` | Nawigacja GET po działaniu użytkownika; `layer=c`, `cbll=lat,lng`; WGS84 (EPSG:4326); strona HTML Google | Dokładna asercja URL w `tests/dzialki-map-tools.test.mjs`; smoke sprawdza odnośnik, nie otwiera Google |
| Odległość/pole/obwód | `index.html:1144–1187`, obliczenia lokalne | Lokalne obliczenia i wektory Leaflet | Brak HTTP; punkty WGS84, wynik m/m² | Wartości referencyjne, odwrotna orientacja, południk 180°; test DOM oraz headed smoke |
| Istniejące podkłady/EGiB | Bez zmiany w tym etapie | Dotychczasowe warstwy i parsery | Bez nowych adresów, parametrów, CRS ani formatów | Dotychczasowe dokładne testy URL; [EGiB](dzialki-module.md), [planowanie](dzialki-planning.md), [tematyczne](dzialki-thematic.md) |

Nie deklarujemy nowego testu produkcyjnych usług ani ich zgodności na podstawie atrap. Dostępność zdjęć Street View w wybranym miejscu zależy od Google.

## Browser-smoke i test ręczny właściciela

W katalogu projektu, Node 22+: `node scripts/browser-smoke.mjs --headed --map-tools --offline-map-tools --task m4e2`. Rzeczywisty Edge i Leaflet, fikcyjne odpowiedzi CDP dla dotychczasowej allowlisty; zero żądań do usług zewnętrznych, bez klikania Street View. Budżet zadania zapisuje się trwale w ignorowanym katalogu; nie zerować go. Opcjonalne pomiary żywych usług wymagają osobnego przebiegu bez `--offline-map-tools` w tym samym budżecie; nie są potrzebne do lokalnej geometrii.

Ręcznie: otworzyć podgląd → Działki → „Wygląd i narzędzia działek” → „Mierz odległość” → dwa punkty → zakończyć → zmienić zakładkę i wrócić → sprawdzić wynik i geometrię. Następnie PPM na mapie → „Mierz obszar stąd” → dwa dalsze punkty → zakończyć PPM; sprawdzić pole, obwód, usuwanie Esc i ponowne zaznaczanie działek. Menu „Opcje środka mapy” sprawdzić klawiaturą. Samodzielnie otworzyć Street View i ocenić wskazane miejsce. Powtórzyć przy 390 px; przyciski i panel wyniku pod mapą muszą być dostępne. Raport PDF jest kolejnym etapem.
