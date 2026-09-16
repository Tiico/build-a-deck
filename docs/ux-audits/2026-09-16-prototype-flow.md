# Prototypiteration: ett sammanhängande speltest

Iteration 15–16 september efter återkopplingen att prototyperna var nära men svåra att följa naturligt. Telefon **A, Handen först**, är vald av användaren, med kravet att kunna kasta ett kort direkt från **Framför mig**. Editorvalet är fortfarande öppet.

## Vad som ändrats

- Editorn börjar med korten. Varje steg har en synlig nästa handling: kort → förberedelse → pågående speltest → lärdomar.
- **Prova som Ada** öppnar den valda telefonvyn i samma flik. Tillbaka till testledaren och tillbaka till handen bevarar kort och provhandlingar.
- Telefonen har **Läs valt kort** och en väg från avslutat provspel till feedback. Bakåt behåller svaren.
- Spelarens egna flaggor och svar visas i lärdomarna. Flaggor följer även med om testledaren avslutar utan enkät.
- **Ta med till nästa kortändring** visar observationen i nästa arbetssteg. Nästa speltest får en ny hand och tomma flaggor; föregående resultat ligger i historiken.
- Testets kortdata fryses vid start. En ändrad korttext kommer med i nästa lokala revision, inte mitt i ett pågående test.
- På varje kort i **Framför mig** finns nu **Ta upp** och **Kasta**. Kasta går direkt till kasthögen och lämnar handen orörd. Ångra återställer kortet till samma zon.
- Telefonalternativen B/C har tagits bort efter valet av A. Editorns tre strukturer finns kvar att jämföra. Den tekniska tillståndsvyn är hopfälld från början.

## Prova

Kör `pnpm prototype`, öppna editorlänken och logga in med `prototype@example.com`. Följ nästa-handlingen från kortarbetet till **Prova som Ada**, spela ett kort framför dig och prova **Kasta** och **Ångra**. Välj sedan **Klar med testet · lämna feedback**, skriv ett svar och ta med det till nästa kortändring.

Den fristående telefonlänken fungerar också. Båda spelarytorna använder samma prototypkomponent. Alla provhandlingar och svar stannar i minnet; inga produktionsmutationer har införts. Spelarvyn i editorn använder ett lokalt exempel från projektets kortdata och den befintliga kortkompilatorn, inte en ny serveranslutning. Regeltexten är fortfarande ett märkt exempel. Se [prototypanteckningarna](../../packages/web/src/prototype/NOTES.md).

## Manuell verifiering

| Förlopp | Resultat |
| --- | --- |
| Ändra kort → förbered → starta → spela | Ändrad text synlig på spelarens kort |
| Spela framför mig → testledare → tillbaka | Hand och kort framför spelaren bevaras |
| Flagga → feedback → bakåt → feedback igen | Flagga, betyg och text bevaras |
| Skicka svar → lärdom → nästa kortändring → nytt test | Observationen följer med, ny hand och ny revision |
| Avsluta från testledaren utan enkät | Spelarens flagga finns kvar i resultatet |
| Kasta från Framför mig | Zonen går 1 → 0, kasthögen 0 → 1, handen stannar på fyra kort |
| Ångra kastet | Zonen går 0 → 1, kasthögen 1 → 0, handen oförändrad |
| Telefon vid 320 px | Inget sidöverflöde; Ta upp/Kasta mäter 146 × 44 px |

Editorns A/B/C provades genom samma förlopp under iterationen. Efter telefonvalet använder samtliga editoralternativ telefon A.

Skärmbilder: [Kort](2026-09-15/01-kort-A.png), [förberedelse](2026-09-15/02-forbered-A.png), [pågående test](2026-09-15/03-speltest-A.png), [Kasta från Framför mig](2026-09-16/phone-A-discard-private-390.png), [spelarens svar i lärdomarna](2026-09-16/flow-feedback-to-review.png).

## Kvalitetskontroller mot senaste main

- `pnpm typecheck` och `pnpm lint`: godkända.
- `pnpm test`: 2 640 godkända tester, 15 databasberoende tester överhoppade utan `DATABASE_URL`.
- `pnpm --filter @byd/web build`: godkänt. Prototypmarkörer, texter och stilar återfinns inte i byggda assets.
- Prototypens lokala interaktioner verifieras genom de manuella förloppen ovan; produktionens testsuite ersätter inte dessa kontroller.

Produktionsbygget ska fortsatt utesluta prototypkoden. Prototypen är ett designunderlag; valet av telefon A är dokumenterat, medan riktig produktimplementation och editorval återstår.
