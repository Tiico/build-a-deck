import { useEffect, useRef, useState } from 'react'
import type { Motif } from '@byd/template'
import { SetupEditor } from './SetupEditor.js'
import { TablesTab } from './TablesTab.js'
import { PlaytestResults } from './PlaytestResults.js'
import type { ProjectClient } from './ProjectClient.js'
import type { ProjectDoc } from './types.js'
import { useT } from '../i18n/index.js'

// The Bord tab (#19, #1010): the game's board and its running tables, and — a press away — what
// its playtests said. «Resultat» is a view of this tab and not a tab of its own (beställarens val
// 2026-10-18): the answers belong to the tables they came from, and the header keeps its seven
// tabs and the game's whole name. The switch stands at the head of the middle column in both
// views, over the felt and over the results, so it is where the hand left it.
//
// A viewer runs no tables and reads no playtest (#524), so she has no switch: the tab is the
// board and its tables, as it always was.
export type BordTabProps = { doc: ProjectDoc; client: ProjectClient; assetBase?: string | undefined; motifs?: Record<string, Motif> | undefined; server: string | null; started?: string | null }

type View = 'tables' | 'results'

export function BordTab({ doc, client, assetBase, motifs, server, started = null }: BordTabProps) {
  const [view, setView] = useState<View>('tables')
  // The table the Resultat view was opened for, from its row; null for all of them.
  const [table, setTable] = useState<string | null>(null)
  // A switch pressed keeps the focus: it is drawn again in the other view, in the same place.
  const [moved, setMoved] = useState(false)
  // The switch opens Resultat on every table; only a row's line narrows it to one.
  const show = (next: View) => {
    setMoved(true)
    setTable(null)
    setView(next)
  }
  const switcher = client.mayStartTables ? <ViewSwitch view={view} onView={show} focus={moved} /> : null
  if (view === 'results') return <PlaytestResults client={client} table={table} onTable={setTable} switcher={switcher} />
  return (
    <SetupEditor
      doc={doc}
      client={client}
      assetBase={assetBase}
      motifs={motifs}
      lead={switcher}
      beside={
        <TablesTab
          client={client}
          server={server}
          started={started}
          onResults={(id) => {
            setMoved(false)
            setTable(id)
            setView('results')
          }}
        />
      }
    />
  )
}

function ViewSwitch({ view, onView, focus }: { view: View; onView(view: View): void; focus: boolean }) {
  const t = useT()
  const chosen = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (focus) chosen.current?.focus()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- on arriving in a view only
  }, [])
  return (
    <div className="byd-bord-switch" role="group" aria-label={t('results.switch')}>
      {(['tables', 'results'] as const).map((v) => (
        <button key={v} ref={v === view ? chosen : undefined} type="button" className="byd-choice" aria-pressed={v === view} onClick={() => v !== view && onView(v)}>
          {t(v === 'tables' ? 'results.switch.tables' : 'results.switch.results')}
        </button>
      ))}
    </div>
  )
}
