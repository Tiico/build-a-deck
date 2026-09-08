# PROTOTYP — projektets historia (B4)

Fråga: hur möter designern sex dagars egna ändringar utan att lära sig git?

Kör: `pnpm proto` → http://localhost:5173/prototype/history?variant=A

Alla varianter läser samma sex versioner och samma diff ur den riktiga koden, och ritar korten med den riktiga kompilatorn. Historien innehåller vanligt arbete: kort tillagda, en kostnad balanserad, ett kort borttaget, leken omordnad och mallen ändrad. Två versioner är namngivna.

- **A — En lista med versioner.** Nyast först, med datum, namn på dem som fått ett, och en rad om vad de ändrade. Vald version visar sin lek med det ändrade inramat.
- **B — Skillnaden i korttabellen.** Två versioner väljs; tabellen visar det gamla överstruket bredvid det nya, tillagda och borttagna rader tonade.
- **C — En remsa att dra i.** Ingen lista: varje version är ett stopp på en remsa, de namngivna som nålar. Att dra handtaget flyttar hela leken bakåt genom sin historia.

## Fynd under bygget

- Nästan varje version ändrar bara en handfull fält. En diff behöver inte visa hela leken, bara det som rörde sig.
- Mall, uppställning och symboler går inte att visa som rader; de måste sägas i ord och ses på korten.
- Omordning av leken är en egen sorts ändring: inget kort ändrades, men draghögens ordning gjorde det.
- Datum säger mer än revisionsnummer. "Första blindtestet" säger mest av allt, och det är hela poängen med namngivna milstolpar.

## Svar

_(fylls i när en variant valts)_
