# DenemContext v1 — kontrakt lokalizacji

**Status:** przyjęty dla etapu M3a do weryfikacji w M3b.  
**Zakres:** wspólny, opcjonalny kontekst lokalizacji między natywnymi zakładkami. M3a używa wyłącznie fikcyjnego dostawcy danych; M3b podłączy słownik po otrzymaniu plików TERC/SIMC od właściciela.

## Model danych

Wartości kodów są zawsze tekstem. Nie wolno konwertować kodów na liczby, aby zachować zera wiodące. Liczby są dopuszczone wyłącznie dla współrzędnych punktu.

| Pole | Kształt | Reguły |
|---|---|---|
| `version` | `"1"` | Wymagane. |
| `source` | identyfikator modułu | Wymagane: `start`, `dzialki`, `rcn`, `oferty`, `podobne` albo `gminy`. |
| `kind` | tekst | Wymagane: `gmina`, `miejscowosc`, `dzialka`, `punkt` albo `nieokreslona`. |
| `match` | tekst | Wymagane: `exact`, `ambiguous` albo `unknown`. |
| `name` | tekst | Opcjonalna nazwa wyświetlana lokalizacji. |
| `voivodeship` | `{code, name}` | `code` jest tekstem 2 cyfr TERYT. |
| `powiat` | `{code, name}` | `code` jest tekstem 4 cyfr. |
| `gmina` | `{terc7, name, kind}` | `terc7` jest tekstem 7 cyfr; `kind` to liczba `1`, `2`, `3` albo `null`. |
| `place` | `{simc7, name}` | Miejscowość; `simc7` jest tekstem 7 cyfr. |
| `parcel` | `{id, obrebTeryt?}` | Opcjonalny identyfikator działki w formacie ULDiK; `obrebTeryt`, jeśli podany, jest tekstem z cyframi. Dokładny profil walidacji ULDiK wymaga potwierdzenia przy integracji z API [HIP]. |
| `point` | `{lat, lon, crs}` | WGS84; `crs` musi mieć wartość `EPSG:4326`; szerokość 48.5–55.0, długość 13.5–24.5. |
| `bdlUnitId` | tekst 12 cyfr | Opcjonalne; nie wypełniać przed rozstrzygnięciem D9. |

Każdy kod pozostaje tekstem także po dekodowaniu. Nazwy są niepustym tekstem. Nieznane pola obiektu kontekstu oraz zagnieżdżonych pól są ignorowane. Walidator tworzy wynik tylko z rozpoznanych pól. Nieprawidłowy typ, długość lub format kodu unieważnia cały kontekst.

### Spójność kodów

Jeśli jednocześnie podano kod województwa i powiatu, kod powiatu musi zaczynać się kodem województwa. Jeśli podano kod powiatu i gminę, `gmina.terc7` musi zaczynać się kodem powiatu. Niespójność unieważnia cały kontekst.

**[HIP] Do weryfikacji w M3b:** gdy `gmina.kind` nie jest `null`, ostatnia cyfra `gmina.terc7` ma być równa rodzajowi; końcówki 4, 5, 8 lub 9 mają wymagać `kind: null`. Hipoteza wynika z próbki opisanej w `reports/m1c-d9-mapping.md` i nie jest traktowana jako potwierdzona reguła danych; komunikaty walidacji oznaczają ją jako [HIP]. M3b sprawdzi ją na pełnym, autorytatywnym TERC i może wymagać zmiany kontraktu.


## Wymagane pola według rodzaju

| `kind` | Pola wymagane |
|---|---|
| `gmina` | `voivodeship`, `powiat`, `gmina` |
| `miejscowosc` | `voivodeship`, `powiat`, `gmina`, `place` |
| `dzialka` | `parcel.id` |
| `punkt` | `point` |
| `nieokreslona` | brak |

JSON po normalizacji do rozpoznanych pól nie może przekraczać 2048 bajtów UTF-8. Sprawdzenie rozmiaru dotyczy danych kontekstu, które są faktycznie serializowane.

## Adres i dekodowanie

Kontekst może być przekazany w części hash URL w formacie:

```text
#/<modul>?ctx=<base64url(UTF-8 JSON)>
```

Hash nie jest wysyłany do serwera HTTP. Router bierze nazwę modułu z części przed `?`; linki zakładek zachowują zakodowany kontekst. Dekoder odrzuca nieprawidłowy base64url, JSON, UTF-8, walidację pól lub limit rozmiaru bez propagowania wyjątku i zwraca `{ context: null, reason }`.

W aplikacji stan kontekstu jest przechowywany tylko w pamięci modułu i opcjonalnie w URL. Nie używamy localStorage, sessionStorage ani cookies. Wyczyść usuwa kontekst z magazynu i parametru `ctx`.

## Dostawca lokalizacji

`app/js/location/provider.js` definiuje kontrakt `search(query, { limit }) → Promise<Candidate[]>` i punkt podłączenia `createProvider(config)`. Kandydat ma pola DenemContext v1, etykietę odróżniającą wynik i w M3a znacznik `test: true`. Domyślny `fixtureProvider` korzysta z maksymalnie 30 jawnie fikcyjnych pozycji w `fixtures.js`; jego nazwy i kody nie są rzeczywistymi danymi TERYT/GUS. UI stale pokazuje „Dane testowe”, gdy dostawca jest fiksturą.

Wyniki o tej samej znormalizowanej nazwie mają `match: "ambiguous"` i etykietę z gminą, powiatem, województwem oraz rodzajem gminy. Dopiero jawny wybór użytkownika zapisuje `match: "exact"`. Wyszukiwanie ma debounce 250 ms, klawiaturowy wybór strzałkami i Enter oraz komunikat „Brak wyników”. Prawdziwy słownik i mapowanie do danych są poza M3a i należą do M3b.

## Użycie przez moduły

| Moduł | Pola, które może wykorzystać | Status |
|---|---|---|
| RCN | gmina `terc7`; dla wyboru miejscowości `place.simc7` | Przekazanie tych identyfikatorów do API RCN wymaga potwierdzenia w M5 [HIP]. |
| Oferty | nazwa i gmina | Mapowanie lokalizacji na portale i parametry endpointów wymaga potwierdzenia w M6 [HIP]. |
| Działki | `parcel` lub `point` | Zgodność identyfikatora ULDiK i punktu z istniejącym API wymaga potwierdzenia w M4 [HIP]. |
| Podobne | `point` lub gmina | Kształt żądania API i preferencja punkt kontra gmina wymagają potwierdzenia w M7 [HIP]. |
| Gminy | gmina `terc7`; po rozstrzygnięciu D9 także `bdlUnitId` | Mapowanie TERYT ↔ BDL pozostaje otwarte do M8 [HIP]. |

## Etapy i ograniczenia

M3a dostarcza kontrakt, walidację, magazyn pamięci, pasek lokalizacji, routing `?ctx=` oraz fikcyjne wyszukiwanie. Nie dodaje rzeczywistego słownika, plików GUS/TERYT ani logiki modułów merytorycznych. M3b zależy od plików TERC/SIMC od właściciela i ponownej walidacji D2/D9. Kontrakt może wymagać nowej wersji zamiast cichej zmiany formatu, jeżeli M3b ujawni niezgodność.


