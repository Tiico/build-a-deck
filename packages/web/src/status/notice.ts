// The nine states a screen can be in when it cannot show what it promised (#12, #7), and the
// one thing every route shares. A route picks where the message stands and says it in its own
// words; it never invents a state of its own.
export const STATUS_KEYS = ['loading', 'slow', 'missing', 'forbidden', 'offline', 'connecting', 'dropped', 'resumed', 'refused'] as const
export type StatusKey = (typeof STATUS_KEYS)[number]

// Three of the nine happen on top of a view that already holds data; the other six happen
// instead of one. That difference decides the form, so it belongs to the model.
const OVER_DATA = new Set<StatusKey>(['dropped', 'resumed', 'refused'])
export function blocksView(state: StatusKey): boolean {
  return !OVER_DATA.has(state)
}

// Which words a route speaks in. Not the same thing as which route it is: `/table`, `/online`
// and `/observe` are all rooms seen across a room, and `/play` and `/join` are both a phone.
export const VOICES = ['app', 'table', 'phone', 'editor'] as const
export type Voice = (typeof VOICES)[number]

// What the message is drawn in. `wait` is nothing wrong yet, `gone` is grey because nothing is
// broken, `shut` is a lock and not a fault, `broken` is the line or the answer.
export type Tone = 'wait' | 'gone' | 'shut' | 'broken' | 'ok'

// Recovery is either a retry or a decision, never a reload: a reload throws away the very state
// the reader is trying to keep, and two of them in a row is a loop.
export type ActionKind = 'retry' | 'login' | 'home' | 'rescan'
export type Action = { kind: ActionKind; label: string; primary?: boolean }

export type Notice = {
  state: StatusKey
  tone: Tone
  // A short word for the badge over the heading: what a reader across a room reads first.
  mark: string
  heading: string
  text: string
  actions: readonly Action[]
  // Assertive only when what is on the screen has stopped being true, or when something someone
  // asked for did not happen. Waiting is polite; being told to wait harder is not an emergency.
  live: 'polite' | 'assertive'
  // Does waiting fix it? A 404 asked again is still a 404, and a refusal is an answer.
  retryable: boolean
}

const retry = (label = 'Försök igen'): Action => ({ kind: 'retry', label, primary: true })
const login: Action = { kind: 'login', label: 'Logga in', primary: true }
const home = (label = 'Till mina spel'): Action => ({ kind: 'home', label })
// Back to the seat picker: the one way out of a phone that is not a link somewhere else.
const rescan: Action = { kind: 'rescan', label: 'Välj plats igen' }

// One wording for every route: the model's own voice, which each route may sharpen but never
// contradict.
function base(state: StatusKey): Notice {
  switch (state) {
    case 'loading':
      return { state, tone: 'wait', mark: 'Laddar', heading: 'Hämtar…', text: 'Det brukar ta en sekund.', actions: [], live: 'polite', retryable: true }
    case 'slow':
      return { state, tone: 'wait', mark: 'Laddar', heading: 'Det här tar längre tid än vanligt', text: 'Vi väntar fortfarande på svar. Vänta kvar, eller försök igen.', actions: [retry(), home()], live: 'polite', retryable: true }
    case 'missing':
      return { state, tone: 'gone', mark: 'Finns inte', heading: 'Vi hittar inte det du sökte', text: 'Länken pekar på något som inte finns längre. Kontrollera adressen, eller gå till dina spel.', actions: [home('Till mina spel')], live: 'assertive', retryable: false }
    case 'forbidden':
      return { state, tone: 'shut', mark: 'Stängt', heading: 'Du har inte tillgång', text: 'Det här hör till ett annat konto. Logga in med rätt konto, eller be den som äger det att bjuda in dig.', actions: [login, home()], live: 'assertive', retryable: false }
    case 'offline':
      return { state, tone: 'broken', mark: 'Ingen kontakt', heading: 'Vi når inte tjänsten', text: 'Det kan vara nätet där du är, eller så är tjänsten nere en stund. Inget av ditt arbete är borta.', actions: [retry(), home()], live: 'assertive', retryable: true }
    case 'connecting':
      return { state, tone: 'wait', mark: 'Ansluter', heading: 'Ansluter…', text: 'Vi kopplar upp mot bordet.', actions: [], live: 'polite', retryable: true }
    case 'dropped':
      return { state, tone: 'broken', mark: 'Frånkopplad', heading: 'Anslutningen bröts', text: 'Det du ser kan ha ändrats sedan dess. Ingenting du gör nu kommer fram.', actions: [retry('Försök nu'), home()], live: 'assertive', retryable: true }
    case 'resumed':
      return { state, tone: 'ok', mark: 'Uppkopplad', heading: 'Uppkopplad igen', text: 'Bilden är uppdaterad till hur det ser ut nu.', actions: [], live: 'polite', retryable: false }
    case 'refused':
      return { state, tone: 'broken', mark: 'Gick inte', heading: 'Draget gick inte igenom', text: '', actions: [], live: 'assertive', retryable: false }
  }
}

