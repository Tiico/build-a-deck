import { translate, type Key, type T } from '../i18n/index.js'

// The nine states a screen can be in when it cannot show what it promised (#12, #7), and the
// one thing every route shares. A route picks where the message stands and says it in its own
// words; it never invents a state of its own.
//
// The words themselves are the catalogue's (A4): this file decides which state a screen is in
// and which voice says it, never what the sentence reads like in one language or another. A
// caller that has no reader — a test, a module outside React — gets Swedish, which is what the
// catalogue is written in.
const swedish: T = (key, params) => translate('sv', key, params)

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

const retry = (t: T, key: Key = 'status.act.retry'): Action => ({ kind: 'retry', label: t(key), primary: true })
const login = (t: T): Action => ({ kind: 'login', label: t('status.act.login'), primary: true })
const home = (t: T, key: Key = 'status.act.home'): Action => ({ kind: 'home', label: t(key) })
// Back to the seat picker: the one way out of a phone that is not a link somewhere else.
const rescan = (t: T): Action => ({ kind: 'rescan', label: t('status.act.rescan'), primary: true })

// One wording for every route: the model's own voice, which each route may sharpen but never
// contradict.
function base(state: StatusKey, t: T): Notice {
  switch (state) {
    case 'loading':
      return { state, tone: 'wait', mark: t('status.loading.mark'), heading: t('status.loading.heading'), text: t('status.loading.text'), actions: [], live: 'polite', retryable: true }
    case 'slow':
      return { state, tone: 'wait', mark: t('status.slow.mark'), heading: t('status.slow.heading'), text: t('status.slow.text'), actions: [retry(t), home(t)], live: 'polite', retryable: true }
    case 'missing':
      return { state, tone: 'gone', mark: t('status.missing.mark'), heading: t('status.missing.heading'), text: t('status.missing.text'), actions: [home(t)], live: 'assertive', retryable: false }
    case 'forbidden':
      return { state, tone: 'shut', mark: t('status.forbidden.mark'), heading: t('status.forbidden.heading'), text: t('status.forbidden.text'), actions: [login(t), home(t)], live: 'assertive', retryable: false }
    case 'offline':
      return { state, tone: 'broken', mark: t('status.offline.mark'), heading: t('status.offline.heading'), text: t('status.offline.text'), actions: [retry(t), home(t)], live: 'assertive', retryable: true }
    case 'connecting':
      return { state, tone: 'wait', mark: t('status.connecting.mark'), heading: t('status.connecting.heading'), text: t('status.connecting.text'), actions: [], live: 'polite', retryable: true }
    case 'dropped':
      return { state, tone: 'broken', mark: t('status.dropped.mark'), heading: t('status.dropped.heading'), text: t('status.dropped.text'), actions: [retry(t, 'status.act.retry.now'), home(t)], live: 'assertive', retryable: true }
    case 'resumed':
      return { state, tone: 'ok', mark: t('status.resumed.mark'), heading: t('status.resumed.heading'), text: t('status.resumed.text'), actions: [], live: 'polite', retryable: false }
    case 'refused':
      // A refusal has no sentence of its own until a reason is carried into it, so its text is
      // an absence rather than a message, and there is nothing in the catalogue for it.
      return { state, tone: 'broken', mark: t('status.refused.mark'), heading: t('status.refused.heading'), text: '', actions: [], live: 'assertive', retryable: false }
  }
}

