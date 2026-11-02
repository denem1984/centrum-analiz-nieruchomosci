# Macierz parytetu funkcji Działki

Macierz opisuje widoczne funkcje publicznego frontu Działki i plan ich odtworzenia w natywnej zakładce. Odwołania dotyczą frontu `index.html` z rewizji `a1aa39d`; nie dokumentuje się tras backendu, których ten front nie wywołuje. Baseline D1 przekazał właściciel 2026-11-02. Dane konkretnego przypadku oraz zrzuty pozostają poza repozytorium.

Status „zrobione” oznacza implementację lokalnej funkcji i testy bez sieci; nie potwierdza dostępności usług produkcyjnych. Właściciel wykonuje porównanie przeglądarkowe przed odbiorem każdego podetapu.

| Element | Dowód w starym froncie | Stan nowej aplikacji | Docelowy podetap | Uwagi |
|---|---|---|---|---|
| Dostęp do zakładki bez bramki własnej modułu | [FAKT z kodu: `index.html:68–74`] | zrobione | M4c | Zgodnie z D15; wspólne logowanie całej aplikacji pozostaje do decyzji D5. |
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
| Czerwony obrys z półprzezroczystym wypełnieniem | [FAKT z kodu: `index.html:451`] | zrobione | M4c | Reguły stylu należą do CSS nowego modułu. |
| Popup: identyfikator, powierzchnia, grupa i kody klasoużytków | [FAKT z kodu: `index.html:817–837`] | zrobione | M4c.1 | Treść budowana z pól odpowiedzi, bez HTML pochodzącego z usługi. |
| Kliknięcie wyniku przełącza zaznaczenie | [FAKT z kodu: `index.html:817–837`] | zrobione | M4c.1 | W M4c.1 przełącza się wynik wyszukiwania; zaznaczanie wielu działek na mapie jest w M4d. |
| OSM, Esri i archiwalna ortofotomapa z wyborem roku | [FAKT z kodu: `index.html:177,211`] | zrobione | M4b | Browser-smoke archiwum po zmianach uruchamia właściciel. |
| Zoom, skala i nawigacja mapy | [FAKT z kodu: `index.html:177,211`] | zrobione | M4b | Zachowują stan w pamięci przy przełączaniu zakładek. |
| Numery i granice działek oraz kontury budynków | [FAKT z kodu: `index.html:507–560`] | brak | M4d | Baseline D1 wymienia widoczne warstwy EGiB; nie są częścią M4c.1. |
| Dynamiczne etykiety zależne od widoku | [FAKT z kodu: `index.html:507–560`] | brak | M4d | Do porównania na baseline D3. |
| Kliknięcie działki z warstwy EGiB i obsługa wielu zaznaczeń | [FAKT z kodu: `index.html:817–837`] | częściowo | M4d | Teraz działa przełączenie zaznaczenia działki znalezionej formularzem; wiele działek i obsługa warstwy wracają w M4d. |
| Kolor konturów, paleta kolorów zaznaczenia i czyszczenie | [FAKT z kodu: `index.html:624–708,861`] | brak | M4e | Obejmuje także stan pusty po wyczyszczeniu. |
| Działki o wspólnym numerze bazowym | [FAKT z kodu: `index.html:458,638–708`] | brak | M4e | Stary front określa dopasowanie jako orientacyjne; zgodność sprawdzi baseline D3. |
| MPZP oraz linie zabudowy | [FAKT z kodu: `index.html:187,319–410,838–844`] | brak | M4d | Wróci w baseline D4. |
| Plan ogólny: warstwa wiążąca oraz warianty projektowane | [FAKT z kodu: `index.html:187,212–318,845–854`] | brak | M4d | Wróci w baseline D5. |
| Własność, KIUT, ryzyko powodziowe i pozwolenia budowlane | [FAKT z kodu: `index.html:187,767–815,838–858`] | brak | M4d | Wróci w baseline D6. |
| Menu mapy, pomiar odległości i powierzchni | [FAKT z kodu: `index.html:197–209,1122–1285`] | brak | M4e | Wróci w baseline D7. |
| Street View z punktu mapy | [FAKT z kodu: `index.html:1270–1275`] | brak | M4e | Usługę wywołuje przeglądarka starego frontu; integracja nowej zakładki podlega osobnej kontroli URL. |
| Lista elementów raportu: dodawanie, usuwanie i czyszczenie | [FAKT z kodu: `index.html:189–194,862–965`] | brak | M4f | Stan listy ma pozostawać w pamięci aplikacji zgodnie z decyzją D15. |
| Eksport raportu PDF z działką i widokiem warstw | [FAKT z kodu: `index.html:993–1110`] | brak | M4f | Wróci w baseline D7; wymaga porównania właściciela. |

## Weryfikacja baseline D1

Właściciel przekazał zrzuty i opis D1 przed M4c.1. Nowa zakładka ma odtwarzać formularz z etykietami zależnymi od administracji, zielonym przyciskiem wyszukiwania, czerwonym obrysem, raportem EGiB i popupem z przełączanym zaznaczeniem. Konkretne wartości wejściowe, identyfikatory, pomiary i zrzuty nie są utrwalane w repozytorium. Wynik porównania nowego frontu z działającymi usługami musi dostarczyć właściciel po swoim przebiegu browser-smoke.

## Utrzymanie

Aktualizuj tę macierz w każdym podetapie M4. Zmieniaj status dopiero po przejrzeniu implementacji i testów danego elementu; nie oznaczaj funkcji zewnętrznej jako działającej produkcyjnie na podstawie atrap.
