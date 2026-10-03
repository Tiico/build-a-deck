import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { nextCardRef } from './fields.js'
import { DeckWall, type WallView } from './DeckWall.js'
import { EditorTabs, MODES, panelId, tabId, type Mode } from './EditorTabs.js'
import { EditorStages, isCanvasStage, modeOf, STAGES, type Stage } from './EditorStages.js'
import { PHONE_READING, SCREENS, minPtIn } from '../legibility.js'
import { noFilter } from './filtering.js'
import { useHeaderStands, useRoom } from '../room.js'
import { useDoor } from '../doors.js'
import { TemplateCanvas } from './TemplateCanvas.js'
import { DataTable } from './DataTable.js'
import { TableMenu, TablesTab } from './TablesTab.js'
import { SetupEditor } from './SetupEditor.js'
import { revealThemeSection, ThemePanel } from './ThemePanel.js'
import { MediaPanel } from './MediaPanel.js'
import { MarkedProvider } from './marked.js'
import { HistoryPanel } from './HistoryPanel.js'
import { GameMore } from './GameMore.js'
import { RulesPanel } from './RulesPanel.js'
import { SharePanel, colourOf } from './SharePanel.js'
import { tvUrl } from './tableLinks.js'
import { Question } from './Question.js'
import { useProjectClient } from './useProjectClient.js'
import type { ProjectDoc } from '@byd/server'
import { useTableClient } from '../table/useTableClient.js'
import { TableEnded, type ProjectClient, type Textures } from './ProjectClient.js'
import { loginUrl } from '../account/api.js'
import { StatusNotice } from '../status/StatusNotice.js'
import { useSay } from '../status/StatusLive.js'
import { noticeFor, refusalText, loggedOutNotice, asOf } from '../status/notice.js'
import { chordOf, isTyping, passedToEditor } from './keys.js'
import { mediaInGame } from './assets.js'
import { previewMotifs } from './motifs.js'
import type { Motif } from '@byd/template'
import { statusLinks } from '../status/links.js'
import { DEFAULT_TIMING } from '../status/connection.js'
import { usePageTitle } from '../status/DocumentTitle.js'
import { useLang, useT, type T } from '../i18n/index.js'
import { HookGlyph } from '../glyphs.js'
import type { CatalogFamily } from './font-catalog.js'
import './editor.css'

const PlaytestPrototype = import.meta.env.DEV ? lazy(() => import('./prototype/PlaytestWorkspace.js')) : null

// How long the render count may stand still before the line says so (#88, UX-43). A texture is a
// page in Chromium and takes seconds, not minutes, so thirty seconds without a single card landing
// is a queue that is not moving — a worker that is down, or none at all — and not a slow one.
// The count itself is what is watched, not the polling: a poll that answers the same number is
// no progress.
export const RENDER_STALLED_AFTER_MS = 30_000
export type EditorTiming = { renderStalledAfterMs: number; dropAfterMs: number }
export const DEFAULT_EDITOR_TIMING: EditorTiming = { renderStalledAfterMs: RENDER_STALLED_AFTER_MS, dropAfterMs: DEFAULT_TIMING.dropAfterMs }
// A count under watch: which table's, where it stands, and how many times the designer has asked
// for it to move. A stall is that same triple seen again when the patience ran out.
type Watched = { table: string; done: number; asked: number }

// /editor?project=…&server=http://…
// The editor (L, prototype answer): the deck wall as home, the template canvas for the template,
// the table as a tab. One project, one preview path, and the header's filled action puts the work
// on a table: "Starta bord" while the game has none, "Uppdatera bordet" once it has one (#417).
export type EditorPageProps = { onNavigate?(url: string): void; timing?: EditorTiming }

