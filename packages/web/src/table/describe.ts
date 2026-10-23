import type { Activity, Snapshot } from '@byd/protocol'
import type { T } from '../i18n/index.js'
import { handName } from './handName.js'
import { cardWord } from './keyboard.js'
import { componentOf } from './presence.js'
import { versionWord } from '../i18n/version.js'
import { dieKind } from '../components.js'

// The lines worth saying. A card played to a public zone is one envelope with a move and a flip,
// and said as its flip it never said where the card went (#560 P-12): the flip of a card the same
// envelope moved is folded into the move, whose sentence names both the card and the zone.
//
// One envelope of rolls is one throw (#1136): the dice leave the hand together, so the envelope is
// said once, on its first roll, which carries what every die in it came to.
export type Said = Activity & { rolls?: readonly { component: string; value: number }[] }
export function sayable(lines: readonly Activity[]): Said[] {
  const moved = new Set(lines.flatMap((l) => (l.intent.v === 'move' ? [`${l.batch}\u0000${l.intent.component}`] : [])))
  const throws = new Map<string, { component: string; value: number }[]>()
  for (const l of lines) {
    if (l.intent.v !== 'roll' || l.rolled === undefined) continue
    throws.set(l.batch, [...(throws.get(l.batch) ?? []), { component: l.intent.component, value: l.rolled }])
  }
  const said: Said[] = []
  for (const l of lines) {
    if (l.intent.v === 'flip' && moved.has(`${l.batch}\u0000${l.intent.component}`)) continue
    if (l.intent.v !== 'roll' || l.rolled === undefined) {
      said.push(l)
      continue
    }
    const rolls = throws.get(l.batch)
    if (rolls === undefined) continue
    said.push({ ...l, rolls })
    throws.delete(l.batch)
  }
  return said
}

// What a throw came to, the way a table says it (#1136): the kinds in the order they were thrown,
// «d4: 2, 2d6: 6 + 1», and the sum after them when more than one die was thrown.
function thrown(rolls: readonly { component: string; value: number }[], view: Snapshot): string {
  const kinds = new Map<string, number[]>()
  for (const r of rolls) {
    const die = view.components.find((c) => c.id === r.component)
    const kind = (die && dieKind(die)) ?? 'd?'
    kinds.set(kind, [...(kinds.get(kind) ?? []), r.value])
  }
  const told = [...kinds].map(([kind, values]) => `${values.length > 1 ? values.length : ''}${kind}: ${values.join(' + ')}`).join(', ')
  return rolls.length > 1 ? `${told} = ${rolls.reduce((sum, r) => sum + r.value, 0)}` : told
}

