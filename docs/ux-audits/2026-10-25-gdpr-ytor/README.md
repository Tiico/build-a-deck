# GDPR-ytorna: kontots och gästens väg (2026-10-25, #1280, #1281)

Del av #1269.
Besluten som ligger fast står i G6 i DESIGN-BESLUT: Deckster är ansvarig, ett raderat konto försvinner direkt och dess assets sopas efter 30 dygn, en gäst raderar själv med sin token eller via Kontakt, och en gäst utan konto maskas efter 12 månader.
Lagret är byggt (#1279), `/villkor#integritet` finns (#1272), och en maskad plats visar i dag platshållaren U+E000 som den är.

## Prototyp

`prototyper/index.html`, en fil med växlare för issue, variant, yta, bredd (dator, 375, 320), språk och vad en maskad plats heter.
Kör den över http: `python3 -m http.server 8791` i `prototyper/` och öppna `http://127.0.0.1:8791/`.

### #1280, kontot

- **A · Konto-kortet bär båda, frågan i remsan** (rekommenderas): utdraget som en fil direkt, och «Radera kontot…» med L9:s remsa som namnger varje spel; spel med medredigerare tas bort.
- **B · En egen sida, ett beslut per spel**: «Ladda ner allt» med spelen inuti, och /profile/radera i tre steg där varje delat spel kan lämnas till en medredigerare.
- **C · Utdraget på sidan, raderingen via mejl**: «Det Deckster har om dig» som läsbar lista, och en dialog som skickar en raderingslänk; delade spel går till den som varit medredigerare längst.

### #1281, gästen

- **A · Under tacket, remsan på plats**: bara efter enkäten; andra ser «Borttagen gäst».
- **B · I Mer, hela tiden**: en rad i Mer och under tacket; hon sitter kvar under «Plats B».
- **C · Där man lämnar** (rekommenderas): Lämna-arket får «Lämna och ta bort mitt namn», tacket får samma rad som A; andra ser «Utan namn».

Skärmdumparna ligger i `bilder/`.

Beslut: _väntar på beställaren_.
