# Jedna lokalizacja w Start — M3c

> **Aktualizacja 2026-11-28.** M3c jest dostępny w lokalnym podglądzie. Poniżej opisano dostarczony kontrakt i założenia projektowe. Powiązanie z raportem RCN i Ofertami opisuje [decyzja D39](../DECISIONS.md#d39--wspólna-lokalizacja-ze-startu-oraz-oferty-w-raporcie-rcn-2026-11-28).

## Wersja dostarczona do odbioru

- Formularz wybiera jeden z trybów `Obszar`, `Adres` i `Działka`. Przy wyszukiwaniu miejscowości można podać nazwę w skali całego kraju lub użyć filtrów administracyjnych. Wynik pokazuje typ miejscowości, jej jednostki nadrzędne i SIMC.
- Wspólny kontekst to v2 w istniejącym parametrze `ctx` w URL. Używa tekstowych identyfikatorów TERC, SIMC, ULIC i opcjonalnie BDL. Osobne pola zawierają `district`, `parcel`, `street`, `canonicalGmina` oraz `point.role`. Rola rozróżnia środek obszaru, punkt miejscowości, punkt ulicy, punkt adresowy i środek działki. Geometria jest pobierana do widoku, a limit kontekstu w URL nadal wynosi 2048 B. Dekoder v1 i obsługa starych linków pozostają dostępne.
- Tryb działki przyjmuje pełny identyfikator lub obręb z numerem. Miejscowość i ulicę można ręcznie dołączyć w obrębie tej samej gminy. Obrys ULDK jest potwierdzany po pełnym identyfikatorze. Przy samym obrębie wyświetlana jest opisana granica gminy, a kod obrębu przechodzi do Działek.
- Podkład Startu to OpenStreetMap. Gmina ma granicę PRG, punkt adresowy lub orientacyjny pochodzi z UUG, a działka ma obrys ULDK. Gdy UUG nie zwróci jednoznacznego punktu, kod lokalizacji pozostaje dostępny dla modułów i mapa może pokazać granicę gminy z odpowiednim komunikatem.
- RCN wykorzystuje nazwę miejscowości, TERYT6 i ulicę w trybie lokali. Analizy gruntów korzystają z dotychczasowej semantyki filtra opisu ewidencyjnego i trybu całej gminy. Oferty otrzymują TERC7 i SIMC, a Podobne otrzymują punkt nieruchomości analizowanej. Gminy używają kanonicznego TERC i identyfikatora BDL. Działki otrzymują obręb i ewentualny pełny ID.
- Pliki w `app/data/location/` powstały z weryfikacji M3b według stanu TERC/SIMC 2026-01-01 i ULIC 2026-07-16. Jest 16 wojewódzkich plików SIMC i 16 plików ULIC, wczytywanych według potrzeby. Pliki można odtworzyć przez `python scripts/build-start-catalog.py <eksport M3b> app/data/location`.

[Raport odbioru, adres podglądu i porównanie zapytań](../reports/m3c-start.md).

## Pierwotny projekt, 2026-11-27

Użytkownik ustala lokalizację raz w zakładce Start. Każda kolejna zakładka pobiera potrzebne pola z tego samego stanu. Moduły nie wymagają ponownego wyboru województwa, powiatu, gminy, obrębu, miejscowości i ulicy.

Uzupełnienie właściciela: wynik wyszukiwania jest pokazany na mapie w Start. Można zacząć od tych danych, które użytkownik ma — nazwy miejscowości, adresu albo numeru/identyfikatora działki — bez obowiązku ręcznego wypełnienia wszystkich list.

### Proponowany interfejs

Trzy tryby wybierane przyciskami radiowymi: **Obszar**, **Adres**, **Działka**. Checkboksy nie są potrzebne do wyboru wzajemnie wykluczających się sposobów wyszukania jednego celu.

| Tryb | Wprowadzanie | Wynik na mapie |
|---|---|---|
| Obszar | Wyszukiwanie gminy lub miejscowości po nazwie; listy województwa/powiatu/gminy do zawężenia i rozróżniania powtarzalnych nazw | Granica dostępnego obszaru i dopasowanie widoku; punkt środka jest orientacyjny |
| Adres | Miejscowość i ulica; numer adresowy opcjonalny, jeśli wspierany przez wybrane źródło. Wybór miejscowości uzupełnia potwierdzoną gminę, powiat i województwo | Ulica jako obszar/linia lub potwierdzony punkt adresowy. Sama ulica nie oznacza ustalonej działki |
| Działka | Gmina/jednostka ewidencyjna → obręb → numer albo bezpośrednio pełny identyfikator działki | Obrys działki, dopasowany widok i dane identyfikujące wynik |

Pod formularzem jeden przycisk „Ustal lokalizację” oraz mapa i opis wybranego celu. Wyniki niejednoznaczne wymagają wyboru z listy opisanej gminą/powiatem/województwem. Pokazać komplet dostępnych pól, ich pochodzenie w kontrakcie i dokładność wskazania; brak potwierdzenia pozostaje brakiem.

Wybranie działki nie gwarantuje automatycznego ustalenia miejscowości i ulicy. Nie dopasowywać ich przez podobieństwo nazw, najbliższą ulicę lub środek wieloboku. Uzupełnić z wiarygodnej relacji przestrzennej/adresowej albo poprosić o wybór brakującego pola w tym samym Start. Analogicznie sam adres bez numeru nie wskazuje jednoznacznej działki.

[FAKT z kodu] Start ma już wyszukiwanie na fikcyjnych danych i wspólny magazyn DenemContext v1. Działki w bieżącym repo mają formularz powiat → gmina → obręb → numer działki. Nie mają jeszcze osobnego wyboru miejscowości ani ulicy. Docelowa lista właściciela opisuje rozszerzenie wspólnego formularza, a nie komplet już dostępnych pól. Źródła: `app/js/modules/registry.js`, `app/js/location/search-ui.js`, `app/js/modules/dzialki/search-ui.js`.

## Przepływ docelowy

1. Start umożliwia wybranie województwa i powiatu, gminy oraz — w potrzebnym zakresie — obrębu, miejscowości i ulicy. Można zakończyć na gminie; brak ulicy nie blokuje analizy gminy lub działki.
2. Pasek wspólnej lokalizacji pokazuje ustalony zakres. Link „Zmień lokalizację” prowadzi do formularza Start. Dane pozostają w pamięci przy zmianie zakładki; odświeżenie i URL podlegają jawnemu kontraktowi kontekstu, bez logowania.
3. Zmiana województwa czyści zależne jednostki, powiatu — gminę i niższe pola, gminy — obręb, miejscowość, ulicę, działkę i zależny punkt; zmiana miejscowości czyści ulicę i zależny punkt adresowy. Zmiana obrębu czyści numer/identyfikator działki. Poprzednie odpowiedzi asynchroniczne nie mogą odtworzyć wyczyszczonych wyborów.
4. Obręb i miejscowość są odrębnymi informacjami. Nie wyprowadzamy obrębu z nazwy miejscowości ani miejscowości z nazwy gminy. Relacje sprawdzają dostawcy danych. W gminie miejsko-wiejskiej należy rozróżnić właściwe jednostki; potwierdzenie reguł nastąpi na pełnym słowniku.
5. Każdy moduł pokazuje pobrany zakres i ewentualny brak wymaganego pola oraz link do Start. Dodatkowe filtry analizy pozostają w module. Zmiana wspólnego kontekstu oznacza poprzednie wyniki jako nieaktualne; nie przepisuje im nowej etykiety i nie uruchamia samoczynnie ciężkich wyszukiwań.

| Moduł | Wykorzystanie wspólnej lokalizacji | Wybory właściwe dla analizy |
|---|---|---|
| Działki | Gmina/jednostka ewidencyjna i obręb; działka/punkt, jeżeli ustalone | Numer działki, warstwy, pomiary i raport. Wspólne listy administracyjne przeniesione do Start; brak ponownego przechodzenia kaskady. |
| RCN | Powiat, gmina, miejscowość i opcjonalna ulica; dokładne identyfikatory lub mapowanie do potwierdzonych parametrów starego API | Typ nieruchomości, daty, promień/polygon, ceny, powierzchnie i pozostałe filtry. Możliwość analizy całej gminy pozostaje. |
| Oferty | Miejscowość i gmina; ulica/punkt tylko jeżeli rzeczywiście obsługuje je istniejące API | Rodzaj, źródła, promień i filtry. Nie wysyłać nieobsługiwanego parametru ulicy. |
| Podobne | Lokalizacja analizowanej nieruchomości, miejscowość/ulica albo działka/punkt | Każda nieruchomość porównawcza nadal ma własną lokalizację — inaczej nie dałoby się zachować funkcji porównania wielu nieruchomości. |
| Gminy | Jednoznaczna gmina TERC, po potwierdzeniu także jednostka BDL | Profil, wskaźniki i zakres porównania. |

## Kontrakt i kolejność prac

- DenemContext v1 nie ma osobnej ulicy ani samodzielnego obrębu bez działki; jego parser usuwa nierozpoznane pola. Nie wystarczy dopisać pól do formularza. Przygotować wersjonowany kontrakt v2 i migrację v1 → v2, testy walidacji, URL, limitu rozmiaru i routera. Nazwy nie zastępują kodów.
- TERC/SIMC oraz dane ulic i obrębów pozyskać z oficjalnych źródeł lub potwierdzonych wywołań starych frontów. M3b rozszerzyć o weryfikację źródła ULIC. Kody zachować jako tekst, w tym zera wiodące. Nie zgadywać ULIC, SIMC, TERC, identyfikatora jednostki ewidencyjnej ani BDL.
- M3c.1: kontrakt v2, migracja, reguły zależności i dostawcy; M3c.2: wspólny formularz Start oraz przeniesienie wyboru gminy/obrębu z Działek; M3c.3: adaptery konsumujące kontekst i regresja przejść między zakładkami. Każdy podetap osobnym PR.
- Bieżące M4e/M4f pozostają kontynuowane. Następnie M3b → M3c → M5–M8; porty kolejnych modułów od początku korzystają z centralnej lokalizacji. Nie usuwać działającego formularza Działek, zanim Start i adapter Działek go zastąpią.
- Zmiana organizacji formularza jest decyzją właściciela i zastępuje wcześniejszy plan powielania list w modułach. Nie oznacza utraty źródłowych opcji wyszukiwania. Podkład satelitarny ma osobny plan `imagery-freshness-plan.md`.

## Akceptacja

Jednokrotny wybór w Start ma pokazać lokalizację na mapie i zasilić moduły. W próbie ręcznej sprawdzić trzy tryby, pełne ID działki, powtarzalne nazwy, brak ulic, miasto na prawach powiatu, gminę miejsko-wiejską, stary link v1 i czyszczenie zależnych danych. [Scenariusz](../reports/m3c-start.md).
