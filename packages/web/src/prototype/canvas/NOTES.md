# PROTOTYP — redigera mallen på duken (L3)

Fråga: hur lägger designern till element och flyttar dem med mus och piltangenter, som i ett bildprogram?

Kör: `pnpm --filter @byd/web dev` → http://localhost:5175/prototype/canvas?variant=A

Rutorna står för element; positioner är millimeter på ett 63 × 88-kort, 6 px per mm.
Alla varianter delar samma kärna: dra för att flytta, piltangenter 0,5 mm (shift 5 mm), Delete tar bort, egenskaper med x/y/w/h.

- **A — Verktygsrad till vänster, handtag, hjälplinjer.** Fyra verktyg (text, bild, ikoner, form) lägger till ett element mitt på kortet. Markeringen får hörnhandtag; hörnet nere till höger ändrar storlek. Magentafärgade hjälplinjer snäpper mot andra elements kanter och kortets mitt. En etikett visar position och storlek medan man drar.
- **B — "+ Element"-meny, dra fritt.** En meny i stället för verktygsrad, inga handtag; storlek via fälten. Renast, men storleksändring kräver siffror.
- **C — Rutnät 1 mm med snäpp, lagerpanel som dras.** Allt snäpper till rutnätet; lagerordningen ändras genom att dra rader i panelen i stället för pilknappar.

## Fynd under bygget

- Pointer capture på elementet räcker; ingen global mus-hanterare behövs. `touch-action: none` krävs för pekplatta.
- Hjälplinjer mot kanter och mitten gör mer för precisionen än ett rutnät, och kostar inget för den som inte vill ha dem. Rutnätet i C känns tryggt men gör 0,5-mm-justeringar omöjliga utan tangentbord.
- Piltangenterna måste ignoreras när fokus ligger i ett inmatningsfält.
- Lagerordning genom att dra (C) är bättre än pilknappar (A) — ta med det i A.

## Rekommendation

A, med C:s dragbara lagerpanel. Rutnät som valfritt lager, av som standard.

## Svar

_(fylls i när Nicklas valt)_
