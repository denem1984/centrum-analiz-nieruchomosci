# E0_CHECKLIST.md — inwentaryzacja produkcji MEGA DENEM

**Cel:** zebrać informacje niewidoczne w repozytoriach i przygotować bezpieczny start implementacji.

**Zakres bezpieczeństwa:** tylko odczyt. Nie zmieniać ustawień, nie zapisywać formularzy, nie uruchamiać wdrożeń, nie odświeżać danych i nie wykonywać operacji administracyjnych.

## 1. Przygotowanie

- [ ] Otworzyć `AUDIT.md`, `IMPLEMENTATION_PLAN.md` i `DECISIONS.md`.
- [ ] Utworzyć `CONFIG.md` na podstawie szablonu poniżej.
- [ ] Ustalić dokładne produkcyjne adresy pięciu modułów i panelu.
- [ ] Zapisać datę kontroli i osobę wykonującą sprawdzenie.

## 2. Hosting — osobno dla każdej usługi

Sprawdź panel hostingu dla RCN, Ofert, Działek, Rozkładu oraz hostingu statycznego Gmin (jeśli jest zarządzany osobno).

Dla każdej usługi:
- [ ] Potwierdzić dostawcę i nazwę usługi.
- [ ] Zapisać domenę produkcyjną.
- [ ] Zapisać plan, region i informację o ewentualnym usypianiu/zimnym starcie.
- [ ] Zapisać komendę build i start.
- [ ] Wypisać wyłącznie nazwy zmiennych środowiskowych i oznaczyć `ustawiona` / `nieustawiona`. **Nie kopiować wartości.**
- [ ] Zaznaczyć, czy usługa korzysta z R2, Supabase lub innych usług zewnętrznych.
- [ ] Nie naciskać Deploy, Restart, Clear cache, Refresh ani podobnych przycisków.

## 3. D1 — potwierdzenie źródła RCN

Wstępna decyzja: Parquet z Cloudflare R2.

- [ ] Odczytać status przez `GET /api/data_source_status` na produkcyjnej usłudze RCN, jeśli endpoint jest dostępny i bezpieczny do odczytu.
- [ ] Odczytać w panelu hostingu status zmiennych `RCN_DATA_SOURCE` i `DATA_SOURCE` (tylko ustawiona/nieustawiona; wartość sprawdzić lokalnie w panelu, ale nie kopiować jej do dokumentacji).
- [ ] Potwierdzić, czy skonfigurowane są wymagane zmienne R2: `R2_BUCKET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` — zapisać wyłącznie status obecności.
- [ ] Zanotować potwierdzony tryb działania oraz źródło potwierdzenia.
- [ ] Jeśli endpoint wymaga operacji odświeżania lub nie jest jednoznaczny, przerwać i nie uruchamiać operacji modyfikującej.

**Wynik D1:** `Parquet/R2 potwierdzone` / `WFS potwierdzone` / `nieustalone`.

## 4. D2 — SIMC jako wspólny słownik

Wstępna decyzja: wykorzystać istniejący słownik SIMC w RCN.

- [ ] Potwierdzić, gdzie w repozytorium i w uruchomionej usłudze znajduje się słownik SIMC.
- [ ] Sprawdzić, czy zawiera kody SIMC i TERYT oraz nazwy potrzebne do rozróżniania miejscowości o tej samej nazwie.
- [ ] Ustalić, jak słownik jest aktualizowany i czy aktualizacja może być uruchamiana automatycznie.
- [ ] Sprawdzić, czy inne moduły mogą pobrać słownik przez istniejące endpointy bez modyfikowania RCN.
- [ ] Zapisać braki, w szczególności dla gmin wieloosadniczych.

Nie uruchamiać endpointów odświeżania danych podczas E0.

## 5. D3 — kod panelu DENEM

- [ ] Zlokalizować repozytorium zawierające `denem.pl/panel` lub wskazać, że panel jest w innym repozytorium/hostingu.
- [ ] Jeśli panel jest w repozytorium, przejrzeć kod bramki dostępu, routingu aplikacji, logowania i uprawnień.
- [ ] Ustalić, jak panel przypisuje użytkownikowi dostęp do aplikacji (slugi).
- [ ] Ustalić, czy dodanie nowej pozycji MEGA wymaga zmiany panelu, czy można dodać osobną stronę.
- [ ] Zapisać rekomendację: `rozszerzyć panel` / `osobna strona` / `wymaga dalszej analizy`.

Nie zmieniać panelu ani uprawnień.

