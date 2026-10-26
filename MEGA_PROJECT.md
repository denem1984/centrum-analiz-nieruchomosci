# MEGA_PROJECT.md — propozycja docelowej architektury i zakresu

Status: PROPOZYCJA oparta na audycie (`AUDIT.md`). Nie przesądza decyzji — patrz `DECISIONS.md`.

## 1. Cel
Jedna platforma DENEM do kompleksowej analizy nieruchomości: użytkownik wskazuje lokalizację/działkę raz i dostaje spójny obraz — transakcje (RCN), oferty, otoczenie i warstwy przestrzenne działki, nieruchomości podobne oraz profil gminy — bez przepisywania działających aplikacji.

## 2. Wnioski z audytu, które kształtują architekturę
1. **Powłoka tożsamości już istnieje**: wszystkie 5 aplikacji używają jednego projektu Supabase, ról i slugów dostępu oraz panelu `denem.pl`.
2. **Backendy są różne i nie nadają się do prostego scalenia**: Python/FastAPI z DuckDB i plikami Parquet (rcn), Node-scraper portali (oferty), Node-proxy usług państwowych (działki, rozkład), brak backendu (gminy). Scalenie w jeden proces oznaczałoby przepisywanie w jednym języku i mieszanie zadań o bardzo różnym obciążeniu (pamięć DuckDB vs scraping z ryzykiem blokad IP).
3. **Wszystkie backendy mają CORS `*` i są bezstanowe**, więc nowy front może wołać je bezpośrednio z przeglądarki — bez bramy API.
4. **Brakuje tylko jednego spoiwa: wspólnego „kontekstu nieruchomości"** (kto/co/gdzie analizujemy), przekazywanego między modułami.

## 3. Porównanie wariantów

| Wariant | Opis | Czas | Koszt | Trudność | Ryzyko | Ocena |
|---|---|---|---|---|---|---|
| A. Hub z linkami (najszybszy, najtańszy) | strona-menu w panelu; moduły otwierane osobno; kontekst w parametrach linku | kilka dni | minimalny | niska | niskie | dobry start, ale użytkownik nadal „skacze" między aplikacjami |
| B. Powłoka + moduły federacyjne (**rekomendowany**) | jedna aplikacja-powłoka: wspólne wyszukiwanie lokalizacji, zakładki modułów (każdy działa jak dotąd, w ramce lub osobnej karcie), wspólny kontekst | tygodnie | niski (bez nowych usług) | średnia | niskie–średnie | najlepszy stosunek wartości do ryzyka |
| C. Brama API + nowe endpointy agregujące | dodatkowa usługa weryfikująca token i łącząca odpowiedzi backendów | miesiące | wyższy (nowa usługa) | wysoka | średnie | uzasadniona dopiero, gdy pojawi się potrzeba agregacji po stronie serwera (raport zbiorczy) |
| D. Jeden monolit (najbardziej ambitny) | przepisanie wszystkiego do jednej aplikacji i jednego backendu | wiele miesięcy | wysoki | bardzo wysoka | wysokie (utrata sprawdzonych funkcji, regresje) | **odradzam** — sprzeczne z zasadą „bez zbędnego przepisywania" |

**Rekomendacja: B, wdrażane przez A** (najpierw linki z kontekstem, potem powłoka). Backendy zostają osobnymi usługami. Nie ma uzasadnienia, by łączyć je w jeden backend; jedyną sensowną konsolidacją opcjonalną jest scalenie dwóch cienkich proxy GUGiK (rozkład → działki), co zaoszczędziłoby jedną usługę (patrz DECISIONS D7).

## 4. Architektura docelowa

```
                      denem.pl (panel) ── logowanie Supabase, role, slugi dostępu
                              │
                      MEGA POWŁOKA (nowa, lekka, statyczna)
        ┌─ wyszukiwarka lokalizacji / działki  → DenemContext
        ├─ zakładki: Działka | Transakcje | Oferty | Podobne | Gmina | Raport
        └─ wspólna bramka dostępu (jeden moduł zamiast 5 kopii)
              │ (kontekst w hashu URL / postMessage)
   ┌──────────┼───────────┬────────────┬───────────┐
 działki     rcn        oferty      rozkład      gminy
(Node proxy)(FastAPI+   (Node       (Node proxy) (statyczna +
            DuckDB+R2)  scraper)                  Supabase)
```
Zasada: **każdy moduł pozostaje samodzielną aplikacją** i działa także bez powłoki (zachowana zgodność wsteczna z obecnymi linkami i panelem).

