# PROTOTYP — kastas (#940): AI-ytan i editorn

## Frågan

Hur arbetar en designer med AI-hjälp i editorn?
Tre strukturellt olika svar är monterade i den riktiga editorn, med riktigt huvud, riktig kortvägg, tabell och duk, så att de bedöms mot den täthet editorn faktiskt har.

## Så körs den

Riggen: `pnpm --filter @byd/server exec tsx scripts/prototype/run.ts` (tjänst, renderare, provleken med 77 kort och Vite på 8317/5317).
Ta riggens editoradress, stryk `&variant=A` och lägg till `&ai=A`, `&ai=B`, `&ai=C` eller `&ai=nyckel`.

- `&nyckel=0` visar editorn för den som inte har någon nyckel.
- `&utfall=nyckel` låter leverantören säga nej, `&utfall=oanvandbart` ger ett förslag som inte går att använda.
- `&skala=4` gör provleken fyra gånger så stor (308 kort, 315 med förslaget).
- `&ren` döljer prototypens växel; Alt + ← → byter variant.

Bilderna tas med `node src/editor/prototype/ai/shoot.mjs <katalog>` från `packages/web`.

## Varianterna

**A — Samtalspanel.**
En dockad panel på 380 px bredvid arbetsytan, i varje flik.
Ett fritt samtal som känner spelet; svaret strömmar, och ett svar med ett förslag visar det som ett kompakt kort i samtalet med «Visa på väggen», «Välj delar…», «Godta» och «Kasta».
Varje nytt meddelande medan ett förslag står öppet förfinar det.
Utan nyckel är panelen en smal flik i kanten, och öppnad är den nyckelrutan.

**B — Riktade handlingar.**
Inget samtal.
«✦ Föreslå kort…» och «✦ Ändra kortet…» i kortväggens krona, samma två i tabellens verktygsrad («Ändra N markerade…» när kort är markerade), en ✦ i varje kolumnhuvud («Fyll kolumnen …») och «✦ Föreslå mall…» på duken.
Varje handling öppnar en liten ruta under knappen: en rad för instruktionen, chips som säger vad som skickas, och svaret på samma ställe — kort med kryssrutor, en lista för en kolumn, och mallen ritad på duken bakom rutan.
Utan nyckel finns knapparna kvar, och rutan de öppnar är nyckelrutan.

**C — Spöken på väggen.**
Förslaget läggs direkt i den riktiga kortväggen: nya kort som spöken med streckad lavendelkant och «✓ Förslag», ändrade kort med hel kant och «✓ Ändrat».
I tabellen visas samma förslag genom tabellens egen jämförelse, med gammalt värde överstruket ovanför det nya.
En fast granskningsrad längst ner bär instruktionen när den vilar, strömmen medan svaret kommer, och «7 nya kort, 3 ändrade · Godta alla · Godta markerade · Kasta · Förfina…» när förslaget är klart.
Pillen på varje spöke är knappen som tar med eller lämnar kortet.
Utan nyckel är raden en mening och «Lägg in nyckel…».

**Nyckel — kontots nyckelruta.**
Det finns ingen kontosida, så rutan hänger på «Mina spel», bakom ett «AI-nyckel» i raden med e-posten, «logga ut» och språket — där kontots egna saker redan står.
Samma ruta är det editorn visar utan nyckel i A, B och C, och «Byt nyckel…» öppnar den som dialog.
Leverantör (Anthropic eller OpenAI), nyckeln i ett lösenordsfält, «Spara och pröva» → «Prövar nyckeln…», sparad med bara leverantören och `…x7Qd`, modell med standardval, «Byt nyckel» och «Ta bort» med en fråga först.
Meningen om vad som skickas vart står alltid synlig, inte bakom ett frågetecken: den säger följden av en handling, och sådant flyttas inte till L32:s låda.

## Vad som är riktigt och vad som är falskt

Riktigt:
- Huvudet, kortväggen, tabellen, duken och startsidan är de riktiga komponenterna, monterade som vanligt.
- Varje förslagskort ritas av `CardPreview`, alltså av den riktiga kompilatorn och E6-passningen (E2) — både de små korten i A och B och spökena på väggen i C.
- Den föreslagna mallen är en `FaceTemplate` i elementmodellen (L1): rektanglar, ett mönster som bildyta (E4), ett `if` på fältet `kostnad`, och butikskortens variant som lägger till myntet och flyttar namnet.
- Väggens fysiska kontroll körs på förslaget: mallen gav «Fysisk kontroll (2)» innan den godtagits.
- Tabellens gammalt → nytt är tabellens egen jämförelse (`compareWith`, `diffProjects`), matad med förslaget.

Falskt:
- Leverantören är ett deterministiskt manus (`fake.ts`) byggt ur lekens egna kolumner, typer och rariteter; ingen nyckel, inget nät.
- Strömmen är timers: ord för ord, och förslagets kort ett i taget.
- «Godta» lägger förslaget på en lokal kopia av dokumentet i React-state; ingenting sparas, och huvudets ↶ och «Sparat» vet inget om det.
  «Ångra» bredvid bekräftelsen är prototypens eget steg.