export function EditorPage({ onNavigate = (url) => location.assign(url), timing = DEFAULT_EDITOR_TIMING }: EditorPageProps = {}) {
  const t = useT()
  // Before every early return below: a hook after them is called only once the project has come.
  const { lang } = useLang()
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const projectId = params.get('project')
  const http = params.get('server') ?? location.origin
  const { client, fault, retry } = useProjectClient(http, projectId, timing.dropAfterMs)
  // How much room there is (L10), and where the designer is standing. One state answers both:
  // the desk shows a mode, a smaller screen shows the stage that mode is made of.
  const room = useRoom()
  const stages = room === 'desk' ? null : STAGES[room]
  // Below the desk «Spara» and «Uppdatera bordet» stand in the header while the header stands, as
  // they do at the desk, and the strip is the stages' own (#567, beslut B): at 820 px the two had
  // hidden Media, Regler and Bord behind them. In a low window the header scrolls away (#550), so
  // there they stay at the end of the strip, the one thing that does not.
  const headerStands = useHeaderStands()
  const actionsInHeader = room === 'desk' || headerStands
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
  // Where the keyboard goes once a press has taken away what it was standing on (#477): the
  // comparison a version was compared from, or the element that was chosen on a card on the wall.
  // Moved after the render that draws it, because it is not there until then.
  const [focusNext, setFocusNext] = useState<{ compare: true } | { layer: string } | null>(null)
  useEffect(() => {
    if (!focusNext) return
    setFocusNext(null)
    const target =
      'compare' in focusNext
        ? document.querySelector<HTMLElement>('.byd-data-compare button')
        : (document.querySelector<HTMLElement>(`[data-layer="${CSS.escape(focusNext.layer)}"] .byd-layer-pick`) ?? document.getElementById(panelId('template')))
    target?.focus()
  }, [focusNext])
  // Set the moment the designer has answered the question herself. Every way out of the editor is
  // a page load, so without this the browser would ask her the same thing a second time.
  const answered = useRef(false)
  const links = statusLinks({ server: params.get('server') })
  // The tab says which game is open, and what is wrong with it while something is (#12).
  // Which tab is open is part of where the designer is (#477), so the browser's tab says it too.
  const part = MODES.find(([m]) => m === mode)?.[1]
  usePageTitle({ state: projectId ? (fault === 'unauthorized' ? null : fault === 'loggedOut' ? 'forbidden' : fault ?? (client ? null : 'loading')) : 'missing', game: client?.doc.name ?? null, part: part ? t(part) : null })
  // What the header has standing over the work: the history (B4), which opens from the revision
  // where the version is already named, or who has the game (D3), which opens from the faces. One
  // state rather than two, because two panels over each other cover the work and each other — on
  // the template tab the history lands over the layer list and the group strip — so opening one
  // closes the other.
  const [over, setOver] = useState<'history' | 'share' | null>(null)
  // Where the wall was left (#477), for as long as the project is open. A ref and not state: the
  // wall reads it when it is drawn again, and nothing else is drawn from it.
  const wallView = useRef<WallView | undefined>(undefined)
  // The wall is mounted afresh when something outside it chooses its eye (#523): it reads its view
  // once, where it was left.
  const [wallMount, setWallMount] = useState(0)
  // An address half written in the share panel outlives the panel (#477).
  const [shareDraft, setShareDraft] = useState('')
  const historyOpen = over === 'history'
  const shareOpen = over === 'share'
  const revRef = useRef<HTMLButtonElement>(null)
  const hereRef = useRef<HTMLButtonElement>(null)
  // «Ny kod», where the focus goes when the last seat it stood beside is kicked (#621).
  const newCodeRef = useRef<HTMLButtonElement>(null)
  // An older version the table is held against (B4), fetched once when the comparison starts.
  const [compare, setCompare] = useState<{ rev: number; label?: string | undefined; doc: ProjectDoc } | null>(null)
  // A running table (L5) with what admits people to it (DRIFT §9): the code and the host key.
  // A table picked up after a reload (`running`) has no key in the page; the account is the
  // authority for it instead.
  const [table, setTable] = useState<{ id: string; version: string; code: string; hostKey?: string; kind: 'new' | 'refreshed' | 'running' } | null>(null)
  // The table outlives the page (#477). Without this a reload put «Starta bord» back in the header
  // while the table was still running, and the press that followed started a second table with a
  // new code — the guests at the first never saw the update. The newest table that still runs and
  // that this account may run is the one the header works on; the server shows its code to no one
  // else, so a role that cannot start tables picks nothing up.
  useEffect(() => {
    if (!client) return
    let live = true
    client.tables().then(
      (tables) => {
        const running = tables.find((t) => !t.ended && t.code !== undefined)
        const code = running?.code
        if (live && running && code) setTable((had) => had ?? { id: running.id, version: running.version, code, kind: 'running' })
      },
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [client])
  // The table's textures (L5): the link opens only when every card can be seen. Polled with a
  // growing pause while anything is still rendering.
  const [textures, setTextures] = useState<Textures | null>(null)
  const [preparing, setPreparing] = useState<Textures | null>(null)
  // Whether an update is under way (#315). The render farm queues, so the first thing the button
  // does can be seconds away from the first thing the table does — and a control that says
  // nothing in between is read as a control that is broken, which is how the same press comes to
  // be made twice. So the press is answered before the table is: the button says what it is
  // doing and takes nothing more, the way "Spara" has since #8.
  const [updating, setUpdating] = useState(false)
  // How many cards of the pending revision are lost for good. While this is set the table keeps
  // the version it has: a card without a face on the table is worse than a table left alone.
  const [lost, setLost] = useState<number | null>(null)
  // What the line counts: the update's own poll while one runs, otherwise the table's textures.
  const progress = preparing ?? textures
  const rendering = progress !== null && progress.done + progress.failed.length < progress.total
  // The count has not moved for as long as the timing allows (#88). What is remembered is the
  // count the stall was seen at, so a count that moves on takes the message with it in the same
  // render; another table and the designer asking again start the wait over too.
  const [asked, setAsked] = useState(0)
  const watching: Watched | null = rendering && table ? { table: table.id, done: progress.done, asked } : null
  const [stalledAt, setStalledAt] = useState<Watched | null>(null)
  const stalled = watching !== null && stalledAt !== null && stalledAt.table === watching.table && stalledAt.done === watching.done && stalledAt.asked === watching.asked
  useEffect(() => {
    if (!watching) return
    const seen = watching
    const timer = setTimeout(() => setStalledAt(seen), timing.renderStalledAfterMs)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the watched record is new every render; its three values are what is watched
  }, [watching?.table, watching?.done, watching?.asked, timing.renderStalledAfterMs])
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- another table or version starts the poll over; the kind is read as it stands
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

  // What is drawn inside each of the deck's pictures (E1). A picture is measured once, by the
  // hash of its bytes, and the answer is kept — so the wall can redraw forty cards without
  // measuring forty files again, and so a picture on ten cards is one measurement. A picture
  // nothing could measure counts as asked about too: its card is drawn by its file, as every
  // card was before there was anything to measure, and nothing keeps asking about it.
  const [motifs, setMotifs] = useState<Record<string, Motif>>({})
  const measured = useRef(new Set<string>())
  // Every picture the game holds and not only those in use (#222): the library is there for the
  // ones no card is drawn from yet, and an unmeasured picture is cropped against a box of the
  // commonest shape instead of its own — with the card beside the window drawn uncropped while
  // the window is dragged.
  const pictures = client ? mediaInGame(client.doc).map((a) => a.hash).join(',') : ''
  useEffect(() => {
    if (!client) return
    const missing = pictures.split(',').filter((hash) => hash.length > 0 && !measured.current.has(hash))
    if (missing.length === 0) return
    for (const hash of missing) measured.current.add(hash)
    let live = true
    void client.motifs(missing)
      .then((found) => {
        if (live) setMotifs((had) => ({ ...had, ...found }))
      })
      // A measurement that will not come is the condition every picture was in before there was
      // anything to measure: the card is drawn by its file. Asking is therefore allowed to fail —
      // a dropped network, or a server that has gone away while the answer was on its way — and
      // it must fail quietly, because an unhandled rejection is not a way to say "drawn as a
      // file". The hash stays in `measured`, so a failure is not asked again on every render.
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [pictures, client])
  // Keyed by the URL the resolved rows carry, once per set of measurements: a fresh object every
  // render is a fresh compile of the whole wall, exactly as it is for the icons and the fonts.
  // The deck's pictures as every surface draws them (E1, #222): what was measured off the file,
  // with the window the designer cut already on it.
  const cropped = client?.doc.pictures
  const deckMotifs = useMemo(() => previewMotifs(motifs, http, cropped), [motifs, http, cropped])

  const line = useLineState(client?.lineDown ?? false)
  // What the reading band has just answered a shortcut with; gone after a moment (#489).
  const [readingSaid, setReadingSaid] = useState<string | null>(null)
  useEffect(() => {
    if (readingSaid === null) return
    const timer = setTimeout(() => setReadingSaid(null), 3000)
    return () => clearTimeout(timer)
  }, [readingSaid])
  const sayReading = (text: string) => setReadingSaid(text)
  if (!projectId) return <StatusNotice notice={noticeFor('missing', 'editor', t)} surface="page" links={links} />
  if (fault === 'unauthorized') {
    // Not logged in (G1): to the login card and back here after.
    onNavigate(loginUrl(location.pathname + location.search, params.get('server')))
    return <p>{t('editor.loggingIn')}</p>
  }
  // A project that is missing, shut or out of reach says so in the editor's own words, with a
  // way back and — where waiting can help — a way to ask again (#12, UX-07).
  if (fault && fault !== 'loggedOut' && !client) return <StatusNotice notice={noticeFor(fault, 'editor', t)} surface="page" links={links} onRetry={retry} />
  if (!client) return <StatusNotice notice={noticeFor('loading', 'editor', t)} surface="page" links={links} />
  const doc = client.doc
  if (PlaytestPrototype && params.has('variant')) return <Suspense fallback={<p>Laddar prototyp…</p>}><PlaytestPrototype doc={doc} revision={client.rev} http={http} /></Suspense>

  // The one guard, so the button's greyed-out look and the chord's answer are the same rule said
  // twice rather than two rules that can drift apart (#35). A document that is already the one
  // the server holds has nothing to save, and a save that is still travelling is not asked twice.
  const save = async (): Promise<boolean> => {
    if (!unsaved || saving) return true
    setSaving(true)
    const result = await client.save()
    setSaving(false)
    // Never the server's own words (#485): a reason is translated, or said as the one it is not.
    setNotice(result.ok ? null : result.reason === 'conflict' ? t('editor.conflict') : refusalText(result.reason, t))
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
    } catch {
      setNotice(t('editor.table.error.start'))
    }
  }
  // The header's table was ended — from the Bord tab, from the TV, or from another tab (#705). Its
  // band was about a table that no longer runs: the kicks pointed at seats that were gone, and
  // «Uppdatera bordet» could only be refused. So the band goes, the primary button starts a table
  // again, and what happened is said once, in the channel routine news belongs in.
  const tableEnded = () => {
    setTable(null)
    setLost(null)
    setTextures(null)
    confirmation.confirm(t('editor.table.ended'))
  }
  // Once a table exists, the primary button pushes the current rev to it (C7, L5) — but only
  // after the new textures are rendered, so the switch is atomic for the players: prepare,
  // poll with a growing pause, then refresh.
  const updateTable = async (retryLost = false) => {
    // The disabled button is what a pointer and a keyboard meet; this is what everything else
    // meets, so a second update can never start on top of the one that is running.
    if (updating) return
    setUpdating(true)
    try {
      if (!table) return await startTable()
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
      // What the server says in its own words is the developer's; the header says it in the
      // designer's language, in a whole sentence (#705, A4).
      if (err instanceof TableEnded) tableEnded()
      else setNotice(t('editor.table.error.update'))
    } finally {
      setPreparing(null)
      setUpdating(false)
    }
  }
  // "Försök igen" on a rendering that stands still (#88): one more `prepare` with the retry, which
  // is what puts a dead render back in the queue (#10). The polling that is already running
  // carries the count on from there; nothing else is restarted.
  const retryRender = async () => {
    if (!table) return
    setAsked((n) => n + 1)
    try {
      await client.prepareTable(table.id, true)
    } catch {
      setNotice(t('editor.table.error.render'))
    }
  }
  // The cards a phone cannot read once they are rendered (#523, beslut C), said after the table is
  // up and never before it: what the renderer fitted each front to, against the smallest text the
  // phone's reading view carries at 320 px (K26). A remark in E5's form, which stops nothing.
  const settled = preparing ?? textures
  const phone = PHONE_READING
  const unreadable = settled && settled.done + settled.failed.length >= settled.total ? Object.values(settled.smallest ?? {}).filter((pt) => pt < minPtIn(phone)).length : 0
  const showOnWall = () => {
    wallView.current = { filter: wallView.current?.filter ?? noFilter, scrollTop: 0, eye: `read.${phone.key}` }
    setWallMount((n) => n + 1)
    setStage('wall')
  }
  const panel: Record<Mode, () => ReactNode> = {
    wall: () => (
      <DeckWall
        key={wallMount}
        doc={doc}
        assetBase={http}
        motifs={deckMotifs}
        face="front"
        selectedRow={row}
        onSelectRow={setRow}
        view={wallView.current}
        readOnly={!client.mayEdit}
        onView={(v) => (wallView.current = v)}
        onSelectElement={(id) => {
          setElement(id)
          // A phone has no canvas to open, so an element on the wall is only chosen there; every
          // wider screen goes on to the card it belongs to, and the keyboard with it.
          if (room !== 'phone') {
            setStage('canvas')
            setFocusNext({ layer: id })
          }
        }}
        // One check mended across the whole deck (#233). Every patch carries the same gesture, so
        // the edits land as one version and one step back: a designer who presses this once and
        // changes her mind presses undo once.
        onFixChecks={(fixes) => {
          const gesture = `fix-check-${Date.now()}`
          for (const fix of fixes) client?.patchElement(fix.face, fix.element, fix.patch, undefined, gesture)
        }}
        // The empty game's two doors (#476): the first card is made here and chosen, and the front
        // is drawn in Mall.
        {...(client.mayEdit
          ? {
              onAddCard: () => {
                const cardRef = nextCardRef(doc)
                client.addRow(cardRef, { title: '', antal: 1 })
                setRow(cardRef)
              },
            }
          : {})}
        onOpenTemplate={() => setStage('canvas')}
      />
    ),
    template: () => (
      <TemplateCanvas
        stage={canvasStage}
        reading={!client.mayEdit}
        doc={doc}
        assetBase={http}
        motifs={deckMotifs}
        face={face}
        onSelectFace={setFace}
        onReplaceFace={(base) => client.replaceFace(face, base)}
        row={row}
        onPickRow={setRow}
        selectedElement={element}
        onSelectElement={setElement}
        onPatch={(id, patch, gesture) => client.patchElement(face, id, patch, group, gesture)}
        onCallOff={(gesture) => client.callOff(gesture)}
        onAdd={(el) => client.addElement(face, el, group)}
        // The symbol's bytes travel before anything is placed (E1), so this is the one tool in the
        // rail that can fail on the way. It says so where the editor says everything else.
        onPlaceIcon={(symbol) => void client.placeIcon(symbol, face, group, t).then(setElement, (err: unknown) => setNotice(err instanceof Error ? err.message : String(err)))}
        onReorder={(id, to) => client.moveElement(face, id, to)}
        // Locking a layer and naming it are edits to the element (L15), so they go the way every
        // other change to an element goes — through the base, which is where the layer lives even
        // when a group is open, exactly as the order does.
        onLock={(id, locked) => client.patchElement(face, id, { locked: locked ? true : undefined })}
        onRename={(id, name) => client.patchElement(face, id, { name: name ?? undefined })}
        onRemove={(id) => {
          client.removeElement(face, id, group)
          setElement(null)
        }}
        onAddField={(field, bindTo) => client.addField(field, { face, id: bindTo, group })}
        // The game's typefaces moved to Speltema (L57); the panel says so and takes the hand there,
        // with the section that holds them open.
        onOpenFonts={() => {
          revealThemeSection('fonts')
          setStage('theme')
        }}
        // A text layer's «Fler typsnitt…» (#634): the family comes into the game the way Speltema
        // brings it, and the canvas sets the layer in whatever it came to be called.
        {...(client.mayEdit ? { onCatalogFont: (family: CatalogFamily) => client.useCatalogFont(family, t) } : {})}
        // The template's own picture is uploaded by the path Media takes (#320), so it lands there.
        onAddPicture={(file) => client.addPicture(file, t)}
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
        reading={!client.mayEdit}
        project={projectId ?? undefined}
        assetBase={http}
        onUpload={(file) => client.uploadAsset(file, 'image', t)}
        onSymbol={(symbol) => client.useSymbol(symbol, undefined, t)}
        compareWith={compare ?? undefined}
        onStopCompare={() => setCompare(null)}
        selectedRow={row}
        onSelectRow={setRow}
        onCell={(cardRef, field, value, gesture) => client.setCell(cardRef, field, value, gesture)}
        onAddRow={(cardRef) => client.addRow(cardRef, { title: '', antal: 1 })}
        onRemoveRow={(cardRef) => client.removeRow(cardRef)}
        onReplaceRows={(rows) => client.replaceRows(rows)}
        onAddField={(field) => client.addField(field)}
        onRemoveField={(field) => client.removeField(field)}
        onMoveField={(field, before) => client.moveField(field, before)}
        onRenameField={(from, to) => client.renameField(from, to)}
        onProse={(field, prose) => client.setProse(field, prose)}
      />
    ),
    theme: () => <ThemePanel doc={doc} client={client} assetBase={http} />,
    // The pictures the deck is drawn from, in one place (#222). The table's own image strip is
    // what is in use; this is what the game has.
    media: () => <MediaPanel doc={doc} assetBase={http} motifs={deckMotifs} onCrop={(hash, crop) => client.setCrop(hash, crop)} saving={client.cropsInFlight} {...(client.mayEdit ? { onAdd: (file: File) => client.addPicture(file, t), onRemove: (hash: string) => client.removePicture(hash) } : {})} />,
    rules: () => <RulesPanel doc={doc} client={client} assetBase={http} />,
    // Bord is the home for both the game's board vocabulary and its running tables (#19, C4).
    // One panel and not two stacked (#126): the list of running tables stands in the setup's third
    // column, beside the felt, so the whole tab is one screen and the header stays where it was.
    tables: () => <SetupEditor doc={doc} client={client} assetBase={http} motifs={deckMotifs} beside={<TablesTab client={client} server={params.get('server')} />} />,
  }

  const wsUrl = (params.get('server') ?? location.origin).replace(/^http/, 'ws')
  const rotate = async () => {
    if (!table) return
    try {
      const { code } = await client.rotateCode(table.id, table.hostKey)
      setTable({ ...table, code })
    } catch {
      setNotice(t('editor.table.error.code'))
    }
  }

  // Saving and reaching the table are the same two buttons wherever they stand: in the header on
  // a desk, pinned to the end of the stage strip below one. They are written once.
  // Nothing to save for a role that may not change the game (#489): the button is not drawn, and
  // the shortcut is answered in the reading band.
  const saveButton = !client.mayEdit ? null : (
    // `aria-disabled` and not `disabled` (#477): a button that disables itself while it has the
    // focus hands the focus to <body>, and the next Tab starts from the top of the page. `save`
    // already refuses what there is nothing to do about.
    <button type="button" className="byd-secondary byd-editor-save" onClick={() => void save()} aria-disabled={!unsaved || saving}>
      {t(saving ? 'editor.saving' : 'editor.save')}
    </button>
  )
  // One button doing two jobs (L5), named for the job it is about to do (#417). On a game that has
  // no table it starts one — and said «Uppdatera bordet» while doing it, so a designer who pressed
  // it believing she was changing something started a session with a room code guests could join.
  // The name follows the state, in both what it does and what it is doing.
  const tableAction = table ? (updating ? 'editor.updatingTable' : 'editor.updateTable') : updating ? 'editor.startingTable' : 'editor.startTable'
  // A tester runs tables and a viewer does not (D3, #489).
  const updateButton = !client.mayStartTables ? null : (
    <button
      type="button"
      className="byd-editor-primary byd-primary"
      data-table-kind={table ? table.kind : 'none'}
      aria-disabled={updating}
      aria-busy={updating}
      // Below 1440 the errand is said short (#566, beslut 2026-09-30): the step buttons took the room
      // its last word stood in. The name is whole at every width, and begins with what is drawn.
      {...(table ? { 'aria-label': t(tableAction) } : {})}
      onClick={() => void updateTable()}
    >
      {table ? (
        <>
          <span className="byd-editor-primary-long">{t(tableAction)}</span>
          <span className="byd-editor-primary-short" aria-hidden="true">{t(updating ? 'editor.updatingTable.short' : 'editor.updateTable.short')}</span>
        </>
      ) : (
        t(tableAction)
      )}
    </button>
  )

  return (
    <>
    <div className="byd-editor" data-page="editor" data-mode={mode} data-room={room} {...(!client.mayEdit ? { 'data-readonly': '' } : {})} {...(fault ? { inert: true } : {})}>
      <header>
        <a
          ref={leaveRef}
          className="byd-editor-home"
          href={home}
          // Under 1280 the way home is an arrow, which gives the row the room «Sparat» lacked beside
          // the revision (#581, beslut 2026-09-29); its name is the same at every width.
          aria-label={t('editor.home')}
          onClick={(event) => {
            event.preventDefault()
            leave()
          }}
        >
          <span className="byd-editor-home-arrow" aria-hidden="true">←</span>
          <span className="byd-editor-home-word">{t('editor.home')}</span>
        </a>
        <strong>{doc.name}</strong>
        {client.mayEdit && projectId && <GameMore http={http} game={{ id: projectId, name: doc.name, rev: client.rev }} />}
        {/* The revision is also the way into the history (B4): the version is already named here. */}
        <button ref={revRef} type="button" className="byd-editor-rev" aria-expanded={historyOpen} onClick={() => setOver((on) => (on === 'history' ? null : 'history'))}>
          {t('editor.rev', { n: client.rev })}
        </button>
        {/* Whether the work is safe, in words and in colour (#8). It is a live region, so the
            change from saved to unsaved and back is spoken as it happens rather than found by
            someone going looking for a greyed-out button. Both words ride along as attributes,
            so the status can hold the room of the wider one and the row after it stays put (#668). */}
        <span className="byd-editor-saved" role="status" data-unsaved={unsaved} data-saved-word={t('editor.saved')} data-unsaved-word={t('editor.unsaved')}>
          {t(unsaved ? 'editor.unsaved' : 'editor.saved')}
        </span>
        {client.mayEdit && <StepButtons client={client} onConfirm={confirmation.confirm} />}
        {/* The modes are the header's on a desk; below one they are the stage strip at the
            bottom of the screen, and mounting both would put two of every tab in the document. */}
        {room === 'desk' && <EditorTabs mode={mode} onSelect={(m) => setStage(m === 'template' ? 'canvas' : m)} />}
        {/* The people in the header are the door to who has the game at all (D3): who is here
            now and who may be here is one question. The name carries the count the button shows,
            so it can be spoken to by what it says (#556). */}
        <button ref={hereRef} type="button" className="byd-editor-here" data-here aria-label={client.here.length > 1 ? t('editor.here.name', { n: client.here.length }) : t('share.title')} aria-expanded={shareOpen} onClick={() => setOver((on) => (on === 'share' ? null : 'share'))}>
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
        <EditorChords client={client} onSave={() => void save()} onConfirm={confirmation.confirm} onReading={() => sayReading(t('editor.reading.nothing'))} />
        {/* "Nytt bord" and the shortcut beside "Uppdatera bordet" are two ways to the tables that
            the Bord stage also holds, so below the desk they leave the header rather than being
            squeezed into it: nothing they reach becomes unreachable. */}
        {room !== 'desk' && actionsInHeader && (
          <>
            {saveButton}
            {updateButton}
          </>
        )}
        {room === 'desk' && (
          <>
            {saveButton}
            {/* «Nytt bord» is in the caret's menu (beslut 2026-09-27, #477): the header holds the
                errand the primary names, and a second table is the rarer, deliberate choice. */}
            {updateButton}
            {client.mayStartTables && <TableMenu client={client} server={params.get('server')} onShowTables={() => setStage('tables')} onNewTable={table ? () => void startTable() : undefined} />}
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
        <div className="byd-editor-table-link" role="status" {...(lost !== null ? { 'data-lost': '' } : {})} {...(stalled ? { 'data-stalled': '' } : {})}>
          {t(table.kind === 'new' ? 'editor.table.started' : table.kind === 'running' ? 'editor.table.running' : 'editor.table.refreshed', { version: table.version })}{' '}
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
            <a href={tvUrl(table.id, params.get('server'), table.hostKey, table.hostKey === undefined)} target="_blank" rel="noreferrer">
              {t('editor.table.open')}
            </a>
          ) : (
            <span className="byd-editor-rendering">{t('editor.table.rendering', { done: textures?.done ?? 0, total: textures?.total ?? '…' })}</span>
          )}
          {stalled && (
            <>
              {' '}· <span className="byd-editor-warning">{t('editor.table.stalled')}</span>{' '}
              <button type="button" onClick={() => void retryRender()}>
                {t('editor.table.retry')}
              </button>
            </>
          )}
          {textures && textures.failed.length > 0 && <span className="byd-editor-warning"> · {t('editor.table.failed', { n: textures.failed.length })}</span>}
          {unreadable > 0 && (
            <>
              {' '}· <span className="byd-editor-warning" data-unreadable>{t(unreadable === 1 ? 'editor.table.unreadable.one' : 'editor.table.unreadable.other', { n: unreadable, pt: minPtIn(phone).toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), width: phone.window.w, floor: SCREENS[phone.screen].floorPx })}</span>{' '}
              <button type="button" onClick={showOnWall}>{t('editor.table.unreadable.show')}</button>
            </>
          )}
          <span className="byd-editor-room">
            {' '}· {t('editor.table.roomCode')} <strong data-room-code>{table.code}</strong>{' '}
            <button type="button" ref={newCodeRef} onClick={() => void rotate()}>{t('editor.table.newCode')}</button>
          </span>
          <HostSeats client={client} sessionId={table.id} hostKey={table.hostKey} ws={wsUrl} onNotice={setNotice} onEnded={tableEnded} lastStop={newCodeRef} />
        </div>
      )}
      {/* The line to the project, in D5's own states (#485, fynd 8): gone, with how old the
          picture is and a way to try now, and back, said once — on the bar surface, over the work. */}
      {(client.lineDown || line.resumed) && (
        <div className="byd-editor-offline" data-offline={client.lineDown ? '' : undefined}>
          <StatusNotice
            notice={noticeFor(client.lineDown ? 'dropped' : 'resumed', 'editor', t)}
            surface="bar"
            links={links}
            onRetry={() => client.reconnectNow()}
            asOf={client.lineDown ? line.since : null}
          />
        </div>
      )}
      {/* The reading band (#489, beställarens beslut C efter prototyp 35): the role line become
          a band that says, once and in the same place on every tab, that this is read-only and
          why — and the one sentence a shortcut that has nothing to do is answered with. The tab
          panels point to it, so a keyboard entering one hears the reason too (L12). */}
      {!client.mayEdit && (
        <div className="byd-editor-readonly" id="byd-editor-reading" role="note" aria-label={t('editor.reading')} data-role-note>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
            <path d="M1.5 3.5c2-1 4.5-1 6.5.5 2-1.5 4.5-1.5 6.5-.5v9c-2-1-4.5-1-6.5.5-2-1.5-4.5-1.5-6.5-.5z" />
            <path d="M8 4v9" />
          </svg>
          <div>
            <b>{t('editor.reading')}</b> — {t(client.role === 'tester' ? 'editor.role.tester' : 'editor.role.viewer')}
            <small>{t('editor.reading.ask')}</small>
          </div>
          <span className="byd-editor-reading-said" role="status">
            {readingSaid ?? ''}
          </span>
        </div>
      )}
      {over && <PanelDoor opener={over === 'history' ? revRef : hereRef} onClose={() => setOver(null)} />}
      {shareOpen && projectId && <SharePanel http={http} project={projectId} here={client.here} onClose={() => setOver(null)} draft={shareDraft} onDraft={setShareDraft} />}
      {historyOpen && (
        <HistoryPanel
          client={client}
          onClose={() => setOver(null)}
          // Everything under the panel changed at once, and «Osparat» was the only sign of it
          // (#477). It is said in words, with the way back, and the keyboard goes back to the
          // revision it came from rather than to a button that is no longer there.
          onRestored={(rev) => {
            setOver(null)
            confirmation.confirm(t('history.restored', { rev }))
            revRef.current?.focus()
          }}
          onCompare={(rev, label) => {
            void client.at(rev).then((old) => {
              if (!old) return
              setCompare({ rev, doc: old, ...(label !== undefined ? { label } : {}) })
              setOver(null)
              setStage('table')
              setFocusNext({ compare: true })
            })
          }}
        />
      )}
      {/* The marking the bulk editor works on stands above the panels (#222, L22): it is made in
          Tabell and acted on there and in Media, and only one of the two is ever mounted. */}
      <MarkedProvider>
      <main>
        {(stages ?? MODES).map(([key]) => (
          // One panel per tab, so every tab's `aria-controls` names a panel that exists; only the
          // open one carries content, so switching mode still mounts a single canvas.
          <div key={key} id={panelId(key)} role="tabpanel" aria-labelledby={tabId(key)} {...(!client.mayEdit ? { 'aria-describedby': 'byd-editor-reading' } : {})} tabIndex={0} hidden={(stages ? here : mode) !== key}>
            {(stages ? here === key : mode === key) && panel[modeOf(key as Stage)]()}
          </div>
        ))}
      </main>
      </MarkedProvider>
      {stages && (
        <EditorStages stages={stages} stage={here} onSelect={setStage}>
          {!actionsInHeader && saveButton}
          {!actionsInHeader && updateButton}
        </EditorStages>
      )}
    </div>
    {/* A game deleted while it was open (#485): said over the work, which stays on the page and
        out of reach, rather than in place of it. */}
    {fault && <StatusNotice notice={fault === 'loggedOut' ? loggedOutNotice(t) : noticeFor(fault, 'editor', t)} surface="card" links={links} onRetry={retry} />}
    </>
  )
}

