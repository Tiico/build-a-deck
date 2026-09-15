# UX-prototyper, 14–15 september 2026

Engångsprototyper för två frågor:

1. Hur binder editorn ihop kortarbete, speltest och lärdomar när funktionerna blivit fler?
2. Hur hjälper telefonen spelaren att läsa och spela sina kort utan att verktyg och tomma ytor tar över?

## Kör och jämför

Kör `pnpm prototype` från repots rot. Öppna de två länkarna i terminalen. Editorinloggning: `prototype@example.com`; lokalt auth-bypass, inga mejl. Portar: webb 5317, tjänst 8317. Ctrl+C stänger miljön. Minnesdata försvinner vid omstart och telefonlänken byts.

På befintliga `/editor` och `/play` väljer `?variant=A|B|C` variant. Flytande pilar och vänster/höger på tangentbordet växlar utan att tappa lokalt tillstånd. Återställ börjar om; Original återgår till befintlig produktvy. Variantkoden laddas bara med `import.meta.env.DEV`.

| Variant | Editor | Telefon |
| --- | --- | --- |
| A | Steg: Kort, Förbered, Speltest, Lärdomar | Handen först, direkta handlingar |
| B | Kortbibliotek, kortarbete och test sida vid sida | Ett stort kort i taget |
| C | Projektets hem utgår från nästa speltest och lärdomar | Separata vyer för hand och namngivna bordsplatser |

## Vad som är riktigt respektive simulerat

Startkommandot använder tjänstens riktiga server, spelmotor och kortbildsrenderare med minneslagring och syntetiska data från `spelkortDoc`. Projekt och spelarens ursprungliga synliga kort läses genom de vanliga klienterna. Prototypens handlingar stannar sedan i lokal React-state. Feedback, regler och testförlopp är uttryckligen exempel. Ett simulerat drag kopierar ett redan känt kort och avslöjar ingen dold kortlek. Byt inte ut detta mot servermutationer som del av designjämförelsen.

## Preliminärt svar

**Editor A + telefon A rekommenderas.** Arbetsstegen ger återkopplingen en tydlig plats utan att göra kortredigering sekundär. Handen först minskar telefonens väg till den vanligaste handlingen. Editor B passar snabb parallell redigering men är tätare; C är bättre som utgångspunkt för återkommande testkvällar. Telefon B gör textkort lättlästa men försämrar överblick; C gör platser tydliga men ökar antalet vybyten.

**Användarens designval: ännu inte gjort.** Jämför särskilt vägen från avslutat spel till nästa ändring samt tiden att hitta, läsa och spela ett kort. Prototyperna är underlag för detta val, inte en ny färdig produktdesign.

Manuellt provklickade varianter och testbegränsningar finns i [speltestrapporten](../../../../docs/ux-audits/2026-09-14.md). Produktionsfixarna för kortbilder är separata från prototypen och har regressionstest.

## Efter designval

Behåll beslutet i projektets designbeslut, implementera den valda interaktionen med vanliga tester och riktiga data, och ta sedan bort dessa prototypmappar, DEV-importerna i EditorPage/PlayerPage, `packages/server/scripts/prototype/run.ts` och rotens `prototype`-kommando. Absorbera inte simuleringarna i produktionsflödet.
