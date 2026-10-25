// Bordet, telefonen, åskådarvyn, att gå med i ett spel och sidorna runt själva spelandet.
//
// Vad en designer skrivit står aldrig här: zonnamn, genvägar, korttext och regeltext kommer från
// spelet och lämnas som de är. Det som står här är bara det verktyget själv säger, i vanlig
// svenska (L73): en mening eller två, inga bilder för tillstånd, och verktyget kallar sig inte «vi».
export const svPlay = {
  // Gemensamt för alla spelytor.
  'play.connecting': 'Ansluter…',
  'play.session.missing': 'Inget bord angivet.',
  'play.session.seat.missing': 'Bord eller plats saknas.',
  'play.cards.one': '{n} kort',
  'play.cards.other': '{n} kort',
  'play.latest': 'Senaste dragen',
  // Bordet självt som handlande: det som ingen enskild plats gjorde.
  'play.table': 'Bordet',
  // Samma bord som granne på filten, där namnen står med liten bokstav.
  'play.peer.table': 'bordet',
  // Ägarens väg från bordet tillbaka till spelets editor (#1217, L80): spelets namn syns, och det
  // en skärmläsare hör säger vart det leder.
  'way.editor.aria': 'Tillbaka till {game} i editorn',

  // Ett korts bild medan den laddas, när den gått förlorad, och när någon ber om den igen (#10).
  'texture.pending': 'Laddar kortet…',
  'texture.failed': 'Bilden kunde inte laddas',
  'texture.retry': 'Försök igen',

  // Bordsskärmen.
  'ended.title': 'Bordet är avslutat',
  // Slutskärmen räknar drag, flaggor och spelare (#703), inte loggens rader.
  'ended.locked': 'Bordet avslutades på {version}. Alla spelare har fått enkäten.',
  'ended.rows.one': 'drag',
  'ended.rows.other': 'drag',
  'ended.flags.one': 'flagga',
  'ended.flags.other': 'flaggor',
  'ended.players.one': 'spelare',
  'ended.players.other': 'spelare',
  'rewind.proposal': 'Förslag',
  'rewind.looked': 'så här såg bordet ut {where}',
  'rewind.waiting': 'väntar på {who}',
  // En hög som bara finns för att två kort lades på varandra (K1) har inget namn från designern.
  'pile.dynamic': 'hög',
  // Under högen på TV:n i tre sekunder efter en blandning (#718).
  'pile.shuffled': '{pile} blandad',

  // TV-läget runt filten.
  // Ovanför adressen, som är värden och sedan /KOD (#675): orden följer värdens språk, adressen
  // är densamma på alla.
  'tv.join': 'Öppna på telefonen',
  'tv.render': 'Laddar kort',
  'tv.render.stalled': 'Laddningen har stannat',
  'tv.render.count': '{done} av {total}',
  'qr.enlarge': 'Visa koden större',
  'qr.title': 'Anslut med telefonen',
  'qr.close': 'Stäng',
  // Vad bilden är till och vilket rum, före adressen som går att skriva av utan kamera (K9, #560).
  'qr.join.alt': 'QR-kod: anslut med telefonen, rum {code} ({url})',
  'tv.inspect': 'Kortet',
  'tv.inspect.hidden': 'dolt kort',
  'tv.inspect.empty': 'peka på ett kort',
  'tv.show.by': '{name} visar',
  'tv.show.table': 'Bordet visar',
  'player.show': 'Visa för alla',
  'player.show.said': 'Visas för alla',
  // Listan innan någon rört bordet (UX-16).
  'tv.latest.empty': 'Inga drag ännu.',
  // Fördjupningen bakom frågetecknet (L32:s tillägg, #305). Raden vid koden är tre ord; vad
  // telefonen blir när den ansluter står i lådan.
  'tv.join.help.topic': 'att gå med',
  'tv.join.help.how': 'Spelarna öppnar adressen på sin telefon eller skannar QR-koden. Rumskoden är sista delen av adressen.',
  'tv.join.help.phone': 'Telefonen blir handen: korten ligger där, och bordet visas här.',
  'tv.seats': 'Platser',
  'tv.seat.hand.one': '{n} kort på hand',
  'tv.seat.hand.other': '{n} kort på hand',
  // En plats på en rad, vid fulla bord (#482 fynd 6): namnet tar resten av raden.
  'tv.seat.hand.short.one': '{n} kort',
  'tv.seat.hand.short.other': '{n} kort',
  // Platsens tredje rad innan platsen gjort något (UX-41): ord, inte ett streck.
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
  // Att observatören ser allt står på ytan, aldrig bara i en låda (L32).
  'tv.observers.one': '{names} tittar på och ser alla kort',
  'tv.observers.other': '{names} tittar på och ser alla kort',

  // Ringen av verb runt fingret (C).
  'ring.flip': 'Vänd',
  'ring.look': 'Titta',
  'ring.rotate': 'Rotera',
  'ring.reveal': 'Avslöja',
  'ring.move': 'Flytta…',
  'ring.shuffle': 'Blanda',
  'ring.draw': 'Dra 1',
  'ring.half': 'Dela i två',
  'ring.flipTop': 'Vänd översta',
  // Spelets egna åtgärder under ringen (K14, utvidgad). Namnen i listan är designerns och
  // översätts aldrig; det här är bara det verktyget säger runt dem.
  'ring.action.howMany': '{name}: hur många?',
  'ring.action.go': 'Kör',
  'ring.action.why.nowhere': 'ingen sitter vid bordet än',
  'ring.action.why.none': 'det blir inga kort just nu',
  'ring.action.why.nothing': 'åtgärden har inga steg',
  'ring.action.why.gone': 'högen finns inte längre',
  'ring.action.why.asks': 'ett steg behöver ett tal',
  'ring.action.why.unfinished': 'ett steg anger inte vilka kort det ska hämta',
  'start.tile': 'Starta spelet',
  'start.blocked': 'Kan inte starta än: {why}',
  'start.wait': 'laddar kort · {done}/{total}',
  'start.wait.why': 'korten laddas fortfarande',
  'start.anyway': 'Starta ändå',
  'start.stalled': 'laddningen har stannat · {done}/{total}',
  'start.again.label': 'Starta om spelet?',
  'start.again.tile': 'Starta om',
  'drop.unanswered': 'Bordet har inte svarat på draget än.',
  'drop.nobody': 'Ingen sitter vid {seat} än, så kortet går tillbaka.',
  'start.again.text': '{actions} körs igen. Kort som redan ligger ute ligger kvar.',
  'start.again.action': '«{action}» på {pile}',
  'start.again.and': ' och ',
  'start.again.yes': 'Ja, starta om',
  // Bordsläget utan telefoner (#682): hörnets rad om det som senast hände, och ⋯-menyn bredvid
  // «Starta om». Avsluta frågar med telefonens egna ord (`end.sheet.*`), så frågan är densamma var
  // den än ställs.
  'table.last': 'Senast:',
  'table.last.now': 'nyss',
  'table.last.seconds': '{n} s',
  'table.last.minutes': '{n} min',
  'table.last.hours': '{n} h',
  'table.more': 'Mer',
  'table.undo': 'Ångra senaste draget',
  'table.undo.none': 'Bordet har inte gjort något drag än.',
  'table.undo.phone': 'Senaste draget gjordes på en telefon. Ångra det där.',
  'table.end': 'Avsluta bordet…',
  'table.end.hint': 'Du får bekräfta först.',
  'kbd.hint.action.asks': 'behöver ett tal; skriv det i listan vid högen',
  'kbd.hint.action.own': 'spelets egen åtgärd',
  'ring.action.list': 'Åtgärder för {zone}',
  // En räknares verb (C4, #67): ett steg åt vardera hållet och ett tal sagt rakt ut. Ringen och
  // tangentbordets panel läser samma lista; varje handling går ut som `setCounter`.
  'ring.counter.minus': '−1',
  'ring.counter.plus': '+1',
  'ring.counter.set': 'Ange värde…',
  // Vems räknaren är. Ett delat bord behöver det; telefonen visar bara sin egen plats.
  'ring.counter.whose': '{name:s} räknare',
  // En plats tredje räknare staplas med de andra, så högens ring säger var och en av dem rakt ut
  // och navet säger hur många de är (#89).
  'ring.counter.named': '{name} {n}',
  'ring.counter.pile': 'räknare',

  // Den diskreta hjälpen och filtens kortkommandon (#224). Knappen är ytans, inte verktygets
  // enda: `{where}` är ytan sagd med dess egna ord, och en annan yta som håller samma knapp
  // säger sina egna kommandon i den.
  'help.title': 'Kortkommandon',
  'help.open': 'Kortkommandon {where}',
  'help.where.felt': 'på bordet',
  // Tangenten som betyder «gör det med det jag pekar på» heter olika på olika maskiner: Ctrl +
  // klick är systemets sekundärklick på en Mac, och sidan får då aldrig något `click`.
  // Filtens egen regel och tangentbordets väg in står först i hjälpen (#719): en dragning flyttar,
  // ett klick läser och frågar, och Tabb, pilarna och Enter når samma saker (K16).
  'felt.press.drag': 'Dra',
  'felt.key.drag': 'Flytta kortet eller högen dit du släpper',
  'felt.press.click': 'Klick',
  'felt.key.click': 'Läs det du klickar på. Ett klick till visar vad som går att göra',
  'felt.press.tab': 'Tabb',
  'felt.press.arrowKeys': 'Pilar',
  'felt.press.enter': 'Enter',
  'felt.key.keyboard': 'Tabb till bordet, pilarna mellan sakerna på det, Enter för åtgärder',
  'felt.press.modClick': '{mod} + klick',
  'felt.press.doubleClick': 'Dubbelklick',
  'felt.key.flip': 'Vänd kortet, eller högens översta kort, under pekaren',
  'felt.key.turnInHand': 'Vänd ett kort i din hand, så spelas det nedvänt',
  'felt.key.draw': 'Dra översta kortet från högen under pekaren',
  'felt.key.shuffle': 'Blanda högen under pekaren',
  'felt.key.moveDie': 'Flytta tärningen som har fokus',
  'felt.key.escape': 'Stäng ringen · avbryt draget',
  'felt.key.help': 'Visa den här listan',

  // Kameran på live-bordet (C5, #325). Vyn står kvar tills den återställs, så varje väg tillbaka
  // måste stå någonstans: knapparna i hörnet för den som pekar, och de här raderna för den som
  // inte gör det.
  'camera.controls': 'Kameran',
  'camera.zoom.in': 'Zooma in',
  'camera.zoom.out': 'Zooma ut',
  'camera.whole': 'Visa hela bordet',
  'camera.level': '{n} %',
  'camera.fold': 'Dölj kamerakontrollerna',
  'camera.unfold': 'Visa kamerakontrollerna',
  'felt.press.wheel': 'Hjul',
  'felt.press.middleDrag': 'Mittenknapp + dra',
  'felt.press.spaceDrag': 'Mellanslag + dra',
  'felt.press.arrows': 'Skift + piltangent',
  'felt.key.zoom': 'Zooma in och ut kring pekaren',
  'felt.key.pan': 'Panorera',
  'felt.key.escape.camera': 'Stäng ringen · avbryt draget · visa hela bordet',

  // Tangentbordet på filten (#1, #2, variant C "adressen"). Zonnamn och kortnamn kommer från
  // spelet och står i meningarna som designern skrev dem; allt runt dem är verktygets.
  //
  // Verben är ringens: tangentbordet säger exakt de verb pekdonet säger och aldrig ett nytt, så
  // de delar nycklar. Det som bara finns här — en vridning i steg, en dragning till min hand —
  // har egna.
  'kbd.hidden': 'Dolt kort',
  'kbd.card': '{name}, kort i {zone}',
  'kbd.card.rotated': '{name}, kort i {zone}, roterat',
  // En räknare är inte ett kort (C4), och ordlistan ger begreppet sitt eget ord (A4). Värdet står
  // med i meningen därför att det är det enda brickan visar — talet är hela poängen med en
  // räknare, och på filten ryms inte ens namnet i den (se `TOKEN_NAME_PX`).
  'kbd.counter': '{name}, räknare i {zone}, värde {n}',
  // Namnet på en räknare är designerns (B5) och kan saknas i en vy som inte får se den. Ett korts
  // reservord är `Dolt kort`, och det skulle smuggla tillbaka `kort` i en brickas mening.
  'kbd.counter.unnamed': 'Räknare i {zone}, värde {n}',
  // En tärning (#1137) heter sin sort, «d6», som vid ett bord, och sidan upp är det den visar. Enter slår
  // den direkt i stället för att öppna en panel, så meningen säger det och inte «öppnar handlingar».
  'kbd.die': '{kind}, visar {n}, i {zone}. Enter slår tärningen, M flyttar den.',
  'kbd.verb.roll': 'Slå',
  'kbd.pile.top': 'Översta kortet i {zone}: {name}',
  'kbd.pile.empty': '{zone}, tom',
  // En hög är ett stopp (#572): namnet, hur mycket som ligger i den, och vad som ligger överst.
  'kbd.pile.one': '{zone}, {n} kort, överst: {top}',
  'kbd.pile.other': '{zone}, {n} kort, överst: {top}',
  // Vad Enter gör, sagt sist i meningen: en kontroll som öppnar en panel ska säga det.
  'kbd.enter': '{label}. Enter öppnar handlingar.',
  'kbd.hand.mine': '{name}, i min hand',
  'kbd.hand.mine.marked': '{name}, i min hand, markerat',
  'kbd.hand.mine.turned': '{name}, i min hand, vänt – spelas nedvänt',
  'kbd.hand.mine.marked.turned': '{name}, i min hand, markerat, vänt – spelas nedvänt',
  'kbd.verb.rotate': 'Rotera 90°',
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
  'kbd.panel.free': 'Fri placering: en punkt på bordet',
  'kbd.panel.free.hint': 'kräver pekdon; med tangentbord finns bara namngivna platser',
  'kbd.panel.empty': 'Högen är tom.',
  'kbd.panel.close': 'Stäng',

  // "Ange värde…" på en skärm utan tangentbord (#67): talet skrivs på verktygets egna knappar.
  'counter.entry.label': 'Ange värde för {what}',
  'counter.entry.value': 'Nytt värde',
  'counter.entry.sign': 'Byt tecken',
  'counter.entry.erase': 'Sudda',
  'counter.entry.confirm': 'Klar',
  'counter.entry.cancel': 'Avbryt',

  // En rad ur loggen i ord. Namn och zoner kommer från vyn och översätts inte.
  'activity.move': '{who} flyttade ett kort till {zone}',
  // Med kortets namn när läsaren får se kortet (#507 fynd 6); annars raden ovan.
  'activity.move.named': '{who} flyttade {card} till {zone}',
  // En hand namnges av den som sitter där (K19), mitt i meningen: "till Adas hand", "till min hand".
  'activity.hand.my': 'din hand',
  'activity.you': 'Du',
  'activity.hand.other': '{name:s} hand',
  'activity.rotate': '{who} roterade ett kort',
  'activity.flip': '{who} vände ett kort',
  'activity.flip.named': '{who} vände {card}',
  'activity.stack': '{who} lade ett kort på ett annat',
  'activity.split.to.one': '{who} drog {n} kort från {zone} till {to}',
  'activity.split.to.other': '{who} drog {n} kort från {zone} till {to}',
  'activity.split.beside.one': '{who} lade {n} kort bredvid {zone}',
  // A pile made on the felt has no name of its own (K1); it is named by the area it lies in (#714).
  'zone.pile.within': 'en hög i {area}',
  'zone.pile.title': 'Hög i {area}',
  'activity.split.beside.other': '{who} delade av {n} kort från {zone} till en ny hög',
  // Bredvid varandra eller omlott blir ingen hög (#1203); en sökning säger inget tal den inte vet.
  'activity.split.row.one': '{who} lade ut {n} kort bredvid {zone}',
  'activity.split.row.other': '{who} lade ut {n} kort bredvid {zone}',
  'activity.split.row.found': '{who} lade ut kort bredvid {zone}',
  'activity.shuffle': '{who} blandade {zone}',
  'activity.deal.one': '{who} delade ut {n} kort var till {to}',
  'activity.deal.other': '{who} delade ut {n} kort var till {to}',
  // How a list of places is said: «Adas hand, Bos hand och Cys hand».
  'activity.and': 'och',
  'activity.roll': '{who} slog en tärning',
  'activity.roll.thrown': '{who} slog {thrown}',
  'activity.setCounter': '{who} satte en räknare till {value}',
  'activity.setCounter.named': '{who} satte {counter} till {value}',
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
  'activity.flag': '{who} flaggade',
  'activity.flag.note': '{who} flaggade: {note}',
  'activity.flag.observer': '{name} (observatör)',
  'activity.turn.give': '{who} gav turen till {to}',
  'activity.turn.take': '{who} tog turen',
  // Vems tur det är (K30): vid platsens namn på filten och i telefonens huvud.
  'turn.of': '{name:s} tur',
  'turn.mine': 'Din tur',
  // Knappen visar «Klar», en pil och nästa plats namn; namnet för den som hör den säger hela meningen.
  'turn.done': 'Klar',
  'turn.done.aria': 'Klar, ge turen till {name}',
  'turn.next': 'nästa',
  'turn.give': 'Ge turen till {name}',
  'turn.take': 'Ta turen',
  'activity.note.add': '{who} antecknade: {text}',
  'activity.note.edit': '{who} skrev om en anteckning: {text}',
  'activity.note.check': '{who} bockade av: {text}',
  'activity.note.uncheck': '{who} tog bort bocken vid: {text}',
  'activity.note.checked': '{who} bockade av en anteckning',
  'activity.note.unchecked': '{who} tog bort en bock',
  'activity.note.remove': '{who} strök: {text}',
  'activity.note.removed': '{who} strök en anteckning',
  // Flera rader i samma andetag blir en mening i den artiga live-regionen (D5). Singularformen
  // är ingen sammanfattning alls: en ensam rad sägs som den mening den är.
  'activity.others.one': '{latest}',
  'activity.others.other': '{n} drag av de andra, senast: {latest}',

  // Att spola tillbaka: vart, och vem som avgör.
  'rewind.someone': 'någon annan',
  'rewind.deciders': '{others} eller {last}',
  'rewind.before': 'före «{what}»',
  'rewind.atSeq': 'vid drag {n}',
  'rewind.mine': 'Du föreslår att spola tillbaka till hur bordet såg ut {where}. {who} avgör.',
  // Ångra efter någon annans drag frågar först (#747, beslut A).
  'rewind.propose.ask.title': 'Senaste draget är inte ditt',
  'rewind.propose.ask.body': 'Bordet visar hur det såg ut {where}. {who} avgör.',
  'rewind.propose.ask.yes': 'Föreslå att spola tillbaka',
  'rewind.propose.ask.no': 'Avbryt',
  'rewind.withdraw': 'Dra tillbaka förslaget',
  'rewind.ask.title': '{who} vill spola tillbaka',
  'rewind.ask.body': 'Bordet visar hur det såg ut {where}. {pile} blandas om.',
  'rewind.ask.body.any': 'Bordet visar hur det såg ut {where}. Leken blandas om.',
  'rewind.approve': 'Godkänn',
  'rewind.decline': 'Neka',
  'rewind.declined': '{who} sa nej till att spola tillbaka.',

  // Fördjupningen bakom frågetecknet (L32:s tillägg, #305). Samma låda som i editorn, på en
  // smalare skärm: den hänger över filtens övre del och täcker ingenting man spelar med, och
  // stängs med ett tryck utanför — vilket på en telefon är nästan hela skärmen. Det som säger
  // vad en handling får för följd flyttar aldrig hit; raden över handen står kvar där den står.
  'play.help.hand.topic': 'handen',
  'play.help.hand.pick': 'Tryck på ett kort för att välja det. Tryck på flera för att spela dem tillsammans.',
  'play.help.hand.play': 'Knapparna under handen spelar de valda korten, och «Läs stort» visar ett kort i full storlek.',
  'play.help.hand.hidden': 'De andra ser hur många kort du har, men inte vilka.',

  // Telefonen: handen, det som ligger framför en, och räknarna.
  'player.counter.minus': '{name} minus',
  'player.counter.plus': '{name} plus',
  'player.counter.set': '{name}: {value}. Ange värde',
  // Tärningarna (K28, #1138): pillret bland räknarna och arket det öppnar.
  'player.dice.pill': 'Tärningar · {n}',
  'player.dice.title': 'Tärningar',
  'player.dice.die': '{kind}, visar {value}',
  'player.dice.all': 'Välj alla',
  'player.dice.none': 'Välj ingen',
  'player.dice.roll.one': 'Slå tärningen',
  'player.dice.roll.other': 'Slå {n} tärningar',
  'player.dice.roll.nothing': 'Välj tärningar att slå',
  'player.dice.close': 'Stäng',
  'player.mine.title': 'Framför dig · {n}',
  'player.mine.flip.down': 'Vänd ner',
  'player.mine.down': 'nedvänt · bara du',
  'player.mine.down.label': '{name}, nedvänt. Bara du ser det',
  'player.mine.flip.up': 'Vänd upp',
  'player.mine.take': 'Ta upp',
  'player.mine.play': 'Spela…',
  'player.mine.empty': 'Inget här ännu. Spela ett kort från handen.',
  // Hela bordet, utfällt när det efterfrågas (C4). Raden över handen är högarna; det här är
  // varje zon läsaren ser in i, andra platsers ytor inräknade sedan #414.
  'online.table.where': 'Hela bordet visas på TV:n eller på en större skärm.',
  // Telefonens fyra flikar (#1147, beställarens val B).
  'player.tabs': 'Telefonens flikar',
  'player.tab.hand': 'Handen',
  'player.tab.mine': 'Framför mig',
  'player.tab.table': 'Bordet',
  'player.tab.more': 'Mer',
  'player.more.help': 'Så fungerar handen',
  'player.hand.actions': 'Spela valda kort',
  'player.hand.read': 'Läs stort',
  'player.hand.marked.one': '{n} kort valt',
  'player.hand.marked.other': '{n} kort valda',
  'player.hand.clear': 'Avmarkera',
  // Ett kort vänt i handen spelas nedvänt (#1133), och raden över flikarna säger det.
  'player.hand.chosen.down': '{name} · spelas nedvänt',
  'player.hand.turn': 'Vänd',
  'player.hand.unturn': 'Vänd upp',
  'player.hand.turned': 'nedvänt · {name}',
  'player.hand.down': '{label} · nedvänt',
  // Tom hand (UX-16): samma form som raden under det som ligger framför en.
  'player.hand.empty': 'Du har inga kort. Dra ett kort från {pile}.',
  'player.hand.empty.any': 'Du har inga kort. Dra ett kort från en hög.',
  'player.hand.empty.none': 'Du har inga kort, och det finns inga att dra.',
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
  'session.exit': 'Lämna…',
  // Kortheten gäller radens bredd, inte det uppläsbara namnet: namnet börjar med etiketten på
  // knappen och säger sedan vart den leder (#48, WCAG 2.5.3).
  'session.exit.aria': '{label} eller avsluta bordet',
  'session.flagged': 'Flaggat',
  'session.version.this': 'den här versionen',
  'session.refused.gone': 'Länken gäller inte längre. Gå med igen med rumskoden.',

  // Att flagga det som hände (G3) och att avsluta sessionen (C9).
  'flag.sheet.title': 'Flagga det som hände',
  'flag.sheet.body': 'Flaggan sparas med tidpunkten i loggen. En kommentar är frivillig.',
  'flag.sheet.note': 'Vad hände? (frivilligt)',
  'flag.sheet.flag': 'Flagga',
  'flag.sheet.cancel': 'Avbryt',
  'flag.sheet.title.card': 'Flagga kortet',
  'flag.sheet.moment': 'Det som händer',
  'flag.sheet.moment.sub': 'i spelet just nu',
  'flag.sheet.card': 'Ett kort…',
  'flag.sheet.card.sub': 'peka ut det',
  'flag.sheet.card.seen': 'Designern ser kortet som det ser ut nu.',
  'flag.sheet.card.drop': 'Ta bort kortet ur flaggan',
  'flag.point.ask': 'Tryck på kortet det gäller',
  'flag.point.cancel': 'Avbryt',
  'flag.panel.title': 'Flagga',
  'flag.panel.close': 'Stäng',
  'flag.panel.moment': 'Det som hände',
  'flag.panel.moment.none': 'Inget har hänt vid bordet än.',
  'flag.panel.moment.sub': 'Flaggan sparas med tidpunkten i loggen.',
  'flag.panel.card': 'Kortet',
  'flag.panel.card.optional': 'valfritt',
  'flag.panel.pick': 'Klicka på ett kort',
  'flag.panel.pick.sub': 'på bordet eller i en hand för att flagga just det.',
  'flag.panel.card.swap': 'Klicka på ett annat kort för att byta.',
  'flag.panel.card.drop': 'Ta bort kortet',
  'flag.panel.note': 'Kommentar',
  'flag.panel.keys': 'flaggar',
  'end.sheet.title': 'Avsluta bordet?',
  'end.sheet.body': 'Spelet avslutas för alla och kan inte fortsätta. Alla spelare får enkäten på sin telefon.',
  'end.sheet.end': 'Avsluta för alla',
  'end.sheet.not': 'Avbryt',

  // Vägen ut (#31, prototypens variant C). Telefonens rad är redan full vid 375 px, så utgången
  // är ingen fjärde kontroll bredvid den röda: den byter ut den. Arket ställer valet, och de två
  // utgångarna hålls isär av vad de kostar, skrivet under var sin knapp.
  'exit.sheet.title': 'Lämna bordet?',
  'exit.sheet.leave': 'Lämna bordet',
  'exit.sheet.leave.body': 'Din plats blir ledig och dina kort läggs tillbaka i {pile}. De andra kan spela vidare.',
  'exit.sheet.leave.body.any': 'Din plats blir ledig och dina kort läggs tillbaka i leken. De andra kan spela vidare.',
  'exit.sheet.end': 'Avsluta för alla',
  'exit.sheet.end.body': 'Spelet avslutas för alla och enkäten skickas ut. Du får bekräfta först.',
  'exit.sheet.stay': 'Avbryt',
  // Ägarens tredje väg (#1217): till editorn utan att lämna platsen.
  'exit.sheet.editor': 'Till {game}, sitt kvar',
  'exit.sheet.editor.body': 'Du behåller din plats och dina kort, och bordet står kvar i sin flik.',

  // Enkäten efter sessionen (G3).
  'survey.title': 'Bordet är avslutat',
  'survey.sub': 'Fyra frågor, en minut. Svaren kopplas till {version}.',
  'survey.q.fun': 'Hur kul var det?',
  'survey.q.fun.low': 'segt',
  'survey.q.fun.high': 'jättekul',
  'survey.q.clarity': 'Hur tydliga var reglerna?',
  'survey.q.clarity.low': 'förvirrande',
  'survey.q.clarity.high': 'glasklara',
  'survey.q.understood': 'Hur lätt var spelet att förstå?',
  'survey.q.understood.low': 'svårt',
  'survey.q.understood.high': 'självklart',
  'survey.q.balance': 'Hur balanserat kändes det?',
  'survey.q.balance.low': 'ojämnt',
  'survey.q.balance.high': 'jämnt',
  'survey.change': 'Vad skulle du ändra?',
  'survey.change.placeholder': 'En mening räcker',
  'survey.failed': 'Det gick inte att skicka. Försök igen.',
  'survey.next': 'Nästa',
  'survey.send': 'Skicka',
  'survey.thanks': 'Tack, {who}.',
  'survey.tied': 'Dina svar är kopplade till {version}.',
  'survey.save': 'Spara till ditt konto',
  'survey.saved': 'Sparat till ditt konto.',
  // Vad som lagras om en gäst, där hon ansluter eller sparar (#757): knutet till bordet, inte till en person.
  'guest.kept': 'Ditt namn, dina drag och dina enkätsvar sparas på bordet, inte på dig som person.',

  // Åskådaren (C8).
  'observer.name': 'observatör',
  // What the owner is called at her own seat when neither this browser nor her account knows a name
  // for her (#1306): the editor's word, in the language she works in (A4).
  'online.designer': 'Designern',
  'observer.banner': 'Du är observatör och ser allas kort. Alla vet att du är här.',
  'observer.watching': '{name} tittar på och ser alla kort',
  // Fördjupningen bakom frågetecknet (L32:s tillägg, #305). Att hon syns för alla står kvar på
  // ytan i `observer.banner`: synlighetsupplysningar flyttar aldrig in i lådan.
  'observer.help.topic': 'observatörsläget',
  'observer.help.sees': 'Du ser allas händer och alla högar, även det som är dolt.',
  'observer.help.touch': 'Du kan flagga, men inte röra korten.',
  'observer.help.survey': 'När bordet avslutas får du samma enkät som spelarna, märkt som observatör.',
  'observer.more': 'Senaste dragen och platser',

  // Att sätta sig vid bordet (K12).
  // Koden är adressen (#675, beslut C): /join utan kod frågar efter den, och en kod som inte leder
  // någonstans sägs på ett enda sätt — okänd och utgången likadant, så att inget avslöjar om en
  // kod en gång funnits.
  'join.code.title': 'Gå med i ett bord',
  'join.code.lead': 'Skriv rumskoden som visas på TV:n.',
  'join.code.label': 'Rumskod',
  'join.code.go': 'Fortsätt',
  'join.seat.taken': 'Platsen togs precis av någon annan. Välj en annan.',
  // Kvitteringen för den som just lämnat: hon kommer tillbaka hit, och får veta vad som hände
  // med platsen och handen hon lämnade (#31).
  // The picker's lobby carries no zones (DRIFT §9), so it cannot name the pile; «leken» is the
  // game's own word for all of it, and not a pile's name it would get wrong (#714).
  'join.left': 'Din plats är ledig och dina kort ligger i leken. De andra kan spela vidare.',
  'join.into': 'Du går med i',
  'join.room': 'Rum {code}',
  'join.seat.chosen': 'Plats {seat} vald',
  'join.seats.full': 'Alla platser är upptagna',
  'join.seats.group': 'Platser',
  'join.seat.pick': 'Välj en ledig plats',
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
  'join.online': 'Spela på den här skärmen',
  // En dator har ett enda val (L77): sidan säger hur många platser som är kvar, och «Gå med»
  // spelar på den här skärmen. Telefonvägen står under, som en länk. «plats» eller «platser»
  // följer bordets storlek, inte hur många som är kvar: «1 av 2 platser kvar».
  'join.seats.left.one': '{n} av {total} plats kvar',
  'join.seats.left.other': '{n} av {total} platser kvar',
  'join.go': 'Gå med',
  'join.phone': 'Sitter ni runt en TV? Använd telefonen som hand',
  'join.screen.lead': 'Du får handen. Bordet står på TV:n.',
  'join.away': 'Inte på plats? Spela med hela bordet',
  // Att alla ser observatören står på ytan, inte bara i lådan (L32).
  'join.observe': 'Bara titta (du ser allt, alla ser dig)',

  // Helt online (C2): bordet och handen i samma fönster.
  'notes.title': 'Anteckningar',
  'notes.unseen': 'Anteckningar, nytt från någon annan',
  'notes.empty': 'Inget antecknat än. Det ni skriver här ser alla vid bordet, och det ligger kvar till nästa gång.',
  'notes.new': 'Ny anteckning',
  'notes.new.placeholder': 'Skriv en anteckning och tryck Enter',
  'notes.done': 'Klar: {text}',
  'notes.edit': 'Ändra: {text}',
  'notes.remove': 'Ta bort: {text}',
  'notes.remove.title': 'Ta bort',
  'notes.refused.full': 'Blocket är fullt: hundra rader. Ta bort en innan du skriver en ny.',
  'notes.refused.gone': 'Raden finns inte längre: någon tog bort den.',
  'notes.refused.other': 'Bordet tog inte emot raden. Försök igen.',

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
  'rules.setup.count.one': '{n} plats. Visa en i taget.',
  'rules.setup.count.other': '{n} platser. Visa en i taget.',
  'rules.setup.pick': 'Visa plats',
  'rules.setup.seat': 'Plats {seat}',
  'rules.setup.seat.zones': 'Zoner vid plats {seat}',
  'rules.setup.seat.empty': 'Inga egna zoner vid den här platsen.',

  // Lånat från editorn men sagt på spelytorna också, och därför i den katalog de hämtar (#760).
  'rules.caption.placeholder': 'Bildtext…',

  // Raden där en gäst ansluter och där hon sparar (#757, #1272): villkoren och integriteten.
  'trust.terms': 'Villkor',
  'trust.privacy': 'Integritet',

  // Handen vid en dator: raden under kortet som läses (#1291) och vad någon annan senast gjorde
  // (#484 fynd 12), i spelets del sedan `/play` ritar dem i ett brett fönster (#1310).
  'online.hand.says.mouse': 'Klick vänder · dra till bordet spelar',
  'online.hand.says.mouse.turned': 'Klick vänder upp · dra till bordet spelar nedvänt',
  'online.hand.says.key': 'Mellanslag vänder · Enter öppnar handlingar',
  'online.last': 'Senast:',
  'online.last.now': 'nyss',
  'online.last.s': 'för {n} s sedan',
  'online.last.min': 'för {n} min sedan',
  'desk.heading': 'Din hand',
  'desk.where': 'Bordet står på TV:n',
  'desk.hand': 'Din hand · {cards}',
  'desk.hint': 'Vila läser · klick vänder · dra till en yta spelar',
  'desk.drop': 'Dra ett kort hit',
  'desk.says.mouse': 'Klick vänder · dra till en yta spelar',
  'desk.says.mouse.turned': 'Klick vänder upp · dra till en yta spelar nedvänt',
  'desk.help.read': 'Vila musen på ett kort för att läsa det. Ett klick vänder det, och ett vänt kort spelas nedvänt.',
  'desk.help.play': 'Dra ett kort till en yta ovanför handen för att spela det dit. Klicka på en hög för att dra ett kort.',
} as const