## 6. D4 — możliwość osadzania modułów

Dla każdego z pięciu produkcyjnych adresów oraz powłoki/panelu:

- [ ] Odczytać nagłówki odpowiedzi HTTP `X-Frame-Options` i `Content-Security-Policy`, zwłaszcza dyrektywę `frame-ancestors`.
- [ ] Zanotować wynik osobno dla każdego adresu.
- [ ] Jeśli nagłówki są nieobecne, nie zakładać automatycznie, że osadzanie jest bezpieczne lub będzie działać we wszystkich przeglądarkach.
- [ ] Sprawdzić, czy logowanie i bramka dostępu działają w kontekście osadzonej strony — wyłącznie przez bezpieczny test w przeglądarce, bez zmian produkcyjnych.
- [ ] Do czasu potwierdzenia przyjąć osobne karty jako wariant awaryjny.

**Wynik D4:** `ramki potwierdzone` / `osobne karty` / `nieustalone`.

## 7. Supabase — tylko odczyt

- [ ] Potwierdzić nazwę/projekt używany przez pięć aplikacji.
- [ ] Odczytać strukturę tabeli `gus_bdl_commune_wide` (nazwy kolumn, bez danych osobowych).
- [ ] Sprawdzić, czy dostępna jest kolumna lub tabela mapująca `unit_id` BDL na TERYT.
- [ ] Odczytać polityki RLS tabeli i zapisać jedynie ich sens oraz wynik kontroli.
- [ ] Nie zmieniać RLS, kluczy, użytkowników, ról ani uprawnień.

## 8. Macierz wyników

- [ ] D1 — źródło RCN: ______________________________
- [ ] D2 — słownik SIMC: _____________________________
- [ ] D3 — miejsce powłoki: __________________________
- [ ] D4 — osadzanie modułów: ________________________
- [ ] Hosting i konfiguracja zebrane: tak / nie
- [ ] Mapowanie BDL ↔ TERYT: potwierdzone / brak / nieustalone
- [ ] Kod panelu przejrzany: tak / nie
- [ ] Pozostałe blokery: ______________________________

## 9. Warunki zamknięcia E0

- [ ] Uzupełniono `CONFIG.md` bez sekretów.
- [ ] Uzupełniono `DECISIONS.md` o wyniki D1–D4 oraz mapowanie BDL ↔ TERYT.
- [ ] Każdy wynik ma wskazane źródło i datę sprawdzenia.
- [ ] Nie dokonano żadnych zmian w kodzie ani na produkcji.
- [ ] Właściciel projektu zatwierdził przejście do E1.

---

# Szablon CONFIG.md

## Metadane
- Data kontroli:
- Osoba wykonująca:
- Zakres: tylko odczyt

## Usługi

| Moduł | Dostawca/hosting | Nazwa usługi | Domena | Plan/region | Build/start |
|---|---|---|---|---|---|
| RCN | | | | | |
| Oferty | | | | | |
| Działki | | | | | |
| Rozkład | | | | | |
| Gminy | | | | | |
| Panel DENEM | | | | | |

## Zmienne środowiskowe — bez wartości

| Moduł | Nazwa zmiennej | Status ustawienia | Uwagi (bez sekretów) |
|---|---|---|---|
| RCN | `RCN_DATA_SOURCE` | | |
| RCN | `DATA_SOURCE` | | |
| RCN | `R2_BUCKET` | | |
| RCN | `R2_ENDPOINT` | | |
| RCN | `R2_ACCESS_KEY_ID` | | |
| RCN | `R2_SECRET_ACCESS_KEY` | | |
| RCN | `RCN_ADMIN_TOKEN` | | |
| RCN | `GEOAPIFY_API_KEY` | | |
| Oferty | `PORT` | | |
| Działki | `PORT` | | |
| Rozkład | `PORT` | | |
| Rozkład | `UPSTREAM_PRG` | | |
| Rozkład | `UPSTREAM_WFS` | | |

Dopisz inne wykryte zmienne, zapisując tylko ich nazwy i status.

## Wyniki E0

- RCN — potwierdzony tryb źródła:
- SIMC — lokalizacja i sposób udostępniania:
- Panel — repozytorium i sposób dodawania aplikacji:
- Ramki — wyniki kontroli nagłówków:
- Supabase — tabela `gus_bdl_commune_wide`, dostępne kolumny:
- Mapowanie BDL ↔ TERYT:
- Otwarte kwestie:
- Osoba zatwierdzająca przejście do E1: