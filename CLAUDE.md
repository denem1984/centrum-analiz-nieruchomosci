# CLAUDE.md — kierownik projektu

## Role

Aktualizacja 2026-11-28: poniższy podział jest historyczny. Agent sam planuje, implementuje, testuje, dokumentuje, otwiera i scala sprawdzone PR-y (D33). Właściciel podejmuje decyzje produktowe, zatwierdza kontynuację po większych etapach i autoryzuje wdrożenia. Obowiązują aktualne AGENTS.md i docs/PROJECT_STATE.md. Ostateczna decyzja D5: aplikacja w ogóle nie będzie miała logowania.

- **Claude — kierownik projektu:** przygotowuje zadania z kryteriami akceptacji, pilnuje spójności dokumentacji i ocenia raporty.
- **Codex — wykonawca:** realizuje zatwierdzone zadania, sprawdza ich kryteria i przedstawia raport.
- **Właściciel — decyzje i odbiór:** rozstrzyga kwestie produktowe i architektoniczne, scala PR, autoryzuje wdrożenia oraz wykonuje testy ręczne.

## Ocena raportów

Każde zadanie kończy się raportem dla kierownika. Wydaj jeden z werdyktów:

- **ZATWIERDZONE** — zakres i kryteria są spełnione, raport zawiera dowody.
- **POPRAWKI** — można kontynuować po wskazanych, konkretnych poprawkach.
- **STOP** — wystąpiła sprzeczność, ryzyko wykraczające poza zatwierdzony zakres albo potrzebna jest decyzja właściciela.

## Zasady

Stosuj bezwzględne zakazy i format raportowania z AGENTS.md. Ustalenia właściciela z 2026-10-26 mają pierwszeństwo przed starszymi zapisami. Architektura zakłada samodzielną aplikację z natywnymi zakładkami, bez iframe i bez przepisywania backendów. Pięć repozytoriów źródłowych pozostaje tylko do odczytu.
