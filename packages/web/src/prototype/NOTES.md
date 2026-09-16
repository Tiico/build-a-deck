# UX-prototyper, 14–16 september 2026

Engångsprototyper för två frågor:

1. Hur binder editorn ihop kortarbete, speltest och lärdomar när funktionerna blivit fler?
2. Hur hjälper telefonen spelaren att läsa och spela sina kort utan att verktyg och tomma ytor tar över?

## Kör och jämför

Kör `pnpm prototype` från repots rot. Börja med editorlänken i terminalen. Där går nu hela rundan att prova i samma flik; den fristående telefonlänken finns också kvar. Editorinloggning: `prototype@example.com`; lokalt auth-bypass, inga mejl. Portar: webb 5317, tjänst 8317. Ctrl+C stänger miljön. Minnesdata försvinner vid omstart och telefonlänken byts.

I editorn väljer `?variant=A|B|C` layout. Telefonen använder nu den valda A-designen, Handen först. Editorns flytande pilar och vänster/höger på tangentbordet växlar utan att tappa lokalt tillstånd. Återställ börjar om; Original återgår till befintlig produktvy. Variantkoden laddas bara med `import.meta.env.DEV`.

| Variant | Editor | Telefon |
| --- | --- | --- |
| A | Steg: Kort, Förbered, Speltest, Lärdomar | Handen först, direkta handlingar |
| B | Kortbibliotek, kortarbete och test sida vid sida | Handen först (A) |
| C | Projektets hem utgår från nästa speltest och lärdomar | Handen först (A) |

## Vad som är riktigt respektive simulerat

Startkommandot använder tjänstens riktiga server, spelmotor och kortbildsrenderare med minneslagring och syntetiska data från `spelkortDoc`. Projektet och den fristående telefonens ursprungliga synliga kort läses genom de vanliga klienterna. Spelarvyn inne i editorn får ett lokalt exempel med de fem första korttyperna från testets frysta kortdata; bilderna använder befintlig CardPreview och samma kortkompilator. Det är en demonstration av användarflödet, inte en simulerad serveranslutning eller en verklig blandning. Prototypens handlingar stannar sedan i lokal React-state. Regeltexten är ett märkt exempel. Feedbacken och flaggorna skriver du själv under provrundan; inga fiktiva enkätsvar visas som inskickade. Ett simulerat drag kopierar ett redan känt kort och avslöjar ingen dold kortlek. Byt inte ut detta mot servermutationer som del av designjämförelsen.

## Preliminärt svar

**Editor A + telefon A rekommenderas.** Arbetsstegen ger återkopplingen en tydlig plats utan att göra kortredigering sekundär. Handen först minskar telefonens väg till den vanligaste handlingen. Editor B passar snabb parallell redigering men är tätare; C är bättre som utgångspunkt för återkommande testkvällar. De tidigare telefonalternativen B/C har tagits bort efter användarens val; historiska skärmbilder finns i första rapporten.

**Användarens designval, 16 september: telefon A**, med kravet att kunna kasta direkt från Framför mig. Editorvalet är fortfarande öppet. Jämför särskilt vägen från avslutat spel till nästa ändring samt tiden att hitta, läsa och spela ett kort. Prototyperna är underlag för detta val, inte en ny färdig produktdesign.

Manuellt provklickade varianter och testbegränsningar finns i [speltestrapporten](../../../../docs/ux-audits/2026-09-14.md). Produktionsfixarna för kortbilder är separata från prototypen och har regressionstest.

## Iteration 2 · sammanhängande förlopp

Användarens återkoppling: alternativen är nära, men det är svårt att få ett naturligt flöde genom dem. Den andra iterationen behåller editorns A/B/C och prövar ett gemensamt förlopp med den valda telefonvyn A:

1. Läs eller justera ett kort. **Klart med korten · förbered test** tar dig vidare.
2. Skriv en testfråga och välj **Starta speltest**. Förberedelsen är skild från det pågående testet.
3. Välj **Prova som Ada**. Spelarvyn öppnas på samma route med testets kortversion.
4. Välj/läs/spela ett kort. **Till testledaren** och tillbaka bevarar handen. Flagga ett ögonblick om något är oklart.
5. Välj **Klar med testet · lämna feedback**. Sätt tydlighet och skriv en ändring. Du kan gå tillbaka utan att tappa svaren.
6. **Skicka svar · tillbaka till lärdomar** visar ditt svar och dina flaggor i editorn.
7. **Ta med till nästa kortändring** gör observationen synlig bredvid nästa kortarbete. Nästa test får nya flaggor och en ny hand; tidigare resultat finns i historiken.

Skillnader från första iterationen: alla layouter har tydliga arbetssteg och verkliga övergångar, framtida resultat visas inte innan testet avslutats, nästa test är ett eget test och den valda observationen följer faktiskt med till redigeringen. Telefonen har en läsvy och visar ytan framför spelaren när ett kort spelas dit. Varje kort i Framför mig har Ta upp och Kasta. Kasta flyttar direkt till kasthögen utan att ändra handen; Ångra återställer kortet till Framför mig. Även om testledaren avslutar utan enkät följer spelarens redan lämnade flaggor med.

Tillståndsdetaljerna är hopfällda från början; den aktuella fasen och testet syns i gränssnittet. Kortdata fryses vid teststart. Ändringar förs över till nästa lokala revision vid förberedelse, inte in i ett redan pågående test. Återställ nollställer även testfråga, urval, feedback och historik.

Designfrågan är nu om hela rundan känns naturlig, särskilt rollbytet och återkomsten med feedback. Detta är fortfarande ett designunderlag. Inga nya produktionsmutationer eller serverendpoints har tillkommit. Valet av A är dokumenterat här; riktig produktimplementation återstår efter denna prototypiteration.

## Efter designval

Behåll beslutet i projektets designbeslut, implementera den valda interaktionen med vanliga tester och riktiga data, och ta sedan bort dessa prototypmappar, DEV-importerna i EditorPage/PlayerPage, `packages/server/scripts/prototype/run.ts` och rotens `prototype`-kommando. Absorbera inte simuleringarna i produktionsflödet.