// The way out of a panel that stands over the work, for everyone who did not come back to the
// button that opened it. The panel is not modal — the work under it is what it is about — so this
// traps nothing: Escape closes the panel and hands the focus back to the button it came from,
// which is where the keyboard was standing when it opened.
//
// It is `standing`, and that is all it says about itself. A panel is opened and then left there
// while the work under it goes on, so a press that arrives while a hand is in the middle of a drag
// is not the panel's — and which of them it is belongs to `doors.ts` rather than to whichever of
// the two happened to open first (#152).
function PanelDoor({ opener, onClose }: { opener: RefObject<HTMLElement | null>; onClose(): void }) {
  const latest = useRef({ opener, onClose })
  latest.current = { opener, onClose }
  useDoor('standing', () => {
    onClose()
    opener.current?.focus()
  })
  useEffect(() => {
    // A click back in the work is the other way out, and the one a mouse reaches for. The focus
    // goes where the click went, so nothing is handed back here. The button that opened the panel
    // is left alone: it already closes it, and closing on the way down would only let the click
    // that follows open it again.
    const onPointerDown = (event: Event) => {
      const now = latest.current
      const target = event.target
      if (!(target instanceof Element)) return
      if (now.opener.current?.contains(target) || target.closest('[role="dialog"]')) return
      now.onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])
  return null
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
function EditorChords({ client, onSave, onConfirm, onReading }: { client: ProjectClient; onSave(): void; onConfirm(text: string): void; onReading(): void }) {
  const t = useT()
  const latest = useRef({ client, onSave, onConfirm, onReading, t })
  latest.current = { client, onSave, onConfirm, onReading, t }
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      const chord = chordOf(event)
      if (!chord) return
      // Saving is the editor's wherever it is pressed; a step back belongs to the field first.
      if (chord !== 'save' && isTyping(event.target) && !passedToEditor(event)) return
      event.preventDefault()
      const now = latest.current
      // A role that may not change the game has nothing to save and no step to take (#489): the
      // shortcut is answered in the reading band, rather than doing nothing without a word.
      if (!now.client.mayEdit) return now.onReading()
      if (chord === 'save') return now.onSave()
      takeStep(now.client, chord, now.t, now.onConfirm)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])
  return null
}

// A step back or forward, and what it took said in the confirmation — the one way both the keys and
// the header's buttons take it (#566). Nothing behind, or nothing ahead: the editor says nothing
// rather than claiming it undid.
function takeStep(client: ProjectClient, dir: 'undo' | 'redo', t: T, onConfirm: (text: string) => void): void {
  const what = dir === 'undo' ? client.undo() : client.redo()
  if (what) onConfirm(t(dir === 'undo' ? 'undo.took' : 'undo.redid', { what: t(what) }))
}

// Undo and redo for a hand without a keyboard (#566, beslut D; L12's addition for large tablets):
// in the header, in every tab, since the stack is the project's and not a tab's. Each is named
// for what it would take, and refused — still there, and saying so — when there is nothing.
function StepButtons({ client, onConfirm }: { client: ProjectClient; onConfirm(text: string): void }) {
  const t = useT()
  const back = client.undoWhat
  const ahead = client.redoWhat
  return (
    <span className="byd-editor-steps">
      <button type="button" aria-label={back ? t('undo.button', { what: t(back) }) : t('undo.button.none')} title={back ? t('undo.button', { what: t(back) }) : t('undo.button.none')} aria-disabled={back === null} onClick={() => back && takeStep(client, 'undo', t, onConfirm)}>
        <HookGlyph />
      </button>
      <button type="button" aria-label={ahead ? t('redo.button', { what: t(ahead) }) : t('redo.button.none')} title={ahead ? t('redo.button', { what: t(ahead) }) : t('redo.button.none')} aria-disabled={ahead === null} onClick={() => ahead && takeStep(client, 'redo', t, onConfirm)}>
        <HookGlyph mirrored />
      </button>
    </span>
  )
}

