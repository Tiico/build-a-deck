# PROTOTYP — regelboken i editorn (B7)

Fråga: hur skriver en designer regler som vet vilket spel de hör till?

Kör: `pnpm proto` → http://localhost:5173/prototype/rules?variant=A

Alla varianter redigerar samma dokument och renderar det med den riktiga renderaren. Knappen uppe till höger döper om kasthögen; varje regel som nämner den skrivs om, eftersom reglerna aldrig höll namnet.

- **A — Block till vänster, boken till höger.** Ett fält per block med sin egen sort. Referenser sätts in i det block som har fokus.
- **B — Ett fält, boken under.** Hela boken som en text i välkänd stenografi: `#` rubrik, `-` eller `1.` lista, `[[zon:draw]]` referens.
- **C — Boken själv är redigeraren.** Sidan är det man klickar i; ett stycke öppnas där det står och stängs när det lämnas.

## Fynd under bygget

- Referensen måste synas som en referens medan man skriver, annars vet man inte om namnet är levande eller avskrivet. I boken räcker en diskret understrykning.
- En referens till något spelet inte har får inte vara tom: den visas som det som skrevs, markerad, precis som en okänd ikon på ett kort (L2).
- Uppställningsbilden är zonerna själva (B5), inte en teckning bredvid dem. I prototypen är den grov men den kommer ur samma setup som bordet.
- Samma rendering ska till tre ställen: editorn, bordets referenspanel och det tryckta häftet. Renderaren returnerar block, inte HTML, just därför.

## Svar

_(fylls i när en variant valts)_
