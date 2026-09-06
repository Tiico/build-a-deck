import type { Activity, Snapshot } from '@byd/protocol'

// One line of Swedish per log line, for the activity feed. Names come from the view;
// zone names too, so "Draghög" rather than "draw".
export function describeActivity(line: Activity, view: Snapshot): string {
  const who = line.by === null ? 'Bordet' : view.seats.find((s) => s.id === line.by)?.name ?? line.by
  const zone = (id: string) => view.zones.find((z) => z.id === id)?.name ?? id
  const it = line.intent
  switch (it.v) {
    case 'move':
      return `${who} flyttade ett kort till ${zone(it.to)}`
    case 'rotate':
      return `${who} vred ett kort`
    case 'flip':
      return `${who} vände ett kort`
    case 'stack':
      return `${who} lade ett kort på ett annat`
    case 'split':
      return `${who} delade ${zone(it.pile)}`
    case 'shuffle':
      return `${who} blandade ${zone(it.pile)}`
    case 'draw':
      return `${who} drog ${it.count} från ${zone(it.from)}`
    case 'deal':
      return `${who} delade ut ${it.each} var`
    case 'roll':
      return `${who} slog en tärning`
    case 'setCounter':
      return `${who} satte en räknare till ${it.value}`
    case 'peek':
      return `${who} tittade på ett kort`
    case 'showTo':
      return `${who} visade ett kort för ${it.seats.map((s) => view.seats.find((x) => x.id === s)?.name ?? s).join(', ')}`
    case 'reveal':
      return `${who} avslöjade ett kort`
    case 'movePile':
      return `${who} flyttade en hög`
    case 'seat.claim':
      return `${it.name} satte sig på plats ${it.seat}`
    case 'seat.release':
      return `Plats ${it.seat} lämnades`
    case 'setup.reset':
      return `${who} återställde bordet`
    case 'session.end':
      return 'Sessionen avslutades'
    case 'version.change':
      return `Spelet uppdaterades till ${it.to}`
    case 'undo.self':
    case 'rewind.propose':
    case 'rewind.confirm':
      return `${who}: ${it.v}`
  }
}