- Medan en lokal kopia visas syns inte en redigering som görs i den riktiga editorn samtidigt.
- Nyckelns prövning är en timer; en nyckel som är kortare än 12 tecken eller innehåller «fel» avvisas.
- Modellistorna är skrivna för hand.
- Texten är svenska literaler, inte i18n-nycklar (A4 gäller den riktiga ytan).

## Rekommendation: C, med två lån från B

C är den enda varianten där förslaget bedöms som designerns eget arbete: på väggen, i lekens grupper, i full storlek, med den fysiska kontrollen räknad på det och tabellens gammalt → nytt.
Det är vad PRD-berättelse 27 beskriver, och de två andra visar det bara när man ber om det — A bakom «Visa på väggen», B inte alls för kort.
Delvist godkännande blir ett tryck på det kort man tittar på i stället för en kryssruta i en lista bredvid.
Den håller på 308 kort: raden står still och «Gå till nästa ↓» hittar spökena i sina band.

A kostar 380 px i varje flik.
Vid 1280 räcker inte kortväggens krona längre: sökfältet krymper till en stump och «Fysisk kontroll» klipps bort.
Och ett samtal bredvid verktyget är just «ett allmänt AI-verktyg i en annan flik», bara närmare.

B är bäst på att visa var hjälpen finns och vad som skickas, men rutan lägger sig över det den handlar om — i tabellen täcker den kolumnen den fyller — och den har ingen plats för en fråga om spelet (berättelse 24–26).
Varje yta får egna knappar i en krona som redan är full, och ✦ i kolumnhuvudet trängs med sortering och filter.

Lånen: B:s riktade ingångar finns kvar som genvägar som fyller i C:s rad («✦ Föreslå kort…» i kronan, ✦ i kolumnhuvudet ger «Fyll antal» i raden), och B:s kontextchips står i raden.
Ett svar utan förslag — en fråga om spelet — behöver en låda ovanför raden (L32:s form), eftersom raden bara rymmer två rader text.

## Öppna frågor

1. L13: «Godta alla» är fylld i C:s rad medan huvudets «Uppdatera bordet» också är fylld. Vilken är vyns första handling medan ett förslag står öppet?
2. Var står ett svar utan förslag (berättelse 25) i C? Förslag: en låda ovanför raden, som A:s samtal fast för ett svar i taget.
3. Utan nyckel tar A en flik i kanten och C en rad på 60 px i höjd — berättelse 9 säger att editorn ska se ut som förut. Räcker B:s knappar som enda väg in utan nyckel, eller en rad i spelets ⋯?
4. Tabellens jämförelse säger «Jämför med version 1 · AI-förslaget» och har «Sluta jämföra». Förslaget behöver egna ord, och «Sluta jämföra» betyder inget för ett förslag.
5. Ska raden säga när förslaget ger nya anmärkningar i den fysiska kontrollen («förslaget ger 1 ny anmärkning»), eller ska ett sådant förslag avvisas?
6. Vad händer med ett öppet förslag när designern eller en medredigerare ändrar dokumentet under tiden — läggs det om på den nya versionen eller avvisas det vid «Godta»?
7. Förfina: ska det förra förslagets spöken stå kvar tills det förfinade har kommit? I prototypen försvinner de och kommer tillbaka ett i taget.
8. Vad heter steget i ↶:s etikett — «Ångra AI-förslaget» eller förslagets sammanfattning?
9. Hämtas modellistan från leverantören när nyckeln sparas, eller är den en fast lista vi underhåller?
10. C:s pill på ett spöke är en knapp inuti ett `role="option"` i väggens listbox — en kontroll i en kontroll. Den riktiga ytan behöver ett annat grepp: Mellanslag på kortet växlar «med/lämnas» medan ett förslag står öppet, och pillen blir ett märke.

## Det prototypen visade om PRD:n

- Modul 2 säger att adaptern strömmar text och *ett färdigt* strukturerat svar. A:s och C:s kort som kommer ett i taget kräver att adaptern strömmar förslagets delar när var och en är klar; annars står väggen tom tills hela svaret har kommit.
- Modul 4 säger att delvist godkännande är att välja bort delar, men inte vad en del är. Prototypen fann tre slag: ett nytt kort, ett ändrat kort (alla dess celler), och en mall tillsammans med de fält och cellvärden den kräver — mallen med myntet går inte att godta utan fältet `kostnad`.
- Berättelse 27:s «ändrade celler markerade» finns redan: tabellens jämförelse med en version ritar gammalt → nytt. Den ska återanvändas, men med egna ord för ett förslag (öppen fråga 4).
- Berättelse 14 säger att en mall ska respektera varningarna. Eftersom förhandsvisningen kör den riktiga kontrollen kan granskningen visa nya anmärkningar innan något godtas; PRD:n bör säga om de ska visas eller avvisas (öppen fråga 5).
- Berättelse 9 (editorn ser ut som förut utan nyckel) krockar med både A och C; se öppen fråga 3.
- En mall som bara bär myntet i butikskortens variant syns inte på duken under «Bas (alla)»: ett mallförslag med varianter behöver visas på väggen, inte på duken.
