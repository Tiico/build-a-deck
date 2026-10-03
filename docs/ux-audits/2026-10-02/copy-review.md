# Hjälptexter och kolumnväljaren

Genomgång påbörjad 2026-10-02, verifierad 2026-10-03. Beställarens riktning:
behåll tydliga arbetskontroller, ta bort självklar eller upprepad instruktionstext,
och samla nödvändig fördjupning bakom produktens befintliga frågetecken (L32).

## Kolumnväljaren

Reproducerat med syntetiska Sal's Saloon: öppna Tabell → knappen med namnet
«Kolumner». Varje användarkolumn bar Prosa/Text, borttagning och en fullständig
mening om textrutans höjd och radens mått. Systemkolumnernas lås hade dessutom
varsin förklarande mening och formuläret ytterligare en beskrivning.

Vid 1280 × 800 var varje vanlig rad cirka 72 px och panelen cirka 547 px hög.
Tre tillfälliga upplägg jämfördes i samma editor: kompakta rader med gemensam
hjälp, kolumnval med separat detaljrad och utfällning per kolumn. Den kompakta
raden följer beställarens efterfrågade förenkling och behåller befintliga val
på plats. Prototypen är borttagen efter implementation.

Nu är raderna 44 px och panelen 470 px i samma sexkolumnsexempel. Panelen
blir cirka 77 px lägre, trots att även låsta rader får full höjd. Listan rullar
när fönstret är lågt. Prosa/Text och borttagning ligger kvar i varje rad;
«Följ höjden igen» är en namngiven återställningsknapp, ↶. Ett lås ersätter
systemkolumnens mening, med orsaken kvar i tillgängligt namn. Gemensam hjälp
förklarar textlägena, streckad markering, återställning, namnbyte och bilder.
Måttuträkningarna tillför inget som behövs för valet och har tagits bort.

Hjälpen öppnas med klick/tangentbord. Första Escape stänger hjälpen och ger
fokus tillbaka till frågetecknet; nästa stänger kolumnväljaren. Kontrollerna
har verifierats i Chromium vid 1280 × 800, 1024 × 640, 768 × 900 och 640 × 400.
En följdbugg där rader krympte under knapparnas höjd rättades: rader behåller
44 px och listan tar hand om rullningen.

- [Före, 1280 px](copy/columns-before-1280.png)
- [Efter, 1280 px](copy/columns-after-1280.png)
- [Hjälpen öppen](copy/columns-help-1280.png)
- [Efter, 1024 px](copy/columns-after-1024.png)
- [Lågt fönster, 640 × 400](copy/columns-after-640.png)

## Genomgång av tjänsten

Inventeringen följer komponenterna och båda språkkatalogerna, och de huvudsakliga
vyerna har öppnats med syntetiska data i den lokala tjänsten. Detta är en
riktad granskning av löptext, inte en ny fullständig tillgänglighetsrevision.

| Yta | Ändring eller bedömning |
| --- | --- |
| Tabell / Kolumner | Kompakta rader, lås och återställning som grafik, en gemensam hjälp. |
| Mall | «Dra för att ändra ordningen» flyttad till befintlig lagerhjälp. Besked om gruppers låsta ordning ligger kvar eftersom det förklarar en faktisk begränsning. |
| Bord / zoner | «Dra en zon på filten…» flyttad till befintlig zonhjälp. Ångra, koordinater, fel och följder av borttagning ligger kvar. |
| Regler | Instruktionen att välja ett block för att skriva ligger i befintlig regelhjälp. Importvarningar och bokstatus ligger kvar. |
| Guidad start | Exempelmeningen under spelnamnet och den upprepade fältbeskrivningen borttagna. Rubrikerna är «Ram» och «Tema». Informationen om senare ändringar ligger i stegets befintliga hjälp. Namnkrav och längdgräns ligger kvar vid fältet. |
| Spelarens hand | Gestinstruktionen finns i handens hjälp i stället för permanent under korten. Antal valda kort står kvar, utan «dra upp för att spela». |
| Kortvägg | Förklaringar redan bakom hjälp; anmärkningar, tomma lägens nästa steg och kortens innehåll är relevant information. |
| Speltema / symboler / typsnitt | Fördjupning redan bakom hjälp. Licens, användning och vilka kort ett val påverkar behövs vid valen. |
| Media / beskärning | Kvarvarande texter beskriver sparstatus, användning och att samma beskärning påverkar flera kort. Det är följder, inte allmänna instruktioner. |
| Historik / delning | Fördjupning bakom hjälp; roll, behörighet, version och följd av återställning ligger kvar. |
| Inloggning / konto / startsida | Hjälp finns redan. Produktintroduktionen visas första gången; validering, mejlstatus och vad import/export omfattar behövs i flödet. |
| Anslutning | Namn, ledig/vald plats och skillnaden mellan deltagande och att se dolda kort är underlag för valet. |
| TV / distansspel | Kort gest- och anslutningshjälp är redan undanlagd. Rumskod, deltagare och senaste aktivitet behövs direkt. |
| Observatör | Hjälp finns. Att observatören ser dolda kort och att övriga vet om närvaron ligger kvar synligt. |
| Enkäter / avslut / frånkoppling | Frågor, anslutningsstatus, dataförlust och återhämtning är handlingsunderlag och tas inte bort. |

Både svenska och engelska har ändrats. Kontrollers tillgängliga namn,
valideringsbesked och valens tillstånd har behållits.

## Verifiering

Beteendeändringarna drevs med fallerande test före ändring och grönt test efter:
kolumnväljaren, Mall, Bord, Regler, guiden och spelarhanden. Testerna prövar att
hjälpen kan nås och stängas, att kontroller fungerar och att valideringen finns
kvar, inte enbart att strängar tagits bort.

E2E skyddar kolumnradernas höjd, återställning, hjälpens träffyta och de två
Escape-stegen vid 1280 och 1024 px. Den breda surfplattekontrollen fångade också
att zonhjälpens negativa marginal behövde tas bort när ingen mening längre stod
framför knappen; hela träffytan hålls nu innanför ytan.

Slutresultat för kvalitetsgrinden redovisas i ändringens PR.