// The same nine states, said in the words of the route they land on. A route may change the
// heading, the sentence and where its way out leads; it may not change the tone, the live
// region or whether waiting helps.
//
// Each entry names its keys rather than spelling them out of the state and the voice, so a
// sentence a voice is missing is a compile error and not a line that quietly stays in Swedish.
type Voiced = (t: T) => Partial<Notice>
const PER_VOICE: Record<Voice, Partial<Record<StatusKey, Voiced>>> = {
  app: {},
  table: {
    loading: (t) => ({ heading: t('status.loading.table.heading'), text: t('status.loading.table.text') }),
    slow: (t) => ({ heading: t('status.slow.table.heading'), text: t('status.slow.table.text') }),
    missing: (t) => ({ heading: t('status.missing.table.heading'), text: t('status.missing.table.text') }),
    forbidden: (t) => ({ heading: t('status.forbidden.table.heading'), text: t('status.forbidden.table.text') }),
    offline: (t) => ({ heading: t('status.offline.table.heading'), text: t('status.offline.table.text') }),
    connecting: (t) => ({ heading: t('status.connecting.table.heading'), text: t('status.connecting.table.text') }),
    dropped: (t) => ({ heading: t('status.dropped.table.heading'), text: t('status.dropped.table.text') }),
    resumed: (t) => ({ heading: t('status.resumed.table.heading'), text: t('status.resumed.table.text') }),
  },
  phone: {
    loading: (t) => ({ heading: t('status.loading.phone.heading'), text: t('status.loading.phone.text') }),
    slow: (t) => ({ heading: t('status.slow.phone.heading'), text: t('status.slow.phone.text'), actions: [retry(t), home(t, 'status.act.home.start')] }),
    // A guest has a room code and no account (#485): the way on is the seat picker, and it is the
    // one primary answer. «Logga in» belongs to the table screen.
    missing: (t) => ({ heading: t('status.missing.phone.heading'), text: t('status.missing.phone.text'), actions: [rescan(t), home(t, 'status.act.home.start')] }),
    forbidden: (t) => ({ heading: t('status.forbidden.phone.heading'), text: t('status.forbidden.phone.text'), actions: [rescan(t), home(t, 'status.act.home.start')] }),
    offline: (t) => ({ heading: t('status.offline.phone.heading'), text: t('status.offline.phone.text'), actions: [retry(t), home(t, 'status.act.home.start')] }),
    connecting: (t) => ({ heading: t('status.connecting.phone.heading'), text: t('status.connecting.phone.text') }),
    dropped: (t) => ({ heading: t('status.dropped.phone.heading'), text: t('status.dropped.phone.text'), actions: [retry(t, 'status.act.retry.now'), home(t, 'status.act.home.start')] }),
    resumed: (t) => ({ heading: t('status.resumed.phone.heading'), text: t('status.resumed.phone.text') }),
  },
  editor: {
    loading: (t) => ({ heading: t('status.loading.editor.heading'), text: t('status.loading.editor.text') }),
    slow: (t) => ({ heading: t('status.slow.editor.heading'), text: t('status.slow.editor.text') }),
    missing: (t) => ({ heading: t('status.missing.editor.heading'), text: t('status.missing.editor.text') }),
    forbidden: (t) => ({ heading: t('status.forbidden.editor.heading'), text: t('status.forbidden.editor.text') }),
    offline: (t) => ({ heading: t('status.offline.editor.heading'), text: t('status.offline.editor.text') }),
    connecting: (t) => ({ heading: t('status.connecting.editor.heading'), text: t('status.connecting.editor.text') }),
    dropped: (t) => ({ heading: t('status.dropped.editor.heading'), text: t('status.dropped.editor.text') }),
    resumed: (t) => ({ heading: t('status.resumed.editor.heading'), text: t('status.resumed.editor.text') }),
  },
}

// `spent`: the reconnect plan has run out and nothing is being tried until a person asks (#483).
// The line is still down, so the state is the same; what changes is that no sentence may promise
// another attempt, and the one way on is said.
export function noticeFor(state: StatusKey, voice: Voice, t: T = swedish, { spent = false }: { spent?: boolean } = {}): Notice {
  const said = { ...base(state, t), ...(PER_VOICE[voice][state]?.(t) ?? {}) }
  if (!spent || state !== 'dropped') return said
  const text = voice === 'phone' ? t('status.dropped.phone.text.spent') : said.text
  return { ...said, text: `${text} ${t('status.dropped.spent')}` }
}