// The same nine states, said in the words of the route they land on. A route may change the
// heading, the sentence and where its way out leads; it may not change the tone, the live
// region or whether waiting helps.
const PER_VOICE: Record<Voice, Partial<Record<StatusKey, Partial<Notice>>>> = {
  app: {},
  table: {
    loading: { heading: 'Dukar bordet…', text: 'Rummet hämtas.' },
    slow: { heading: 'Bordet dröjer', text: 'Vi väntar fortfarande på spelet. Ingen behöver göra något än.' },
    missing: { heading: 'Rummet är slut', text: 'Koden som stod här gäller inte längre. Starta ett nytt rum från Mina spel.' },
    forbidden: { heading: 'Bordet hör till ett annat konto', text: 'Logga in på kontot som äger spelet för att visa det på den här skärmen.' },
    offline: { heading: 'Bordet når inte tjänsten', text: 'Kontrollera nätet på den här skärmen. Spelet ligger kvar och ingenting har gått förlorat.' },
    connecting: { heading: 'Kopplar upp bordet…', text: 'Rummet är på väg upp.' },
    dropped: { heading: 'Bordet har tappat kontakten', text: 'Ingen kan spela förrän kontakten är tillbaka.' },
    resumed: { heading: 'Bordet är igång igen', text: 'Bilden visar hur det ser ut nu.' },
  },
  phone: {
    loading: { heading: 'Hämtar din hand…', text: 'Ett ögonblick.' },
    slow: { heading: 'Det tar längre tid än vanligt', text: 'Vi väntar fortfarande på rummet.', actions: [retry(), home('Till startsidan')] },
    missing: { heading: 'Rummet finns inte', text: 'Rummet kan ha avslutats. Läs QR-koden på TV:n igen så kommer du in i det som pågår.', actions: [home('Till startsidan')] },
    forbidden: { heading: 'Din plats är inte längre din', text: 'Någon annan sitter på platsen. Välj en ledig plats igen, eller läs QR-koden på TV:n.', actions: [{ ...rescan, primary: true }, login, home('Till startsidan')] },
    offline: { heading: 'Vi når inte rummet', text: 'Kontrollera nätet på telefonen. Din plats står kvar så länge spelet pågår.', actions: [retry(), home('Till startsidan')] },
    connecting: { heading: 'Kopplar upp…', text: 'Vi letar upp ditt rum.' },
    dropped: { heading: 'Du är frånkopplad', text: 'Handen du ser är gammal och ingenting du gör nu kommer fram. Vi försöker igen.', actions: [retry('Försök nu'), home('Till startsidan')] },
    resumed: { heading: 'Uppkopplad igen', text: 'Din hand är uppdaterad.' },
  },
  editor: {
    loading: { heading: 'Öppnar spelet…', text: 'Vi hämtar leken.' },
    slow: { heading: 'Spelet dröjer', text: 'Vi väntar fortfarande på servern.' },
    missing: { heading: 'Vi hittar inte spelet', text: 'Spelet kan vara borttaget, eller så blev det ett tecken fel i länken.' },
    forbidden: { heading: 'Spelet hör till någon annan', text: 'Be den som äger spelet att bjuda in dig, eller logga in på rätt konto.' },
    offline: { heading: 'Vi når inte servern', text: 'Ändringarna du gjort ligger kvar här. Vi sparar så fort kontakten är tillbaka.' },
    connecting: { heading: 'Kopplar upp…', text: 'Vi hämtar den senaste versionen.' },
    dropped: { heading: 'Ingen kontakt med servern', text: 'Osparat arbete ligger kvar här tills kontakten är tillbaka.' },
    resumed: { heading: 'Sparat och uppkopplat igen', text: 'Allt du hann göra ligger på servern.' },
  },
}

export function noticeFor(state: StatusKey, voice: Voice): Notice {
  return { ...base(state), ...(PER_VOICE[voice][state] ?? {}) }
}

// When old data is left on the screen the reader has to be told how old it is, or the picture
// goes on looking current (#7). The clock is the app's own, not the server's.
export function asOf(at: Date): string {
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
}

// A refusal comes back from the server as a developer's sentence in English. It is a fact about
// the intent, not a message to a person, so it is translated here and never shown as it stands.
const REFUSALS: { match: RegExp; say: string }[] = [
  { match: /^not connected$/, say: 'Du är inte uppkopplad, så draget skickades aldrig.' },
  { match: /^connection lost$/, say: 'Anslutningen bröts innan draget kom fram.' },
  { match: /session has ended/, say: 'Bordet är avslutat och tar inte emot fler drag.' },
  { match: /an observer can only flag/, say: 'Som observatör kan du titta och flagga, men inte spela.' },
  { match: /seat does not match/, say: 'Draget hörde till en annan plats än din.' },
  { match: /was already used/, say: 'Draget hade redan skickats.' },
  { match: /is empty/, say: 'Högen är tom.' },
  { match: /fewer than/, say: 'Det finns inte så många kort kvar.' },
  { match: /cannot be flipped|has no face/, say: 'Kortet kan inte vändas.' },
  { match: /cannot be stacked|onto itself/, say: 'Korten kan inte läggas på varandra.' },
  { match: /cannot be shuffled/, say: 'Högen kan inte blandas.' },
  { match: /cannot be rolled/, say: 'Kortet kan inte slås.' },
  { match: /has no counter/, say: 'Kortet har ingen räknare.' },
  { match: /is not a pile|is not an area|into itself|needs x and y/, say: 'Det går inte att lägga korten där.' },
  { match: /cannot peek/, say: 'Den här skärmen har ingen hand att titta i.' },
  { match: /^unknown (component|zone|seat)/, say: 'Kortet eller zonen finns inte längre på bordet.' },
]

export function refusalText(reason: string): string {
  return REFUSALS.find((r) => r.match.test(reason))?.say ?? 'Bordet tog inte emot draget. Försök igen om en stund.'
}

// The refusal as a notice, so that the inline message at the control is the same model as
// everything else — only smaller and standing somewhere different.
export function refusal(reason: string, voice: Voice): Notice {
  return { ...noticeFor('refused', voice), text: refusalText(reason) }
}
