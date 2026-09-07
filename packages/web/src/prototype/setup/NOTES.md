# PROTOTYP — setup-editorn (B5, K2)

Fråga: hur lägger en designer upp bordet — zoner, platser, händer, högar, räknare — och ser vad spelarna får?

Kör: `pnpm proto` → http://localhost:5173/prototype/setup?variant=A

Alla varianter redigerar samma setup och visar den på den riktiga bordsrenderaren, som skärmen skulle visa bordet innan någon satt sig: tjugo kort i draghögen och varje plats räknare.

- **A — Lista med mått, bordet bredvid.** Varje zon är en rad: slag, namn, ägare, synlighet och x/y/b/h i millimeter. Platser och räknare som små listor ovanför. Bordet ritas om vid varje tangenttryck.
- **B — Bordet är arbetsytan.** Zoner som handtag ovanpå renderaren: dra för att flytta, hörnet för att ändra storlek, klicka för att namnge i ett litet fönster. Inga siffror skrivs.
- **C — Recept.** Inga mått: antal spelare, vad varje plats har, vad bordet har gemensamt, räknarna. Geometrin följer av receptet, som i wizarden.

## Fynd under bygget (oavsett variant)

- Förhandsvisningen är gratis: `initialState` plus `project` i webbläsaren ger exakt bordet skärmen visar, och motorns validering säger direkt om setupen är ogiltig.
- Att byta antal spelare lägger ut händer, ytor och räknare på nytt. En setup som redigerats fritt (A, B) förlorar sina fria mått vid ett sådant byte, om inte händerna behandlas som receptets och resten behålls.
- Wizardens geometrifunktioner hör hemma i en delad modul som editorn kan återanvända; i dag ligger de i wizarden.
- Receptet (C) täcker allt wizarden gör och det mesta ett kortspel behöver; A och B täcker resten. Frågan är om ett läge räcker eller om receptet är startpunkt och bordet finjusteringen.

## Svar

_(fylls i när en variant valts)_
