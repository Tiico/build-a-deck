// De nio delade tillstånden (#12, #7): vad en skärm säger när den inte kan visa det den lovat,
// vad fliken heter under tiden, och vad bordet svarar när ett drag inte gick igenom.
//
// Basen är appens egen. En yta säger samma tillstånd med sitt eget substantiv — bordet, handen,
// spelet — och samma verb, under `status.<tillstånd>.<yta>.…`, och ärver resten. Orden är vanlig
// svenska (L73): tillstånd sägs som andra verktyg säger dem, i en mening eller två, och verktyget
// kallar sig inte «vi».
export const svStatus = {
  // Vägarna ut. Aldrig en omladdning: den kastar bort just det tillstånd läsaren försöker behålla.
  'status.act.retry': 'Försök igen',
  'status.act.retry.now': 'Försök igen',
  'status.act.login': 'Logga in',
  'status.act.home': 'Mina spel',
  'status.act.home.start': 'Till startsidan',
  'status.act.rescan': 'Välj plats',
  // Den som värden tog bort (#679, beslut C).
  'status.kicked.heading': 'Du har tagits bort från bordet',
  'status.kicked.text': 'Värden tog bort dig. Dina kort har lagts tillbaka i leken.',
  'status.kicked.closed': 'Bordet har fått en ny rumskod. Be värden om den nya koden om du vill tillbaka.',
  'status.act.rejoin': 'Gå med igen',
  'status.act.switch': 'Byt konto',
  'status.act.observe': 'Öppna som observatör',

  // Flikens namn per rutt (#12). Namnet står först, för en flik klipps från höger.
  'title.home': 'Mina spel',
  'title.landing': 'Bygg ditt kortspel',
  'title.login': 'Logga in',
  'title.new': 'Nytt spel',
  'title.claim': 'Spara bordet',
  'title.invite': 'Inbjudan',
  'title.profile': 'Profil',
  'title.editor': 'Editor',
  'title.table': 'Bordet',
  'title.join': 'Gå med i rum {code}',
  'title.join.any': 'Gå med i ett rum',
  'title.play': 'Din hand',
  'title.play.ended': 'Bordet är avslutat',
  'title.online': 'Spela',
  'title.observe': 'Tittar på rum {code}',
  'title.observe.game': 'Tittar på {game}',
  'title.observe.any': 'Tittar på',
  'title.prototype': 'Prototyp',
  'title.unknown': 'Sidan finns inte',
  'title.room': 'Rum {code}',
  // Fliken säger att det är ens tur (K30): det enda som syns utanför sidan, och ingen notis (K7).
  'title.turn': '● Din tur',
  // Tillståndet vinner över rutten så länge det finns ett, så att en flik i bakgrunden säger
  // sanningen. Ordet "fel" står aldrig här; det hör hemma i vyn och i live-regionen.
  'title.state.loading': 'Laddar',
  'title.state.connecting': 'Ansluter',
  'title.state.missing.game': 'Spelet finns inte',
  'title.state.missing.table': 'Bordet finns inte',
  'title.state.forbidden': 'Ingen åtkomst',
  'title.state.offline': 'Ingen anslutning',
  'title.state.dropped': 'Frånkopplad',

  // Två meningar hör till meddelandets ram och inte till något enskilt tillstånd: hur gammalt
  // det som ligger kvar bakom har blivit (#7), och när nästa försök kommer.
  'status.asOf': 'Det du ser är från {at} och kan ha ändrats.',
  'status.countdown': 'Försöker igen om {seconds} s (försök {attempt} av {attempts})',
  // En skärm ingen rör som fortsätter försöka efter planen (#722): inget «av», för det tar inte slut.
  'status.countdown.ongoing': 'Försöker igen om {seconds} s',

  'status.loading.mark': 'Laddar',
  'status.loading.heading': 'Laddar…',
  'status.loading.text': 'Det tar normalt en sekund.',
  'status.loading.table.heading': 'Laddar bordet…',
  'status.loading.table.text': 'Det tar normalt en sekund.',
  'status.loading.phone.heading': 'Laddar din hand…',
  'status.loading.phone.text': 'Det tar normalt en sekund.',
  'status.loading.editor.heading': 'Laddar spelet…',
  'status.loading.editor.text': 'Det tar normalt en sekund.',

  'status.slow.mark': 'Laddar',
  'status.slow.heading': 'Det tar längre tid än vanligt',
  'status.slow.text': 'Väntar fortfarande på svar. Vänta kvar eller försök igen.',
  'status.slow.table.heading': 'Det tar längre tid än vanligt',
  'status.slow.table.text': 'Väntar fortfarande på servern. Ingen behöver göra något.',
  'status.slow.phone.heading': 'Det tar längre tid än vanligt',
  'status.slow.phone.text': 'Väntar fortfarande på bordet.',
  'status.slow.editor.heading': 'Det tar längre tid än vanligt',
  'status.slow.editor.text': 'Väntar fortfarande på servern.',

  // Skalet (#749): det `index.html` säger innan appen har kommit fram, skrivet in ur den här delen
  // när appen byggs (`shell.ts`). Laddar-rubrikerna är ytornas egna ovan; texten när det dröjer är
  // skalets egen, eftersom skalet inte har något «försök igen» att peka på — bara en omladdning,
  // och den först efter `SHELL_RELOAD_AFTER_MS`. Utan JavaScript säger skalet bara `noscript`, på
  // båda språken, eftersom inget har körts som kan välja ett.
  'status.shell.slow.text': 'Sidan laddas fortfarande. Den öppnas när den är klar.',
  'status.shell.slow.table.text': 'Sidan laddas fortfarande. Ingen behöver göra något.',
  'status.shell.slow.phone.text': 'Sidan laddas fortfarande. Din plats finns kvar.',
  'status.shell.slow.editor.text': 'Sidan laddas fortfarande.',
  'status.shell.reload': 'Ladda om sidan',
  'status.shell.noscript': 'Deckster behöver JavaScript. Slå på det och ladda om sidan.',

  'status.spent.mark': 'Gäller inte',
  'status.missing.mark': 'Finns inte',
  'status.missing.heading': 'Sidan finns inte',
  'status.missing.text': 'Länken leder till något som inte finns längre. Kontrollera adressen eller gå till Mina spel.',
  'status.missing.text.start': 'Länken leder till något som inte finns längre. Kontrollera adressen eller gå till startsidan.',
  // «Finns inte» är inte «avslutat» (#753): ett bord servern aldrig hört talas om har inte tagit
  // slut, och en adress utan bord i sig pekar inte på något alls. Att ett bord avslutats sägs bara
  // till den som redan sitter vid det; en rumskod till ett avslutat bord sägs som en okänd (#938).
  'status.missing.table.heading': 'Bordet finns inte',
  'status.missing.table.text': 'Länken leder till ett bord som inte finns. Starta ett nytt bord från Mina spel.',
  'status.unlinked.table.heading': 'Inget bord i länken',
  'status.unlinked.table.text': 'Adressen pekar inte på något bord. Starta ett bord från Mina spel.',
  'status.deleted.table.heading': 'Spelet är borttaget',
  'status.deleted.table.text': 'Bordet avslutades när spelet togs bort. Starta ett nytt bord från Mina spel.',
  'status.missing.phone.heading': 'Bordet finns inte',
  'status.missing.phone.text': 'Bordet kan ha avslutats. Skanna QR-koden på TV:n igen för att gå med i det som pågår.',
  // En tittarlänk öppnad på telefonens sida (#753): bordet lever och länken gäller, den har bara
  // ingen plats att visa en hand ur.
  'status.watching.phone.mark': 'Tittare',
  'status.watching.phone.heading': 'Du kan bara titta',
  'status.watching.phone.text': 'Länken är till för att titta och har ingen plats vid bordet. Öppna den som observatör.',
  'status.missing.editor.heading': 'Spelet finns inte',
  'status.missing.editor.text': 'Spelet kan ha tagits bort, eller så är länken fel.',
  'status.unlinked.editor.heading': 'Inget spel i länken',
  'status.unlinked.editor.text': 'Adressen pekar inte på något spel. Välj ett i Mina spel.',

  'status.forbidden.mark': 'Ingen åtkomst',
  'status.forbidden.heading': 'Du har inte åtkomst',
  'status.forbidden.text': 'Det här tillhör ett annat konto. Logga in med rätt konto, eller be ägaren bjuda in dig.',
  'status.forbidden.table.heading': 'Bordet tillhör ett annat konto',
  'status.forbidden.table.text': 'Logga in på kontot som äger spelet för att visa det här.',
  'status.forbidden.table.out.heading': 'Bordet kräver värdens länk eller ägarens inloggning',
  'status.forbidden.table.out.text': 'Öppna bordet med värdens länk från editorn, eller logga in på kontot som äger spelet.',
  'status.forbidden.table.other.text': 'Du är inloggad som {email}. Byt till kontot som äger spelet, eller öppna bordet med värdens länk från editorn.',
  'status.forbidden.phone.heading': 'Platsen är upptagen',
  'status.forbidden.phone.text': 'Någon annan sitter på din plats. Välj en ledig plats, eller skanna QR-koden på TV:n igen.',
  'status.forbidden.observer.heading': 'Observatörslänken gäller inte längre',
  'status.forbidden.observer.text': 'Gå med igen med rumskoden, eller be testledaren om en ny länk.',
  'status.forbidden.editor.heading': 'Spelet tillhör någon annan',
  'status.forbidden.editor.text': 'Be ägaren bjuda in dig, eller logga in med rätt konto.',
  'status.loggedOut.editor.heading': 'Du är utloggad',
  'status.loggedOut.editor.text': 'Du loggades ut medan spelet var öppet. Logga in igen så finns dina ändringar kvar.',

  'status.offline.mark': 'Ingen anslutning',
  'status.offline.heading': 'Ingen kontakt med tjänsten',
  'status.offline.text': 'Kontrollera nätverket, eller försök igen om en stund. Inget av ditt arbete är borta.',
  'status.offline.table.heading': 'Bordet har ingen anslutning',
  'status.offline.table.text': 'Kontrollera nätverket på den här skärmen. Spelet finns kvar.',
  'status.offline.phone.heading': 'Ingen kontakt med bordet',
  'status.offline.phone.text': 'Kontrollera nätverket på telefonen. Din plats finns kvar så länge spelet pågår.',
  'status.offline.editor.heading': 'Ingen kontakt med servern',
  'status.offline.editor.text': 'Dina ändringar finns kvar här och sparas när anslutningen är tillbaka.',

  'status.connecting.mark': 'Ansluter',
  'status.connecting.heading': 'Ansluter…',
  'status.connecting.text': 'Ansluter till bordet.',
  'status.connecting.table.heading': 'Ansluter bordet…',
  'status.connecting.table.text': 'Bordet startar.',
  'status.connecting.phone.heading': 'Ansluter…',
  'status.connecting.phone.text': 'Ansluter till ditt bord.',
  'status.connecting.editor.heading': 'Ansluter…',
  'status.connecting.editor.text': 'Hämtar den senaste versionen.',

  'status.dropped.mark': 'Frånkopplad',
  'status.dropped.heading': 'Anslutningen bröts',
  'status.dropped.text': 'Det du ser kan vara inaktuellt. Inget du gör nu kommer fram.',
  'status.dropped.table.heading': 'Bordet har tappat anslutningen',
  'status.dropped.table.text': 'Ingen kan spela förrän anslutningen är tillbaka.',
  'status.dropped.phone.heading': 'Anslutningen bröts',
  'status.dropped.phone.text': 'Din hand kan vara inaktuell och inget du gör nu kommer fram. Försöker igen.',
  'status.dropped.phone.text.spent': 'Din hand kan vara inaktuell och inget du gör nu kommer fram.',
  'status.dropped.spent': 'Försöker inte längre automatiskt. Tryck på Försök igen när nätverket är tillbaka.',
  'status.dropped.editor.heading': 'Ingen kontakt med servern',
  'status.dropped.editor.text': 'Osparat arbete finns kvar här tills anslutningen är tillbaka.',

  'status.resumed.mark': 'Ansluten',
  'status.resumed.heading': 'Ansluten igen',
  'status.resumed.text': 'Allt är uppdaterat.',
  'status.resumed.table.heading': 'Bordet är igång igen',
  'status.resumed.table.text': 'Bordet är uppdaterat.',
  'status.resumed.phone.heading': 'Ansluten igen',
  'status.resumed.phone.text': 'Din hand är uppdaterad.',
  'status.resumed.editor.heading': 'Sparat och anslutet igen',
  'status.resumed.editor.text': 'Allt du gjort är sparat på servern.',

  // Vägran har ingen egen mening förrän ett skäl bärs in i den, så den har ingen `text` här.
  'status.refused.mark': 'Gick inte',
  'status.refused.heading': 'Draget gick inte att göra',

  // Skälet bordet vägrade med. Det kommer över tråden som en utvecklarmening på engelska — ett
  // faktum om ett kuvert, inte ett meddelande till en människa — och sätts i ord först här.
  'refusal.notConnected': 'Du är inte ansluten, så draget skickades inte.',
  'refusal.connectionLost': 'Anslutningen bröts innan draget kom fram.',
  'refusal.ended': 'Bordet är avslutat och tar inte emot fler drag.',
  'refusal.observer': 'Som observatör kan du titta och flagga, men inte spela.',
  'refusal.seat': 'Draget hörde till en annan plats än din.',
  'refusal.spent': 'Draget har redan skickats.',
  'refusal.empty': 'Högen är tom.',
  'refusal.tooFew': 'Det finns inte så många kort kvar.',
  'refusal.flip': 'Kortet kan inte vändas.',
  'refusal.stack': 'Korten kan inte läggas på varandra.',
  'refusal.shuffle': 'Högen kan inte blandas.',
  'refusal.roll': 'Kortet kan inte slås.',
  'refusal.counter': 'Kortet har ingen räknare.',
  'refusal.place': 'Korten kan inte läggas där.',
  'refusal.peek': 'Den här skärmen har ingen hand.',
  'refusal.unknown': 'Kortet eller zonen finns inte längre på bordet.',
  // Ett skäl den här klienten aldrig hört talas om får en mening av sin egen i stället för att
  // utvecklarens engelska ord skrivs ut på skärmen.
  'refusal.other': 'Bordet tog inte emot draget. Försök igen om en stund.',

  // Ord som skalet runt varje yta säger, och som därför måste finnas var sidan än öppnas (#760):
  // kort som inte gick att ladda, en spelare som tagits bort från bordet, hjälprutornas knappar och «Avbryt».
  'texture.lost.one': '{n} kort kunde inte laddas',
  'texture.lost.other': '{n} kort kunde inte laddas',
  'session.refused.kicked': 'Värden har tagit bort dig från bordet.',
  'canvas.hint.base': 'Dra för att ändra ordningen.',
  'help.about': 'Hjälp om {topic}',
  'help.close': 'Stäng hjälpen',
  'editor.cancel': 'Avbryt',
  // Rumskodens fält står både i platsväljaren och på startsidan (`join/codeField.ts`).
  'join.code.empty': 'Skriv rumskoden först.',
  'join.code.unknown': 'Koden finns inte eller har gått ut. Fråga värden efter den nya.',
  // Ett ord för en sparad version överallt där människor läser (#703) — bordet, telefonen, startsidan och editorn: «Version 3», «version 3» och «v3» där det är trångt.
  'version.word': 'version {n}',
  'version.name': 'Version {n}',
  'version.short': 'v{n}',
} as const
