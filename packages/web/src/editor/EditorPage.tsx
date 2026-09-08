import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { DeckWall } from './DeckWall.js'
import { EditorTabs, MODES, panelId, tabId, type Mode } from './EditorTabs.js'
import { TemplateCanvas } from './TemplateCanvas.js'
import { DataTable } from './DataTable.js'
import { TableMenu, TablesTab } from './TablesTab.js'
import { SetupEditor } from './SetupEditor.js'
import { SymbolPanel } from './SymbolPanel.js'
import { HistoryPanel } from './HistoryPanel.js'
import { tvUrl } from './tableLinks.js'
import { useProjectClient } from './useProjectClient.js'
import type { ProjectDoc } from '@byd/server'
import { useTableClient } from '../table/useTableClient.js'
import type { ProjectClient, Textures } from './ProjectClient.js'
import { loginUrl } from '../account/api.js'
import './editor.css'

// /editor?project=…&server=http://…
// The editor (L, prototype answer): the deck wall as home, the template canvas for the template,
// the table as a tab. One project, one preview path, and "Uppdatera bordet" starts a table.
export type EditorPageProps = { onNavigate?(url: string): void }

export function EditorPage({ onNavigate = (url) => location.assign(url) }: EditorPageProps = {}) {
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const projectId = params.get('project')
  const http = params.get('server') ?? location.origin
  const { client, error } = useProjectClient(http, projectId)
  const [mode, setMode] = useState<Mode>('wall')
  // Which face the canvas edits (#13, L7). The wall is the deck seen from the front.
  const [face, setFace] = useState('front')
  // Which group the canvas edits (#13), or nothing for the base every card inherits.
  const [group, setGroup] = useState<string | null>(null)
  const [row, setRow] = useState<string | null>(null)
  const [element, setElement] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  // The history (B4) opens from the revision, which is where the version is already named.
  const [historyOpen, setHistoryOpen] = useState(false)
  // An older version the table is held against (B4), fetched once when the comparison starts.
  const [compare, setCompare] = useState<{ rev: number; label?: string | undefined; doc: ProjectDoc } | null>(null)
  // A running table (L5) with what admits people to it (DRIFT §9): the code and the host key.
  const [table, setTable] = useState<{ id: string; version: string; code: string; hostKey: string; kind: 'new' | 'refreshed' } | null>(null)
  // The table's textures (L5): the link opens only when every card can be seen. Polled with a
  // growing pause while anything is still rendering.
  const [textures, setTextures] = useState<Textures | null>(null)
  const [preparing, setPreparing] = useState<Textures | null>(null)
  // How many cards of the pending revision are lost for good. While this is set the table keeps
  // the version it has: a card without a face on the table is worse than a table left alone.
  const [lost, setLost] = useState<number | null>(null)
  useEffect(() => {
    if (!client || !table) return
    let stop = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let delay = 100
    const poll = async () => {
      const t = await client.textures(table.id).catch(() => null)
      if (stop) return
      if (t) setTextures(t)
      if (!t || t.done + t.failed.length < t.total) {
        timer = setTimeout(() => void poll(), delay)
        delay = Math.min(1000, delay * 2)
      }
    }
    // A refreshed table keeps what is known until the next answer; another table starts over.
    setTextures((t) => (t && table.kind === 'refreshed' ? t : null))
    void poll()
    return () => {
      stop = true
      if (timer) clearTimeout(timer)
    }
  }, [client, table?.id, table?.version])

  if (!projectId) return <p>Inget projekt angivet.</p>
  if (error === 'not logged in') {
    // Not logged in (G1): to the login card and back here after.
    onNavigate(loginUrl(location.pathname + location.search, params.get('server')))
    return <p>Loggar in…</p>
  }
  if (error) return <p role="alert">{error}</p>
  if (!client) return <p>Laddar projektet…</p>
  const doc = client.doc

  const save = async () => {
    setSaving(true)
    const result = await client.save()
    setSaving(false)
    setNotice(result.ok ? null : result.reason === 'conflict' ? 'Någon annan har sparat sedan du laddade. Ladda om och gör om ändringen.' : result.reason)
  }
  const startTable = async () => {
    try {
      const started = await client.startTable()
      setTable({ ...started, kind: 'new' })
      setNotice(null)
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err))
    }
  }
  // Once a table exists, the primary button pushes the current rev to it (C7, L5) — but only
  // after the new textures are rendered, so the switch is atomic for the players: prepare,
  // poll with a growing pause, then refresh.
  const updateTable = async (retryLost = false) => {
    if (!table) return startTable()
    try {
      setLost(null)
      let delay = 100
      // Only the first call carries the retry: it is what puts the dead renders back in the
      // queue, and the polling after it must not keep queueing them.
      for (let first = true; ; first = false) {
        const t = await client.prepareTable(table.id, retryLost && first)
        setPreparing(t)
        // A render that failed is not a render that finished. Stop here and say so.
        if (t.failed.length > 0) return setLost(t.failed.length)
        if (t.done >= t.total) break
        await new Promise((r) => setTimeout(r, delay))
        delay = Math.min(1000, delay * 2)
      }
      const { version } = await client.refreshTable(table.id)
      setTable({ ...table, version, kind: 'refreshed' })
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err))
    } finally {
      setPreparing(null)
    }
  }
  const panel: Record<Mode, () => ReactNode> = {
    wall: () => (
      <DeckWall
        doc={doc}
        assetBase={http}
        face="front"
        selectedRow={row}
        onSelectRow={setRow}
        onSelectElement={(id) => {
          setElement(id)
          setMode('template')
        }}
      />
    ),
    template: () => (
      <TemplateCanvas
        doc={doc}
        assetBase={http}
        face={face}
        onSelectFace={setFace}
        row={row}
        selectedElement={element}
        onSelectElement={setElement}
        onPatch={(id, patch) => client.patchElement(face, id, patch, group)}
        onAdd={(el) => client.addElement(face, el, group)}
        onReorder={(id, to) => client.moveElement(face, id, to)}
        onRemove={(id) => {
          client.removeElement(face, id, group)
          setElement(null)
        }}
        group={group}
        onSelectGroup={setGroup}
        onGroupColumn={(column) => {
          client.setGroupColumn(column)
          setGroup(null)
        }}
        onReset={(id) => group && client.resetElement(face, id, group)}
      />
    ),
    table: () => (
      <DataTable
        doc={doc}
        assetBase={http}
        onUpload={(file) => client.uploadAsset(file)}
        onSymbol={(symbol) => client.useSymbol(symbol)}
        compareWith={compare ?? undefined}
        onStopCompare={() => setCompare(null)}
        selectedRow={row}
        onSelectRow={setRow}
        onCell={(cardRef, field, value) => client.setCell(cardRef, field, value)}
        onAddRow={(cardRef) => client.addRow(cardRef, { title: '', antal: 1 })}
        onRemoveRow={(cardRef) => client.removeRow(cardRef)}
        onReplaceRows={(rows) => client.replaceRows(rows)}
      />
    ),
    symbols: () => <SymbolPanel doc={doc} client={client} assetBase={http} />,
    // Bord is the home for both the game's board vocabulary and its running tables (#19, C4).
    tables: () => (
      <>
        <SetupEditor doc={doc} client={client} />
        <TablesTab client={client} server={params.get('server')} />
      </>
    ),
  }

  const wsUrl = (params.get('server') ?? location.origin).replace(/^http/, 'ws')
  const rotate = async () => {
    if (!table) return
    try {
      const { code } = await client.rotateCode(table.id, table.hostKey)
      setTable({ ...table, code })
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="byd-editor" data-page="editor" data-mode={mode}>
      <header>
        <strong>{doc.name}</strong>
        <button type="button" className="byd-editor-rev" aria-expanded={historyOpen} onClick={() => setHistoryOpen((on) => !on)}>
          rev {client.rev}
        </button>
        <EditorTabs mode={mode} onSelect={setMode} />
        <span className="byd-editor-spacer" />
        {notice && <span role="status" className="byd-editor-notice">{notice}</span>}
        <button type="button" onClick={() => void save()} disabled={!client.dirty || saving}>
          {saving ? 'Sparar…' : 'Spara'}
        </button>
        {table && (
          <button type="button" onClick={() => void startTable()}>
            Nytt bord
          </button>
        )}
        <button type="button" className="byd-editor-primary" onClick={() => void updateTable()}>
          Uppdatera bordet
        </button>
        <TableMenu client={client} server={params.get('server')} onShowTables={() => setMode('tables')} />
      </header>
      {table && (
        <div className="byd-editor-table-link" role="status" {...(lost !== null ? { 'data-lost': '' } : {})}>
          {table.kind === 'new' ? 'Nytt bord startat' : 'Bordet uppdaterat'} på {table.version} —{' '}
          {lost !== null ? (
            <>
              <span className="byd-editor-warning">{lost} kort kunde inte renderas. Bordet står kvar på sin gamla version.</span>{' '}
              <button type="button" onClick={() => void updateTable(true)}>
                Försök igen
              </button>
            </>
          ) : preparing ? (
            <span className="byd-editor-rendering">renderar kort {preparing.done}/{preparing.total}</span>
          ) : textures && textures.done + textures.failed.length >= textures.total ? (
            <a href={tvUrl(table.id, params.get('server'), table.hostKey)} target="_blank" rel="noreferrer">
              öppna bordet
            </a>
          ) : (
            <span className="byd-editor-rendering">renderar kort {textures?.done ?? 0}/{textures?.total ?? '…'}</span>
          )}
          {textures && textures.failed.length > 0 && <span className="byd-editor-warning"> · {textures.failed.length} kort kunde inte renderas</span>}
          <span className="byd-editor-room">
            {' '}· rumskod <strong data-room-code>{table.code}</strong>{' '}
            <button type="button" onClick={() => void rotate()}>Ny kod</button>
          </span>
          <HostSeats client={client} sessionId={table.id} hostKey={table.hostKey} ws={wsUrl} onNotice={setNotice} />
        </div>
      )}
      {historyOpen && (
        <HistoryPanel
          client={client}
          onClose={() => setHistoryOpen(false)}
          onRestored={() => setHistoryOpen(false)}
          onCompare={(rev, label) => {
            void client.at(rev).then((old) => {
              if (!old) return
              setCompare({ rev, doc: old, ...(label !== undefined ? { label } : {}) })
              setHistoryOpen(false)
              setMode('table')
            })
          }}
        />
      )}
      <main>
        {MODES.map(([m]) => (
          // One panel per tab, so every tab's `aria-controls` names a panel that exists; only the
          // open one carries content, so switching mode still mounts a single canvas.
          <div key={m} id={panelId(m)} role="tabpanel" aria-labelledby={tabId(m)} tabIndex={0} hidden={mode !== m}>
            {mode === m && panel[m]()}
          </div>
        ))}
      </main>
    </div>
  )
}

// The seats as the lobby sees them (DRIFT §9), each taken one with a kick: the host's control
// over who is at the table, from the screen the host already has open.
function HostSeats({ client, sessionId, hostKey, ws, onNotice }: { client: ProjectClient; sessionId: string; hostKey: string; ws: string; onNotice(text: string | null): void }) {
  const { view } = useTableClient({ url: ws, sessionId, seat: null, lobby: true })
  if (!view) return null
  const taken = view.seats.filter((s) => s.name !== null)
  if (taken.length === 0) return null
  return (
    <span className="byd-editor-seats">
      {' '}· vid bordet:{' '}
      {taken.map((s) => (
        <span key={s.id} data-host-seat={s.id}>
          {s.name}{' '}
          <button type="button" onClick={() => void client.kick(sessionId, hostKey, s.id).catch((err: unknown) => onNotice(err instanceof Error ? err.message : String(err)))}>
            Sparka {s.name}
          </button>{' '}
        </span>
      ))}
    </span>
  )
}