// One line per log line, for the activity feed, in whichever language the reader is given (A4).
// Names come from the view; zone names too, so "Draghög" rather than "draw" — a zone's name is
// the designer's word and is never translated — except a hand, which is named by whoever sits there.
export function describeActivity(line: Said, view: Snapshot, t: T): string {
  // The reader's own move is said to the reader (#714): «Du drog 1 … till din hand», in one person,
  // where it was «Ada drog 1 … till min hand».
  // And by the name the line was written under (#714), which outlives the seat being left.
  const now = view.seats.find((s) => s.id === line.by)?.name ?? null
  const mine = line.by !== null && line.by === view.seat && (line.name === undefined || line.name === now)
  const who = line.by === null ? t('play.table') : mine ? t('activity.you') : line.name ?? now ?? line.by
  const zone = (id: string) => {
    const z = view.zones.find((x) => x.id === id)
    if (!z) return id
    // A hand is the one zone the log does not call by the designer's name (K19).
    if (z.kind === 'hand') return handName(view, z, t, 'inSentence')
    // A pile made on the felt is named by the area it lies in (K1, #714), not by its id.
    return z.kind === 'pile' && z.dynamic ? t('zone.pile.within', { area: z.name }) : z.name
  }
  // The card the line is about, by its title, only as the reader's own view has it (#507 fynd 6).
  // The projection has already decided what this reader is told (B6, #412): a card she may not
  // see is not in her view, or is there without a name, and the line then says «ett kort».
  const about = componentOf(line)
  const card = about === null ? null : cardWord(view.components.find((c) => c.id === about))
  const it = line.intent
  switch (it.v) {
    case 'move':
      return card ? t('activity.move.named', { who, card, zone: zone(it.to) }) : t('activity.move', { who, zone: zone(it.to) })
    case 'rotate':
      return t('activity.rotate', { who })
    case 'flip':
      return card ? t('activity.flip.named', { who, card }) : t('activity.flip', { who })
    case 'stack':
      return t('activity.stack', { who })
    // One protocol verb, two moves a player recognises (#421). `split` is both "Dra 1 till min
    // hand" and the ring's "Dela på hälften", and the vocabulary is closed, so the line is told
    // apart here, by the `to` the intent already carries: with a destination the top cards were
    // drawn to it, without one they became a new pile beside. `at` is said and the cards are not,
    // so a hidden pile stays hidden — `which` never reaches the line.
    case 'split':
      return it.to
        ? t(it.at === 1 ? 'activity.split.to.one' : 'activity.split.to.other', { who, n: it.at, zone: zone(it.pile), to: zone(it.to) })
        : t(it.at === 1 ? 'activity.split.beside.one' : 'activity.split.beside.other', { who, n: it.at, zone: zone(it.pile) })
    case 'shuffle':
      return t('activity.shuffle', { who, zone: zone(it.pile) })
    // Where the cards went, as a drawn card already says it (#714): three «drog 5 från Kortlek» in a
    // row could not be told apart.
    case 'draw':
      return t(it.count === 1 ? 'activity.split.to.one' : 'activity.split.to.other', { who, n: it.count, zone: zone(it.from), to: zone(it.to) })
    case 'deal': {
      const to = it.to.map(zone)
      const listed = to.length < 2 ? to.join('') : `${to.slice(0, -1).join(', ')} ${t('activity.and')} ${to[to.length - 1]}`
      return t(it.each === 1 ? 'activity.deal.one' : 'activity.deal.other', { who, n: it.each, to: listed })
    }
    case 'roll': {
      const rolls = line.rolls ?? (line.rolled === undefined ? undefined : [{ component: it.component, value: line.rolled }])
      return rolls ? t('activity.roll.thrown', { who, thrown: thrown(rolls, view) }) : t('activity.roll', { who })
    }
    case 'setCounter': {
      // By the counter's own name, as its chip on the felt says it (#714).
      const named = view.components.find((c) => c.id === it.component)?.cardRef
      return named ? t('activity.setCounter.named', { who, counter: named, value: it.value }) : t('activity.setCounter', { who, value: it.value })
    }
    case 'peek':
      return t('activity.peek', { who })
    case 'showTo':
      return t('activity.showTo', { who, seats: it.seats.map((s) => view.seats.find((x) => x.id === s)?.name ?? s).join(', ') })
    case 'reveal':
      return t('activity.reveal', { who })
    case 'movePile':
      return t('activity.movePile', { who })
    case 'seat.claim':
      return t('activity.seat.claim', { name: it.name, seat: it.seat })
    case 'seat.release':
      return t('activity.seat.release', { seat: it.seat })
    case 'setup.reset':
      return t('activity.setup.reset', { who })
    case 'session.end':
      return t('activity.session.end')
    case 'version.change':
      return t('activity.version.change', { to: versionWord(it.to, t) })
    case 'undo.self':
      return t('activity.undo.self', { who })
    case 'rewind.propose':
      return t('activity.rewind.propose', { who })
    case 'rewind.confirm':
      return t('activity.rewind.confirm', { who })
    case 'rewind.reject':
      return t('activity.rewind.reject', { who })
    case 'flag': {
      const flagger = it.observer ? t('activity.flag.observer', { name: it.observer }) : who
      return it.note ? t('activity.flag.note', { who: flagger, note: it.note }) : t('activity.flag', { who: flagger })
    }
    // Whose turn it is (K29): given on, or taken by the seat itself.
    case 'turn.give':
      if (it.seat === line.by) return t('activity.turn.take', { who })
      return t('activity.turn.give', { who, to: view.seats.find((s) => s.id === it.seat)?.name ?? it.seat })
  }
}
