// Bordet, telefonen, åskådarvyn, att gå in i ett spel och sidorna runt själva spelandet.
//
// Vad en designer skrivit står aldrig här: zonnamn, genvägar, korttext och regeltext kommer från
// spelet och lämnas som de är. Det som står här är bara det verktyget själv säger.
export const svPlay = {
  // Gemensamt för alla spelytor.
  'play.connecting': 'Ansluter…',
  'play.session.missing': 'Inget bord angivet.',
  'play.session.seat.missing': 'Bord eller plats saknas.',
  'play.cards.one': '{n} kort',
  'play.cards.other': '{n} kort',
  'play.latest': 'Senast',
  // Bordet självt som handlande: det som ingen enskild plats gjorde.
  'play.table': 'Bordet',
  // Samma bord som granne på filten, där namnen står med liten bokstav.
  'play.peer.table': 'bordet',

  // Ett korts bild medan den renderas, när den gått förlorad, och när någon ber om den igen (#10).
  'texture.pending': 'Kortet renderas…',
  'texture.failed': 'Bilden kunde inte laddas',
  'texture.retry': 'Försök igen',
  'texture.lost.one': '{n} kort kunde inte renderas',
  'texture.lost.other': '{n} kort kunde inte renderas',

  // Bordsskärmen.
  'ended.title': 'Bordet är avslutat',
  'ended.locked': 'Loggen är låst på {version}. Enkäten finns på telefonerna.',
  'ended.rows.one': 'rader',
  'ended.rows.other': 'rader',
  'ended.flags.one': 'flaggade ögonblick',
  'ended.flags.other': 'flaggade ögonblick',
  'ended.players.one': 'spelare',
  'ended.players.other': 'spelare',
  'rewind.proposal': 'Förslag',
  'rewind.looked': 'så här såg bordet ut {where}',
  'rewind.waiting': 'väntar på {who}',
  // En hög som bara finns för att två kort lades på varandra (K1) har inget namn från designern.
  'pile.dynamic': 'hög',

  // TV-läget runt filten.
  'tv.join': 'anslut med telefon',
  'qr.enlarge': 'Visa koden större',
  'qr.title': 'Anslut med telefonen',
  'qr.close': 'Stäng',
  // Vad bilden är till och vilket rum, före adressen som går att skriva av utan kamera (K9, #560).
  'qr.join.alt': 'QR-kod: anslut med telefonen, rum {code} ({url})',
  'tv.inspect': 'Inspektion',
  'tv.inspect.hidden': 'dolt kort',
  'tv.inspect.empty': 'peka på ett kort',
  'tv.show.by': '{name} visar',
  'tv.show.table': 'Bordet visar',
  'player.show': 'Visa för alla',
  'player.show.said': 'Visas för alla',
  // "Senast" innan någon rört bordet (UX-16): rubriken säger vad listan fylls av.
  'tv.latest.empty': 'Inget hänt ännu. Det som spelas vid bordet hamnar här.',
  // Fördjupningen bakom frågetecknet (L32:s tillägg, #305). Raden vid koden är fyra ord; vad
  // telefonen blir när den ansluter står i lådan.
  'tv.join.help.topic': 'att ansluta',
  'tv.join.help.how': 'Spelarna öppnar adressen på sin telefon och skriver rumskoden, eller läser av rutan.',
  'tv.join.help.phone': 'Telefonen blir handen: korten ligger där, och bordet står kvar här.',
  'tv.seats': 'Platser',
  'tv.seat.hand.one': '{n} kort på hand',
  'tv.seat.hand.other': '{n} kort på hand',
  // En plats på en rad, vid fulla bord (#482 fynd 6): namnet tar resten av raden.
  'tv.seat.hand.short.one': '{n} kort',
  'tv.seat.hand.short.other': '{n} kort',
  // Platsens tredje rad innan platsen gjort något (UX-41): ett ord, inte ett streck.
  'tv.seat.none': 'Inget ännu',
  // Where the name of a seat nobody sits in stands; the ball beside it keeps the letter (#717).
  'tv.seat.free': 'ledig',
  // Observatörens platser som listor att fälla ut (#551, beslut A): ett kort per rad, och raden
  // säger var kortet ligger. Handen heter som på filten, «Adas hand» (K19).
  'tv.list.table': 'På bordet',
  'tv.list.card': '{card}, i {where}',
  'tv.list.card.down': '{card}, nedvänt, i {where}',
  'tv.list.down': '{card} (nedvänt)',
  'tv.list.pile.one': 'hög, {n} kort, överst {top}',
  'tv.list.pile.other': 'hög, {n} kort, överst {top}',
  'tv.list.area.one': '{n} kort',
  'tv.list.area.other': '{n} kort',
  'tv.observers.one': '{names} tittar på · ser allt',
  'tv.observers.other': '{names} tittar på · ser allt',

  // Ringen av verb runt fingret (C).
  'ring.flip': 'Vänd',
  'ring.look': 'Titta',
  'ring.rotate': 'Vrid',
  'ring.reveal': 'Avslöja',
  'ring.move': 'Flytta…',
  'ring.shuffle': 'Blanda',
  'ring.draw': 'Dra 1',
  'ring.half': 'Dela på hälften',
  'ring.flipTop': 'Vänd översta',
  // Spelets egna åtgärder under ringen (K14, utvidgad). Namnen i listan är designerns och
  // översätts aldrig; det här är bara det verktyget säger runt dem.
  'ring.action.howMany': 'Hur många — {name}?',
  'ring.action.go': 'Kör',
  'ring.action.why.nowhere': 'ingen sitter vid bordet än',
  'ring.action.why.none': 'det blir inga kort just nu',
  'ring.action.why.nothing': 'åtgärden har inga steg',
  'ring.action.why.gone': 'högen är inte kvar',
  'ring.action.why.asks': 'ett steg frågar efter ett tal',
  'ring.action.why.unfinished': 'ett steg har inte sagt vilka kort det letar fram',
  'start.tile': 'Starta spelet',
  'start.blocked': 'Går inte att starta just nu: {why}',
  'start.again.label': 'Starta om spelet?',
  'start.again.tile': 'Starta om',
  'drop.unanswered': 'Bordet har inte svarat på draget än.',
  'drop.nobody': 'Ingen sitter vid {seat} än, så kortet går tillbaka.',
  'start.again.text': '{actions} körs igen. Korten som ligger ute ligger kvar där de är.',
  'start.again.action': '«{action}» på {pile}',
  'start.again.and': ' och ',
  'start.again.yes': 'Ja, starta om',
  'kbd.hint.action.asks': 'kräver ett tal; skriv det i listan vid högen',
  'kbd.hint.action.own': 'spelets egen åtgärd',
  'ring.action.list': 'Vad {zone} kan',
  // En räknares verb (C4, #67): ett steg åt vardera hållet och ett tal sagt rakt ut. Ringen och
  // tangentbordets panel läser samma lista; varje handling går ut som `setCounter`.
  'ring.counter.minus': '−1',
  'ring.counter.plus': '+1',
  'ring.counter.set': 'Sätt värde…',
  // Vems räknaren är. Ett delat bord behöver det; telefonen visar bara sin egen plats.
  'ring.counter.whose': '{name:s} räknare',
  // En plats tredje räknare staplas med de andra, så högens ring säger var och en av dem rakt ut
  // och navet säger hur många de är (#89).
  'ring.counter.named': '{name} {n}',
  'ring.counter.pile': 'räknare',

  // Den diskreta hjälpen och filtens snabbkommandon (#224). Knappen är ytans, inte verktygets
  // enda: `{where}` är ytan sagd med dess egna ord, och en annan yta som håller samma knapp
  // säger sina egna kommandon i den.
  'help.title': 'Snabbkommandon',
  'help.open': 'Snabbkommandon {where}',
  'help.where.felt': 'på bordet',
  // Tangenten som betyder «gör det med det jag pekar på» heter olika på olika maskiner: Ctrl +
  // klick är systemets sekundärklick på en Mac, och sidan får då aldrig något `click`.
  'felt.press.modClick': '{mod} + klick',
  'felt.press.doubleClick': 'Dubbelklick',
  'felt.key.flip': 'Vänd kortet, eller högens översta, under pekaren',
  'felt.key.draw': 'Dra översta kortet från högen under pekaren',
  'felt.key.shuffle': 'Blanda högen under pekaren',
  'felt.key.escape': 'Stäng hjulet · avbryt draget',
  'felt.key.help': 'Visa den här listan',

  // Kameran på live-bordet (C5, #325). Vyn står kvar tills den återställs, så varje väg tillbaka
  // måste stå någonstans: knapparna i hörnet för den som pekar, och de här raderna för den som
  // inte gör det.
  'camera.controls': 'Kameran',
  'camera.zoom.in': 'Zooma in',
  'camera.zoom.out': 'Zooma ut',
  'camera.whole': 'Visa hela bordet',
  'camera.level': '{n} %',
  'camera.fold': 'Fäll undan kamerakontrollerna',
  'camera.unfold': 'Ta fram kamerakontrollerna',
  'felt.press.wheel': 'Hjul',
  'felt.press.middleDrag': 'Mitten + drag',
  'felt.press.spaceDrag': 'Space + drag',
  'felt.press.arrows': 'Skift + piltangent',
  'felt.key.zoom': 'Zooma in och ut kring pekaren; vyn står kvar',
  'felt.key.pan': 'Panorera vyn',
  'felt.key.escape.camera': 'Stäng hjulet · avbryt draget · visa hela bordet',

  // Tangentbordet på filten (#1, #2, variant C "adressen"). Zonnamn och kortnamn kommer från
  // spelet och står i meningarna som designern skrev dem; allt runt dem är verktygets.
  //
  // Verben är ringens: tangentbordet säger exakt de verb pekdonet säger och aldrig ett nytt, så
  // de delar nycklar. Det som bara finns här — en vridning i steg, en dragning till min hand —
  // har egna.
  'kbd.hidden': 'Dolt kort',
  'kbd.card': '{name}, kort i {zone}',
  'kbd.card.rotated': '{name}, kort i {zone}, vridet',
  // En räknare är inte ett kort (C4), och ordlistan ger begreppet sitt eget ord (A4). Värdet står
  // med i meningen därför att det är det enda brickan visar — talet är hela poängen med en
  // räknare, och på filten ryms inte ens namnet i den (se `TOKEN_NAME_PX`).
  'kbd.counter': '{name}, räknare i {zone}, värde {n}',
  // Namnet på en räknare är designerns (B5) och kan saknas i en vy som inte får se den. Ett korts
  // reservord är `Dolt kort`, och det skulle smuggla tillbaka `kort` i en brickas mening.
  'kbd.counter.unnamed': 'Räknare i {zone}, värde {n}',
  'kbd.pile.top': 'Översta kortet i {zone}: {name}',
  'kbd.pile.empty': '{zone}, tom',
  // En hög är ett stopp (#572): namnet, hur mycket som ligger i den, och vad som ligger överst.
  'kbd.pile.one': '{zone}, {n} kort, överst: {top}',
  'kbd.pile.other': '{zone}, {n} kort, överst: {top}',
  // Vad Enter gör, sagt sist i meningen: en kontroll som öppnar en panel ska säga det.
  'kbd.enter': '{label}. Enter öppnar handlingar.',
  'kbd.hand.mine': '{name}, i min hand',
  'kbd.hand.mine.marked': '{name}, i min hand, markerat',
  'kbd.verb.rotate': 'Vrid 90°',
  'kbd.verb.lookTop': 'Titta på översta',
  'kbd.verb.lookBottom': 'Titta på understa',
  'kbd.verb.toHand': 'Dra 1 till min hand',
  'kbd.verb.beside': 'Lägg 1 bredvid',
  'kbd.hint.reveal': 'visar kortet för alla',
  'kbd.hint.look': 'bara på den här skärmen',
  'kbd.hint.half': 'ny hög bredvid',
  'kbd.hint.counter.becomes': 'blir {n}',
  'kbd.hint.counter.set': 'skriv ett tal',
  'kbd.hand.my': 'Min hand',
  'kbd.hand.other': '{name:s} hand',
  'kbd.place.floor': 'Bordet',
  'kbd.place.floor.hint': 'fri yta',
  'kbd.place.onCard': 'På {name}',
  'kbd.place.nth': '{label} {n}',
  'kbd.place.onCard.hint': 'bildar en hög i {zone}',
  'kbd.place.pile.one': '{n} kort · överst',
  'kbd.place.pile.other': '{n} kort · överst',
  'kbd.place.hand.one': '{n} kort',
  'kbd.place.hand.other': '{n} kort',
  'kbd.place.area.one': '{n} kort · fri yta',
  'kbd.place.area.other': '{n} kort · fri yta',
  'kbd.panel.label': 'Handlingar för {what}',
  'kbd.panel.do': 'Gör',
  'kbd.panel.moveTo': 'Flytta till',
  'kbd.panel.movePile': 'Flytta hela högen till',
  'kbd.panel.moveTop': 'Flytta översta kortet till',
  'kbd.panel.free': 'Fri placering — en punkt på filten',
  'kbd.panel.free.hint': 'kräver pekdon; med tangentbord finns bara platser med namn',
  'kbd.panel.empty': 'Högen är tom. Det finns inget att göra med den.',
  'kbd.panel.close': 'Stäng',

  // "Sätt värde…" på en skärm utan tangentbord (#67): talet skrivs på verktygets egna knappar.
  'counter.entry.label': 'Sätt värde för {what}',
  'counter.entry.value': 'Nytt värde',
  'counter.entry.sign': 'Byt tecken',
  'counter.entry.erase': 'Sudda',
  'counter.entry.confirm': 'Sätt värdet',
  'counter.entry.cancel': 'Avbryt',

  // En rad ur loggen i ord. Namn och zoner kommer från vyn och översätts inte.
  'activity.move': '{who} flyttade ett kort till {zone}',
  // Med kortets namn när läsaren får se kortet (#507 fynd 6); annars raden ovan.
  'activity.move.named': '{who} flyttade {card} till {zone}',
  // En hand namnges av den som sitter där (K19), mitt i meningen: "till Adas hand", "till min hand".
  'activity.hand.my': 'min hand',
  'activity.hand.other': '{name:s} hand',
  'activity.rotate': '{who} vred ett kort',
  'activity.flip': '{who} vände ett kort',
  'activity.flip.named': '{who} vände {card}',
  'activity.stack': '{who} lade ett kort på ett annat',
  'activity.split.to.one': '{who} drog {n} kort från {zone} till {to}',
  'activity.split.to.other': '{who} drog {n} kort från {zone} till {to}',
  'activity.split.beside.one': '{who} delade av {n} kort från {zone} till en ny hög',
  'activity.split.beside.other': '{who} delade av {n} kort från {zone} till en ny hög',
  'activity.shuffle': '{who} blandade {zone}',
  'activity.draw.one': '{who} drog {n} kort från {zone}',
  'activity.draw.other': '{who} drog {n} kort från {zone}',
  'activity.deal.one': '{who} delade ut {n} kort var',
  'activity.deal.other': '{who} delade ut {n} kort var',
  'activity.roll': '{who} slog en tärning',
  'activity.setCounter': '{who} satte en räknare till {value}',
  'activity.peek': '{who} tittade på ett kort',
  'activity.showTo': '{who} visade ett kort för {seats}',
  'activity.reveal': '{who} avslöjade ett kort',
  'activity.movePile': '{who} flyttade en hög',
  'activity.seat.claim': '{name} satte sig på plats {seat}',
  'activity.seat.release': 'Plats {seat} lämnades',
  'activity.setup.reset': '{who} återställde bordet',
  'activity.session.end': 'Bordet avslutades',
  'activity.version.change': 'Spelet uppdaterades till {to}',
  'activity.undo.self': '{who} ångrade sitt senaste drag',
  'activity.rewind.propose': '{who} föreslog att spola tillbaka',
  'activity.rewind.confirm': '{who} godkände tillbakaspolningen',
  'activity.rewind.reject': '{who} avvisade tillbakaspolningen',
  'activity.flag': '{who} flaggade ögonblicket',
  'activity.flag.note': '{who} flaggade: {note}',
  'activity.flag.observer': '{name} (observatör)',
  // Flera rader i samma andetag blir en mening i den artiga live-regionen (D5). Singularformen
  // är ingen sammanfattning alls: en ensam rad sägs som den mening den är.
  'activity.others.one': '{latest}',
  'activity.others.other': '{n} drag av de andra, senast: {latest}',

  // Att spola tillbaka: vart, och vem som avgör.
  'rewind.someone': 'någon annan',
  'rewind.deciders': '{others} eller {last}',
  'rewind.before': 'före «{what}»',
  'rewind.atSeq': 'vid drag {n}',
  'rewind.mine': 'Du föreslår att spola tillbaka. Bordet visar hur det såg ut; {who} avgör.',
  'rewind.withdraw': 'Dra tillbaka förslaget',
  'rewind.ask.title': '{who} vill spola tillbaka',
  'rewind.ask.body': 'Bordet visar hur det såg ut. Draghögen blandas om.',
  'rewind.approve': 'Godkänn',
  'rewind.decline': 'Neka',
  'rewind.declined': '{who} sa nej till att spola tillbaka.',

  // Fördjupningen bakom frågetecknet (L32:s tillägg, #305). Samma låda som i editorn, på en
  // smalare skärm: den hänger över filtens övre del och täcker ingenting man spelar med, och
  // stängs med ett tryck utanför — vilket på en telefon är nästan hela skärmen. Det som säger
  // vad en handling får för följd flyttar aldrig hit; raden över handen står kvar där den står.
  'play.help.hand.topic': 'handen',
  'play.help.hand.pick': 'Tryck på ett kort för att läsa det, och det blir valt. Håll för att välja flera.',
  'play.help.hand.play': 'Dra ett valt kort uppåt för att spela det, eller använd knapparna under handen.',
  'play.help.hand.hidden': 'De andra ser hur många kort du har, aldrig vilka.',

  // Telefonen: handen, det som ligger framför en, och räknarna.
  'player.hint': 'Tryck för att läsa · håll för att välja flera',
  'player.hint.selected.one': '{n} valda · dra upp för att spela',
  'player.hint.selected.other': '{n} valda · dra upp för att spela',
  'player.counter.minus': '{name} minus',
  'player.counter.plus': '{name} plus',
  'player.counter.set': '{name}: {value}. Sätt värde',
  'player.mine.title': 'Framför dig · {n}',
  'player.mine.flip.down': 'Vänd ner',
  'player.mine.down': 'nervänt · bara du',
  'player.mine.down.label': '{name}, nervänt – bara du ser det',
  'player.mine.flip.up': 'Vänd upp',
  'player.mine.take': 'Ta upp',
  'player.mine.play': 'Spela…',
  'player.mine.empty': 'Inget framför dig. Spela ett kort hit från handen.',
  // Hela bordet, utfällt när det efterfrågas (C4). Raden över handen är högarna; det här är
  // varje zon läsaren ser in i, andra platsers ytor inräknade sedan #414.
  'player.table.title': 'Ytorna',
  'online.hand.back': 'Tillbaka i handen',
  'online.last': 'Senast:',
  'online.last.now': 'nyss',
  'online.last.s': 'för {n} s sedan',
  'online.last.min': 'för {n} min sedan',
  'online.table.where': 'Hela bordet står på TV:n, eller på en skärm som rymmer det.',
  // Tom hand (UX-16): samma form som raden ovanför, så telefonens två tomlägen läses som ett par.
  'player.hand.title': 'Dina kort',
  'player.hand.actions': 'Spela valda kort',
  'player.hand.read': 'Läs valt kort',
  'player.hand.chosen': 'Valt: {name}',
  'player.hand.none': 'Inget kort valt',
  'player.hand.left': 'Flytta vänster',
  'player.hand.right': 'Flytta höger',
  'player.hand.empty': 'Tom hand. Dra ett kort ur draghögen.',
  'player.hand.empty.none': 'Tom hand. Det finns inga kort att dra.',
  // Läsvyn går igenom raden kortet lyftes ur (#507): handen, ytan framför dig, eller en annan yta.
  'player.read.prev': 'Föregående kort',
  'player.read.next': 'Nästa kort',
  'player.read.at': '{n} av {of}',

  // Arket som säger vart ett kort går (C4). Kortets eget namn står fetstilt mitt i meningen, så
  // verbet och riktningen är två nycklar med namnet emellan.
  'play.sheet.title': 'Spela till',
  'play.sheet.verb': 'Spela',
  'play.sheet.into': 'till',
  'play.target.top.one': '{n} kort · överst i {zone}',
  'play.target.top.other': '{n} kort · överst i {zone}',
  'play.target.bottom.one': '{n} kort · underst i {zone}',
  'play.target.bottom.other': '{n} kort · underst i {zone}',
  'play.target.free': 'lägg fritt',

  // Sessionens egna knappar och det den vägrar med.
  'session.undo': 'Ångra',
  'session.flag': 'Flagga',
  'session.exit': 'Ut…',
  // Kortheten gäller radens bredd, inte det uppläsbara namnet: namnet börjar med etiketten på
  // knappen och säger sedan vart den leder (#48, WCAG 2.5.3).
  'session.exit.aria': '{label} ur bordet',
  'session.flagged': 'Ögonblicket är flaggat',
  'session.version.this': 'den här versionen',
  'session.refused.kicked': 'Värden har tagit bort dig från bordet.',
  'session.refused.gone': 'Länken gäller inte längre. Gå med igen med rumskoden.',

  // Att flagga ett ögonblick (G3) och att avsluta sessionen (C9).
  'flag.sheet.title': 'Flagga det här ögonblicket',
  'flag.sheet.body': 'Tidsstämplas mot loggen. En kommentar är frivillig.',
  'flag.sheet.note': 'Vad hände? (frivilligt)',
  'flag.sheet.flag': 'Flagga',
  'flag.sheet.cancel': 'Avbryt',
  'end.sheet.title': 'Avsluta bordet?',
  'end.sheet.body':
    'Loggen låses på {version}, bordet kan inte spelas vidare, och alla får enkäten på sin telefon. Att bara lägga ifrån sig telefonen avslutar inget: bordet väntar.',
  'end.sheet.end': 'Avsluta för alla',
  'end.sheet.not': 'Inte än',

  // Vägen ut (#31, prototypens variant C). Telefonens rad är redan full vid 375 px, så utgången
  // är ingen fjärde kontroll bredvid den röda: den byter ut den. Arket ställer valet, och de två
  // utgångarna hålls isär av vad de kostar, skrivet under var sin knapp.
  'exit.sheet.title': 'På väg ut?',
  'exit.sheet.leave': 'Lämna bordet',
  'exit.sheet.leave.body':
    'Din plats blir ledig och korten i din hand går tillbaka i draghögen. De andra spelar vidare. Tappar du nätet i stället står platsen kvar och du kommer tillbaka till din hand.',
  'exit.sheet.end': 'Avsluta bordet för alla',
  'exit.sheet.end.body': 'Ingen kan spela vidare, och alla får enkäten på sin telefon. Vi frågar en gång till innan det sker.',
  'exit.sheet.stay': 'Stanna kvar',

  // Enkäten efter sessionen (G3).
  'survey.title': 'Bordet är avslutat',
  'survey.sub': 'Fyra frågor, en minut. Svaren knyts till version {version}.',
  'survey.q.fun': 'Hur kul var det?',
  'survey.q.fun.low': 'segt',
  'survey.q.fun.high': 'jättekul',
  'survey.q.clarity': 'Hur tydliga var reglerna?',
  'survey.q.clarity.low': 'förvirrande',
  'survey.q.clarity.high': 'glasklara',
  'survey.q.understood': 'Hur lätt var spelet att förstå?',
  'survey.q.understood.low': 'förvirrande',
  'survey.q.understood.high': 'självklart',
  'survey.q.balance': 'Hur balanserat kändes det?',
  'survey.q.balance.low': 'någon körde över',
  'survey.q.balance.high': 'jämnt',
  'survey.change': 'Vad skulle du ändra?',
  'survey.change.placeholder': 'En mening räcker',
  'survey.failed': 'Det gick inte att skicka. Försök igen.',
  'survey.next': 'Nästa',
  'survey.send': 'Skicka',
  'survey.thanks': 'Tack, {who}.',
  'survey.tied': 'Dina svar är knutna till {version}.',
  'survey.save': 'Spara till ditt konto',

  // Åskådaren (C8).
  'observer.name': 'observatör',
  'observer.banner': 'Du är observatör: du ser allas händer och alla högar. Alla vet att du är här.',
  'observer.watching': '{name} tittar på · ser allt',
  // Fördjupningen bakom frågetecknet (L32:s tillägg, #305). Att hon syns för alla står kvar på
  // ytan i `observer.banner`: synlighetsupplysningar flyttar aldrig in i lådan.
  'observer.help.topic': 'observatörsläget',
  'observer.help.sees': 'Du ser allas händer och alla högar, också det som är dolt vid bordet.',
  'observer.help.touch': 'Du kan flagga ett ögonblick, men aldrig röra ett kort.',
  'observer.help.survey': 'När bordet avslutas får du samma enkät som spelarna, märkt som observatör.',
  'observer.more': 'Senast och platser',

  // Att sätta sig vid bordet (K12).
  'join.code.missing': 'Ingen rumskod angiven.',
  'join.code.gone': 'Rumskoden {code} gäller inte längre. Be värden om en ny.',
  'join.ended': 'Det här bordet är avslutat. Be värden starta ett nytt.',
  'join.code.expired': 'Rumskoden gäller inte längre. Be värden om en ny.',
  'join.seat.taken': 'Platsen togs precis av någon annan. Välj en annan.',
  // Kvitteringen för den som just lämnat: hon kommer tillbaka hit, och får veta vad som hände
  // med platsen och handen hon lämnade (#31).
  'join.left': 'Din plats är ledig och handen ligger tillbaka i draghögen. De andra spelar vidare.',
  'join.into': 'Du är på väg in i',
  'join.room': 'Rum {code}',
  'join.seat.chosen': 'Plats {seat} vald',
  'join.seats.full': 'Alla platser är upptagna',
  'join.seats.group': 'Platser vid bordet',
  'join.seat.pick': 'Tryck på en ledig plats',
  'join.seat.free': 'ledig',
  // Två lediga platser säger samma ord, och vilken som är vilken bärs av färgen och av kanten de
  // sitter vid. Namnet sätter platsens bokstav framför ordet ögat redan läser.
  'join.seat.label.free': 'Plats {seat}, ledig',
  'join.seat.label.taken': 'Plats {seat}, {name}',
  'join.name': 'Ditt namn',
  // Villkoret sägs en gång per skärm och först när någon trycker (#416, variant B): vägarna in
  // står öppna, och den som trycker med tomt fält får beskedet vid fältet i stället för en död
  // knapp utan förklaring.
  'join.name.says': 'Skriv ditt namn först.',
  'join.sit': 'Sätt dig',
  'join.sitting': 'Sätter dig…',
  'join.online': 'Spela på den här skärmen (bordet och handen här)',
  'join.observe': 'Bara titta (ser allt, alla ser dig)',

  // Helt online (C2): bordet och handen i samma fönster.
  'online.showall': 'Visa alla',
  'online.observers.one': '{names} tittar på',
  'online.observers.other': '{names} tittar på',

  // Reglerna vid bordet (B7). Själva regeltexten är designerns och står aldrig här.
  'rules.drawer.open': 'Regler',
  'rules.drawer.close': 'Stäng reglerna',
  'rules.drawer.ask': 'Vad undrar du?',
  'rules.drawer.loading': 'Läser reglerna…',
  'rules.drawer.none': 'Ingen regel nämner det. Fråga den som gjorde spelet.',
  // En referens till något spelet inte längre har säger vad som stod skrivet.
  'rules.drawer.ref.zone': 'zon',
  'rules.drawer.ref.card': 'kort',
  'rules.drawer.ref.counter': 'räknare',
  // Den levande siffran (#226). Brickan visar talet; örat får formen A:s hela mening, som är vad
  // beslutet gav B i utbyte mot att inte skriva ut den. «Ordningen dold» är skillnaden mellan
  // «18 kort, och jag vet vilka» och «18 kort, och det är allt som går att veta» — antalet i sig
  // är inget hemligt, varken här eller på filten bredvid.
  'rules.tally.read.one': '{name}, {n} kort',
  'rules.tally.read.other': '{name}, {n} kort',
  'rules.tally.counted.one': '{name}, {n} kort, ordningen dold',
  'rules.tally.counted.other': '{name}, {n} kort, ordningen dold',

  // Uppställningen i boken (B5, B7, #270). Orden är verktygets; zonernas namn är designerns och
  // står aldrig här. Samma ord i editorn och vid bordet, eftersom det är samma bild.
  'rules.setup.show': 'Visa uppställningen',
  'rules.setup.hide': 'Dölj uppställningen',
  'rules.setup.common': 'Gemensamt på bordet',
  'rules.setup.common.zones': 'Gemensamma zoner',
  'rules.setup.seats': 'Vid spelarnas platser',
  'rules.setup.count.one': '{n} plats. Visa en plats i taget.',
  'rules.setup.count.other': '{n} platser. Visa en plats i taget.',
  'rules.setup.pick': 'Visa plats',
  'rules.setup.seat': 'Plats {seat}',
  'rules.setup.seat.zones': 'Zoner vid plats {seat}',
  'rules.setup.seat.empty': 'Inga egna zoner vid den här platsen.',
} as const
