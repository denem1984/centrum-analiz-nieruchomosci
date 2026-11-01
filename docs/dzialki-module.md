# Moduł Działki — M4b

## Zakres

M4b dodaje natywny widok mapy do zakładki Działki. Używa lokalnego Leaflet 1.9.4 z licencją BSD 2-Clause. Biblioteka jest ładowana lokalnie; moduł nie dodaje CDN ani zależności npm.

Frontend poprzedniej aplikacji zaczyna mapę w centrum [52.07, 19.48], przy zoomie 6, z krokami zoomu 0,1 i limitem 22. [FAKT z kodu: index.html:211] W tym froncie widoczne są bazowe podkłady OpenStreetMap, satelitarne Esri World Imagery i archiwalna ortofotomapa GUGiK; elementy i atrybucje znajdują się w konfiguracji warstw mapy. [FAKT z kodu: index.html:177,211]

## Podkłady i kontrolki

- **OpenStreetMap** — atrybucja © OpenStreetMap.
- **Satelita – Esri World Imagery** — atrybucja Esri wyświetlana przez kontrolkę Leaflet.
- **Ortofotomapa archiwalna – GUGiK** — suwak „Rok zdjęcia” w zakresie 1995–2025. Podpis: „Dostępne lata: 1995–2025. W danym miejscu może brakować zdjęcia z wybranego roku.”
- Kontrolki przybliżenia mają krok 0,1; skala metryczna pochodzi z kontrolki Leaflet.

Nazwy, zakres lat, podpis suwaka i źródłowe atrybucje podkładów są zgodne z widocznym zachowaniem frontu. [FAKT z kodu: index.html:177,211] Przy zmianie podkładu oraz roku aktywny zestaw prób pobierania kafelków jest anulowany i inicjowany ponownie.

## Stan i cykl życia

Wybrany podkład, rok, środek mapy i zoom są przechowywane w pamięci modułu. Przełączenie zakładki odmontowuje mapę i sprząta jej zdarzenia i timery; ponowne wejście przywraca widok. Odświeżenie strony czyści ten stan. Jeśli DenemContext zawiera punkt, mapa ustawia go jako środek przy zoomie co najmniej 16; moduł nie zmienia wspólnego kontekstu.

Stan usługi Działki jest odczytywany z pamięci istniejącej sondy powłoki i subskrybowany w jej magazynie stanu. Moduł nie wykonuje własnych żądań do API Działek.

## Błędy kafelków

Na warstwie bazowej moduł wykonuje najwyżej dwie ponowne próby danego kafelka po początkowym błędzie, po około 1,5 s i 4 s, z niewielkim jitterem. Maksymalnie sześć prób może być zaplanowanych lub aktywnych jednocześnie dla warstwy. Odejście kafelka z widoku, przełączenie podkładu albo roku oraz odmontowanie anuluje oczekujące próby. Po wyczerpaniu prób licznik „Niezaładowane kafelki: N” i przycisk „Spróbuj ponownie” informują o stanie.

Wyszukiwanie działki, EGiB, planowanie przestrzenne, inwestycje i zagrożenia, infrastruktura i własność pozostają oznaczone jako „w kolejnych etapach”.