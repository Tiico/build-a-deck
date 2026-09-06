# PROTOTYP — wizarden

Fråga: hur ser vägen från tom sida till spelbart projekt ut? (stegen är beslutade i L6)

Kör: `pnpm proto` → http://localhost:5173/prototype/wizard?variant=A

- **A — En fråga per sida.** Ett steg i taget med framsteg; fokus.
- **B — Allt på en sida, levande kort.** Formulär till vänster, kortet växer fram till höger.
- **C — Guidad editor.** Stegen som checklista i sidopanel; kortväggen växer; slutar i editorn.

Alla tre använder den riktiga `CardPreview` (kompilator + DOM-anpassning) och tre ramar ur ett galleri som binder fälten automatiskt.

## Svar (2026-09-06)

**B — allt på en sida med levande kort.**
Formuläret till vänster, kortet växer fram till höger medan man fyller i: fält blir rutor, ram blir utseende, rad blir kort.
Slutar med "Öppna bordet" och "Till editorn".
Wizarden är ett formulär som producerar exakt ett `ProjectDoc` — E3:s villkor.
