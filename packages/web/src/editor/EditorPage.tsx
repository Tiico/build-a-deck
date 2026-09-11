import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DeckWall } from './DeckWall.js'
import { EditorTabs, MODES, panelId, tabId, type Mode } from './EditorTabs.js'
import { EditorStages, isCanvasStage, modeOf, STAGES, type Stage } from './EditorStages.js'
import { useRoom } from '../room.js'
import { TemplateCanvas } from './TemplateCanvas.js'
import { DataTable } from './DataTable.js'
import { TableMenu, TablesTab } from './TablesTab.js'
import { SetupEditor } from './SetupEditor.js'
import { SymbolPanel } from './SymbolPanel.js'
import { HistoryPanel } from './HistoryPanel.js'
import { RulesPanel } from './RulesPanel.js'
import { SharePanel, colourOf } from './SharePanel.js'
import { tvUrl } from './tableLinks.js'
import { Question } from './Question.js'
import { useProjectClient } from './useProjectClient.js'
import type { ProjectDoc } from '@byd/server'
import { useTableClient } from '../table/useTableClient.js'
import type { ProjectClient, Textures } from './ProjectClient.js'
import { loginUrl } from '../account/api.js'
import { StatusNotice } from '../status/StatusNotice.js'
import { useSay } from '../status/StatusLive.js'
import { noticeFor } from '../status/notice.js'
import { chordOf, isTyping } from './keys.js'
import { statusLinks } from '../status/links.js'
import { usePageTitle } from '../status/DocumentTitle.js'
import { useT } from '../i18n/index.js'
import './editor.css'

// /editor?project=…&server=http://…
// The editor (L, prototype answer): the deck wall as home, the template canvas for the template,
// the table as a tab. One project, one preview path, and "Uppdatera bordet" starts a table.
export type EditorPageProps = { onNavigate?(url: string): void }

