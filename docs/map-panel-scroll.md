# Niezależne przewijanie panelu i weryfikacja linii zabudowy

Właściciel 2026-11-28: mapa nie ma przewijać się wraz z lewym menu. Osobna opcja linii ma pozostać tylko po potwierdzeniu działającej warstwy z nieprzekraczalnymi liniami.

Obszar Działek ma wysokość opartą na widocznym oknie (`dvh`). Lewy panel przewija się wewnętrznie; `overscroll-behavior-y:contain` zatrzymuje przewijanie przy jego końcu. Na telefonie mapa jest nad osobno przewijanymi kontrolkami. Panel pomiaru mieści się wewnątrz ramki mapy; ResizeObserver aktualizuje rozmiar Leaflet po zmianach układu. Przewijanie całej strony poza panelem nadal pozwala dotrzeć do nagłówka i zakładek.

## Stary front vs nowa aplikacja — żądania

| Funkcja | Stary front | Nowa aplikacja | Adres, metoda, parametry, CRS i format | Dowód |
|---|---|---|---|---|
| Linie zabudowy | `analizator-nieruchomosci`, `a1aa39d711b2730dfcf62799e42ab7d79d4bf3d3`, `index.html:211` | Bez zmiany definicji `buildingLines` | GET `https://mapy.geoportal.gov.pl/wss/ext/KrajowaIntegracjaMiejscowychPlanowZagospodarowaniaPrzestrzennego`; WMS 1.3.0, `layers=wektor-lzb`, `styles=default`, EPSG:3857, 256×256, PNG transparent; bbox generowany przez Leaflet | Pełny URL w `tests/dzialki-planning.test.mjs`; dotychczasowa ograniczona allowlista; nowy smoke sprawdza rzeczywiste obrazy tej jednej warstwy |
| Układ i przewijanie | Układ nowej aplikacji | CSS, obserwacja rozmiaru | Brak nowej usługi lub parametrów żądań | Start DOM; rzeczywiste przewijanie kołem w Edge, także przy końcu panelu |
| Legenda linii | Ta sama rewizja, `index.html:187` | Bez zmiany `PLANNING_LEGEND_URLS.buildingLines` | GET `https://opendata.geoportal.gov.pl/Geoportal/ikony/mpzp/mpzp-lzb.png`; bez parametrów/CRS, PNG | Dotychczasowa allowlista i test dokładnego adresu; obraz legendy obejrzany w przeglądarce |

Przykład wektorowego planu do próby pochodzi z [instrukcji GUGiK, wersja 1.12, str. 26](https://www.geoportal.gov.pl/wp-media/2023/10/PodstawoweUslugiDanychPrzestrzennychDlaSystemowInformatycznychPanstw-ver.-1.12.pdf). Duży zasięg zwrócił pusty PNG; mniejsze fragmenty przy większym zbliżeniu dały niepuste obrazy. Obejrzany obraz w aplikacji pokazuje linie z pełnymi i pustymi trójkątami oraz zgodną legendę KIMPZP. **Opcja zostaje zgodnie z warunkiem właściciela.** Nie potwierdza to publikacji danych w całej Polsce. Opis przy przełączniku i w statusie informuje o dużym zbliżeniu i planach wektorowych. [Wynik końcowy](../reports/map-panel-scroll.md).

## Sprawdzenie właściciela

`node scripts/browser-smoke.mjs --headed --map-layout --task map-panel-scroll` — atrapy usług, rzeczywiste kółko myszy na panelu w trzech rozmiarach okna, blokada przejścia przewijania na stronę, regresja narzędzi.

Opcja `--verify-building-lines` dodaje rzeczywiste GET-y wyłącznie dotychczasowej warstwy `wektor-lzb` i jej legendy w publicznym przykładzie GUGiK, przy zoomie 19,5; pozostałe usługi są atrapami. W tej próbie wyłączono nieprzezroczyste atrapy EGiB, aby nie zasłaniały linii. Ten sam licznik zadania, bez resetu, maksymalnie 4 starty i 300 żądań do usługi. Budżet został zużyty: **nie uruchamiać ponownie zadania `map-panel-scroll`**. Nie jest to pełny test pokrycia kraju.

Ręcznie: podgląd → Działki → przewijać lewy panel aż do końca i dalej; mapa ma zachować położenie. Powtórzyć przewijanie wstecz, Tab/PageDown oraz 390 px; mapa na telefonie jest nad panelem. Rozwinąć narzędzia, wykonać pomiar i sprawdzić dostępność wyniku, usuwanie oraz zmianę zakładki. Osobno sprawdzić linie na planie publikowanym wektorowo przy dużym zbliżeniu.
