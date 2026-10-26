# MEGA_PROJECT.md — Centrum Analiz Nieruchomości, wersja 2

**Status:** architektura samodzielnej aplikacji przyjęta przez właściciela 2026-10-26.

## 1. Cel

Połączyć pięć istniejących modułów analiz nieruchomości w jednej aplikacji: Działki, RCN, Oferty, Podobne i Gminy. Użytkownik pracuje w natywnych zakładkach i może przenosić wspólny kontekst lokalizacji oraz nieruchomości między modułami.

## 2. Potwierdzone zasady architektury

- Aplikacja jest samodzielna i nie jest częścią portalu ani panelu denem.pl.
- Pięć repozytoriów źródłowych pozostaje tylko do odczytu.
- Moduły są natywnymi zakładkami nowej aplikacji.
- Zakładki wywołują istniejące backendy bezpośrednio przez API. Nie dodajemy pośredniej bramy API i nie przepisujemy backendów.
- Nie zakładamy osadzania modułów w iframe.
- Sposób logowania i dostępu właściciel rozstrzygnie przed M8. Do tego czasu aplikacja nie ma własnej bramki.
- DenemContext v1 pozostaje wspólnym kontraktem przekazywania kontekstu.

[FAKT z audytu kodu AUDIT.md; do potwierdzenia pomiarem w M1] Cztery backendy — RCN, Oferty, Działki i Podobne — deklarują CORS *. M1 sprawdzi wywołanie z obcego origin, w tym preflight OPTIONS z nagłówkiem Authorization. To ustalenie nie zastępuje pomiaru rzeczywistych odpowiedzi.

## 3. Odrzucony wariant

Wariant „powłoka w panelu denem.pl” ze wspólną bramką panelu został odrzucony, ponieważ właściciel zdecydował o samodzielnej aplikacji, poza portalem i panelem. Nie zmieniamy kodu denem.pl ani repozytorium denem1984/denem. Wariant iframe również nie jest przyjęty; wraca do rozważenia wyłącznie po nowej decyzji właściciela.

## 4. Schemat

    Przeglądarka
      Centrum Analiz Nieruchomości
        ├─ zakładka Działki  ── bezpośrednio do istniejącego API Działek
        ├─ zakładka RCN      ── bezpośrednio do istniejącego API RCN
        ├─ zakładka Oferty   ── bezpośrednio do istniejącego API Ofert
        ├─ zakładka Podobne  ── bezpośrednio do istniejącego API Podobnych
        └─ zakładka Gminy    ── istniejące źródło danych modułu Gminy

Adresy API, rzeczywiste zachowanie CORS i czasy odpowiedzi zostaną zapisane w CONFIG.md po pomiarach M1. W tej wersji nie powstaje nowy backend ani wspólna bramka.

## 5. DenemContext v1

Kontrakt v1 pozostaje bez zmian. Kontekst w URL jest kodowany w hash, aby nie trafiał do logów serwera; dużych geometrii nie przekazuje się wprost, tylko przez identyfikator.

    {
      "v": 1,
      "location": {
        "name": "...",
        "teryt7": "...",
        "simc": "...",
        "gminaTeryt7": "...",
        "powiatTeryt4": "...",
        "wojTeryt2": "...",
        "lat": 0,
        "lon": 0
      },
      "parcel": { "id": "...", "obreb": "...", "number": "...", "areaM2": 0 },
      "subject": { "type": "dzialka|dom|lokal|komercyjna", "areaM2": 0, "price": 0 },
      "area": { "mode": "miejscowosc|promien|polygon", "radiusM": 0 }
    }

TERYT/SIMC jest wspólnym kluczem wyszukiwania. D9 sprawdza osobno mapowanie BDL ↔ TERYT wymagane przez Gminy.

## 6. Moduły

- **Działki:** natywny widok mapy i warstw; pobiera dane z istniejącego API.
- **RCN:** natywny widok transakcji; pobiera dane z istniejącego API.
- **Oferty:** natywny widok ofert; pobiera dane z istniejącego API.
- **Podobne:** natywny widok nieruchomości porównawczych; pobiera dane z istniejącego API.
- **Gminy:** natywny widok porównywania gmin; integracja rusza po decyzji o dostępie przed M8.

Każdy moduł zachowuje funkcje swojego źródła. Zmiany w źródłach lub ich backendach są poza zakresem i wymagają osobnego polecenia właściciela.

## 7. Ryzyka do obsłużenia

1. **CORS i preflight:** [FAKT z audytu kodu AUDIT.md; do potwierdzenia pomiarem w M1] backendy deklarują CORS *. M1 zmierzy odpowiedzi z obcego origin, w tym OPTIONS z Authorization; wynik może ograniczyć bezpośrednią integrację.
2. **Dostępność API i czasy odpowiedzi:** [HIP] wpływ zimnego startu i różnic między pierwszym a kolejnym wywołaniem będzie mierzony w M1.
3. **Lokalizacja:** [HIP] mapowanie BDL ↔ TERYT nie jest jeszcze potwierdzone; D9 jest wymagane przed M8.
4. **Dostęp:** model logowania i dostępu pozostaje decyzją właściciela przed M8. Gminy nie rozpoczyna się przed jej podjęciem.
5. **Uruchamianie Ofert:** [FAKT: odczyt konfiguracji usługi przez kierownika 2026-10-26; do potwierdzenia w kodzie] usługa ma startować poleceniem `node server.js`; rozbieżność z opisem `npm start` w AUDIT.md wymaga sprawdzenia ścieżki startu w kodzie podczas M1.
6. **Widoki zbiorcze:** zgodność liczb między modułami i zakres raportu wymagają osobnej weryfikacji w M9; D10 pozostaje otwarte.
