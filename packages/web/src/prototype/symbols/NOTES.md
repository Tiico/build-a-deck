# PROTOTYP — symbolbiblioteket (E4)

Fråga: var hittar designern en symbol, och hur når den kortet?

Kör: `pnpm proto` → http://localhost:5173/prototype/symbols?variant=A

Gemensam modell: ett kurerat bibliotek av fritt licensierade symboler, platshållarramar och färgblock, var och en med sin licens. Att ta en symbol lägger den i projektets ikonuppsättning (namn → bild), som `{namn}` i korttext och ikonraden slår upp (L2). Licensen följer med symbolen, eftersom den ska hela vägen in i tryckunderlaget.

- **A — Bibliotekspanel.** En egen yta: sökfält, kategorier, rutnät. Uppsättningen står överst med licens per symbol och ett sätt att ta bort.
- **B — Vid klammern.** Inget bibliotek att öppna: `{` i korttexten öppnar sökningen där markören står, piltangenter väljer, Enter skriver `{namn}` och tar in symbolen.
- **C — Dra till kortet.** En bricka under korten; symbolen dras dit den ska sitta och hamnar i kortets ikonrad. Inget skrivs och inget namnges.

## Fynd under bygget

- Ikonuppsättningen finns redan i dokumentet och kompilatorn, men inget fyller den i dag; det är hela glappet E4 stänger.
- Licensen är ett fält per symbol, inte per projekt: den måste bäras med assetet för att kunna hamna i tryckunderlaget.
- Symbolerna bör bli assets som allt annat (`/assets/<hash>`, E1) när de tas in, annars är projektets utseende beroende av att biblioteket aldrig ändras.
- Platshållarramar och färgblock hör till samma bibliotek men vill hamna på bildytan, inte i en ikonrad: bara C har någonstans att släppa dem.

## Svar

_(fylls i när en variant valts)_
