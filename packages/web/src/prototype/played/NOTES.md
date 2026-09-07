# PROTOTYP — bord du spelat vid, på startsidan (G1)

Fråga: var bor de bord en gäst suttit vid när de sparats till ett konto, bredvid de egna spelen, och hur ser ögonblicket ut när ett bord just sparats?

Kör: `pnpm proto` → http://localhost:5173/prototype/played?variant=A

Ingen server. Tillståndsraden växlar mellan "kom just från claim-länken" och vanligt besök, och mellan ett konto med egna spel och en ren gäst.

- **A — Två rutnät.** Egna spel som i dag, sedan "Bord du spelat vid" som ett andra rutnät av kort: platsens färg, spelet, vems bord, ditt namn, utfall (enkät, flaggor, pågår) och en handling. Sparandet är en rad överst.
- **B — En tidslinje.** Inga rutnät: en lista över allt kontot gjort, senast först — spelat, ändrat, startat — med en handling per rad. Egna spel som chips överst. Sparandet är en rad i tidslinjen.
- **C — Två flikar och en banderoll.** "Mina spel" och "Spelat" som flikar; Spelat är en tabell. Sparandet är en banderoll ovanför flikarna som erbjuder enkäten direkt.

## Fynd under bygget (oavsett variant)

- Ett spelat bord har fler fakta än ett eget spel: vems bord, vilken plats, vilket namn, om enkäten är besvarad, om det pågår. Kortet i A blir tätt; raden i B och C rymmer det bättre.
- "Tillbaka till bordet" för ett pågående bord kräver att gästens token lever och att koden inte gått ut — det avgör om handlingen kan visas.
- En ren gäst utan egna spel är det vanligaste fallet: G1 säger att spelare inte skapar konton förrän de vill äga något. Variant A:s tomma "Mina spel" ovanför är då ett hinder; B och C bär det bättre.

## Svar

_(fylls i när en variant valts)_
