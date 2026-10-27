# Roadmap till release

Status: sammanställd 2026-09-06, betan inlagd 2026-10-18, ur [DESIGN-BESLUT.md](DESIGN-BESLUT.md), [DRIFT.md](DRIFT.md), [TUNN-SKIVA.md](TUNN-SKIVA.md) och git-loggen.
Det här dokumentet sammanfattar och ordnar besluten; det fattar inga nya.
Ett beslut ändras i sitt eget dokument, och den här roadmapen följer efter.

Läsanvisning:
`✅` betyder byggt och verifierat i tester, `🔶` betyder delvis byggt, `⬜` betyder beslutat men inte påbörjat, `❓` betyder att ett beslut saknas.
Varje rad pekar på det beslut som styr den, till exempel C6 eller DRIFT §5.

---

## Vad release betyder

Produkten är en webbplattform där en speldesigner skapar sitt kortspel, playtestar det digitalt utan regelmotor, och beställer hem det fysiskt (produktdefinitionen).
Första användaren är en semi-pro designer på väg mot förlag eller crowdfunding (A1).

Release är nådd när en sådan designer, utan hjälp av oss, kan:

1. Skapa ett konto, bygga en kortlek i editorn och spara den i en versionerad historik (G1, E1–E6, B4).
2. Playtesta den runt en TV med telefoner som händer, eller helt på distans, med ångra, närvaro, flaggor och enkät (C2–C9, K1–K14, G3).
3. Beställa leken tryckt hos en riktig partner med pris i kassan och få den hem (F1–F3, H1).
4. Betala för en abonnemangsnivå över gratisnivån och exportera allt när som helst (A2, G5).

Och när tjänsten:

5. Kör på lådan bakom Cloudflare med backup som provats tillbaka, assets utanför huset och en CI-grind på riktiga loggar (DRIFT §1–§8).
6. Håller juridiken: villkor, GDPR för gäster, moms och tull för fysiska varor (F4, I).

Sekvensen är fastlagd: allt digitalt före tryck (H3), och den tunna skivan (H1) räknas som klar först när en tryckt lek ligger i brevlådan.

---

## Fas 0 — Grunden: klar

Det här är byggt, testat och committat, i den ordning det kom.

Protokoll och motor:
- ✅ Slutet fysiskt intent-vokabulär, atomiska kuvert, slump som resultat i loggen, deterministisk återspelning (D1, D4, K3, TUNN-SKIVA §2).
- ✅ Zonhärledd synlighet med undantag per komponent, verifierad på råa nätverksframes (B6, TUNN-SKIVA §5).
- ✅ Dynamiska högar, fri placering med zonrektanglar, atomisk batch (K1, K2, K3).
- ✅ Personlig ångra och gruppens tillbakaspolning som återställningsrader i loggen, dolda högar blandas om (C6, K13).
- ✅ Versionsbyte mitt i sessionen: leken följer projektet, korten på bordet ligger kvar (C7, L5).
- ✅ Observatör med full insyn, flaggade ögonblick som loggrader, avslutad session som låst logg (C8, C9, G3).

Server:
- ✅ En aktör per bord i en Node-process, ordningen decide → commit → apply → patchar, drain på SIGTERM (D2, DRIFT §3).
- ✅ Händelselogg och projekt i Postgres eller minne, render-kö i Postgres med SKIP LOCKED, texturer per innehållshash (DRIFT §4, §6).
- ✅ Närvaro som efemär kanal vid sidan av loggen (K6).
- ✅ Övergivna bord avslutas efter ett dygn (C9).
- ✅ Konton med magisk länk, sessionskaka, projekt som tillhör kontot; gäster loggar aldrig in (G1, DRIFT §11).
- ✅ Enkätsvar lagrade bredvid loggen, knutna till versionen (G3).

