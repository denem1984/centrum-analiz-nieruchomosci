# Szablon baseline macierzy regresji przed M4

Właściciel zapisuje baseline przed rozpoczęciem M4. Wypełnij osobny blok dla każdego przypadku poniżej. Zapisuj tylko dane zagregowane; nie dołączaj nazwisk, danych kontaktowych, identyfikatorów kont ani innych danych osobowych. Zrzuty ekranu powinny być zanonimizowane.

## Wspólne pola dla każdego przypadku

- Data i strefa czasowa:
- Moduł / przypadek:
- Środowisko:
- Wersja usługi lub SHA wdrożonego commitu, jeśli znana:
- Liczba rekordów / wyników:
- Mediana ceny za m², jeśli dotyczy:
- Plik zrzutu ekranu:
- Uwagi, filtry i ograniczenia:

## RCN — lokale, Olsztyn (gmina miejska)

- Data:
- Wersja / SHA usługi:
- Liczba rekordów:
- Mediana ceny/m²:
- Zrzut ekranu — nazwa pliku:
- Uwagi:

## RCN — lokale, Pisz, Biała Piska, Piecki (gminy wieloosadnicze)

- Data:
- Wersja / SHA usługi:
- Liczba rekordów dla każdej miejscowości:
- Mediana ceny/m² dla każdej miejscowości:
- Zrzut ekranu — nazwa pliku:
- Uwagi:

## RCN — grunt niezabudowany, polygon i promień

- Data:
- Wersja / SHA usługi:
- Liczba rekordów:
- Mediana ceny/m²:
- Zrzut ekranu — nazwa pliku:
- Uwagi, w tym oznaczenie jakości ceny/m²:

## Oferty — Olsztyn i Pisz; dom i działka; tolerancja 10%

- Data:
- Wersja / SHA usługi:
- Liczba ofert dla lokalizacji i typu:
- Mediana ceny/m² dla wyników, jeśli jest dostępna:
- Zrzut ekranu — nazwa pliku:
- Uwagi, w tym działanie przy błędzie pojedynczego portalu:

## Oferty — resolve-location dla miejscowości spoza listy awaryjnej

- Data:
- Wersja / SHA usługi:
- Liczba zwróconych dopasowań:
- Mediana ceny/m²: nie dotyczy
- Zrzut ekranu — nazwa pliku:
- Uwagi; zapisz wynik TERYT/SIMC bez danych osobowych:

## Działki — powiat piski, gmina Pisz, obręb Łupki

- Data:
- Wersja / SHA usługi:
- Liczba widocznych etykiet / działek:
- Mediana ceny/m²: nie dotyczy
- Zrzut ekranu — nazwa pliku:
- Uwagi, w tym widoczność numerów oraz ładowanie MPZP/POG:

## Działki — raport PDF

- Data:
- Wersja / SHA usługi:
- Liczba rekordów w raporcie:
- Mediana ceny/m²: jeśli raport ją zawiera
- Zrzut ekranu — nazwa pliku:
- Uwagi; zapisz nazwę wygenerowanego pliku bez danych osobowych:

## Podobne — jedna analizowana nieruchomość i trzy podobne (adres i działka)

- Data:
- Wersja / SHA usługi:
- Liczba nieruchomości podobnych:
- Mediana ceny/m²:
- Zrzut ekranu — nazwa pliku:
- Uwagi, w tym markery i linie na mapie:

## Gminy — gmina docelowa, zakres kraj / województwo, trzy profile

- Data:
- Wersja / SHA usługi lub danych:
- Liczba gmin w wynikach:
- Mediana ceny/m²: nie dotyczy
- Zrzut ekranu — nazwa pliku:
- Uwagi, w tym ranking, zakres i generowanie PDF:

## Wszystkie moduły — wejście bez kontekstu

- Data:
- Wersja / SHA usługi:
- Liczba rekordów / wyników:
- Mediana ceny/m²: jeśli dotyczy
- Zrzut ekranu — nazwa pliku:
- Uwagi; opisz zachowanie każdego modułu:

## Działki — rozszerzone przypadki baseline M4a

