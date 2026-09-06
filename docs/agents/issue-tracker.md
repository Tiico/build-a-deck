# Issue tracker

Projektets implementationstickets och PRD:er publiceras i GitHub Issues i
`Tiico/build-a-deck`.

## Verktyg

- Läs och sök med `gh issue list` och `gh issue view`.
- Skapa med `gh issue create` först efter att issue-indelningen har godkänts.
- Ange beroenden uttryckligen i issue-texten; publicera blockerare före de
  tickets som beror på dem.
- Bifoga eller länka reproducerbara skärmbilder för visuella UX-fynd. Ange vy,
  viewport och datum och undvik verkliga användaruppgifter.

## Issueformat

Varje ticket ska vara en självständigt greppbar vertikal skiva och innehålla:

- användarberättelse och observerbart utfall,
- berörda vyer och tillstånd,
- acceptanskriterier och verifiering,
- `Blocked by` när ett verkligt beroende finns,
- `HITL` när design/prototyp eller mänskligt beslut krävs, annars `AFK`,
- relevanta beslutskällor och skärmbilder.

Ändra eller stäng inte ett överordnat issue automatiskt.
