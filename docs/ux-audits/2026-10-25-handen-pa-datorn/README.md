# Handen på datorn: vänd i stället för skicka (2026-10-25)

Beställaren: «Hanteringen av kort på handen på desktop är väldigt klumpig, man behöver inte kunna skicka korten direkt från handen. Det räcker med att man kan vända på kortet.»

## Idag

Handen på `/online` i ett liggande fönster är en kolumn vid fönstrets kant (K17, #77).
Musen över ett kort lyfter det bredvid kolumnen (#510).
Ett klick håller det lyft, ett klick till öppnar adresspanelen med varje zon kortet kan skickas till.
Att dra kortet till filten spelar det också.
Att vända kortet (#1133) finns bara som tangenten F, som ingenting på skärmen nämner.

Det ger två vägar att spela samma kort, och den som syns är den långsamma: klick, klick, välj zon.
Det enda verb beställaren vill ha på handen går inte att hitta med musen.

## Prototyp

`prototyper/index.html`, spelbar i ett fönster på 1280 × 800 (ritas mindre i ett smalare).
`?v=0|A|B|C`, och ← → byter.
Servera katalogen över http, till exempel `python3 -m http.server 8743` i `prototyper/`.

Alla varianter spelar ett kort på ett enda sätt: dra det till bordet.
Adresspanelen öppnas inte från handen i någon av dem.
Ett vänt kort visar baksidan i kolumnen med namnet på, och landar nedvänt vart det än dras (#1133).
Det varianterna prövar är hur man läser och vänder.

- **A · Klick vänder** (rekommenderas): tre gester och ingen knapp.
  Musen över läser, klick vänder, drag spelar.
  Enter, Space och F vänder från tangentbordet.
  Det man gör med ett riktigt kort, och varje kort är exakt ett mål.
  Priset: ett klick som var tänkt att läsa vänder kortet, ofarligt men överraskande första gången.
  Läsvyn kan inte hållas kvar med ett klick.
- **B · Vändknapp på kortet**: en rund ⟲ i kortets hörn när musen är över det, ifylld och alltid synlig på ett vänt kort.
  Klick på kortet håller läsvyn som idag.
  Priset: ett mål på 32 px som täcker en del av titeln, och två mål per kort där draget ska börja.
- **C · Vänd i läsvyn**: klick håller läsvyn kvar, och under det stora kortet står «⟲ Vänd» och «Stäng».
  Samma form som telefonens «Vänd» under kortet man håller upp.
  Priset: två klick för att vända, och knappen står 300 px från kortet den gäller.

Bilder i `prototyper/bilder/`.

Beslut: _väntar på beställaren_.
