# PROTOTYP — helt online: båda rollerna i ett fönster (C2)

Fråga: var bor min hand bredvid bordet när jag spelar på distans, och hur spelar jag ett kort ur den?

Kör: `pnpm proto` → http://localhost:5173/prototype/online?variant=A

Du är Ada på distans. Bordet är den riktiga renderaren (spelbart som på TV:n), din hand visas som baksidor på bordet och ritas i stället i varianten. Bo spelar då och då.

- **A — Telefonens remsa under bordet.** Bordet ovan, handen som telefonens remsa (K4) under, kontroller till höger i remsan. Dra ett kort upp på bordet.
- **B — Handen utfläktad på filten.** Handen som en solfjäder vid din kant ovanpå bordet; håll musen över för att läsa; dra rakt upp. Bordsläge (perspektiv) gör kanten till din.
- **C — Bordet + handen som kolumn.** Bordet till vänster, en sidopanel med handen som läsbara kort, aktivitetsflödet och kontrollerna (ångra, flagga, avsluta). Dra ett kort in på bordet.

## Fynd under bygget (oavsett variant)

- Att spela ur handen är `move` till zonen under pekaren plus `flip` om zonen är publik (K11), samma som telefonens ark; dragningen behöver bara bordets skala och rektangel.
- Orientering: i bordsläge ska bordet vridas så att min plats hamnar nederst (C5); renderaren saknar ett `rotate`-val. Andras kort blir då uppochnedvända, som vid ett riktigt bord.
- Renderaren fläktar redan synliga händer (observatören), men utan dragbara kort. Den vinnande handytan blir en komponent runt renderaren, inte i den.
- Vid TV-läge hemma finns ingen anledning att någon kör den här vyn; den är distansläget, och en hybrid (någon på distans) fungerar utan specialkod (C2).

## Svar

_(fylls i när en variant valts)_