Bordet och telefonen:
- ✅ Filtbord i bordsläge och sändningslayout i TV-läge med rumskod och QR (C5, K9).
- ✅ Telefonens hand som remsa med tryck, dra upp, håll; zongenvägar; spela vänder kortet om målet är publikt (C4, K4, K10, K11).
- ✅ Telefonen mot TV:n tagen om från grunden: fyra flikar (Handen, Framför mig, Bordet, Mer), handen som rutnät och verben i en rad över flikarna (C4 2026-10-23, #1147).
- ✅ Rummets TV som scen för det senaste kortet: kortet stort i spalten med sin rad under, ingen logg, koden och namnet i en fot, och scenen så bred som filten kan ge och behålla K9:s kort (K8 2026-10-25, #1290).
- ✅ Vänd ett kort i handen så spelas det nedvänt, vart det än går (K11 reviderad, #1133).
- ✅ Anslutning: bordet som platsväljare, "Bara titta", "Spela på den här skärmen" (K12, C8, C2).
- ✅ Bordet spelas direkt: dra, släpp, håll för en ring med verb; perspektivet projiceras exakt (K14, C1).
- ✅ Distansläget: bordet vridet till din kant, handen som solfjäder på filten, båda rollerna i ett fönster (C2, C5).
- ✅ Närvaro: prickar med namn, speglade dragningar, pekpulser, kort som bär färg när de flyttas (K6).
- ✅ Håll för att förstora, inget ljud (K7, K8).
- ✅ Texturer på bordet och i handen, serverade per hash som kapabilitet (TUNN-SKIVA §5).

Editorn:
- ✅ Elementmodell kompilerad till HTML/CSS, inline-syntax, varianter, datatabell med `antal`, baksida som egen mall (E1, E2, L1–L4, L7).
- ✅ Textanpassning ned till minimigräns, mätt i DOM (E6).
- ✅ Kortväggen som hem, duken för mallen, tabellen som flik (L8).
- ✅ Grafisk wizard för en liten startlek: fält syns direkt på exempelkorten, bildfält kan fyllas och editorn är den tydliga nästa vägen; CSV importeras och exporteras i editorns tabell (E1, E3, L6).
- ✅ Ett spel utan den guidade starten: från wizardens steg 1 med bara namn och spelarantal till ett tomt spel i editorn — inga kort, inga fält, tomma sidor, receptets bord — genom samma `POST /projects` som den guidade vägen (E3, L42).
- ✅ Steget före guidad start (L79, #1218): `/new` är ett vägskäl med namnet, spelarna och två dörrar — guidad start och tomt spel — och guiden bakom den första är två steg på en egen adress, med spelets namn och «Ändra» i huvudet.
- ✅ Ett fält görs i editorn: samma blankett från tabellhuvudets sista cell och från mallens bindning, wizardens tre typer och wizardens nyckelförslag, blanketten ligger över raden så huvudet aldrig växer, och `addField`/`removeField` är en redigering var — kolumnen tas bort med värdena och de element som ritade den, och `antal` är motorns (L4, B4, A4, #32).
- ✅ Bildernas storlek jämnas ut på motivet: tomrummet runt det som är ritat mäts en gång per innehållshash i webbläsaren och lagras bredvid asseten, kompilatorn passar in motivet i stället för filen när elementet säger `trim`, och en omätt fil passas in som en fil — mätt på skärmen i Chromium, där två filer med samma motiv och olika mycket luft ritar det lika stort (E1, E2).
- ✅ Tabellens kolumner är formgivarens: bredden följer innehållet tills hon drar i en rubrikkant, och ordningen ändras genom att dra en rubrik på en annan eller med Alt och en pil. Ordningen skrivs i dokumentet — alla ser den, CSV:n följer den, Ctrl+Z tar tillbaka den — och bredden minns i webbläsaren per projekt, som sortering och filter. `×` och hänglaset lämnar rubriken för huvudets egen dörr, där kolumnerna listas (L4, #46, #32). Vad som står still när tabellen rullar i sidled är också hennes: ett lås per kolumn i dörren och på en låst rubrik, titeln låst från start, id och antal i raden (L92, #1408).
- ✅ Editor till bord med förrenderade texturer; bytet är atomiskt för spelarna (L5).
- ✅ "Bord"-fliken: spelets alla bord med miniatyr ur bordets egen snapshot, vem som spelar, vilken version som körs och vägarna in — TV, bordsläge, spela härifrån, titta på, QR — plus avslut med bekräftelse (L5, K9, C7, C9).
- ✅ Former bortom rektangeln: varje form ritas som en path i en SVG, en parametrisk kärna (polygon och stjärna) under ett galleri av sjutton namngivna konturer, formen passas in i sin ruta och konturen ligger innanför den; mönster som ett lager över fyllningen i fem sorter med färg, storlek och vinkel; skugga som fyra förval med fem tal bakom `Anpassa`; och färdiga baksidor som läggs ut som vanliga lager i en enda redigering (L1, L16, L17, E5).
- ✅ Kortgrupper som regler på en kolumn: en flik per grupp över duken, fram- och baksida redigeras likadant, lagerpanelen säger om ett lager är basens eller gruppens, och tabellens kolumn som styr gruppen bär märket «kortgrupp» (#695); dolda kort får gruppens baksida utan identitetsläcka och tryckmanifestet håller varje fram-/baksidespar ihop (L3, L7).
- ✅ "Mina spel" och inloggningskortet (G1).
- ✅ Skydd för osparat arbete: osparat mätt mot servern, fråga vid vägen ut, `beforeunload` vid stängning och omladdning, bekräftelse innan ett kort tas bort, och sparat/osparat i huvudet (L9).
- ✅ Editorn, wizarden och observatören på små skärmar: namngivna etapper under 1024 px, ingen duk under 768 px och gränssnittet säger det, tre steg i wizarden, bordet först och ingen banner över spelet hos observatören (L10, #4, #5, #6).
- ✅ Handsolfjädrarna i bordets eget mått: fläkten skalar med filten, inpassningen räknar in händerna och ett kvartsvridet bord passas in i den form det ritas i, mätt i Chromium vid 390, 768 och 1280 i alla fyra konsumenter (K9, C5, #23).
- ✅ Distansvyns nedre band: bågen kapad vid 30°, kortet kvar i läsbar storlek, steget bottnat på 44 px och en hand bredare än bandet som rullar i sidled; hörnen uppe i en topplist och hela handen som rutnät bakom `Visa alla` (K17, C4, #24, #25).
- ✅ Observatörens filt möter fönstret hon håller: ett landskapsbord i ett porträttfönster vänds ett kvartsvarv så att dess långsida löper nedför skärmen, luften mellan filt och ram är två tal för två skäl i stället för ett, och namnen går fria från högarnas antalsbrickor — noll namnpar på varandra vid 320 och 390, kortets kortsida 12 → 20 px och 15 → 27 px (C8, L12, K19, #76).
- ✅ Ett zonnamn står aldrig i en annan zons ruta: #76:s undantag för den smala filten är borta, namnet står bredvid sin zon på varje filt och prövar sedan en rad längre ut, motsatt sida, zonens ändar och sist inuti, och sidan avgörs en gång i filtens inpassade skala — 37 namn i grannens ruta före, noll efter, på varje yta vid fyra och åtta platser (K19, #685).
- ✅ Platsens skylt på rummets TV utan räknare, på en fri plats: skylten säger bokstav, namn och hand, räknarens tal står på platsens mark, skylten placeras i #685:s ordning och blir hellre en bricka med platsens mark än kapas — ren vid 1280 och 1920 med fyra och åtta platser, också 15 % bredare, med kortet orört (K19, K26, #683).
- ✅ Distansvyns filt får fönstret den står i: en sidoplats vänds inte i ett fönster som redan ligger rätt, luften kring träet är 12 px i stället för 44, handen står som en lodrät lista i en kolumn vid fönstrets inline-slut i ett liggande fönster, och den egna fläkten på filten viks ihop till sin bricka — kortets kortsida 31 → 46 px vid 1280 × 800 och 49 → 62 vid 1920 × 1080, vid varje plats och varje handstorlek, med det stående fönstrets band orört (K9, K17, C5, C8, #77).
- ✅ Filten mot ramens yta i stället för mot dess kortare sida: två femtedelar av ramen, minst 44 px luft, en enda regel för `/online`, `/table`, TV:n och Bord-flikens miniatyrer (K9, K17, #24).
- ✅ Ett grepp är ett steg tillbaka: en dragning och ett ord skrivet i en cell är ett Ctrl+Z var, och trafiken på tråden är oförändrad (L14, #35).
- ✅ Fyllningen kan följa en kolumn: en färg per värde i mallen, lekens värden erbjudna i panelen, och en standardfärg för allt annat (L16).
- ✅ Lagerpanelen som rutnät: lagret heter det designern kallar det och säger vad det visar, låset ligger i raden, dropplinjen säger var en dragning hamnar, och ett låst lager går varken att dra, storleksändra, nudga eller radera (L15).

Drift:
- ✅ Compose-stack med minnestak och loggrotation: Postgres, app som serverar webben från samma origin, render-worker, och en väg in som är lådans egen — dess omvända proxy genom ett överlägg, eller tunneln i stacken (DRIFT §1, §2, §6, §8).
- ✅ Pull-baserad deploy på lådan via systemd-timer, som drar CI:s bilder eller bygger själv (DRIFT §7).
- ✅ CI med lint, typecheck, tester mot Postgres och Chromium, bilder till GHCR, replay-korpusen som grind (DRIFT §7, D4).
- ✅ E2E-svit i Playwright ovanpå återspelningen: flera samtidiga klienter, anslutning, telefon och QR, mot den byggda webben serverad av servern på ett ursprung (D4, `packages/e2e`).
- ✅ Nattlig `pg_dump` till R2 med återställningsprov (DRIFT §5, första steget).

---

## Fas 1 — Spelupplevelsen färdig

Målet är att en grupp kan spela vilket kortspel som helst utan att sakna något fysiken tillåter.

- ✅ Kamera i TV-läge: bordet ramar in det som är i spel och glider med, tillfällig zoom kring pekaren med återgång (C5).
- ✅ Högens topp som adress i `stack` och `flip`, så att översta kortet i en dold hög kan staplas på ett löst kort och vändas; ett uppvänt kort överst i en hög ses av alla (K15).
- ✅ Fel-, tom- och anslutningslägen som en familj: nio lägen med gemensam modell och en form per route, initial timeout på anslutningen, tappad och återansluten ovanpå vyn, avvisade drag vid kontrollen, och en egen dokumenttitel per huvudroute (D5).
- ✅ Sidan säger vad den hämtar innan appen har kommit fram: ruttens eget laddar-besked står i `index.html` och målas efter en halv sekund på ett långsamt mobilnät i stället för efter fem till sju, byter till ruttens dröjer-ord efter fyra sekunder och erbjuder en omladdning efter tjugo; arket står efter `#root` och håller fortfarande appens första bild, och ingen navigering ritar en vit ram (D5, L20, #749).
- ✅ Räknare och privata zoner på telefonen: en räknartyp `token.counter`, en yta "Framför mig" och en räknarzon per plats från wizarden; telefonen visar räknarna som piller och korten framför sig som en remsa med vänd, ta upp och spela; bordet ritar räknare som brickor (C4).
- ✅ Aktivitetshistorik i snapshoten: de senaste femtio raderna följer med vid anslutning, så en skärm som ansluter mitt i ett spel ser vad som hänt (I, teknik).
- ✅ En hög kvadrerar sina kort, och zoner får överlappa med minsta zonen som vinnare, lika stora efter setupens ordning (K1, K2).
- ✅ Rumskoder: sex tecken utan förväxlingsbara, går ut tre timmar efter senaste anslutning, köper tokens för plats och observatör; bordet öppnas med värdnyckel; värden roterar koden och sparkar från editorn (DRIFT §9, G1 följdkrav).
- ✅ Zongenvägar per spel: varje zon kan bära ett verb för telefonen ("Kasta", "Lägg underst") skilt från bordets namn, med placering överst eller underst; editorns flik "Bord" redigerar namn och genvägar med telefonens ark som förhandsvisning (C4 följdkrav).
- ✅ En hög kan ha egna åtgärder, och en zon kan säga vilka kort som börjar i den (K21): frågespråket är tabellens filter lyft till ett dokumentvärde, ett steg är ett verb ur det slutna vokabuläret med parametrarna ifyllda, antalet är en källa och aldrig en formel, och `split`/`draw`/`deal` fick `face` och `which` — två parametrar och inget nytt verb. Ringen står orörd och spelets egna hänger under den som en lista; tangentbordets panel läser samma lista. Författandet i fliken Bord är meningar med rattarna inne i texten (B5, K14, K16, L4).
- ✅ Ett steg som lägger kort bredvid högen säger själv vilken sida och hur korten ligger: på varandra, bredvid varandra eller omlott (K21, reviderat 2026-10-23, #1203). `split` fick parametern `row`, och motorn lägger ut korten, så att också en sökning i en dold hög kan läggas i rad.
- ✅ Spelet startas av ett kommando vid bordet (K25): en åtgärd säger själv om den körs på begäran, vid spelstart eller båda, och en bricka på filten kör varje startåtgärd på varje hög som ett enda kuvert. Inget nytt verb — starten är vanliga verb, och slumpen ligger i loggen som förut (D4). Tidpunkten ställs in som en ratt i meningen, där K21 lade alla andra rattar. Receptet föreslår en blandning på draghögen när det lägger bordet (#453), så ett nytt spel inte längre föds med leken i dokumentets ordning; verktyget skeppar fortfarande inga åtgärder, och designern tar bort den som allt annat receptet lägger. Ett steg som frågar efter ett tal och spelstarten går inte ihop (#454), och panelen stänger av den ena så länge den andra står, med skälet som en rad text under ratten.
- ✅ En zon går att klippa, kopiera och klistra i fliken Bord (K22): kopian bär frågan, åtgärderna, genvägen, ägaren, synligheten och storleken, och landar bredvid originalet. En hand kopieras aldrig (C3).
- ✅ Filten säger när ett kort är på väg in i en hand, och bara då (K24): det burna kortet vänder ryggen till medan det bärs, och platsens egna 500 mm av kanten tänds med antalet uppräknat. Ett släpp i en hand är det enda släppet som tar bort information ur allas syn, och det enda som träffas på en yta större än den ser ut. Den fällda handen i distansvyn får samma besked, vilket gör en osynlig träffyta synlig.
- ✅ Bordets anteckningsblock på `/online` (K29, #1131): en spalt med rader som alla vid bordet skriver, bockar av och tar bort, med skribentens platsfärg; sessionens och inte spelets, så Ångra och tillbakaspolning lämnar det kvar.
- ✅ Tärningar d4–d20, slagna från bordet och telefonen, i spelets setup med antal per spelare (K28, #1129). Typerna, setupen och aktivitetsraden med värden (#1136), telefonens ark «Tärningar» med flerslag i ett kuvert (#1138), fliken Bord med en rad per tärning (#1139), bordet som ritar och slår dem (#1137), och trycket, där en tärning är en köpt lagervara som partnern packar och som går att välja bort (#1140).
- ✅ Vägen tillbaka mellan editorn och borden (L80, #1217): varje bordsyta leder ägaren till editorns egen flik, ett bord öppnas i sin egen flik i stället för en ny, ägaren som lämnar `/online` landar i spelet, och Mina spel, `/join` och `/login` har en väg vidare.
- ✅ Materialets plats (K31, #1292): tärningar och räknare dras i fliken Bords filt dit de ska ligga, och en punkt i en yta vid platserna vänds mot varje plats kant.
- ✅ Vägen in till ett bord (L86, #1286): två sätt att sitta, runt en TV eller vid varsin dator. Varje start frågar vilket och bordet minns svaret, så ett bord har en väg in, «Öppna bordet», och anslutningssidan ett enda «Gå med» på varje skärm. Genvägarna där designern hoppade in själv är borta ur editorn.
- ❓ Fler komponenttyper än standardkortet och tärningen — bricka, meeple, bräde (B1, B2, B3).
  Frågan är om release är "kortspel" eller "kort- och brädspel"; A1 talar för kort först.

## Fas 2 — Editorn färdig ✅

Målet är att designern aldrig behöver ett annat verktyg för att göra leken.
Klar 2026-09-08: varje punkt nedan är byggd, och besluten bakom dem står i DESIGN-BESLUT.

- ✅ Setup-editor: recept som start, bordet som finjustering — zoner, platser, händer, högar, räknare och egna zoner i editorns flik "Bord" (B5, K2).
- ✅ Bordet är designerns (2026-09-15): receptet lägger bara öppningsbordet, varje zon och hög går att ta bort och stannar borta, leken är en roll en hög bär, och fliken "Bord" är listan över bordets alla zoner med filten bredvid (B5 reviderat).
- ✅ Bilder: bildceller i editorns tabell, spelets bilder en gång var, innehållsadresserad lagring i R2 via `/assets` (E1, DRIFT §4).
- ✅ Symbolbibliotek: fliken "Symboler" med sök och kategorier, väljare vid klammern i tabellen, symboler som projektets assets och licenser hela vägen till trycket (E4).
- ✅ Symbolerna bär färg: spelet namnger sina betydelser med var sin färg, `{namn|roll}` i korttext och i ikonraden, biblioteket omritat som en form i en färg med hålen skurna så masken kan målas, och paletten dömd med kortkontrollens egna mått för kontrast och färgblindhet (E4, E5).
- ✅ Speltema (2026-10-02, #612): fliken "Symboler" blev "Speltema", där spelets typsnitt, betydelser med färger och ikoner väljs som ett tema ur ett galleri av färdiga teman, avvikelserna sägs på en rad, klammern i Tabell föreslår ur temat, och den guidade starten väljer ram och tema tillsammans som «Utseende» (L57).
- ✅ Spelets eget tema (2026-10-25, #1287): Speltema börjar med spelets eget tema, utfällt och med spelets första kort bredvid, och de färdiga temana är exempel i ett ark som kopieras med en fråga om vad som byts ut; spelet minns inte vilket exempel det kom ifrån (L84).
- ✅ Bildens källa ramas mot ett mått: bildelementet bär hur stor andel av ramen motivet fyller — filen skrivs aldrig om (E1). Kortväggens «Bildernas mått» och kortets egen avvikelse avvecklades när bilden fick bära sin beskärning (#607).
- ✅ Fysisk validering: minsta textstorlek, kontrast, färgblindhet, utfall och linjetjocklek, som rapport på kortväggen och blockerande fel vid order (E5, E6).
- ✅ Versionering: oföränderlig historik, namngivna milstolpar, diff i korttabellen och att ta tillbaka en äldre version (B4).
- ✅ Regelboken: versionerat dokument med referenser till zoner och kort, skrivet i fliken "Regler", läst vid bordet, på telefonen, hos observatören och i distansläget (#709), och tryckt som häfte i A5 genom samma renderare som korten (B7).
- ✅ Samredigering: en aktör per projekt med en redigeringslogg, live över `/projects/:id/edit`, med närvaro, roller, inbjudningar och återuppkoppling (D3).
- ✅ Typsnitt: familjen väljs i mallens egenskapspanel, filen laddas upp som projektets asset och pinnas av versionen, licensen anges bredvid familjen och följer med till trycket, och en familj utan fil är ett varsel i den fysiska kontrollen (B3, E5) — licensfrågan i (I) står kvar, verktyget levererar inga egna fontfiler.
- ✅ Typsnittskatalogen: hela Google Fonts söks från Template-sidan i ett ark under kortet, där varje träff sätter kortets egen rubrik och dess regeltext i kortets egen grad; den valda familjen kopieras in som projektets egen asset med licensen ifylld, och Google nås bara av designerns webbläsare och bara när väljaren öppnas (L27, #329).
- ✅ Flerspråkighet i verktyget: en katalog per språk och yta, en språkväljare, och hela editorn, bordet, telefonen, kontot och guiden på svenska eller engelska; mejlen och regelhäftets enda verktygsrubrik följer med, och ett spel som skapas på engelska får engelska zoner, räknare och kolumnnamn (A4).
- ✅ "Mina spel" med senast spelat, starta bord direkt från kortet och ta bort spel med hela dess historia (G1). Sedan #1204 en arbetsbänk: det senast sparade spelet stort med solfjäder, övriga som rader, och en högerspalt med pågående bord, spelade bord och rumskoden. Sedan #1225 har högerspalten «Väntar på dig» (nya flaggor på spelets senaste version, enkäter att svara på och en medredigerares version) och heron spelarnas enkätsvar och de nya flaggorna.
- ✅ Verktyget talar vanlig svenska, och sekundära kontroller bär ikoner (L73, #1101, beställarens beslut 2026-10-22): alla fyra katalogdelar är omskrivna på svenska och engelska med en grind som håller tonen, verktygets egna namn (Ögon, hoppspalten, etapperna, Bordets lyft, «n inne») är bytta mot vanliga ord, och ångra, flagga, lämna, senast, guidens steg, profil, logga ut, importera och visa alla ritas som ikoner i #1083:s hand med ordet som namn och tooltip.
- ✅ AI-stöd i editorn med designerns egen nyckel hos Anthropic eller OpenAI (2026-10-07, #940): förslag på mall, fält, kort och regeltext, aldrig bild; nyckeln krypterad på kontot och anropet förmedlat av servern; ytan är vald — en samtalspanel i editorn och nyckeln på en egen profilsida (E4). Byggt: profilsidan med nyckeln, valvet och leverantörernas prövning och modellista (#999); panelen med frågor om spelet och strömmade svar genom serverns proxy (#1001); nya kort som förslag, strömmade del för del, på väggen och godtagna som en sammansatt redigering (#1002); ändrade kort med urvalet som kontext, gammalt → nytt på väggen och i Tabell, och «Välj delar…» (#1003); att förfina ett väntande förslag med en följdinstruktion (#1004); mallförslag, en mallsida i elementmodellen med sina nya fält, förhandsvisad på väggen (#1005); kontextens budget, så att en stor lek skickas sammanfattad med fältens värden och ett urval kort (#1007); regeltext som förslag, block i regelbokens eget format placerade vid id och förhandsvisade i Regler-fliken (#1006). Blockerar inte release.
- ✅ En landningssida på `/` för den som inte är inloggad, som visar konceptet med ett dukat bord och leder vidare till editorns startsida; kodraden står kvar för spelaren (G1, #1009).

## Fas 3 — Konton, betalning och data

Målet är att kunna ta betalt och lämna ifrån sig allt.

- ✅ Kvoter och mätning: nivåer som konfiguration, kontots nivå, tak på projekt, kort, bord och lagring, och förbrukningen läsbar för designern och operatören (A2, DRIFT §12, #1192). Nivåerna i `BYD_PLANS`, kontots nivå och spel som första mått (#1193), bordets bärare (#1194), kort per spel som rader och exemplar (#1195), bord som mått, öppna och startade under rullande 30 dygn (#1196), lagring och renderingar (#1197), och hur ett nått tak och förbrukningen sägs, där designern tryckte och i Profil (#1198, variant A).
- ⬜ Abonnemang via Stripe: betalnivåerna och kassan, som skriver kontots nivå i `account_plans` (A2, DRIFT §12).
- 🔶 Full export i dokumenterat JSON med assets, mallar, historik och tryckfiler; läsläge vid utgånget abonnemang (G5). Exporten och importen är byggda, på servern och i Mina spel (#527, #528, #529); läsläget vid utgånget abonnemang återstår och väntar på abonnemangen.
- ✅ Att claima en gästsession till ett konto efteråt: telefonen erbjuder det när sessionen är slut, claim-sidan knyter gästens admission till kontot, och startsidan visar "Bord du spelat vid" med plats, namn, utfall och vägen tillbaka (G1).
- 🔶 Passkeys och OAuth som bekvämlighet; passkey-återställning som UX (DRIFT §11). Passkeys är byggda (#1180, L78): bandet på Mina spel efter länken, knappen och förslaget på inloggningskortet och kortet på profilen, med mejlet som återställning; OAuth återstår.
- ✅ Kontots eget namn: ett välkomststeg efter första inloggningen med förslaget ur adressen, ett band på Mina spel för konton som fanns före det, kortet «Namn» i Profil, och namnet i Dela, i editorns huvud, för ägaren som tittar på vid bordet, i inbjudningsmejlet och i kvotraden med «spelets ägare» som reserv (#1254, L85).
- ✅ Behörighetsroller: ägare, medredigerare, testledare, betraktare, med inbjudan per adress; byggt med D3 i fas 2.
- 🔶 GDPR för gäster och konton: Deckster är personuppgiftsansvarig, lagringstider, maskning på plats i loggen, radering för gäst och konto, och registerutdrag (G6, beslutat 2026-10-24, #1269).
  Raderingen i lagret är byggd (#1279): ett inträde, ett bords gäster och ett borttaget spels bord maskas på plats, gästen utan konto gallras tolv månader efter att bordet slutade, liggaren körs om efter en återställning, och operatören raderar med `erase`.
  Skivorna: personfälten som sluten karta (#1276), rensningen av det som inte längre kan användas (#1277), namn och token ur adressraden (#1278), raderingen i lagret (#1279), gästens väg från telefonen med meningen och integritetstexten (#1281, L87) och kontots väg i Profil, med utdraget, raderingen och sopningen efter 30 dygn (#1280), och bandet på medredigerarens Mina spel när ett spel hon redigerar försvinner (#1334), är byggda.
- 🔶 Villkor med garantiklausul om IP, godkända i ett eget steg efter första inloggningen; korta betavillkor i betan och en releaseversion på ett aktiebolag (F4, reviderad 2026-10-24, #1268).
  Villkorsversionen och godkännandet på servern (#1270) och betavillkoren med sidan, steget, läsläget och grinden (#1272) är byggda.
  Releaseversionen på aktiebolaget återstår.

## Fas 4 — Drift i produktion

Målet är att tjänsten tål riktiga användare, dygnet runt, på en låda hemma.

Första produktionssättningen gjordes 2026-09-12: `v0.4.0` körde på `deck.ockelberg.com` (sedan 2026-10-22 deckster.se, A5), bakom lådans egen omvända proxy (DRIFT §2, reviderad), med assets och WAL-arkivering i R2:s europeiska jurisdiktion och inloggningsmejl genom Resend.
Deployen är pull-baserad och timern är på: att tagga är att deploya.

- ✅ Assets i R2: renderade texturer och tryckfiler i R2, `/faces/:hash` svarar 302 till en signerad URL som lever en timme och cachas i femtio minuter; hashen är förmågan (DRIFT §4).
- ✅ WAL-arkivering till R2 med WAL-G i Postgres-bilden, nattlig basbackup, återställningsprov som spelar upp den senaste sessionen genom motorn (DRIFT §5).
- ✅ Hälsokontroll som även prövar R2 (DRIFT §2).
- ✅ Händelseschemats `schemaVersion` på varje rad och upcasters vid inläsning; korpusens filer lyfts, aldrig skrivs om (DRIFT §7).
- 🔶 Riktiga loggar i replay-korpusen, anonymiserade; svar på hur anonymiseringen behåller det värdefulla (DRIFT §7). Svaret och verktyget finns (#540): spelets egna ord och kortens id byts mot pseudonymer, spelet och utfallen står kvar. Beställaren beslutade 2026-09-29 att stänga #540 utan en första riktig session ur lådan; korpusen får riktiga sessioner först med betan (fas 6).
- 🔶 Rate limiting mot join- och login-endpointerna (DRIFT §9): lådans egen proxy gör det sedan 2026-09-11, 100 i sekunden med burst 50, räknat på riktiga besökar-IP:n eftersom proxyn litar på Cloudflares vidarebefordrade huvuden. Kvar är att flytta den framför huset, vilket §9 ber om — den här stoppar inget innan det når fibern.
- 🔶 Tailscale för administration är i drift sedan 2026-09-11, och en extern pulskoll mot `/health` beslutades 2026-10-18 inför betan (DRIFT §8); UPS för lådan står kvar (DRIFT §10, öppna frågor).
- ✅ Minnesbudgeten reviderad och mätt i vila 2026-09-11: taken är render 1,5 GB, Postgres 768 MB, app 512 MB på en låda som delas med ett trettiotal andra containrar, och stacken tar 605 MB av dem när ingen spelar (DRIFT §1). Mätt under last 2026-10-18 med ett upprepbart lasttest (#1012): ett bord med 308 illustrerade kort pressade appen mot sitt tak och tre samtidigt fällde den. Två läsningar av hela leken rättades, och sedan #1028 namnger leken och sidorna sina bilder med hash och renderworkern läser bytesen själv (DRIFT §4): tre bord samtidigt toppar på app 189, render 602 och Postgres 201 MiB, inom dagens tak.
- 🔶 Dokumenterad återställning från noll: ny låda, `.env`, restore, deploy — skriven som [ops/RUNBOOK.md](ops/RUNBOOK.md); vägen från R2 till den riktiga datavolymen är körd först den dag den behövs.

## Betan — före tryck

Betan kommer före fas 5, inte efter den: startsidan lovar det som finns, «Skapa ditt kortspel och speltesta det på skärmen — tryck kommer.» (L36 reviderad, #743).
~~Den kräver varken villkor eller GDPR för gäster, eftersom betans minsta förtroendeyta är beslutad och byggd (I, #757).~~
Reviderat 2026-10-24 av beställaren (F4, #1268): betan kräver korta betavillkor före inbjudningarna, eftersom tryckpaketet lämnar tryckfärdiga filer, betan är öppen för alla och skuggscreeningen behöver stöd i villkoren (#1272).
GDPR-arbetet för gäster (G6, #1269) krävs inte före inbjudningarna; betans minsta förtroendeyta är beslutad och byggd (I, #757).
Betan är öppen för alla, utan kvoter, och dess sessioner når korpusen med samtycke i inbjudan (I, beslutat 2026-10-18).

- ✅ Minsta förtroendeyta: kontakt, version, vad en gäst lämnar efter sig, mejlets fot (I, #757); stacken skickar `BYD_CONTACT` till appen sedan 2026-10-18 (#1030), och lådans `.env` behöver raden ifylld.
- ✅ Säljtexten lovar inte trycket (L36, #743).
- ✅ Speltestet före betan 2026-10-02: 94 fynd ur tretton resor (#675–#768), alla rättade; de två som väntade på beställarens val av prototyp valdes 2026-10-20 och är byggda: lagerraden som bryter (L3, #699) och antal på listen med grupp i typ (L4, #695).
- ✅ Designern läser playtestets svar — enkätsvar och flaggor per bord och version, i Bord-flikens vy «Resultat» (G3, L70, #1010).
- ✅ En flagga kan gälla ett kort, som pekas ut efter «Flagga», och Resultat visar kortet som det såg ut i versionen det flaggades på (G3, #1142).
- ✅ Korpusen får läsa samtyckta kontons bord, och inget annat (DRIFT §7, #1011).
- ✅ Ett enkätsvar kommer från deltagarens eget inträde, ett per plats, och ett andra svar ersätter det första (G3, #1021).
- ✅ Minnesbudgeten mätt under ett riktigt playtest mot lådans tak (DRIFT §1, #1012), och tre bord på 308 kort ryms sedan leken bär hashar i stället för bilder (DRIFT §4, #1028). Det tredje av tre bord som startas samtidigt väntar runt sex minuter på sina texturer; beställaren beslutade 2026-10-18 att mäta det i betan i stället för att bygga bort det.
- ⬜ Extern pulskoll mot `/health`, uppsatt av beställaren (DRIFT §8).
- ✅ Tjänsten heter Deckster och ligger på deckster.se (A5): namnet är bytt överallt en användare läser det, och produktionen flyttade 2026-10-22 från `deck.ockelberg.com`, som svarar 301 till den nya adressen med sökväg och query kvar (#1080).
- ✅ Ett märke, handen (A6): tre kort i bärnsten, grönt och papper i fliken, på hemskärmen, på landningssidan och i inloggningskortet, ritade från en enda ritning (#1082), i en delad länk och överst i rummets TV-spalt (#1084).
- 🔶 Korta betavillkor, och godkännandet i ett eget steg efter första inloggningen, samordnat med välkomststeget för visningsnamnet (F4, #1270, #1272, #1254).
  Byggt (#1272): `/villkor` med villkor och integritet, villkoren som välkomstkortets andra steg, bandet för befintliga konton, läsläget och grinden på servern.
  Kvar före inbjudningarna: uppgifterna om «vi» i hakparenteser, som beställaren fyller i på ett ställe (`packages/web/src/terms/operator.ts`).
- ⬜ En release från main med allt ovan, och tre till fem designers inbjudna med samtyckesfrågan.

## Fas 5 — Tryck

Byggs sist (H3), och stänger den tunna skivan (H1).
Beställaren beslutade 2026-10-23 (#1199) att stödet för fler partner och tryckpaketet byggs redan i betan, medan partnervalet, ordern och spårningen väntar (F1, F2, H3).

- ✅ `PrintProvider`-abstraktionen i `packages/print`: komponenttyp till SKU, tryckunderlagskrav, prissättning, orderläggning och spårning, formad efter The Game Crafter och QPMN, med ett förberedelsesteg, regiondirigering för EU-kravet och kraven som data ur `requirements()`, en fake-provider och en kontraktssvit som varje adapter ska klara (F2, TUNN-SKIVA §4, #1206). Ingen serverväg anropar `submit` eller `track` ännu.
- ✅ Tryckfiler efter partnerns krav: raster i exakta pixelmått och utfall ur `requirements()` i stället för typens fasta 3 mm, från den enda renderaren (E2, F2, #1207). Servern förbereder en providers order och ritar dess filer, och `GET /projects/:id/print-package` lämnar dem med regelhäftet; CMYK är inte byggt och väntar på en riktig partner.
- ✅ Tryckpaketet: designern ser vad som skulle skickas till tryckeriet, förklarat, och laddar ner det i betan (F1, #1208, beslut B). En egen sida, `/print-package`, med kniven, leken, lagervarorna, kraven och zippen i fem delar och en följesedel med Testtryckeriets exempelsvar; nås ur spelets ⋯ och ur Fysisk kontroll. Testtryckeriet är den provider servern registrerar, en fake-provider som låtsas trycka i Sverige och ställer typens krav.
- ⬜ Tryckpaketet kostar att ladda ner när en riktig partner finns, i en form som beslutas med abonnemangen (F1, A2, #1209).
- ⬜ En verklig POD-partner integrerad; all beställning går via plattformen (F1). Ingen partner är vald: #1199 fann inget tryckeri som både tillverkar i EU och har ett order-API, och EU-kunder går till EU-tryck (F2).
- ✅ Tryckunderlag: renderaren gör vektor-PDF med utfall från samma HTML/CSS som texturerna (E2), utan passmärken, eftersom ingen av partnerna i #1199 vill ha dem; partnerns krav i pixlar och utfall är byggda (#1207). Tryckprofilen per typ (B2) bär hela vägen: varje typ i registret har sin profil, standardkortet trycks i sitt mått med sitt utfall, sin skyddsmarginal och sina textgolv, tärningarna är lagervaror som partnern packar eller som lämnas utanför (#1140), och räknaren följer inte med trycket (#1208, beslut B). Ark med flera kort per sida finns inte, eftersom partnerna i #1199 tar en fil per kortsida.
- ⬜ Tryckfiler i CMYK, som E2:s ICC-steg efter renderingen; väntar tills en riktig partner är vald (#1207).
- ⬜ Kassa med kostnadsbesked först i flödet, ingen prisvisning i editorn (F3).
- ⬜ Automatisk IP-screening med manuell eskalering före tryck (F4, reviderad 2026-10-24, #1268): klassificerare och bildhash på lådan, i skuggläge vid uppladdning redan i betan, och grind först i kassan.
  Screeningkontraktet, cachen per hash och jobbslaget `screen` är byggda med en fake-klassificerare och operatörens `screening run` och `report` (#1271); lådans klassificerare (NSFW-ViT och CLIP i int8), PDQ, referenslistan i databasen och screeningen vid uppladdning i skuggläge är byggda och mätta mot kortkonst (#1273); anmälan och spärr per hash är byggda (#1274, L88): `/villkor/anmal`, kvittot, `report` för operatören och «Spärrad» i Tabell; granskningen före tryck (#1275) prototypas först och väntar på kassan och en partner.
- ⬜ Moms, tull och leveransvillkor för EU-kunder: DDP eller DDU, IOSS (I, ekonomi).
- ⬜ Fontlicensiering för tryck (I).
- ⬜ En riktig order som landar i brevlådan (H1, TUNN-SKIVA).

## Fas 6 — Releasegrind

Innan första betalande användaren:

- ⬜ Betabruk med tre till fem designers ur målgruppen (A1), rekryterade med delbar länk (A3), med enkäterna som mått (G3); vad betan kräver står i avsnittet ovan.
- ⬜ Replay-korpusen innehåller deras sessioner och spelar upp identiskt på varje commit (D4).
- ⬜ Återställningsprovet har körts mot en riktig backup (DRIFT §5).
- ✅ Tillgänglighet i verktyget självt på en grundnivå: tangentbord, kontrast, skärmläsarnamn (I). Granskningen 2026-09-29 (#549) fann 84 fynd, och alla är rättade eller beslutade och byggda (#550–#560, #569, #570, #575, #579–#581).
- ⬜ Prisnivåernas tak och gratisnivåns gränser beslutade (I, A2).
- ⬜ Villkor, integritetspolicy och GDPR-rutiner på plats (F4, G6, #1268, #1269): releaseversionen av villkoren skriven på aktiebolaget och läst av en jurist; integritetspolicyn (#1281); biträdesavtal med Cloudflare och Resend, och Resend prövad mot Data Privacy Framework eller standardavtalsklausuler; gallringen och raderingsliggaren i drift (#1279).
- ⬜ En sista genomgång av mönstret i avsnitt J: att de fyra besluten som skär bort kopplingarna mellan pelarna fortfarande är rätt.

---

## Öppna frågor som blockerar release

Från DESIGN-BESLUT I och DRIFT:
- Moms, tull och leveransvillkor för fysiska varor (fas 5).
- ~~GDPR för gästdeltagare (fas 3).~~ Besvarad 2026-10-24 (#1269): se G6.
- Fontlicensiering mot kravet att bevara fontfiler (fas 2 och 5).
- Prisnivåernas tak (fas 3 och 6).
- Om release omfattar fler komponenttyper än kort (fas 1).

## Öppna frågor som inte blockerar release

- ~~Anonymisering av replay-korpusen (fas 4).~~ Besvarad 2026-09-28 (#540): se DRIFT §7.
- UPS (fas 4). Den externa pulskollen är besvarad 2026-10-18: ja, inför betan (DRIFT §8).
- Tillgänglighet utöver grundnivån (fas 6).

---

## Arbetssättet fram till release

Varje punkt byggs med `/tdd`, röd → grön → refaktorering, och allt visuellt prototypas med `/prototype` i tre strukturellt olika varianter innan det byggs på riktigt ([CLAUDE.md](CLAUDE.md)).
Ett beslut ändras i DESIGN-BESLUT.md eller DRIFT.md, aldrig genom att koden tyst avviker.
När en punkt är klar markeras den här, med det beslut den uppfyller.
Faserna är en ordning, inte en tidplan: utvecklingstid är inte en begränsande faktor (H2), men beroendena är det.
