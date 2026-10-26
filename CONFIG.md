# CONFIG.md — inwentaryzacja konfiguracji produkcyjnej

Status: szablon. Uzupełniać podczas E0, wyłącznie na podstawie odczytu.

**Nie wpisywać wartości sekretów, haseł, tokenów ani kluczy API.** Dla zmiennych środowiskowych zapisywać tylko nazwę oraz status: ustawiona / nieustawiona.

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

| Moduł | Nazwa zmiennej | Status ustawienia | Uwagi bez sekretów |
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

Dopisz inne wykryte zmienne, ale tylko ich nazwy i status.

## Wyniki E0
- D1 — potwierdzone źródło RCN i źródło potwierdzenia:
- D2 — lokalizacja słownika SIMC i sposób udostępniania:
- D3 — repozytorium panelu i rekomendacja miejsca powłoki:
- D4 — wyniki kontroli nagłówków bezpieczeństwa:
- Supabase — kolumny tabeli `gus_bdl_commune_wide`:
- Mapowanie BDL ↔ TERYT:
- Otwarte kwestie:
- Zatwierdzenie przejścia do E1:
