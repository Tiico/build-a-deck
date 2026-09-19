# Engångsprototyp #270 — uppställningen i spelarnas bok

Fråga: hur ryms samma zonbild som editorn visar i telefonen, den smala luckan och TV-vyn?
Beslutet att bilden ska visas finns redan i #270. Beställaren valde C, men bedömde själva uppställningen som stökig. Innehållet har därför itererats; den nya grupperingen är fortfarande ett designunderlag.

Kör `pnpm prototype:setup`. Öppna:

- http://localhost:5417/play?setupPrototype&lang=sv&variant=C — telefon
- http://localhost:5417/online?setupPrototype&lang=sv&variant=C — regellucka
- http://localhost:5417/table?setupPrototype&lang=sv&variant=C — TV

C är nu enda alternativet. Växla till 45 zoner för att prova åtta platser och långa zonnamn.
Yta och antal följer URL:en. Inga konton, serveranslutningar eller sparade data.
Den riktiga RuleShelf används med sin sökning, typografi, stängning och rullning. Bok och
zoner är syntetiska. Bordet bakom boken är endast ett sammanhang, inget spelbart bord.
Prototypverktygen reserverar 146 px på telefon och 120 px på större skärmar; mätt läsyta är
alltså mindre än produktionsytan. Bildhöjden påverkas inte av denna reservation.

C behåller den utfällbara uppställningen i boken. Inuti kommer gemensamma zoner först,
sedan en vald spelarplats. Visa plats växlar mellan samtliga platser; namnen behålls i sin
helhet. Platsvalet bevaras när bilden fälls ihop och öppnas igen. Det återställs när man
byter demo-yta via en länk, eftersom detta är separata sidladdningar.

Rutornas dekorativa ramar är ersatta med lugna listor och rubriker. Alla ägarskap är
uttryckliga i fixturedata, aldrig härledda ur zonernas stavning. Det är en zonöversikt,
inte en geografisk bordskarta, och den gör inga antaganden om hur kort ska delas ut.

Mätt vid 320 px: 45 zoner går från 1190 px utfällt till 539 px genom att visa en plats
åt gången. Sex zoner tar 365 px, alltså mer än den gamla platta bilden: grupperingen
prioriterar begriplighet framför minsta höjd för det lilla exemplet.

## När formen väljs

Ta bort denna mapp, DEV-grenen i App och `prototype:setup`. Implementera med TDD:
extrahera editorns befintliga uppställningsrenderare till en delad komponent, och förse
spelarnas bok med zonuppgifter från sessionens låsta version. Dagens RenderedRules.setup
bär bara en bildtext — fixturelistan här är inte en lösning på transporten. Läs aldrig in
ett senare editorutkast som underlag för ett pågående bords bok. Kontrollera att enbart
zonmetadata, aldrig privata kort eller spelartillstånd, hamnar i regelbokssvaret.

Portalen och den lokala grupperingsvyn är uttryckligen engångskod för jämförelsen;
de ska inte bli en andra produktionsrenderare. Prototypen är DEV-laddad och saknas i bygget.
