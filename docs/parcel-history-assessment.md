# Historia działek — decyzja o pominięciu opcji

2026-11-27. Właściciel wskazał niską jakość dopasowywania „rodziny działek” po numerze i polecił nie dodawać tej opcji bez lepszego rozwiązania.

[FAKT z kodu starego frontu] `index.html:638–708`, rewizja `a1aa39d`, porównuje część przed ukośnikiem w tym samym obrębie w otoczeniu około 500 m. Nie odtwarza zapisów o podziale ani geometrii działki macierzystej. Zbieżność numeru nie stanowi w tym algorytmie dowodu pochodzenia.

[FAKT z opisu dostawcy] Oficjalny opis ULDK/EGiB przedstawia lokalizację według identyfikatora lub punktu oraz pobranie geometrii/atrybutów. W sprawdzonym opisie nie znaleziono relacji poprzednik → działki po podziale. Nie jest to twierdzenie o braku jakichkolwiek danych historycznych w całej administracji. [GUGiK: EGiB i ULDK](https://www.geoportal.gov.pl/pl/dane/ewidencja-gruntow-i-budynkow-egib/).

**Wniosek:** nie znaleziono zweryfikowanego publicznego źródła pozwalającego wdrożyć wiarygodne odtworzenie historii w obecnym zakresie. Nie dodajemy opcji opartej na numerach. Rozpoczęty szkic usunięto przed dostawą; ukończony podgląd M4d.3 nie zawierał tej funkcji.

Lepszy kierunek wymaga danych o zdarzeniach podziału z identyfikatorami przed/po, datą i archiwalną geometrią albo zweryfikowanych dokumentów źródłowych. Porównanie nakładania geometrii w dwóch datach może wskazać kandydatów, ale samo nie dowodzi podziału i nie zastąpi takiej relacji. Nie wdraża się kolejnej heurystyki ani odtwarzania historii przez AI. Powrót do funkcji dopiero z konkretnym źródłem i próbą potwierdzającą wynik.

To zaakceptowane przez właściciela odstępstwo od historycznej macierzy parytetu (D31). Brak przycisku jest wynikiem decyzji o jakości, nie pominięciem nierozliczonego zadania. Nie zmieniano starych repozytoriów ani nie wykonywano dodatkowych zapytań o działki; przegląd objął dokumentację.