export function EditorPage({ onNavigate = (url) => location.assign(url) }: EditorPageProps = {}) {
  const t = useT()
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const projectId = params.get('project')
  const http = params.get('server') ?? location.origin
  const { client, fault, retry } = useProjectClient(http, projectId)
  // How much room there is (L10), and where the designer is standing. One state answers both:
  // the desk shows a mode, a smaller screen shows the stage that mode is made of.
  const room = useRoom()
  const stages = room === 'desk' ? null : STAGES[room]
  const [stage, setStage] = useState<Stage>('wall')
  // A room that does not offer the stage that was open — a phone has no canvas — puts the
  // designer on the deck wall rather than on a panel that is not there.
  const here: Stage = stages && !stages.some(([s]) => s === stage) ? 'wall' : stage
  const mode: Mode = modeOf(here)
  // Which of the template's four panels the canvas draws: all four on the desk, one at a time
  // below it.
  const canvasStage = room === 'desk' ? null : isCanvasStage(here) ? here : 'canvas'
  // Which face the canvas edits (#13, L7). The wall is the deck seen from the front.
  const [face, setFace] = useState('front')
  // Which group the canvas edits (#13), or nothing for the base every card inherits.
  const [group, setGroup] = useState<string | null>(null)
  const [row, setRow] = useState<string | null>(null)
  const [element, setElement] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // What could not happen, and what just did. Two states, because they are two different pieces
  // of news and one slot could only ever hold the later of them (#35).
  const [notice, setNotice] = useState<string | null>(null)
  const confirmation = useConfirmation()
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
  // The history (B4) opens from the revision, which is where the version is already named.
  const [historyOpen, setHistoryOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
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

  if (!projectId) return <StatusNotice notice={noticeFor('missing', 'editor', t)} surface="page" links={links} />
  if (fault === 'unauthorized') {
    // Not logged in (G1): to the login card and back here after.
    onNavigate(loginUrl(location.pathname + location.search, params.get('server')))
    return <p>{t('editor.loggingIn')}</p>
  }
  // A project that is missing, shut or out of reach says so in the editor's own words, with a
  // way back and — where waiting can help — a way to ask again (#12, UX-07).
  if (fault) return <StatusNotice notice={noticeFor(fault, 'editor', t)} surface="page" links={links} onRetry={retry} />
  if (!client) return <StatusNotice notice={noticeFor('loading', 'editor', t)} surface="page" links={links} />
  const doc = client.doc

  // The one guard, so the button's greyed-out look and the chord's answer are the same rule said
  // twice rather than two rules that can drift apart (#35). A document that is already the one
  // the server holds has nothing to save, and a save that is still travelling is not asked twice.
  const save = async (): Promise<boolean> => {
    if (!unsaved || saving) return true
    setSaving(true)
    const result = await client.save()
    setSaving(false)
    setNotice(result.ok ? null : result.reason === 'conflict' ? t('editor.conflict') : result.reason)
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
        assetBase={http}
        face="front"
        selectedRow={row}
        onSelectRow={setRow}
        onSelectElement={(id) => {
          setElement(id)
          // A phone has no canvas to open, so an element on the wall is only chosen there; every
          // wider screen goes on to the card it belongs to.
          if (room !== 'phone') setStage('canvas')
        }}
      />
    ),
    template: () => (
      <TemplateCanvas
        stage={canvasStage}
        doc={doc}
        assetBase={http}
        face={face}
        onSelectFace={setFace}
        row={row}
        selectedElement={element}
        onSelectElement={setElement}
        onPatch={(id, patch) => client.patchElement(face, id, patch, group)}
        onAdd={(el) => client.addElement(face, el, group)}
        // The symbol's bytes travel before anything is placed (E1), so this is the one tool in the
        // rail that can fail on the way. It says so where the editor says everything else.
        onPlaceIcon={(symbol) => void client.placeIcon(symbol, face, group, t).then(setElement, (err: unknown) => setNotice(err instanceof Error ? err.message : String(err)))}
        onReorder={(id, to) => client.moveElement(face, id, to)}
        onRemove={(id) => {
          client.removeElement(face, id, group)
          setElement(null)
        }}
        onAddField={(field, bindTo) => client.addField(field, { face, id: bindTo, group })}
        onFontFile={(file) => client.useFont(file, t)}
        onFontLicence={(family, licence) => client.setFontLicence(family, licence)}
        onRemoveFont={(family) => client.removeFont(family)}
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
        onUpload={(file) => client.uploadAsset(file, t)}
        onSymbol={(symbol) => client.useSymbol(symbol, undefined, t)}
        compareWith={compare ?? undefined}
        onStopCompare={() => setCompare(null)}
        selectedRow={row}
        onSelectRow={setRow}
        onCell={(cardRef, field, value) => client.setCell(cardRef, field, value)}
        onAddRow={(cardRef) => client.addRow(cardRef, { title: '', antal: 1 })}
        onRemoveRow={(cardRef) => client.removeRow(cardRef)}
        onReplaceRows={(rows) => client.replaceRows(rows)}
        onAddField={(field) => client.addField(field)}
        onRemoveField={(field) => client.removeField(field)}
      />
    ),
    symbols: () => <SymbolPanel doc={doc} client={client} assetBase={http} />,
    rules: () => <RulesPanel doc={doc} client={client} />,
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

  // Saving and reaching the table are the same two buttons wherever they stand: in the header on
  // a desk, pinned to the end of the stage strip below one. They are written once.
  const saveButton = (
    <button type="button" onClick={() => void save()} disabled={!unsaved || saving}>
      {t(saving ? 'editor.saving' : 'editor.save')}
    </button>
  )
  const updateButton = (
    <button type="button" className="byd-editor-primary byd-primary" onClick={() => void updateTable()}>
      {t('editor.updateTable')}
    </button>
  )

  return (
    <div className="byd-editor" data-page="editor" data-mode={mode} data-room={room}>
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
          {t('editor.home')}
        </a>
        <strong>{doc.name}</strong>
        {/* The revision is also the way into the history (B4): the version is already named here. */}
        <button type="button" className="byd-editor-rev" aria-expanded={historyOpen} onClick={() => setHistoryOpen((on) => !on)}>
          {t('editor.rev', { n: client.rev })}
        </button>
        {/* Whether the work is safe, in words and in colour (#8). It is a live region, so the
            change from saved to unsaved and back is spoken as it happens rather than found by
            someone going looking for a greyed-out button. */}
        <span className="byd-editor-saved" role="status" data-unsaved={unsaved}>
          {t(unsaved ? 'editor.unsaved' : 'editor.saved')}
        </span>
        {/* The modes are the header's on a desk; below one they are the stage strip at the
            bottom of the screen, and mounting both would put two of every tab in the document. */}
        {room === 'desk' && <EditorTabs mode={mode} onSelect={(m) => setStage(m === 'template' ? 'canvas' : m)} />}
        {/* The people in the header are the door to who has the game at all (D3): who is here
            now and who may be here is one question. */}
        <button type="button" className="byd-editor-here" data-here aria-label={t('share.title')} aria-expanded={shareOpen} onClick={() => setShareOpen((on) => !on)}>
          {client.here.map((p) => (
            <i key={p.id} title={p.name} style={{ ['--who' as string]: colourOf(p.name) }}>
              {p.name.slice(0, 1).toUpperCase()}
            </i>
          ))}
          {client.here.length > 1 && <b>{t('editor.here.count', { n: client.here.length })}</b>}
        </button>
        <span className="byd-editor-spacer" />
        {/* A save that could not happen is not a passing remark: it is spoken at once, because
            the work it was about is still only in this tab. It stands until it stops being true,
            and nothing routine may push it out of the way. */}
        {notice && <span role="alert" className="byd-editor-notice">{notice}</span>}
        {/* What just happened, in the channel routine news belongs in. It is read out politely by
            `useConfirmation` and stands here only while it is still what just happened. */}
        {confirmation.text && <span className="byd-editor-confirm">{confirmation.text}</span>}
        <EditorChords client={client} onSave={() => void save()} onConfirm={confirmation.confirm} />
        {/* "Nytt bord" and the shortcut beside "Uppdatera bordet" are two ways to the tables that
            the Bord stage also holds, so below the desk they leave the header rather than being
            squeezed into it: nothing they reach becomes unreachable. */}
        {room === 'desk' && (
          <>
            {saveButton}
            {table && (
              <button type="button" onClick={() => void startTable()}>
                {t('editor.newTable')}
              </button>
            )}
            {updateButton}
            <TableMenu client={client} server={params.get('server')} onShowTables={() => setStage('tables')} />
          </>
        )}
      </header>
      {/* Said out loud, because a tool that is quietly missing reads as a tool that is broken: on
          a phone the editor is a reading and writing surface, and laying a card out waits for a
          wider screen (L10). */}
      {room === 'phone' && (
        <p className="byd-editor-narrow">{t('editor.narrow')}</p>
      )}
      {leaving && (
        <Question
          className="byd-editor-leave"
          label={t('editor.leave.title')}
          keep={{ label: t(saving ? 'editor.saving' : 'editor.leave.save'), disabled: saving, onChoose: () => void saveAndLeave() }}
          confirm={t('editor.leave.discard')}
          onConfirm={() => {
            setLeaving(false)
            goHome()
          }}
          onCancel={stay}
        >
          {/* The game's own name goes into the sentence rather than beside it: what a designer
              named her game is hers and is never translated (A4, B5). */}
          {t('editor.leave.body', { game: doc.name })}
        </Question>
      )}
      {table && (
        <div className="byd-editor-table-link" role="status" {...(lost !== null ? { 'data-lost': '' } : {})}>
          {t(table.kind === 'new' ? 'editor.table.started' : 'editor.table.refreshed', { version: table.version })}{' '}
          {lost !== null ? (
            <>
              <span className="byd-editor-warning">{t('editor.table.lost', { n: lost })}</span>{' '}
              <button type="button" onClick={() => void updateTable(true)}>
                {t('editor.table.retry')}
              </button>
            </>
          ) : preparing ? (
            <span className="byd-editor-rendering">{t('editor.table.rendering', { done: preparing.done, total: preparing.total })}</span>
          ) : textures && textures.done + textures.failed.length >= textures.total ? (
            <a href={tvUrl(table.id, params.get('server'), table.hostKey)} target="_blank" rel="noreferrer">
              {t('editor.table.open')}
            </a>
          ) : (
            <span className="byd-editor-rendering">{t('editor.table.rendering', { done: textures?.done ?? 0, total: textures?.total ?? '…' })}</span>
          )}
          {textures && textures.failed.length > 0 && <span className="byd-editor-warning"> · {t('editor.table.failed', { n: textures.failed.length })}</span>}
          <span className="byd-editor-room">
            {' '}· {t('editor.table.roomCode')} <strong data-room-code>{table.code}</strong>{' '}
            <button type="button" onClick={() => void rotate()}>{t('editor.table.newCode')}</button>
          </span>
          <HostSeats client={client} sessionId={table.id} hostKey={table.hostKey} ws={wsUrl} onNotice={setNotice} />
        </div>
      )}
      {client.lineDown && (
        <p className="byd-editor-offline" role="status" data-offline>
          {t('editor.offline')}
        </p>
      )}
      {!client.mayEdit && (
        <p className="byd-editor-readonly" role="status" data-role-note>
          {t(client.role === 'tester' ? 'editor.role.tester' : 'editor.role.viewer')}
        </p>
      )}
      {shareOpen && projectId && <SharePanel http={http} project={projectId} here={client.here} onClose={() => setShareOpen(false)} />}
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
              setStage('table')
            })
          }}
        />
      )}
      <main>
        {(stages ?? MODES).map(([key]) => (
          // One panel per tab, so every tab's `aria-controls` names a panel that exists; only the
          // open one carries content, so switching mode still mounts a single canvas.
          <div key={key} id={panelId(key)} role="tabpanel" aria-labelledby={tabId(key)} tabIndex={0} hidden={(stages ? here : mode) !== key}>
            {(stages ? here === key : mode === key) && panel[modeOf(key as Stage)]()}
          </div>
        ))}
      </main>
      {stages && (
        <EditorStages stages={stages} stage={here} onSelect={setStage}>
          {saveButton}
          {updateButton}
        </EditorStages>
      )}
    </div>
  )
}

