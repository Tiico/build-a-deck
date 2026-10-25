// Distansvyn, `/online`: bordet och handen i samma fönster, och väntrummet före spelet.
//
// En egen del därför att ingen annan yta säger de här orden, och telefonen ska inte bära dem
// (#760, `phone-bundle.spec.ts`). Telefonläget av `/online` hämtar den här delen också, eftersom
// det är `/online` som hämtar.
export const svOnline = {
  'online.hand.back': 'Tillbaka till handen',
  'online.spread.title': 'Hela handen',
  'online.spread.label.one': 'Hela handen, {n} kort',
  'online.spread.label.other': 'Hela handen, {n} kort',
  'online.spread.count.one': '{n} kort',
  'online.spread.count.other': '{n} kort',
  'online.spread.close': 'Stäng',
  'online.showall': 'Visa alla',
  // Väntrummet över filten tills något har hänt vid bordet (L77, #1130).
  'online.wait.heading': 'Väntar på spelare · {n} av {of}',
  'online.wait.text': 'Skicka länken till dem som ska spela. Bordet startar när du säger till.',
  'online.wait.address': 'Bordets adress',
  'online.wait.copy': 'Kopiera länk',
  'online.wait.copied': 'Kopierad',
  'online.wait.copy.failed': 'Gick inte att kopiera. Adressen är markerad, så kopiera den själv.',
  'online.wait.seats': 'Platserna',
  'online.wait.free': 'väntar…',
  'online.wait.me': '{name} (du)',
  'online.wait.begin': 'Börja spela',
  'online.wait.hide': 'Göm väntrummet',
  'online.observers.one': '{names} tittar på',
  'online.observers.other': '{names} tittar på',
} as const
