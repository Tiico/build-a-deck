# PROTOTYP — reglerna vid bordet (B7)

Fråga: hur slår en spelare upp en regel mitt i spelet, på skärmen och på telefonen, utan designern i rummet?

Kör: `pnpm proto` → http://localhost:5173/prototype/rulepanel?variant=A

Alla varianter läser samma renderade regelbok som sessionen lämnar ut på `GET /sessions/:id/rules`, renderad mot den version bordet låstes till. Referenserna är redan namn, inte id.

- **A — En lucka från kanten.** En knapp i hörnet; boken dras in över bordet och går att bläddra i. Samma lucka på telefonen, över handen.
- **B — Boken ligger på bordet.** Regelboken är ett föremål i rummet: den tas upp, läses och läggs tillbaka. På telefonen en flik bredvid handen.
- **C — Fråga, få en regel.** Ingen bok att läsa: en fråga, och de stycken som svarar på den. Det spelet har erbjuds som färdiga frågor.

## Fynd under bygget

- Mitt i ett spel vill man ha en regel, inte en bok. C svarar på det men saknar överblicken någon som aldrig spelat behöver.
- Boken över bordet tar plats som bordet behöver; på telefonen är det tvärtom, där finns ingen konkurrens.
- Sökningen behöver bara den renderade texten, som renderaren redan lämnar ut rad för rad. Ingen extra modell krävs.
- En regel som inte finns är ett svar i sig: "ingen regel nämner det" är bättre än en tom lista.

## Svar

_(fylls i när en variant valts)_
