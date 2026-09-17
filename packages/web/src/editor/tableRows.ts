import type { TableSummary } from './ProjectClient.js'
import type { T } from '../i18n/index.js'

// What a row in the table list says, and which group it belongs in (#176, C9, G3).
//
// The list used to be one flat stack of cards with six ways in stacked under each: five tables
// came to 2 350 px, and the one table being played lay a screen below four that nobody had ever
// touched. So the column is three groups — what is being played, what was started and never
// touched, what is over — and this module is the whole of that decision as data. Nothing here
// draws; the panel paints what comes out of here, which is what lets the words be read by a test
// rather than by an eye.
//
// It is framework-free on purpose, and it works off the summary the server already answers with
// (`/projects/:id/sessions`): which group a table is in must be known *before* the row is drawn,
// because a folded group is precisely a group whose rows have not connected to anything yet.

export type TableGroupId = 'played' | 'untouched' | 'ended'

export type TableGroup = {
  id: TableGroupId
  // The heading a reader sees and hears. The two folded ones carry their count in it, because a
  // fold that does not say how much is behind it is a fold nobody opens.
  heading: string
  tables: TableSummary[]
}

// Which of the three a table is. Being over decides first: an ending writes `session.end` into
// the log (C9), so an ended table has a last moment like any played one, and it is where the
// survey answers live (G3) — it must never be filed among the tables where nothing happened.
export function groupOf(table: TableSummary): TableGroupId {
  if (table.ended) return 'ended'
  return table.lastAt === null ? 'untouched' : 'played'
}

const HEADING: Record<TableGroupId, 'tables.group.played' | 'tables.group.untouched' | 'tables.group.ended'> = {
  played: 'tables.group.played',
  untouched: 'tables.group.untouched',
  ended: 'tables.group.ended',
}

// The three groups in the order the column shows them: what is being played first, because that
// is what the designer is looking for. A group with nothing in it is not drawn at all.
export function tableGroups(tables: readonly TableSummary[], t: T): TableGroup[] {
  const order: TableGroupId[] = ['played', 'untouched', 'ended']
  return order
    .map((id) => {
      const mine = tables.filter((table) => groupOf(table) === id)
      return { id, heading: t(HEADING[id], { n: mine.length }), tables: mine }
    })
    .filter((group) => group.tables.length > 0)
}
