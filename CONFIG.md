# CONFIG.md — pomiary M1 i stan konfiguracji bez sekretów

> Repozytorium jest publiczne. Zapisano tylko ścieżki endpointów, wyniki pomiarów przekazane przez właściciela i dozwoloną, niesekretną wartość trybu RCN. Nie zapisano adresów bazowych API, sekretów ani innych wartości zmiennych.

**Data pomiaru:** 2026-10-27  
**Źródło:** odczyty i pomiary właściciela oraz lokalny odczyt kodu. Wykonawca nie wysyłał żądań HTTP do usług produkcyjnych.

## Metadane pomiaru

- Osoba wykonująca pomiary: właściciel.
- Zakres: GET/OPTIONS, czasy dwóch kolejnych odpowiedzi, odczyt SHA wdrożeń, trybu RCN i struktury tabeli Gminy.
- Adresy bazowe pozostawiono niewypełnione; podano wyłącznie ścieżki.

## API i punkty wejścia

| Moduł | Adres bazowy | Ścieżka pomiaru | Źródło |
|---|---|---|---|
| RCN | — | GET `/` | [FAKT: pomiar właściciela 2026-10-27]; statyczny index.html [FAKT z kodu: rcn-web-app/main.py:5426-5428] |
| Oferty | — | GET `/health` | [FAKT: pomiar właściciela 2026-10-27]; wrapper przekazuje ścieżkę do compat-server [FAKT z kodu: reports/m1a-code-review.md C1] |
| Działki | — | GET `/health` | [FAKT: pomiar właściciela 2026-10-27]; lokalny handler [FAKT z kodu: api-dzialki/server.js:1951] |
| Podobne | — | GET `/api/health` | [FAKT: pomiar właściciela 2026-10-27]; lokalny handler [FAKT z kodu: server.js:192] |
| Gminy | — | odczyt struktury `gus_bdl_commune_wide` przez właściciela | [FAKT: odczyt właściciela z panelu 2026-10-27] |

## CORS i preflight

Wszystkie cztery API zwróciły `Access-Control-Allow-Origin: *` [FAKT: pomiar właściciela 2026-10-27].

| API | Access-Control-Allow-Methods | Access-Control-Allow-Headers | Access-Control-Max-Age | Wynik |
|---|---|---|---:|---|
| RCN | DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT | authorization, content-type | 600 s | Preflight dla eksportów XLSX/DOCX z POST i Content-Type zaakceptowany. Nie wysyłano POST. |
| Oferty | GET, POST, OPTIONS | Content-Type | — | Authorization nie pojawił się w dozwolonych nagłówkach. |
| Działki | GET, OPTIONS | brak nagłówka | — | Nie wysyłano żądania z nagłówkiem Authorization. |
| Podobne | GET, OPTIONS | Content-Type | — | Authorization nie pojawił się w dozwolonych nagłówkach. |

Źródło tabeli: [FAKT: pomiar właściciela 2026-10-27]. Preflight używał Origin `https://example.org`; nie wykonywano żądań POST/PUT/DELETE.

## Dwa kolejne wywołania

| API | Endpoint | Pierwsza odpowiedź | Druga odpowiedź, po 2 s |
|---|---|---:|---:|
| RCN | GET `/` | 52 s | 0,29 s |
| Oferty | GET `/health` | 22 s | 0,13 s |
| Działki | GET `/health` | 22 s | 0,15 s |
| Podobne | GET `/api/health` | 22 s | 0,13 s |

Źródło: [FAKT: pomiar właściciela 2026-10-27]. Określenie pierwszej odpowiedzi jako zimnego startu pozostaje [HIP], ponieważ nie potwierdzono co najmniej 15 minut bezczynności usługi. Druga odpowiedź jest kolejnym pomiarem po 2 sekundach.

## Wdrożone rewizje

| Usługa | SHA wdrożenia |
|---|---|
| RCN | `85cb2f9` |
| Oferty | `596451b` |
| Działki | `a1aa39d` |
| Podobne | `a750201` |
| Gminy | `c1b682c` |

Źródło: [FAKT: odczyt właściciela z panelu 2026-10-27]. Pełne SHA checkoutów użytych w przeglądzie i ich zgodność z tymi rewizjami podano w `reports/m1a-code-review.md`.

## Zmienne środowiskowe — tylko nazwy i status

| Moduł | Nazwa zmiennej | Status | Uwagi bez wartości |
|---|---|---|---|
| RCN | RCN_DATA_SOURCE | odczytane przez właściciela | Niesekretna wartość trybu jest podana niżej. |
| RCN | DATA_SOURCE | nieznany | Nie odczytywano. |
| RCN | RCN_ADMIN_TOKEN | nieznany | Nie odczytywano. |
| Oferty | PORT | nieznany | Nie odczytywano. |
| Działki | PORT | nieznany | Nie odczytywano. |
| Podobne | PORT | nieznany | Nie odczytywano. |
| Podobne | UPSTREAM_PRG | nieznany | Nie odczytywano. |
| Podobne | UPSTREAM_WFS | nieznany | Nie odczytywano. |

## D1 — źródło danych RCN

`RCN_DATA_SOURCE = r2_parquet` [FAKT: odczyt właściciela z panelu 2026-10-27]. D1 potwierdzone. Wartość jest niesekretna.

## Gminy — struktura tabeli przekazana przez właściciela

[FAKT: odczyt właściciela z panelu 2026-10-27] Tabela `gus_bdl_commune_wide` ma kolumny `unit_id` (text; 12 znaków w odczytanych rekordach), `unit_name` (text), `unit_kind` (integer), siedem wskaźników liczbowych z kolumnami rocznymi i nie ma kolumny TERYT. Właściciel podał liczności: `unit_kind=1` — 302, `unit_kind=2` — 1459, `unit_kind=3` — 718. Nie wykonywano zapytań do Supabase.

Usługa statyczna frontu Podobnych nie ma skonfigurowanych reguł rewrite ani redirect [FAKT: odczyt właściciela z panelu 2026-10-27].

## Wyniki i otwarte kwestie

- D2 — kod i zakres słownika SIMC opisano w `reports/m1c-d2-simc.md`; pełnego runtime cache nie pobierano.
- D9 — analiza próbki CSV i kandydat reguły mapowania opisano w `reports/m1c-d9-mapping.md`; pełne mapowanie pozostaje do potwierdzenia przed M8.
- Nie wykonywano żądań HTTP do produkcyjnych API. Nie odczytywano ani nie zapisywano wartości sekretów.
