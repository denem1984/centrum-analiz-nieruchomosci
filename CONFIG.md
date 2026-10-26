# CONFIG.md — szablon konfiguracji bez sekretów

> **Repozytorium jest publiczne.** Wpisuj wyłącznie nazwy zmiennych i status ustawiona / nieustawiona / nieznany. Nigdy nie wpisuj wartości sekretów, tokenów, kluczy ani innych wartości konfiguracji. Jedyny wyjątek: niesekretna wartość trybu RCN_DATA_SOURCE, odczytana przez właściciela w M1.

**Status:** szablon do uzupełnienia po pomiarach M1. Nie zawiera wartości produkcyjnych.

## Metadane pomiaru

- Data:
- Osoba wykonująca:
- Zakres: odczyt
- Źródła i metoda:

## API i punkty wejścia

| Moduł | Adres API | Punkt wejścia / metoda | Źródło potwierdzenia |
|---|---|---|---|
| RCN | | | |
| Oferty | | | |
| Działki | | | |
| Podobne | | | |
| Gminy | | | |

## Zmienne środowiskowe — tylko nazwy i status

| Moduł | Nazwa zmiennej | Status | Uwagi bez wartości |
|---|---|---|---|
| RCN | RCN_DATA_SOURCE | | Wartość trybu jest niesekretna; właściciel odczytuje ją w M1. |
| RCN | DATA_SOURCE | | |
| RCN | RCN_ADMIN_TOKEN | | |
| Oferty | PORT | | |
| Działki | PORT | | |
| Podobne | PORT | | |
| Podobne | UPSTREAM_PRG | | |
| Podobne | UPSTREAM_WFS | | |

Dopisuj wyłącznie nazwy i statusy. Nie zapisuj adresów usług administracyjnych, identyfikatorów kont ani wartości konfiguracji.

## Wyniki M1

- CORS i OPTIONS z Authorization dla czterech API:
- Czas zimnego i ciepłego startu oraz metoda pomiaru:
- D1 — tryb RCN i źródło potwierdzenia:
- D2 — dostępność i pola TERYT/SIMC:
- D9 — mapowanie BDL ↔ TERYT:
- Oferty — potwierdzony punkt wejścia:
- RCN — odczyt kodu wywołań frontendowych:
- Otwarte kwestie i źródła: