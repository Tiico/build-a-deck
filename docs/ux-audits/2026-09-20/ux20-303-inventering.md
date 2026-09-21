
**Symboler** — 7 strängar, 695 tecken

- `symbols.deck.painted.some` (144 tecken) — Inget kort säger den här. Mallen målar den på vissa kort — en variant eller ett villkor avgör vilka — så den s…
- `symbols.colours.lead` (120 tecken) — En betydelse, en färg. Korten skriver betydelsen och aldrig färgen, så en ändring här målar om varje kort som …
- `symbols.deck.painted` (110 tecken) — Inget kort säger den här. Mallen målar den på varje kort den ritar, så den syns utan att någon rad nämner den.
- `symbols.lead` (94 tecken) — Fritt licensierade symboler, platshållarramar och färgblock. Licensen följer med in i trycket.
- `symbols.none` (83 tecken) — Inget med det namnet. Sök på vad symbolen är till för, som "försvar" eller "skörd".
- `symbols.set.none` (74 tecken) — Inga symboler ännu. Ta in en ur biblioteket och skriv {namn} i korttexten.
- `symbols.colours.none` (70 tecken) — Spelet har inga betydelser än. En symbol utan betydelse ritas i bläck.

**Bord (uppställning)** — 4 strängar, 505 tecken

- `setup.hint` (160 tecken) — Listan är varje zon bordet har. Dra en zon på filten för att flytta den, hörnet för att ändra storlek; piltang…
- `setup.counter.stacks` (134 tecken) — En eller två räknare ligger bredvid varandra framför platsen. En tredje staplar platsens brickor i en hög, som…
- `setup.counters.homeless` (108 tecken) — Ingen plats har någon räknarzon, så inga brickor läggs på bordet. Ge platserna en med "Räknarzon per plats".
- `setup.seats.hint` (103 tecken) — En ny plats får en hand och det platserna redan har. En plats som lämnar bordet tar sina zoner med sig.

**Kort** — 4 strängar, 383 tecken

- `wall.measure.lead` (160 tecken) — Måttet självt står i mallens bildelement, för {fields}. Här står lekens svar på det: filerna som inte kan svar…
- `wall.checks.note` (90 tecken) — En anmärkning är oftast mallens, inte kortets: den syns på varje kort som ärver elementet.
- `wall.measure.source.lead` (78 tecken) — Filen rörs aldrig. Det här är bara det här kortets avvikelse från lekens mått.
- `wall.checks.fix.none` (55 tecken) — Den här behöver ett formval och kan inte rättas åt dig.

**Mall** — 3 strängar, 293 tecken

- `canvas.hint.base` (179 tecken) — Dra ett lager för att ändra ordningen, eller håll Alt och tryck pil upp eller ner. F2 byter namn på lagret. El…
- `canvas.props.empty` (58 tecken) — Välj ett lager i lagerlistan, eller ett element på kortet.
- `canvas.hint.group` (56 tecken) — Lagrens ordning är basens och ändras med basfliken vald.

**Regler** — 2 strängar, 215 tecken

- `rules.empty` (112 tecken) — Reglerna hör till spelet: de versioneras med korten, och spelarna når dem från telefonen, TV:n och observatöre…
- `rules.hint` (103 tecken) — Klicka i sidan för att skriva. En regel som nämner en zon eller ett kort följer med när det byter namn.

**Bord (listan)** — 2 strängar, 199 tecken

- `tables.lead` (124 tecken) — Varje bord hör till det här spelet. Ett bord överlever att alla kopplar ner; det avslutas uttryckligen eller e…
- `tables.none` (75 tecken) — Inget bord ännu. "Uppdatera bordet" startar ett från den sparade versionen.

**Media** — 2 strängar, 134 tecken

- `media.crop.lead` (68 tecken) — Beskärningen är bildens egen och gäller varje kort som använder den.
- `media.empty` (66 tecken) — Inga bilder ännu. Släpp bildfiler här, eller välj Ladda upp media.

**Historik** — 1 strängar, 93 tecken

- `history.lead` (93 tecken) — Varje sparning är en version. Ingen av dem skrivs om; den du tar tillbaka blir nästa version.

**Mall (typsnitt)** — 1 strängar, 84 tecken

- `fonts.none` (84 tecken) — Inget eget typsnitt ännu. Utan en fil sätts korten i vad tryckeriets dator råkar ha.

**Delning** — 1 strängar, 70 tecken

- `share.lead` (70 tecken) — De som är inne nu står överst. Samma lista säger vem som får vara med.

**Bord** — 1 strängar, 68 tecken

- `table.import.note` (68 tecken) — Import ersätter korten i tabellen. Spara när resultatet ser rätt ut.

**Media** — 1 strängar, 65 tecken

- `library.none` (65 tecken) — Spelet har inga bilder ännu. Ladda upp en bild direkt i tabellen.

## Utfört 2026-09-21

Mönstret är L32:s låda (`packages/web/src/editor/HelpDrawer.tsx`).
Varje rad nedan är en av de 29 strängarna ovan; de 19 som räknades bort innan — fel, väntestatus och följdupplysningar — rördes inte.
Före-höjderna är mätta i Chromium vid 1280×800 med produktens egna ark, med den gamla strängen lagd i den nya ytan; efter-höjden är densamma med lådan öppen som stängd, för lådan ligger över arbetet och inte i flödet.

| yta | före | efter |
|---|---|---|
| Lager, foten under listan (220 px) | 86 px, fem rader | 31 px, en rad |
| Bord, inledningen över listan (320 px) | 72 px, fyra rader | 36 px, två rader — kortare, men bär fortfarande «rev {n}», som #299 satte dit |
| Uppställningen, raden över filten | 30 px, en rad | 30 px, en rad — raden var redan en rad; vinsten där är ord, inte bildpunkter |

Lager var den yta L32 mätte på: 179 tecken, sex rader i prototypens grader, fem i produktens. Där satt vinsten, och den är tagen.

### Flyttat bakom frågetecknet, med en kort rad kvar

| nyckel | kvar synligt | i lådan |
|---|---|---|
| `canvas.hint.base` | «Dra för att ändra ordningen.» | Alt + pil, F2, flyttläget från duken (`canvas.help.*`) |
| `setup.hint` | «Dra en zon på filten för att flytta den.» | hörnet, piltangenterna och Delete, listan (`setup.help.*`) |
| `tables.lead` | «Bord på det här spelet. Ett nytt startar från den sparade versionen, rev {n}.» | att ett bord överlever att alla kopplar ner och avslutas efter ett dygn (`tables.help.life`) |
| `rules.hint` | «Klicka i sidan för att skriva.» | att en regel följer med när zonen eller kortet byter namn (`rules.help.names`) |
| `rules.empty` | «Reglerna hör till spelet.» | att de versioneras med korten och nås från telefonen, TV:n och observatören (`rules.help.reach`) |
| `history.lead` | «Den du tar tillbaka blir nästa version.» — följden av att ta tillbaka står kvar | att varje sparning är en version och ingen skrivs om (`history.help`) |

### Flyttat i sin helhet

Rubriken står kvar och säger vad ytan är; frågetecknet står bredvid den.

| nyckel | nu | vid |
|---|---|---|
| `setup.seats.hint` | `setup.seats.help` | rubriken Spelare |
| `setup.counter.stacks` | `setup.counters.help` | rubriken Räknare |
| `symbols.lead` | `symbols.help` | rubriken Symbolbibliotek |
| `symbols.colours.lead` | `symbols.colours.help` | rubriken Spelets färger |
| `wall.checks.note` | `wall.checks.help` | raden med antalet fel, i kontrollens låda |
| `wall.measure.lead` | `wall.measure.help` | rubriken Bildernas mått |
| `share.lead` | `share.help` | rubriken i delningsdialogen |

### Kvar synligt, oförändrat

Tomma tillstånd säger varför ytan är tom och vart man går; följdupplysningar säger vad en handling får för följd. Ingen av dem är förklarande löptext i L32:s mening, även om inventeringen räknade tecknen.

- `canvas.hint.group` — varför ordningen inte går att ändra i en grupp.
- `canvas.props.empty`, `symbols.none`, `symbols.set.none`, `symbols.colours.none`, `symbols.deck.painted`, `symbols.deck.painted.some`, `media.empty`, `library.none`, `fonts.none`, `tables.none` — tomma tillstånd.
- `setup.counters.homeless` — status: inga brickor läggs på bordet.
- `wall.checks.fix.none` — varför ingen rättning erbjuds.
- `wall.measure.source.lead`, `media.crop.lead`, `table.import.note` — vad handlingen gör med filen, med varje kort som använder bilden, med korten i tabellen.

### Hoppat över

Inget. Alla 29 nycklar fanns kvar efter #295–#302; ingen av dem hade bytt roll.

### Mätningen i sviten

`packages/web/test/help-layout.test.tsx` lägger de tre ytorna i Chromium vid 1280, 1024 och 768 och med texten fördubblad: raden är högst två rader hög och lika hög med lådan öppen, lådan står inuti fönstret, aldrig över raden den handlar om, och klipps inte av kolumnen.
Ingen bildpunkt är fastnaglad i sviten; raden mäts mot sin egen radhöjd och lådan mot fönstret, så samma regel gäller där typsnittet är bredare.
