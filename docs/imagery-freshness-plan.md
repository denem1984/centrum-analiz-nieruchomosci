# Plan aktualniejszych zdjęć — M4b.4

2026-11-27. Właściciel zgłosił, że Esri wydaje się nieaktualne, i polecił dodać znalezienie lepszego podkładu do planu bez przerywania bieżącej pracy. Nie zmieniono teraz podkładów aplikacji.

**Rekomendacja [HIP do pomiaru w wybranych miejscach]:** dodać „Zdjęcia – aktualna ortofotomapa GUGiK” z datą zobrazowania i rozdzielczością. Zachować Esri i archiwum. Wyboru najnowszego obrazu dokonywać na podstawie metadanych miejsca, nie daty aktualizacji serwisu.

| Kandydat | Potwierdzone właściwości | Ocena dla analizy działek |
|---|---|---|
| Aktualna ortofotomapa GUGiK | [FAKT] Dostępne WMS/WMTS standardowej i wysokiej rozdzielczości (≤10 cm/piksel), true ortho oraz skorowidz aktualności. GUGiK opisuje bezpłatne pobieranie i wykorzystanie. | Główny kandydat; zdjęcia mogą być lotnicze. Trzeba sprawdzić datę i pokrycie konkretnego miejsca. [Źródło GUGiK](https://www.geoportal.gov.pl/pl/dane/ortofotomapa-orto/) |
| Esri World Imagery z metadanymi | [FAKT] Mozaika ma różne daty zależnie od miejsca i zoomu, bez jednego cyklu aktualizacji; datę zdjęcia można ustalić z metadanych. | Zachować do porównania. Nie potwierdzono jeszcze daty zdjęcia, które właściciel uznał za stare. [Źródło Esri](https://support.esri.com/en-us/knowledge-base/faq-can-the-date-of-an-image-be-determined-from-the-wor-000012181) |
| Sentinel-2 / Copernicus | [FAKT] Cztery pasma mają 10 m/piksel, projektowany nawrót konstelacji to 5 dni na równiku; dane są bezpłatne. | [HIP] Przydatny do świeżych zmian dużego obszaru; zbyt mała szczegółowość jako jedyny podkład działki i budynków. Częstotliwość obserwacji nie gwarantuje obrazu bez chmur. [Źródło Copernicus](https://dataspace.copernicus.eu/data-collections/copernicus-sentinel-missions/sentinel-2) |

GUGiK wskazuje odrębne usługi aktualne i archiwalne. Aktualny podkład nie powinien używać stałego roku z archiwum. Przy dużym przybliżeniu WMS może zachować więcej szczegółów niż przygotowane kafle WMTS. Są to wskazówki dostawcy, nie wynik naszego pomiaru. [GUGiK](https://www.geoportal.gov.pl/pl/dane/ortofotomapa-orto/)

## Plan wykonania

1. Po bieżącym M4d.2 przygotować osobny podetap M4b.4, z tabelą „obecny podkład vs alternatywa”, bez usuwania żadnej opcji.
2. Ustalić z oficjalnych opisów usługi GetMap/GetTile i odczytu metadanych, warstwy, CRS, rozdzielczości i reguły atrybucji. Odróżnić datę nalotu/satelity od daty publikacji. Nie zgadywać brakującej daty.
3. Dla tych samych publicznych obszarów i skal porównać GUGiK oraz Esri: datę, czytelność budynków i granic, pokrycie, puste kafelki i stabilność. Wysoka jakość oznacza realny szczegół obrazu, nie samo powiększenie kafelka.
4. Zaprojektować podpis „Zdjęcie: data/rok; rozdzielczość; źródło”. Przy braku daty pokazać „data niepotwierdzona”. Mieszana mozaika wymaga informacji dla wskazanego miejsca.
5. Dodać lokalne testy dokładnych URL-i, startu, przełączania i cleanup, monitor obrazów oraz wąski scenariusz headed smoke z osobnym jawnym budżetem. Nie wykorzystywać wyczerpanego licznika m4d2.
6. Rekomendować podkład domyślny dopiero po pomiarze. Jeśli żadne bezpłatne źródło nie zapewni dostatecznej świeżości i jakości, przygotować porównanie oferty komercyjnej do decyzji właściciela o kosztach; bez zakładania kont, kluczy i zakupów przez agenta.

**Akceptacja:** udokumentowana alternatywa, jawna aktualność i jakość, zachowany parytet opcji, brak fałszywej etykiety „najnowsze”, testy i oględziny desktop/mobile. Obecny przegląd obejmuje wyłącznie dokumentację dostawców; nie wykonano nowych żądań mapowych ani porównania dat konkretnych zdjęć. Wdrożenie planu pozostaje do realizacji.
