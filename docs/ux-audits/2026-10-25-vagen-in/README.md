# Vägen in: två behov, inga genvägar (2026-10-25)

Beställaren: «Vägen in till ett bord har fortfarande för många olika varianter. Jag tror vi bara har behovet av dator till dator eller på en gemensam tv + dator eller mobil. Genvägar där designern hoppar in skapar mer förvirring än vinning.»

## Inventering (i koden, main `05a887cb`)

- Frågan «Hur sitter ni?» (L77) ställs bara av editorns Starta.
  Mina spel «Starta bord», pilmenyns «Nytt bord» och Bord-flikens «Starta nytt bord» startar utan att fråga och öppnar ingenting.
- Fyra genvägar där designern hoppar in själv: «Spela härifrån» (plats som «Designern», utan fråga), Bordsläge, Titta på och QR-panelen, i både pilmenyn och varje rad på Bord-fliken.
- Varje «Öppna bordet» för ägaren öppnar TV-vyn, också för ett bord som startades för varsin dator.
- Anslutningssidan har tre knappar på telefonen och «Gå med» plus två länkar på datorn; en gäst med dator vid TV:n får hela bordet en gång till.
- Värden vid ett TV-bord har ingen väg till sin egen hand utom «Spela härifrån», som ger ett andra bord.

## Prototyp

`prototyper/index.html`, fyra varianter × två sätt att sitta, med en karta över alla vägar in och vad som händer med dem.

- **A · En fråga, överallt**: varje start ställer L77:s fråga; genvägarna går ur editorn; ett bord har «Öppna bordet», «Kopiera länk» och «Avsluta»; värden går med via QR:n som alla andra.
- **B · Bordet minns hur ni sitter** (rekommenderas): som A, och svaret följer med bordet, så anslutningssidan har ett enda «Gå med» på varje skärm — bordet och handen vid ett datorbord, handen (telefon eller dator) vid ett TV-bord. Rör C2.
- **C · Ingen fråga, skärmen bestämmer**: Starta öppnar en hall i bordets flik med «Sätt dig här» och «Gör den här skärmen till bordet»; gästens vy beror på om en TV är ansluten.

Beslut: _väntar på beställaren_.
