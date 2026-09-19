# Engångsprototyp #270 — uppställningen i spelarnas bok

Fråga: hur ryms samma zonbild som editorn visar i telefonen, den smala luckan och TV-vyn?
Beslutet att bilden ska visas finns redan i #270. Formen väntar på beställarens val.

Kör `pnpm prototype:setup`. Öppna:

- http://localhost:5417/play?setupPrototype&lang=sv&variant=A — telefon
- http://localhost:5417/online?setupPrototype&lang=sv&variant=A — regellucka
- http://localhost:5417/table?setupPrototype&lang=sv&variant=A — TV

Pilarna väljer A/B/C. Växla till 45 zoner för att prova åtta platser och långa zonnamn.
Variant, yta och antal följer URL:en. Inga konton, serveranslutningar eller sparade data.
Den riktiga RuleShelf används med sin sökning, typografi, stängning och rullning. Bok och
zoner är syntetiska. Bordet bakom boken är endast ett sammanhang, inget spelbart bord.
Prototypverktygen reserverar 146 px på telefon och 120 px på större skärmar; mätt läsyta är
alltså mindre än produktionsytan. Bildhöjden påverkas inte av denna reservation.

A: hela zonbilden direkt i textflödet.
B: en skalad översikt plus separat läsvy med alla zoner, stängning och Escape.
C: bilden är infälld tills läsaren öppnar den i samma textflöde.

Översikten i B är en orientering, inte läsbar text vid 45 zoner. Läsvyn bär hela innehållet.
Inga koordinater, spelregler eller dold information härleds ur zonernas namn.
Den befintliga editorbilden är en följd av namnrutor, inte en geografisk bordskarta.

## När formen väljs

Ta bort denna mapp, DEV-grenen i App och `prototype:setup`. Implementera med TDD:
extrahera editorns befintliga uppställningsrenderare till en delad komponent, och förse
spelarnas bok med zonuppgifter från sessionens låsta version. Dagens RenderedRules.setup
bär bara en bildtext — fixturelistan här är inte en lösning på transporten. Läs aldrig in
ett senare editorutkast som underlag för ett pågående bords bok. Kontrollera att enbart
zonmetadata, aldrig privata kort eller spelartillstånd, hamnar i regelbokssvaret.

Portalen och kopian av editorbildens CSS är uttryckligen engångskod för jämförelsen;
de ska inte bli en andra produktionsrenderare. Prototypen är DEV-laddad och saknas i bygget.