// A seat's way back once its line is gone (#484 fynd 14): where a notice offers the way home, the
// room's seat picker is offered before it. «Till mina spel» is no way back for a guest, who has no
// games, while the code the seat came in by still opens the picker. Only for a route that has the
// code to open it with — the route asks, and says so by calling this.
export function towardSeat(notice: Notice, t: T = swedish): Notice {
  const at = notice.actions.findIndex((a) => a.kind === 'home')
  if (at < 0 || notice.actions.some((a) => a.kind === 'rescan')) return notice
  const actions = [...notice.actions.slice(0, at), { kind: 'rescan' as const, label: t('status.act.rescan') }, ...notice.actions.slice(at)]
  return { ...notice, actions }
}

// The way home from a page read by someone who is not signed in (#475). `/` is the login card for
// them, and "Till mina spel" over it is a promise the page does not keep; "Till startsidan" is true
// of both shapes the start page has.
export function signedOut(notice: Notice, t: T = swedish): Notice {
  return { ...notice, actions: notice.actions.map((a) => (a.kind === 'home' ? { ...a, label: t('status.act.home.start') } : a)) }
}

// When old data is left on the screen the reader has to be told how old it is, or the picture
// goes on looking current (#7). The clock is the app's own, not the server's.
export function asOf(at: Date): string {
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
}

// A refusal comes back from the server as a developer's sentence in English. It is a fact about
// the intent, not a message to a person, so it is translated here and never shown as it stands.
const REFUSALS: { match: RegExp; say: Key }[] = [
  { match: /^not connected$/, say: 'refusal.notConnected' },
  { match: /^connection lost$/, say: 'refusal.connectionLost' },
  { match: /session has ended/, say: 'refusal.ended' },
  { match: /an observer can only flag/, say: 'refusal.observer' },
  { match: /seat does not match/, say: 'refusal.seat' },
  { match: /was already used/, say: 'refusal.spent' },
  { match: /is empty/, say: 'refusal.empty' },
  { match: /fewer than/, say: 'refusal.tooFew' },
  { match: /cannot be flipped|has no face/, say: 'refusal.flip' },
  { match: /cannot be stacked|onto itself/, say: 'refusal.stack' },
  { match: /cannot be shuffled/, say: 'refusal.shuffle' },
  { match: /cannot be rolled/, say: 'refusal.roll' },
  { match: /has no counter/, say: 'refusal.counter' },
  { match: /is not a pile|is not an area|into itself|needs x and y/, say: 'refusal.place' },
  { match: /cannot peek/, say: 'refusal.peek' },
  { match: /^unknown (component|zone|seat)/, say: 'refusal.unknown' },
  // A save refused because the game is gone (#485): the editor put the server's words in its head.
  { match: /^(unknown project|missing)$/, say: 'refusal.projectGone' },
]

export function refusalText(reason: string, t: T = swedish): string {
  return t(REFUSALS.find((r) => r.match.test(reason))?.say ?? 'refusal.other')
}

// The refusal as a notice, so that the inline message at the control is the same model as
// everything else — only smaller and standing somewhere different.
export function refusal(reason: string, voice: Voice, t: T = swedish): Notice {
  return { ...noticeFor('refused', voice, t), text: refusalText(reason, t) }
}

// What a guest's route says when it cannot show a table at all (#485): the phone's words and ways
// out, on every route a guest reaches through the seat picker — /play, /online, /observe — whatever
// voice the rest of that route speaks in. A guest told «Starta ett nytt bord från Mina spel», or
// offered «Logga in», was offered a way on she does not have.
export function guestNotice(state: 'missing' | 'forbidden', t: T = swedish): Notice {
  return noticeFor(state, 'phone', t)
}

// An editor whose reader was logged out while it was open (#485, fynd 7): not «someone else's
// game», which is what it used to be told, but what happened and the way back in. The work stays
// on the page behind it.
export function loggedOutNotice(t: T = swedish): Notice {
  return { ...noticeFor('forbidden', 'editor', t), heading: t('status.loggedOut.editor.heading'), text: t('status.loggedOut.editor.text'), actions: [login(t)] }
}