Wykonaj przed M4b w obecnej aplikacji Działki. Dla każdego przypadku wybierz te same obszary/usługi także po porcie; wpisuj tylko wyniki zagregowane, bez danych osobowych. Zrzuty ekranu zanonimizuj. Wyników poniżej nie wypełniać w PR.

### D1 — wyszukiwanie i zaznaczenie działki

1. Otwórz obecną aplikację zwykłym sposobem dostępu.
2. Wybierz powiat piski, gminę Pisz, obręb Łupki i znany numer działki.
3. Użyj „Szukaj działki”, a następnie kliknij działkę na mapie.
4. Zapisz widoczność obrysu/etykiety oraz pola widoczne w popupie.

- Data:
- Wersja / SHA usługi:
- Liczba widocznych etykiet:
- Wynik wyszukiwania i popup:
- Zrzut ekranu — nazwa pliku:
- Uwagi:

### D2 — podkłady i nawigacja

1. Przełącz OSM, zdjęcia Esri i ortofotomapę archiwalną.
2. Zmień rok ortofotomapy, jeśli suwak jest dostępny.
3. Użyj zoomu, skali i przesunięcia mapy.
4. Zapisz stan każdego podkładu i działanie kontrolek.

- Data:
- Wersja / SHA usługi:
- Dostępne podkłady / wybrany rok:
- Zrzut ekranu — nazwa pliku:
- Uwagi:

### D3 — warstwy EGiB i rodzina działek

1. Włącz numery, granice działek i kontury budynków.
2. Kliknij działkę, zapisz widoczne dane i zaznaczenie.
3. Zmień kolor konturów oraz kolor zaznaczenia.
4. Użyj „Pokaż działki o wspólnym numerze bazowym”.
5. Zapisz liczbę etykiet i działek powiązanych.

- Data:
- Wersja / SHA usługi:
- Liczba etykiet / działek:
- Zrzut ekranu — nazwa pliku:
- Uwagi:

### D4 — MPZP i linie zabudowy

1. Włącz MPZP oraz linie zabudowy.
2. Kliknij działkę lub obszar planu.
3. Zapisz widoczną nazwę/status planu i dostępne odnośniki.
4. Zanotuj brak danych oddzielnie od błędu usługi.

- Data:
- Wersja / SHA usługi:
- Liczba widocznych informacji planistycznych:
- Zrzut ekranu — nazwa pliku:
- Uwagi:

### D5 — plan ogólny

1. Włącz warstwę POG uchwalonego.
2. Włącz oddzielnie oba warianty POG projektowanego.
3. Kliknij miejsce, dla którego usługa zwraca informację.
4. Zapisz źródło, etykietę/strefę i stan odpowiedzi dla każdej warstwy.

- Data:
- Wersja / SHA usługi:
- Wynik per warstwa:
- Zrzut ekranu — nazwa pliku:
- Uwagi:

### D6 — własność, sieci, ryzyka i RWDZ

1. Przełącz warstwy KIUT, własności, ryzyka powodziowego i RWDZ.
2. Kliknij mapę przy włączonych warstwach.
3. Zapisz, które warstwy są widoczne i jakie informacje pojawiają się w popupie.
4. Oznacz brak danych, jeśli warstwa nie ma pokrycia dla wybranego miejsca.

- Data:
- Wersja / SHA usługi:
- Wynik per warstwa:
- Zrzut ekranu — nazwa pliku:
- Uwagi:

### D7 — pomiar, Street View i raport

1. Z menu kontekstowego rozpocznij pomiar odległości, zakończ go i zapisz wynik.
2. Wykonaj analogicznie pomiar obszaru, a potem anuluj/usuń pomiar.
3. Otwórz Street View z wybranego punktu.
4. Dodaj działkę i widok warstw do raportu, usuń jedną pozycję i wygeneruj PDF.
5. Zapisz liczbę stron, obecność mapy/rekordów i nazwę pliku.

- Data:
- Wersja / SHA usługi:
- Długość / powierzchnia:
- Liczba pozycji i stron PDF:
- Zrzut ekranu — nazwa pliku:
- Nazwa pliku PDF:
- Uwagi:

## Zestawienie baseline

- Data zakończenia zapisu baseline:
- Właściciel potwierdził kompletność przed rozpoczęciem M4:
- Lokalizacja pliku / wersjonowanie:
- Uwagi:
