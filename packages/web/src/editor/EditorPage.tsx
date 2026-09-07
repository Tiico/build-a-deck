import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DeckWall } from './DeckWall.js'
import { EditorTabs, MODES, panelId, tabId, type Mode } from './EditorTabs.js'
import { TemplateCanvas } from './TemplateCanvas.js'
import { DataTable } from './DataTable.js'
import { TableMenu, TablesTab } from './TablesTab.js'
import { tvUrl } from './tableLinks.js'
import { Question } from './Question.js'
import { useProjectClient } from './useProjectClient.js'
import type { Textures } from './ProjectClient.js'
import { loginUrl } from '../account/api.js'
import { StatusNotice } from '../status/StatusNotice.js'
import { noticeFor } from '../status/notice.js'
import { statusLinks } from '../status/links.js'
import { usePageTitle } from '../status/DocumentTitle.js'
import './editor.css'

// /editor?project=…&server=http://…
// The editor (L, prototype answer): the deck wall as home, the template canvas for the template,
// the table as a tab. One project, one preview path, and "Uppdatera bordet" starts a table.
export type EditorPageProps = { onNavigate?(url: string): void }

export function EditorPage({ onNavigate = (url) => location.assign(url) }: EditorPageProps = {}) {
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const projectId = params.get('project')
  const http = params.get('server') ?? location.origin
  const { client, fault, retry } = useProjectClient(http, projectId)
  const [mode, setMode] = useState<Mode>('wall')
  // Which face the canvas edits (#13, L7). The wall is the deck seen from the front.
  const [face, setFace] = useState('front')
  // Which group the canvas edits (#13), or nothing for the base every card inherits.
  const [group, setGroup] = useState<string | null>(null)
  const [row, setRow] = useState<string | null>(null)
  const [element, setElement] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  // The question asked before the editor is left with work that is not saved (#8), and the way
  // back to the link that asked it: a question that takes the focus has to give it back.
  const [leaving, setLeaving] = useState(false)
  const [refocusLeave, setRefocusLeave] = useState(false)
  const leaveRef = useRef<HTMLAnchorElement>(null)
  // Set the moment the designer has answered the question herself. Every way out of the editor is
  // a page load, so without this the browser would ask her the same thing a second time.
  const answered = useRef(false)
  const links = statusLinks({ server: params.get('server') })
  // The tab says which game is open, and what is wrong with it while something is (#12).
  usePageTitle({ state: projectId ? (fault === 'unauthorized' ? null : fault ?? (client ? null : 'loading')) : 'missing', game: client?.doc.name ?? null })
  const [table, setTable] = useState<{ id: string; version: string; kind: 'new' | 'refreshed' } | null>(null)
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

  // Whether the project differs from the one the server holds (#8, L9). Everything the editor
  // does about unsaved work hangs off this one fact, and it is a comparison and not a memory of
  // something having been typed.
  const unsaved = client?.dirty === true
  useEffect(() => {
    if (!refocusLeave) return
    leaveRef.current?.focus()
    setRefocusLeave(false)
  }, [refocusLeave])
  // Closing or reloading the tab is the one way out the page cannot ask its own question about:
  // the browser asks it instead, and only when there is something to lose. The listener is there
  // exactly while the project differs from the saved one, so a deck nobody has changed closes
  // without a word.
  useEffect(() => {
    if (!unsaved) return
    const hold = (event: BeforeUnloadEvent) => {
      if (answered.current) return
      event.preventDefault()
      // Older browsers read the answer off the event instead of the cancellation.
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', hold)
    return () => window.removeEventListener('beforeunload', hold)
  }, [unsaved])

  if (!projectId) return <StatusNotice notice={noticeFor('missing', 'editor')} surface="page" links={links} />
  if (fault === 'unauthorized') {
    // Not logged in (G1): to the login card and back here after.
    onNavigate(loginUrl(location.pathname + location.search, params.get('server')))
    return <p>Loggar in…</p>
  }
  // A project that is missing, shut or out of reach says so in the editor's own words, with a
  // way back and — where waiting can help — a way to ask again (#12, UX-07).
  if (fault) return <StatusNotice notice={noticeFor(fault, 'editor')} surface="page" links={links} onRetry={retry} />
  if (!client) return <StatusNotice notice={noticeFor('loading', 'editor')} surface="page" links={links} />
  const doc = client.doc

  const save = async (): Promise<boolean> => {
    setSaving(true)
    const result = await client.save()
    setSaving(false)
    setNotice(result.ok ? null : result.reason === 'conflict' ? 'Någon annan har sparat sedan du laddade. Ladda om och gör om ändringen.' : result.reason)
    return result.ok
  }
  // Out of the editor and back to the games. Work that differs from the saved project is asked
  // about first (#8); a project as it was loaded is simply left.
  const home = homeUrl(params.get('server'))
  const goHome = () => {
    answered.current = true
    onNavigate(home)
  }
  const leave = () => (unsaved ? setLeaving(true) : goHome())
  const stay = () => {
    setLeaving(false)
    setRefocusLeave(true)
  }
  // "Spara och lämna" only leaves once the work is actually on the server: a save that collides
  // with someone else keeps the designer here, with the edit and the reason in
  // front of her.
  const saveAndLeave = async () => {
    if (!(await save())) return stay()
    setLeaving(false)
    goHome()
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
        selectedRow={row}
        onSelectRow={setRow}
        onCell={(cardRef, field, value) => client.setCell(cardRef, field, value)}
        onAddRow={(cardRef) => client.addRow(cardRef, { title: '', antal: 1 })}
        onRemoveRow={(cardRef) => client.removeRow(cardRef)}
        onReplaceRows={(rows) => client.replaceRows(rows)}
      />
    ),
    tables: () => <TablesTab client={client} server={params.get('server')} />,
  }

  return (
    <div className="byd-editor" data-page="editor" data-mode={mode}>
      <header>
        <a
          ref={leaveRef}
          className="byd-editor-home"
          href={home}
          onClick={(event) => {
            event.preventDefault()
            leave()
          }}
        >
          Mina spel
        </a>
        <strong>{doc.name}</strong>
        <span className="byd-editor-rev">rev {client.rev}</span>
        {/* Whether the work is safe, in words and in colour (#8). It is a live region, so the
            change from saved to unsaved and back is spoken as it happens rather than found by
            someone going looking for a greyed-out button. */}
        <span className="byd-editor-saved" role="status" data-unsaved={unsaved}>
          {unsaved ? 'Osparade ändringar' : 'Sparat'}
        </span>
        <EditorTabs mode={mode} onSelect={setMode} />
        <span className="byd-editor-spacer" />
        {/* A save that could not happen is not a passing remark: it is spoken at once, because
            the work it was about is still only in this tab. */}
        {notice && <span role="alert" className="byd-editor-notice">{notice}</span>}
        <button type="button" onClick={() => void save()} disabled={!unsaved || saving}>
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
      {leaving && (
        <Question
          className="byd-editor-leave"
          label="Osparade ändringar"
          keep={{ label: saving ? 'Sparar…' : 'Spara och lämna', disabled: saving, onChoose: () => void saveAndLeave() }}
          confirm="Lämna utan att spara"
          onConfirm={() => {
            setLeaving(false)
            goHome()
          }}
          onCancel={stay}
        >
          Osparade ändringar i {doc.name}. Vad vill du göra innan du lämnar editorn?
        </Question>
      )}
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
            <a href={tvUrl(table.id, params.get('server'))} target="_blank" rel="noreferrer">
              öppna bordet
            </a>
          ) : (
            <span className="byd-editor-rendering">renderar kort {textures?.done ?? 0}/{textures?.total ?? '…'}</span>
          )}
          {textures && textures.failed.length > 0 && <span className="byd-editor-warning"> · {textures.failed.length} kort kunde inte renderas</span>}
        </div>
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

// The way back to "Mina spel", keeping the server the editor was opened against.
function homeUrl(server: string | null): string {
  return server ? `/?${new URLSearchParams({ server }).toString()}` : '/'
}
