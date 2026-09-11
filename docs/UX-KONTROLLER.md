# Löpande UX-kontroller

Det här är projektets återkommande arbetssätt för UX-kontroller. Målet är att
varje användarflöde ska granskas i sitt verkliga sammanhang och att varje fynd
antingen får en verifierad, liten fix eller en självständigt greppbar ticket.

## När kontrollen görs

Gör en full kontroll före release och efter en fas som lägger till eller ändrar
en användaryta. Gör en riktad kontroll efter mindre UI-ändringar. Lägg till nya
vyer och tillstånd i inventeringen samma dag som de införs.

## Förberedelse

1. Läs `CLAUDE.md` och relevanta beslut i `DESIGN-BESLUT.md`, `TUNN-SKIVA.md`,
   `DRIFT.md` och `ROADMAP.md`.
2. Starta tjänsten lokalt med syntetiska projekt, sessioner och deltagare. Använd
   inte verkliga konton eller personuppgifter i bevismaterial.
3. Inventera samtliga rutter, komponentfamiljer och användarroller. För varje
   flöde ingår grundläge, laddning, tomt läge, fel, frånkoppling/återanslutning,
   bekräftelse och slutfört läge när de är relevanta.

## Kontrollmatris

Bredderna en yta granskas i följer vem som håller ytan (DESIGN-BESLUT L12):

- **Spelarens ytor** — `/play`, `/online`, `/join`, observatören — granskas i 390,
  768 och 1280, och kritiska mobilflöden även vid 320 px. Telefonen i playtestet
  hålls i en hand och måste vara utmärkt på en liten skärm.
- **Editorn** — `/editor`, `/new`, kortväggen, duken, tabellen, wizarden —
  granskas i 1280 och 1024, och därutöver i 768 bara för att slå fast att inget
  går sönder eller tappar arbete. Den är skrivbordsförst och ska degradera, inte
  garantera, under skrivbordsbredd. Ett fynd som bara gäller editorn vid 390
  eller 320 är inte ett fynd.
- **Bordets skärm** — `/table` — är en TV och har sina egna mått (K9, C5).

Allt annat nedan gäller **varje** yta oavsett bredd. Tillgänglighet är inte
mobilstöd: tangentbord, fokus, läsordning, namn, roller, kontrast, träffytor och
`prefers-reduced-motion` gäller editorn fullt ut. Kontrollera:

- visuell hierarki, begriplig text, konsekvens och innehåll som inte överlappar,
- komplett mus-, touch- och tangentbordsinteraktion samt synlig fokusmarkering,
- semantiska namn, roller, tillstånd, läsordning och dynamiska meddelanden,
- kontrast, textskalning, träffytor och `prefers-reduced-motion`,
- validering, väntelägen, felåterhämtning och skydd mot dataförlust,
- verklig återkoppling från nätverk, renderare och andra långsamma beroenden.

Skärmbilder tas för varje avvikelse och namnges med datum, vy, viewport och ett
kort fynd-ID. Reproduktion, förväntat resultat och beslutskälla ska följa bilden.

## Beslut: direkt fix eller issue

En ändring får göras direkt bara när den är liten, uppenbar, inte ändrar ett
visuellt koncept eller domänbeslut och kan bevisas med ett fokuserat test. Även
då följs TDD: rött test, minsta gröna ändring, refaktorering och därefter
`pnpm typecheck`, `pnpm test` och `pnpm lint`. Committen ska vara atomär.

Alla andra fynd behandlas med `to-issues`:

1. Dela upp arbetet i tunna vertikala skivor med användarberättelser.
2. Märk visuella eller beslutskrävande skivor `HITL`; de ska prototypas enligt
   projektets riktlinjer innan implementation. Märk entydiga skivor `AFK`.
3. Redovisa titel, typ, beroenden och berättelser för beställaren och få
   granulariteten godkänd innan publicering.
4. Publicera blockerare först i GitHub Issues. Bifoga skärmbilder, viewport,
   reproduktion, acceptanskriterier, testkrav och relevanta beslutslänkar.

## Klar-kriterium

Kontrollen är klar när inventeringen täcker alla kända ytor och kritiska
tillstånd, varje fynd har en disposition (direkt commit eller godkänt issue),
skärmbilder är kopplade till större visuella fynd och hela kvalitetsgrinden är
grön. Resultatet sparas under `docs/ux-audits/YYYY-MM-DD.md`.