function homeUrl(server: string | null): string {
  return server ? `/?${new URLSearchParams({ server }).toString()}` : '/'
}

// The seats as the lobby sees them (DRIFT §9), each taken one with a kick: the host's control
// over who is at the table, from the screen the host already has open.
//
// A seat is a chip, its name and an × (#621, beslut A 2026-10-01). The kick used to be an outlined
// «Sparka Ada» of its own beside each name, so the strip grew by a button's width per player and
// broke between a name and its kick; the × is a full target that carries the same sentence as its
// name, and the chips go under the strip's first row together rather than one by one.
//
// The pressed × goes with its seat, and a focus whose element is taken away falls to the page,
// where the next Tab starts over from the top (#477, fynd 6). So it is handed on: to the seat
// that took the kicked one's place, the one before it at the end of the row, and «Ny kod» when
// nobody is left.
function HostSeats({ client, sessionId, hostKey, ws, onNotice, onEnded, lastStop }: { client: ProjectClient; sessionId: string; hostKey: string | undefined; ws: string; onNotice(text: string | null): void; onEnded(): void; lastStop: RefObject<HTMLButtonElement | null> }) {
  const t = useT()
  const labelId = useId()
  const { view } = useTableClient({ url: ws, sessionId, seat: null, lobby: true })
  // The table says so itself the moment it is ended (#705), whoever ended it; this is the line the
  // header already has open to it.
  const ended = view?.ended === true
  const latestEnded = useRef(onEnded)
  latestEnded.current = onEnded
  useEffect(() => {
    if (ended) latestEnded.current()
  }, [ended])
  const list = useRef<HTMLUListElement>(null)
  const kicked = useRef<{ seat: string; at: number } | null>(null)
  const taken = view ? view.seats.filter((s) => s.name !== null) : []
  const seated = taken.map((s) => s.id).join(' ')
  useEffect(() => {
    const was = kicked.current
    if (!was || seated.split(' ').includes(was.seat)) return
    kicked.current = null
    // Only a focus that went with the chip is handed on; one the host has since put somewhere
    // else stays where she put it.
    if (document.activeElement !== null && document.activeElement !== document.body) return
    const crosses = list.current?.querySelectorAll('button') ?? []
    ;(crosses[Math.min(was.at, crosses.length - 1)] ?? lastStop.current)?.focus()
  }, [seated, lastStop])
  if (taken.length === 0) return null
  return (
    <>
      <span className="byd-editor-seats-at">
        · <span id={labelId}>{t('editor.seats.at')}</span>
      </span>
      <ul className="byd-editor-seats" ref={list} aria-labelledby={labelId}>
        {taken.map((s, at) => {
          const name = t('editor.seats.kick', { name: s.name ?? '' })
          return (
            <li key={s.id} className="byd-chip" data-host-seat={s.id}>
              {s.name}
              <button
                type="button"
                aria-label={name}
                title={name}
                onClick={() => {
                  kicked.current = { seat: s.id, at }
                  void client.kick(sessionId, hostKey, s.id).catch(() => {
                    kicked.current = null
                    onNotice(t('editor.table.error.kick', { name: s.name ?? '' }))
                  })
                }}
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}

// When the line to the project went down, as the clock on this screen read it, and whether it has
// just come back (#485): the two things D5's bar says about a line beyond that it is down.
const RESUMED_MS = 2500
function useLineState(down: boolean): { since: string | null; resumed: boolean } {
  // Stamped when the break is first drawn and kept while it lasts, the way `useLiveStatus` stamps
  // a route's picture: the age of the data, never the age of the message.
  const stamp = useRef<string | null>(null)
  if (!down) stamp.current = null
  else stamp.current ??= asOf(new Date())
  const [resumed, setResumed] = useState(false)
  const was = useRef(down)
  useEffect(() => {
    if (down) setResumed(false)
    else if (was.current) setResumed(true)
    was.current = down
  }, [down])
  useEffect(() => {
    if (!resumed) return
    const timer = setTimeout(() => setResumed(false), RESUMED_MS)
    return () => clearTimeout(timer)
  }, [resumed])
  return { since: stamp.current, resumed }
}