## 5. Wspólny kontrakt: DenemContext v1
Mały obiekt JSON przekazywany do modułów w parametrze `ctx` (w hashu URL, żeby nie trafiał do logów serwerów; duże geometrie przekazywane po identyfikatorze, nie wprost):
```
{ "v": 1,
  "location": { "name", "teryt7", "simc", "gminaTeryt7", "powiatTeryt4", "wojTeryt2", "lat", "lon" },
  "parcel":   { "id", "obreb", "number", "areaM2" },   // geometria pobierana po id
  "subject":  { "type": "dzialka|dom|lokal|komercyjna", "areaM2", "price" },
  "area":     { "mode": "miejscowosc|promien|polygon", "radiusM" }
}
```
Klucz główny lokalizacji: **TERYT/SIMC** (używany już w rcn i oferty). Moduły czytają kontekst przy starcie (opcjonalnie — brak kontekstu = zachowanie dotychczasowe) i potrafią go emitować (np. działki po wyborze działki).

## 6. Zakres funkcjonalny aplikacji

**W zakresie, bez zmian funkcji (przenosimy jak są):**
- Działki: mapa, numery działek, warstwy planistyczne, pomiary, raport PDF (analizator-nieruchomosci).
- Transakcje RCN: lokale i grunty, statystyki, eksporty, otoczenie (rcn-web-app).
- Oferty: 6 portali, filtr powierzchni (Analizator-cen-ofertowych).
- Podobne: lokalizacja i mapa listy porównawczej (rozklad-nieruchomosci-podobnych).
- Gminy: scoring podobieństwa gmin (gminy).

**Nowe, o największej wartości dodanej (kolejność):**
1. Wspólne wyszukiwanie lokalizacji (jedno wejście, jeden klucz TERYT).
2. „Dodaj z RCN / z ofert" w module Podobne (zamiast wpisywania ręcznego).
3. Widok porównawczy: transakcje vs oferty dla tego samego kontekstu (np. mediana ceny za m²).
4. Profil gminy w karcie nieruchomości (z gminy → moduł Gminy).
5. Raport zbiorczy (PDF/Word) łączący wyniki modułów — dopiero po ustabilizowaniu kontraktu danych; największe ryzyko zakresowe.

**Poza zakresem tego etapu:** przepisywanie parserów portali, zmiana źródeł danych RCN, własna baza danych, płatności, aplikacja mobilna.

## 7. Zasady przekrojowe
- **Dostęp:** jeden moduł bramki (Supabase) w powłoce; backendy dostają **weryfikację tokenu po stronie serwera** (patrz DECISIONS D5) — obecnie jej nie mają.
- **Konfiguracja:** spisać zmienne środowiskowe i ustawienia hostingu każdej usługi do jednego dokumentu (dziś są tylko w panelach).
- **Wersjonowanie:** lockfile i przypięte wersje (rcn już ma przypięte; Node-serwisy nie mają zależności albo mają bez lockfile).
- **Bezpieczeństwo/koszty:** wyłączyć lub zabezpieczyć trasy diagnostyczne (26 w działkach, 8 w ofertach, admin/debug w rcn).
- **Zasada zmian:** nie dotykamy działających funkcji; zmiany w modułach ograniczone do adaptera kontekstu i zabezpieczeń.

## 8. Główne ryzyka architektury
1. **Spójność lokalizacji:** brak potwierdzonego klucza `unit_id` (BDL) ↔ TERYT w gminy (sprawdzić strukturę tabeli).
2. **Osadzanie w ramkach:** wymaga, by serwisy nie blokowały `X-Frame-Options`/CSP (w kodzie żadnego nie ustawiono — **[HIP]**, trzeba sprawdzić na produkcji; zapas: otwieranie w nowej karcie).
3. **Utrzymanie 4 usług hostingowych:** koszt i zimne starty zależą od planu (nieznany).
4. **Scraping ofert:** ryzyko zmian HTML, blokad i regulaminów portali — niezależne od integracji.
5. **Źródło danych rcn:** domyślnie WFS (wolniejszy, niestabilny), Parquet/R2 jako opcja — wybrany tryb produkcyjny musi być znany przed budową widoków porównawczych.
6. **Brak testów:** każda zmiana adaptera wymaga testów regresyjnych (patrz IMPLEMENTATION_PLAN).
7. **Kod panelu `denem.pl/panel` nie był w audycie** — powłoka może go częściowo zastępować lub zależeć od niego.