# PROTOTYP — räknare och privata zoner på telefonen (C4)

Fråga: var bor platsens räknare och dess privata yta på telefonen bredvid handremsan, och hur ändrar man en räknare eller spelar till och från ytan?

Kör: `pnpm proto` → http://localhost:5173/prototype/phone-more?variant=A

Motorn i webbläsaren. Setupen ger varje plats en yta "Framför mig" (area, synlig för ägaren) och tre räknare (Liv, Guld, Poäng) som komponenter av en egen typ `token.counter` (B2) i en räknarzon. Du är Ada; Bo spelar då och då och tappar liv.

- **A — Staplat.** Räknare som en rad piller under huvudet, bordsöversikten som förut, "Framför dig" som en mindre remsa ovanför handen. Allt på en skärm.
- **B — Flikar.** Hand · Framför dig · Räknare som flikar nederst; varje flik får hela mitten; räknarna som stora rattar.
- **C — Räknarna i huvudet, ytan som bricka.** Räknarna som chips i huvudet (tryck +1, håll −1), mitten är din bricka med korten framför dig som en solfjäder, handen nederst.

## Fynd under bygget (oavsett variant)

- En räknare är en komponent med `counter` i en egen typ; `setCounter` finns redan i vokabuläret. Ingen protokolländring behövs, men typen är ny och saknar textur, så bordet måste rita den som en bricka med värdet.
- Räknarzonen bör vara publik (alla ser Bos liv) medan "Framför mig" är ägarens. Det gör att räknare och privata zoner är två olika saker, inte en.
- Ett kort framför dig kan vändas, tas upp i handen eller spelas vidare; arket från handen fungerar oförändrat eftersom ytan är en zon med genväg.
- `targetsOf` erbjuder i dag andra platsers privata ytor som mål ("Framför Bo") och räknarzoner som "3 kort": arket och översikten måste lära sig ägare och komponenttyp, oavsett variant.
- Wizarden måste lägga till ytan och räknarna per plats för att de ska finnas i ett spel; editorns flik "Bord" kan sedan namnge dem.

## Svar

_(fylls i när en variant valts)_
