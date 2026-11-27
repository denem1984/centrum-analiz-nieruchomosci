# Raporty AI: mapa i internet — analiza możliwości

Stan 2026-11-27, **analiza i propozycja**, bez podłączenia AI, wywołań modeli, opłat ani wdrożenia. Ostatnie wymaganie właściciela zastępuje wcześniejszą propozycję raportu z listą źródeł: profesjonalny tekst **bez sekcji źródeł i przypisów**, oparty na odczycie mapy oraz bieżącym internecie. Bez wewnętrznej bazy wiedzy DENEM, bez generowania obrazów. Bez logowania do aplikacji.

## Co potwierdza kod DENEM

[FAKT z odczytu GitHub] Rewizja `e868314780cea29fd114892c5a6293b88005037e`, [index.html:2200](https://github.com/denem1984/denem/blob/e868314780cea29fd114892c5a6293b88005037e/index.html#L2200): czat używa klienta portalu, wywołuje funkcję `denem-ai`, przesyła pytanie i historię rozmowy, a odbiera `answer` i `sources`. Klient wymaga sesji użytkownika. Historia ma TTL godziny, do ośmiu wymian i limit znaków; UI pokazuje oczekiwanie, błędy i źródła z wersją materiału/stroną. Wywołanie jest w [linii 2388](https://github.com/denem1984/denem/blob/e868314780cea29fd114892c5a6293b88005037e/index.html#L2388).

[FAKT] Drzewo tego repo zawiera statyczne fronty i zasoby, bez implementacji funkcji `denem-ai`. Nie potwierdza modelu, promptów, sposobu wyszukiwania, kluczy, aktywnych limitów ani kosztów backendu. Nie uruchamiano portalu i nie wywoływano funkcji. Nie odczytywano wartości środowiska ani konfiguracji usług. DENEM pozostał bez zmian.

Do nowej aplikacji można przenieść wzorzec oczekiwania i obsługi błędów. Zgodnie z wymaganiem właściciela nie przenosimy bazy wiedzy, źródeł w raporcie, logowania ani historii przypisanej do konta. Bezpośrednie wykorzystanie starej funkcji nie jest potwierdzoną możliwością i wymagałoby niezależnej analizy jej kodu oraz nowego upoważnienia; nie jest rekomendowanym pierwszym krokiem.

## Proponowany przebieg

1. Start ustala jedną lokalizację i jej dokładność. Użytkownik uruchamia raport z RCN, Działek albo Gmin po uzyskaniu wyniku analizy.
2. Aplikacja przygotowuje **widok istniejącej mapy** z widoczną legendą, skalą i zaznaczeniem oraz zwięzły opis: lokalizacja, aktywne warstwy, bbox, przybliżenie i data zdjęcia, jeśli znana. Dołącza też już obliczone wyniki, filtry i statusy kompletności. Nie generuje nowych obrazów. W Gminach przekazuje ranking, wybrane wagi i wartości wskaźników; zrzut tabeli/wykresu może być dodatkiem.
3. Osobna usługa raportów wykonuje rzeczywiste wyszukiwanie internetowe dla tej lokalizacji i tematu. Nie wystarczy polecenie „użyj internetu” w zwykłym wywołaniu modelu. Brak powodzenia wyszukiwania daje jawny błąd lub informację o niepełności, bez udawania przeglądu internetu.
4. Gemini odczytuje widok i informacje internetowe, a następnie redaguje polski raport: lokalizacja i otoczenie, wyniki analizy, istotne obserwacje oraz ograniczenia wymagające sprawdzenia. Raport nie zawiera bibliografii, listy URL-i ani odsyłaczy typu [1].
5. Raport można przeczytać, poprawić i pobrać jako dokument. Zmiana lokalizacji, filtrów lub warstw oznacza stary raport jako nieaktualny. Nowa generacja następuje na kliknięcie, nie po każdym przesunięciu mapy.

| Moduł | Zakres profesjonalnego opisu |
|---|---|
| RCN | Przestrzenny rozkład transakcji widocznych na mapie, poziom i rozrzut cen, zmiany w czasie oraz kontekst lokalny z internetu. Liczby i trend pochodzą z obliczeń aplikacji; AI opisuje ich znaczenie i ograniczenia próby. |
| Działki | Widoczny sposób zagospodarowania i otoczenie, położenie, dojazd oraz odczyt aktywnych warstw planowania, infrastruktury i zagrożeń. Weryfikacja informacji lokalnych w internecie. Brak symbolu na mapie nie zamienia się w potwierdzenie braku ograniczenia. |
| Podobieństwo gmin | Opis pozycji gminy, cech wspólnych i różnic według wybranego profilu/wag, uzupełniony bieżącym kontekstem internetowym. Braki wskaźników i różne lata pozostają jawne. |

Odczyt mapy nie dowodzi treści niewidocznych warstw. Gemini musi rozróżniać obserwację obrazu, dane modułu i informacje internetowe, nawet jeśli raport nie ma przypisów. Daty zdjęć i aktualność internetu są osobnymi sprawami. Nie wyprowadzać powierzchni, cen ani historii podziału wyłącznie z pikseli, jeśli aplikacja ma dokładne dane. Tekst i strony internetowe są danymi do analizy, nie poleceniami zmiany działania usługi.

## Gemini i dostęp do internetu

[FAKT] Gemini obsługuje obrazy wejściowe i odpowiedzi według JSON Schema. To pozwala odczytać istniejący screenshot i utrzymać strukturę raportu; poprawny schemat nie gwarantuje prawdziwości wniosków. [Obrazy wejściowe](https://aistudio.google.com/docs/image-understanding), [struktura odpowiedzi](https://aistudio.google.com/docs/structured-output).

**Rekomendacja do próby jakości [HIP]:** Gemini 3.8 Flash do opisów wymagających interpretacji mapy; porównać z Gemini 3.5 Flash-Lite na tych samych przypadkach i wybrać tańszy model dopiero po ocenie błędów. Oba są opisane jako stabilne i obsługują structured output. Stary Gemini 2.5 Flash ma zapowiedziane przekierowanie od 2026-12-01, więc nie jest podstawą nowej integracji. [3.8 Flash](https://aistudio.google.com/docs/models/gemini-3.8-flash), [3.5 Flash-Lite](https://aistudio.google.com/docs/models/gemini-3.5-flash-lite), [cennik i migracja 2.5](https://aistudio.google.com/docs/pricing#gemini-2.5-flash).

| Wariant internetu | Ocena względem „bez źródeł” |
|---|---|
| Wbudowane Grounding with Google Search | Rzeczywisty internet, ale warunki wymagają wyświetlania powiązanych Search Suggestions i ograniczają modyfikację wyników. Nie obiecywać ukrycia wszystkich linków ani bezwarunkowego eksportu dowolnie zmienionego wyniku. **Nie wybierać automatycznie przy obecnym wymaganiu.** [Dokumentacja](https://aistudio.google.com/docs/google-search), [warunki Google](https://aistudio.google.com/docs/terms#grounding-with-google-search). |
| Gemini + osobne wyszukiwanie po stronie serwera | Lepszy kierunek dla raportu bez przypisów. Przykład do dalszej weryfikacji: zwykły Brave Search API, gdzie atrybucja dostawcy jest opcjonalna. Wyniki przetwarzane na bieżąco, bez budowy bazy wiedzy. Przed produkcją potwierdzić wybrany plan oraz uprawnienia do przetwarzania/zapisu raportu i treści stron. Nie zakładać, że API przenosi prawa do cudzych treści. [Warunki Brave](https://api-dashboard.search.brave.com/app/documentation/general/terms-of-service), [opis planów](https://brave.com/search/api/). |

Nie używać wyników Google Grounding jako ukrytego źródła do innego wariantu, aby ominąć jego warunki. W raporcie autorska synteza, bez kopiowania obszernych treści stron. Obowiązkowa atrybucja dostawcy mapy pozostaje częścią widoku mapy; brak bibliografii AI nie oznacza usunięcia oznaczeń z podkładu.

## Koszt i architektura

**Odczytywanie screenshotu również zużywa tokeny wejściowe.** Nie jest generowaniem obrazu. W pierwszej próbie jeden czytelny widok plus dane tekstowe, bez filmów, wielu powielonych zrzutów i stałego śledzenia ekranu. Dokładną liczbę mierzyć narzędziem count_tokens i metadanymi użycia, nie samą liczbą znaków. [Tokeny](https://aistudio.google.com/docs/tokens).

[FAKT: cennik 2026-11-27] Za milion tokenów wejścia/wyjścia: 3.5 Flash-Lite 0,30/2,50 USD; 3.8 Flash 0,75/3,75 USD do końca 2026, potem 1,50/7,50 USD. Wyjście obejmuje myślenie. [Cennik Gemini](https://aistudio.google.com/docs/pricing). Brave Search: 5 USD / 1000 żądań przed uwzględnieniem dostępnych kredytów; to koszt odrębny od modelu. [Cennik Brave](https://brave.com/search/api/).

Przykład wyłącznie rachunkowy: łącznie 8000 tokenów wejścia (także obraz, instrukcje i pobrany tekst), 2000 płatnych tokenów wyjścia/myślenia i dwa wyszukania Brave dają około **0,0174 USD** dla Lite albo **0,0235 USD** dla Flash według obecnych stawek. 1000 takich raportów: 17,40 albo 23,50 USD, bez hostingu, podatków, dodatkowych stron, ponowień i zmian cen. To nie pomiar jakości, czasu ani rozmiaru prawdziwego raportu. Koszt zrzutu jest zawarty tylko wtedy, gdy całość rzeczywiście mieści się w założonych 8000 tokenów.

Klucz modelu i wyszukiwarki musi pozostać po stronie serwera. [Zalecenia Google](https://aistudio.google.com/docs/api-key#critical-security-rules). Statyczna aplikacja wymaga osobnej małej usługi raportów — bez zmian DENEM i pięciu starych backendów. Brak logowania jest zachowany; płatny publiczny endpoint potrzebuje trwałego limitu globalnego i krótkookresowego, limitu wejścia/wyjścia/wyszukań i współbieżności. Samo CORS nie ogranicza wydatków. Nie uruchomiono żadnej takiej usługi.

[FAKT] Aktualne warunki Gemini wymagają Paid Services dla aplikacji udostępnianych użytkownikom w EOG. W paid prompts i odpowiedzi nie służą ulepszaniu produktów, lecz istnieje przetwarzanie i retencja określona warunkami. Nie obiecywać zerowej retencji ani bezpłatnego wdrożenia. [Warunki Google](https://aistudio.google.com/docs/terms).

## Etapy do zatwierdzenia i wykonania

1. Kontrakt raportu, obrazu i stanu mapy; fikcyjne przypadki oceny oraz lokalna atrapa AI. Sprawdzić kompletne kafelki, legendę, zasłonięty popup i nieaktualny podkład. Same zrzuty testowe nie są generowaniem obrazów przez AI.
2. Po decyzji właściciela o oddzielnej usłudze i limicie kosztów przygotować kod adaptera modelu i wyszukiwania. Zweryfikować uprawnienia wybranego planu do docelowego raportu bez przypisów. Klucze i wdrożenie obsługuje właściciel; nie wkleja ich do czatu ani repo.
3. Ograniczona próba płatna dopiero po zgodzie i w określonym budżecie: porównanie modeli, odczytu mapy i internetu na tych samych przypadkach, pomiar kosztu oraz błędów. Nie wykonano takiej próby teraz.
4. Integracja osobno z gotowymi wynikami RCN, Działek i Gmin; edycja i eksport raportu bez bibliografii; odmowa generacji lub jawna niepełność, gdy mapa/usługa jest niekompletna. Podsumowanie, podgląd lokalny i akceptacja właściciela przed następnym większym etapem.

**Pozostałe decyzje przed aktywacją:** hosting odrębnej usługi, budżet miesięczny i próbny oraz ostateczny plan wyszukiwania zgodny z raportem bez źródeł. Sama analiza nie jest zgodą na opłaty lub wdrożenie. Nie wygenerowano obrazów, nie wysyłano screenshotów do Gemini ani nie wykonywano zapytań AI.