// How long a confirmation stands before it takes itself back. Long enough to be read after the
// eye has already gone back to the deck, short enough never to be the answer to something that
// happened a minute ago.
const CONFIRM_MS = 6000

// What just happened, said the way routine news is said (#35). A step back is not a fault: it is
// spoken politely, through the app's own channel rather than a region this route made for itself,
// and it takes itself back instead of standing in the header for the rest of the session. The
// amber slot beside it is left to what could not happen, which is the only thing worth cutting a
// reader off for and the only thing worth leaving on the screen until it stops being true.
function useConfirmation(): { text: string | null; confirm(text: string): void } {
  const say = useSay()
  const [text, setText] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  const confirm = (next: string) => {
    setText(next)
    say?.('polite', next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      setText(null)
      say?.('polite', '')
    }, CONFIRM_MS)
  }
  return { text, confirm }
}

// The way back to "Mina spel", keeping the server the editor was opened against.
// The chords the whole editor answers (#35), wherever the focus is. Its own component, so the
// listener is hung once the editor has a project to act on rather than by a hook that would have
// to run before there is one. The callbacks are read through a ref so the editor's every keystroke
// does not swap the listener out.
function EditorChords({ client, onSave, onConfirm }: { client: ProjectClient; onSave(): void; onConfirm(text: string): void }) {
  const t = useT()
  const latest = useRef({ client, onSave, onConfirm, t })
  latest.current = { client, onSave, onConfirm, t }
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      const chord = chordOf(event)
      if (!chord) return
      // Saving is the editor's wherever it is pressed; a step back belongs to the field first.
      if (chord !== 'save' && isTyping(event.target)) return
      event.preventDefault()
      const now = latest.current
      if (chord === 'save') return now.onSave()
      const what = chord === 'undo' ? now.client.undo() : now.client.redo()
      // Nothing behind, or nothing ahead: the editor says nothing rather than claiming it undid.
      if (what) now.onConfirm(now.t(chord === 'undo' ? 'undo.took' : 'undo.redid', { what: now.t(what) }))
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])
  return null
}

function homeUrl(server: string | null): string {
  return server ? `/?${new URLSearchParams({ server }).toString()}` : '/'
}

// The seats as the lobby sees them (DRIFT §9), each taken one with a kick: the host's control
// over who is at the table, from the screen the host already has open.
function HostSeats({ client, sessionId, hostKey, ws, onNotice }: { client: ProjectClient; sessionId: string; hostKey: string; ws: string; onNotice(text: string | null): void }) {
  const t = useT()
  const { view } = useTableClient({ url: ws, sessionId, seat: null, lobby: true })
  if (!view) return null
  const taken = view.seats.filter((s) => s.name !== null)
  if (taken.length === 0) return null
  return (
    <span className="byd-editor-seats">
      {' '}· {t('editor.seats.at')}{' '}
      {taken.map((s) => (
        <span key={s.id} data-host-seat={s.id}>
          {s.name}{' '}
          <button type="button" onClick={() => void client.kick(sessionId, hostKey, s.id).catch((err: unknown) => onNotice(err instanceof Error ? err.message : String(err)))}>
            {t('editor.seats.kick', { name: s.name ?? '' })}
          </button>{' '}
        </span>
      ))}
    </span>
  )
}
