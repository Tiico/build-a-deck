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
  'play.refused.host': 'Bordsvyn öppnas med värdens länk från editorn.',
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
  'rewind.waiting': '· väntar på {who}',
  // En hög som bara finns för att två kort lades på varandra (K1) har inget namn från designern.
  'pile.dynamic': 'hög',

  // TV-läget runt filten.
  'tv.join': 'anslut med telefon',
  'tv.inspect': 'Inspektion',
  'tv.inspect.hidden': 'dolt kort',
  'tv.inspect.empty': 'peka på ett kort',
  'tv.seats': 'Platser',
  'tv.seat.hand.one': '{n} kort på hand',
  'tv.seat.hand.other': '{n} kort på hand',
  'tv.observers.one': '{names} tittar på · ser allt',
  'tv.observers.other': '{names} tittar på · ser allt',

  // Ringen av verb runt fingret (C).
  'ring.flip': 'Vänd',
  'ring.look': 'Titta',
  'ring.close': 'Stäng',
  'ring.rotate': 'Vrid',
  'ring.reveal': 'Avslöja',
  'ring.shuffle': 'Blanda',
  'ring.draw': 'Dra 1',
  'ring.half': 'Dela på hälften',
  'ring.flipTop': 'Vänd översta',

  // Tangentbordet på filten (#1, #2, variant C "adressen"). Zonnamn och kortnamn kommer från
  // spelet och står i meningarna som designern skrev dem; allt runt dem är verktygets.
  //
  // Verben är ringens: tangentbordet säger exakt de verb pekdonet säger och aldrig ett nytt, så
  // de delar nycklar. Det som bara finns här — en vridning i steg, en dragning till min hand —
  // har egna.
  'kbd.hidden': 'Dolt kort',
  'kbd.card': '{name}, kort i {zone}',
  'kbd.card.rotated': '{name}, kort i {zone}, vridet',
  'kbd.pile.top': 'Översta kortet i {zone}: {name}',
  'kbd.pile.empty': '{zone}, tom',
  'kbd.pile.whole.one': '{zone}, hela högen, {n} kort',
  'kbd.pile.whole.other': '{zone}, hela högen, {n} kort',
  // Vad Enter gör, sagt sist i meningen: en kontroll som öppnar en panel ska säga det.
  'kbd.enter': '{label}. Enter öppnar handlingar.',
  'kbd.hand.mine': '{name}, i min hand',
  'kbd.hand.mine.marked': '{name}, i min hand, markerat',
  'kbd.verb.rotate': 'Vrid 90°',
  'kbd.verb.lookTop': 'Titta på översta',
  'kbd.verb.toHand': 'Dra 1 till min hand',
  'kbd.hint.reveal': 'visar kortet för alla',
  'kbd.hint.look': 'bara på den här skärmen',
  'kbd.hint.half': 'ny hög bredvid',
  'kbd.hand.my': 'Min hand',
  'kbd.hand.other': '{name}s hand',
  'kbd.place.floor': 'Bordet',
  'kbd.place.floor.hint': 'fri yta',
  'kbd.place.onCard': 'På {name}',
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
  'kbd.panel.free': 'Fri placering — en punkt på filten',
  'kbd.panel.free.hint': 'kräver pekdon; med tangentbord finns bara platser med namn',
  'kbd.panel.close': 'Stäng',

  // En rad ur loggen i ord. Namn och zoner kommer från vyn och översätts inte.
  'activity.move': '{who} flyttade ett kort till {zone}',
  'activity.rotate': '{who} vred ett kort',
  'activity.flip': '{who} vände ett kort',
  'activity.stack': '{who} lade ett kort på ett annat',
  'activity.split': '{who} delade {zone}',
  'activity.shuffle': '{who} blandade {zone}',
  'activity.draw': '{who} drog {n} från {zone}',
  'activity.deal': '{who} delade ut {n} var',
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
  'rewind.before': 'före ”{what}”',
  'rewind.atSeq': 'vid drag {n}',
  'rewind.mine': 'Du föreslår att spola tillbaka. Bordet visar hur det såg ut; {who} avgör.',
  'rewind.withdraw': 'Dra tillbaka förslaget',
  'rewind.ask.title': '{who} vill spola tillbaka',
  'rewind.ask.body': 'Bordet visar hur det såg ut. Draghögen blandas om.',
  'rewind.approve': 'Godkänn',
  'rewind.decline': 'Neka',

  // Telefonen: handen, det som ligger framför en, och räknarna.
  'player.hint': 'tryck = titta · dra upp = spela · håll = välj flera',
  'player.hint.selected.one': '{n} valda · dra upp för att spela',
  'player.hint.selected.other': '{n} valda · dra upp för att spela',
  'player.counter.minus': '{name} minus',
  'player.counter.plus': '{name} plus',
  'player.mine.title': 'Framför dig · {n}',
  'player.mine.flip.down': 'Vänd ner',
  'player.mine.flip.up': 'Vänd upp',
  'player.mine.take': 'Ta upp',
  'player.mine.play': 'Spela…',
  'player.mine.empty': 'Inget framför dig. Spela ett kort hit från handen.',

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
  'session.undo': '↶ Ångra',
  'session.flag': '⚑ Flagga',
  'session.end': 'Avsluta',
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

  // Enkäten efter sessionen (G3).
  'survey.title': 'Bordet är avslutat',
  'survey.sub': 'Fyra frågor, en minut. Svaren knyts till version {version}.',
  'survey.q.fun': 'Hur kul var det?',
  'survey.q.fun.low': 'segt',
  'survey.q.fun.high': 'jättekul',
  'survey.q.clarity': 'Hur tydliga var reglerna?',
  'survey.q.clarity.low': 'förvirrande',
  'survey.q.clarity.high': 'glasklara',
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
  'observer.watching': '{name} tittar på',
  'observer.more': 'Senast och platser',

  // Att sätta sig vid bordet (K12).
  'join.code.missing': 'Ingen rumskod angiven.',
  'join.code.gone': 'Rumskoden {code} gäller inte längre. Be värden om en ny.',
  'join.code.expired': 'Rumskoden gäller inte längre. Be värden om en ny.',
  'join.seat.taken': 'Platsen togs precis av någon annan. Välj en annan.',
  'join.into': 'Du är på väg in i',
  'join.room': 'Rum {code}',
  'join.seat.chosen': 'Plats {seat} vald',
  'join.seats.full': 'Alla platser är upptagna',
  'join.seat.pick': 'Tryck på en ledig plats',
  'join.seat.free': 'ledig',
  'join.name': 'Ditt namn',
  'join.sit': 'Sätt dig',
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
} as const
