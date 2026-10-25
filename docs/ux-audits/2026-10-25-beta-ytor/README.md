# Betaytorna: kvittot på /login och /play-arken på en dator (2026-10-25, #1360, #1376)

Två beslut från beställaren 2026-10-25 som prototypas före bygget.
#1360: kvittot «Kolla din mejl» får «Fel adress?», som går tillbaka till fältet med adressen kvar, och «Skicka igen» med begränsarens besked.
#1376 punkt 3: Flagga, Lämna, «Avsluta bordet?», enkäten och tacket får en form för datorn i `/play` i ett brett fönster (#1310), och avslutsfrågan säger inte «på telefonen».

## Prototyperna

`prototyper/kvittot.html` (#1360) och `prototyper/play-arken.html` (#1376), med `prototyper/index.html` som lista.
Varje fil har en rad överst med växlare för variant, bredd och språk, och ← → byter variant.
Kör dem över http: `python3 -m http.server 8803 --bind 127.0.0.1` i `prototyper/` och öppna `http://127.0.0.1:8803/`.
Skärmdumparna ligger i `bilder/`.

## #1360, kvittot

Det som ligger fast: inloggningskortets rader (L36, #691), alltså märket och namnet, säljtexten första gången, leadraden med frågetecknet, fältet eller kvittot, passkeyn, språket och raden om villkoren.
Varianterna rör bara det som står där kvittot står.
Begränsaren är `LoginLimiter` i `packages/server/src/auth.ts`: fem länkar i timmen per adress, och den sjätte får 429.
En ny länk återkallar inte den förra (`issueToken` lägger till), så «Den förra fungerar också» är sant inom de femton minuterna.

- **A · I kvittot** (rekommenderas): kvittot står kvar och får en rad med «Fel adress?» och «Skicka igen», i passkey-erbjudandets form på den gröna grunden.
  «Skicka igen» skickar direkt och raden under texten säger när, och den sjätte länken får begränsarens besked i kvittot medan knappen vilar.
  Bilder: `kvitto-A-skickat-dator.png`, `kvitto-A-igen-375.png`, `kvitto-A-feladress-375.png`, `kvitto-A-sparr-320.png`, `kvitto-A-sparr-en-320.png`.
- **B · Fältet står kvar**: formuläret står kvar med fältet låst, «Fel adress?» under fältet, ett kort kvitto, och huvudknappen blir «Skicka igen» med 30 sekunders nedräkning.
  Bilder: `kvitto-B-skickat-375.png`, `kvitto-B-sparr-320.png`.
- **C · Adressen som egen rad**: adressen står stort på en egen rad med «Fel adress?» som länk, och under kvittot en tyst rad om skräpposten med «skicka igen» som länk efter en minut.
  Bilder: `kvitto-C-skickat-375.png`, `kvitto-C-igen-dator.png`, `kvitto-C-sparr-320.png`.

**Rekommendation: A.**
L36 och #691 säger att raden är «samma rad på samma plats, inte en ny form», och A är den enda som inte ändrar något utanför kvittorutan: B ger fältet ett tredje, låst läge och flyttar huvudknappen, C lägger en ny rad under rutan.
Båda vägarna står där ögat redan är när kvittot kommer, i en form kortet redan har (passkey-erbjudandets knappar på grönt, #1180).
A har ingen timer: B:s nedräkning är en ny sak att läsa, och C:s vilande länk är precis den kontroll som läses som död (minnet om osynliga svar), medan A:s andra tryck får ett synligt svar med klockslag.
Priset är att två knappar står med samma vikt fast «Fel adress?» är det vanligare skälet; ordningen ger den platsen först.

Följdkrav för bygget, oavsett variant:
- Besked med tid kräver att servern säger när: i dag svarar 429 bara «too many links; try again later».
  Förslaget är `Retry-After` räknat från den äldsta av de fem, och beskedet «Nästa kan skickas om {n} minuter»; utan det blir meningen «Försök igen om en stund», som det befintliga `login.error.too-many`.
- «Fel adress?» lägger tillbaka fältet med adressen och fokus i det; en rättad adress har sina egna fem länkar, eftersom begränsaren räknar per adress.
- De nya strängarna har inget «vi», inget tankstreck och högst två meningar (L73, `catalog-tone.test.ts`); den befintliga `login.sent.body` står kvar som den är.

Beslut: _väntar på beställaren_.

## #1376 punkt 3, /play-arken på en dator

Det som ligger fast: G3 med kortet (#1142) och panelen bredvid filten på `/online` (#1255), C9 och #31 (Lämna har två vägar ut, Avsluta frågar först och öppnar på «Avbryt»), L80 (ägarens «sitt kvar»), L87 (gästens «Lämna och ta bort mitt namn…» som tyst andra knapp efter en linje, och samma rad under tacket) och enkätens frågor (G3, #1021).
Skrivbordet är #1310:s, ritat för hand med `desk.css` och `player.css` mått och färger; zonnamnen och räknaren är spelets och står på svenska också på engelska (minnet om språkgränsen).
Avslutsfrågan säger i A, B och C «Alla spelare får enkäten där de håller sin hand.» («Every player gets the survey where they hold their hand.»), en mening som är sann på både telefonen och datorn, så att strängen inte behöver veta vilken skärm den står på.

- **0 · I dag**: telefonens bottenark över hela bredden med två knappar på drygt 600 px, 13 px text, och enkäten i en spalt på 520 px med 11 px ändord.
  Bilder: `play-0-flagga.png`, `play-0-lamna.png`, `play-0-avsluta.png`, `play-0-enkat.png`.
- **A · Panelen bredvid** (rekommenderas): allt står i en panel till höger, från huvudet till nederkanten, och målen och handen ger upp 380 px medan den står.
  Flaggan är inget läge: ett klick på ett kort i handen eller på ett mål pekar ut det, och ⌘↵ flaggar.
  Lämna och Avsluta är samma panel med frågan, och enkäten och tacket står i en bredare panel bredvid bordet som det låg när det slutade, en fråga i taget med 1 till 5 och ↵ på tangenterna.
  Bilder: `play-A-flagga.png`, `play-A-flagga-kort.png`, `play-A-flagga-1024.png`, `play-A-lamna.png`, `play-A-lamna-agare-en.png`, `play-A-avsluta.png`, `play-A-enkat.png`, `play-A-tack.png`.
- **B · Dialogen mitt på**: varje ark blir en modal dialog med knapparna till höger, som editorns frågor (#1286).
  Flaggan frågar först som telefonen och «Ett kort…» lägger undan dialogen tills ett kort är klickat; Lämna ställer vägarna ut bredvid varandra; enkäten är ett formulär med alla fyra frågor och en «Skicka».
  Bilder: `play-B-flagga.png`, `play-B-peka.png`, `play-B-lamna.png`, `play-B-avsluta.png`, `play-B-enkat.png`, `play-B-tack.png`.
- **C · Från knappen, och enkäten som sida**: Flagga fälls ut under sin knapp, Lämna är en meny under sin knapp med följden under varje rad, och Avsluta frågar i samma ruta.
  Enkäten tar hela fönstret som en sida, med bordet som det slutade till vänster och frågorna till höger.
  Bilder: `play-C-flagga.png`, `play-C-lamna.png`, `play-C-avsluta.png`, `play-C-enkat.png`, `play-C-tack-1024.png`.

**Rekommendation: A.**
Beställaren har redan valt panelen för flaggan på en dator (#1255, G3), och samma dator kan stå i `/online` ena kvällen och i `/play` nästa; A ger den samma flagga på båda, medan B gör flaggan till ett läge igen, vilket #1255 valde bort, och C:s ruta inte är panelen.
Panelen täcker inte handen, så kortet man vill flagga går att klicka där det ligger, och inget annat på skrivbordet byter betydelse under tiden.
Lämna och Avsluta på samma plats gör att en sällanhandling alltid öppnar där den förra gjorde, med L87:s ordning och vikt oförändrad.
Enkäten bredvid det avslutade bordet låter spelaren se handen och målen när hon svarar «Vad skulle du ändra?», och texten står i 15 till 20 px i stället för 11 till 13.
Priset är mätbart: vid 1024 × 768 ryms ett mål färre medan panelen står, och handens sju kort överlappar mer (`play-A-flagga-1024.png`); det gäller bara medan panelen är öppen.
Ett andra pris är att en fråga som inte går att ångra står i en panel och inte i en modal dialog; i bygget bör panelen därför ta fokus och fånga Tab medan den bär Lämna, Avsluta eller raderingsfrågan, som arken gör i dag, och bara flaggan lämna Tab fri (#1255).
B:s enkätformulär är det bästa av de tre formulären och kan lyftas in i A:s panel om beställaren vill ha alla frågor på en gång.

Beslut: _väntar på beställaren_.
