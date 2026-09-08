import type { Activity, Snapshot } from '@byd/protocol'
import type { T } from '../i18n/index.js'

// One line per log line, for the activity feed, in whichever language the reader is given (A4).
// Names come from the view; zone names too, so "Draghög" rather than "draw" — a zone's name is
// the designer's word and is never translated.
export function describeActivity(line: Activity, view: Snapshot, t: T): string {
  const who = line.by === null ? t('play.table') : view.seats.find((s) => s.id === line.by)?.name ?? line.by
  const zone = (id: string) => view.zones.find((z) => z.id === id)?.name ?? id
  const it = line.intent
  switch (it.v) {
    case 'move':
      return t('activity.move', { who, zone: zone(it.to) })
    case 'rotate':
      return t('activity.rotate', { who })
    case 'flip':
      return t('activity.flip', { who })
    case 'stack':
      return t('activity.stack', { who })
    case 'split':
      return t('activity.split', { who, zone: zone(it.pile) })
    case 'shuffle':
      return t('activity.shuffle', { who, zone: zone(it.pile) })
    case 'draw':
      return t('activity.draw', { who, n: it.count, zone: zone(it.from) })
    case 'deal':
      return t('activity.deal', { who, n: it.each })
    case 'roll':
      return t('activity.roll', { who })
    case 'setCounter':
      return t('activity.setCounter', { who, value: it.value })
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
      return t('activity.version.change', { to: it.to })
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
  }
}
