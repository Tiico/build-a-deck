import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { useSay } from '../status/StatusLive.js'
import type { ProjectDoc } from '@byd/server'
import type { Motif } from '@byd/template'
import { targetsOf } from '../player/PlaySheet.js'
import { stepAside } from './grips.js'
import { TableRenderer, type FeltFit, type TableHandle } from '../table/TableRenderer.js'
import { previewOf } from '../setup/preview.js'
import { MIN_MM, NUDGE_MM, onTableOf, sizedBy } from './zone-geometry.js'
import { useNumberDraft } from './number-draft.js'
import { layMaterial, newAreaSpot, newPileSpot, pasteSpot, placeLine, type Counter, type Die, type Geometry, type MaterialLine, type Setup, type Zone } from '@byd/server/doc'
import type { ProjectClient } from './ProjectClient.js'
import { useT, type T } from '../i18n/index.js'
import { Help } from './HelpDrawer.js'
import { GamePanel } from './GamePanel.js'
import { TableTree } from './TableTree.js'
import { Reading, familyRole, fixed, movedTo, newCounter } from './setup-rows.js'
import type { MaterialKey } from './MaterialRow.js'
import { recipeWords } from './fields.js'
import { useGesture } from './gesture.js'
import { CardPreview } from './CardPreview.js'
import { ZoneActions } from './ZoneActions.js'
import { landingOf } from './landing.js'
import { CARD_MM } from '../table/drop.js'
import { previewIcons } from './assets.js'
import { previewFonts } from './fonts.js'
import { FootSaid } from './said.js'
import { ChevronGlyph } from '../glyphs.js'

// The setup editor (B5, K2). The table is the designer's: the recipe laid the first one out and
// then let go, so what stands here stands here because they left it standing. The list on the left
// is every zone the table has, which is the only way to reach one that lies under another; the
// felt beside it is the real renderer fed by the setup, so what the designer sees is what the
// screen will show; and the phone's sheet under it shows what a player gets.
//
// What cannot go, and why each one: the felt is the table itself, a seat *is* a hand (C3), and the
// deck has to lie in some pile — which is why the deck is a role a pile carries and not a zone, and
// why moving the role is the way to be rid of the pile the wizard laid out.
export type SetupEditorProps = {
  doc: ProjectDoc
  client: ProjectClient
  // Where the project's images are served from (E1), and what is drawn inside each picture — the
  // same two the wall and the canvas compile a card with. The felt compiles the deck's back, so
  // a back made of a picture is a picture here too and not an empty box.
  assetBase?: string | undefined
  motifs?: Record<string, Motif> | undefined
  // What stands in the third column, beside the felt rather than a screenful under it (#126): the
  // list of tables the game is being played at. The setup owns the tab's layout — it is the one
  // that knows there are three columns — so the list is handed to it rather than dropped after it.
  beside?: ReactNode
  // What stands over the felt, at the head of the middle column (#1010): the Bord tab's switch to
  // its Resultat view, which stands in the same place in both views. Not over the first column,
  // whose ways to add a zone must all show at 1024 × 640 (#711), and not in the row over the
  // felt, which a chosen zone's four fields fill at 1024 (L50).
  lead?: ReactNode
}

// What one CSS millimetre is worth in pixels. A compiled card is laid out in millimetres, the
// felt in pixels, and this is the rate between them — so the zoom that makes the back the size of
// the card it lies on is the felt's own millimetre divided by this one.
const CSS_MM_PX = 96 / 25.4
const SNAP_MM = 5

// Whether a key press belongs to something being written in rather than to the table. Read off
// the event as well as off the focus: the focus is what a browser moves when a field is typed
// in, and the event's own target is what the press actually landed on — a press dispatched at a
// field that has not taken focus yet is still that field's.
// One rule, read by Delete and by cut/copy/paste, so the two cannot disagree about what a key
// press is for.
function inAField(e: KeyboardEvent): boolean {
  const on = [e.target, document.activeElement].filter((n): n is HTMLElement => n instanceof HTMLElement)
  return on.some((el) => el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

export function SetupEditor({ doc, client, assetBase, motifs, beside, lead }: SetupEditorProps) {
  const t = useT()
  const setup = doc.setup
  const [selected, setSelected] = useState<string | null>(null)
  // Vilka zonfamiljer som står utfällda (#175). Ingen av dem fälls ut av sig själv — det gör bara
  // den som pekas på: att välja en zon på filten fäller ut familjen den hör till, så att raden
  // finns att markera.
  const [opened, setOpened] = useState<string[]>([])
  // What the last step back would take back, said where the removal happened rather than only in
  // the header: a zone that went by mistake is one press from standing again.
  const [undoable, setUndoable] = useState<string | null>(null)
  // Whether what can be undone was a cut rather than a removal: the same zone gone, said as what it
  // is (#712) — «Yta 1 är borttagen.» over a zone that was on its way to be pasted read as a loss.
  const [wasCut, setWasCut] = useState(false)
  // Which zone the way back would restore, and whether the way back should take the focus: the ×
  // or the handle that had it is gone with the zone (#480).
  const [removedId, setRemovedId] = useState<string | null>(null)
  const undoButton = useRef<HTMLButtonElement>(null)
  const [focusUndo, setFocusUndo] = useState(0)
  useEffect(() => {
    if (focusUndo > 0) undoButton.current?.focus()
  }, [focusUndo])
  // What the last key press said, when it was not a removal: a copy taken, or a refusal with its
  // reason. It stands where the removal's own word stands, because it is the same kind of news.
  const [said, setSaid] = useState<string | null>(null)
  // Which pile's «Bredvid högen» picker is being held — hovered or focused (L30, #316). The felt
  // draws where that pile's actions lay their cards for as long as it is held, and no longer: a
  // handle per zone is already on the felt, and an outline that always stood there would be one
  // more thing to read past every time a pile is picked. Hover and focus both, so the keyboard
  // gets the same as the mouse.
  const [held, setHeld] = useState<string | null>(null)
  // The editor's own clipboard, and what the key handler needs to read without being rebuilt on
  // every keystroke the panel beside it takes.
  // A cut zone is the same zone on its way somewhere: pasted back it keeps its name and wishes for
  // the spot it was cut from (#480). A copy is a second zone, named as one and laid beside.
  const clipboard = useRef<{ zone: Zone; cut: boolean } | null>(null)
  // Whether the phone's sheet stands open beside the setup (#301). It is the editor's own
  // remembering and nobody else's: not the document's, not the table's, not the browser's — so
  // the tab opens with the sheet folded every time, and the room is the setup's until asked for.
  const [sheetShown, setSheetShown] = useState(false)
  const view = previewOf(doc)
  const selectedZone = setup.zones.find((z) => z.id === selected)
  // Att välja en zon markerar dess rad, och den raden måste finnas: hör zonen till en familj fälls
  // familjen ut. En hopfälld familj som markeras vore en markering ingen ser.
  // Where the panel was opened from, so closing it hands the focus back there (#558, K16's rule):
  // a handle on the felt, or the zone's row in the list. Read before the panel takes the focus.
  const opener = useRef<HTMLElement | null>(null)
  const select = (id: string | null) => {
    if (id !== null) {
      const at = document.activeElement
      opener.current = at instanceof HTMLElement && at.closest('[data-zone-handle], [data-zone-row]') ? at : null
    }
    setSelected(id)
    const zone = id === null ? undefined : setup.zones.find((z) => z.id === id)
    const role = zone === undefined ? null : familyRole(zone)
    if (role !== null) setOpened((now) => (now.includes(role) ? now : [...now, role]))
  }
  // Att lägga undan högens nederpanel (#300). Att stänga den är att avmarkera zonen — samma sak
  // som ett andra klick på raden gör, och skälet till att samma rad öppnar panelen igen med det
  // som står i dokumentet just då. Zonen och allt som redan skrivits i den rörs inte; ingenting
  // av det här når dokumentet, och därmed inte heller något bord eller någon session.
  //
  // Fokus går till raden i listan och inte till handtaget på filten: raden är det som öppnade
  // panelen från listan, och den står där vare sig zonen är markerad eller inte. Raden finns kvar att peka ut —
  // den ritas vare sig zonen är markerad eller inte, och `select` har redan fällt ut familjen den
  // ligger i — så den läses ur DOM:en på samma sätt som regelpanelen läser sin (#152).
  const close = (zone: Zone) => {
    select(null)
    const back = opener.current?.isConnected ? opener.current : document.querySelector<HTMLElement>(`[data-zone-row="${zone.id}"] .byd-setup-name`)
    opener.current = null
    back?.focus()
  }
  const remove = (zone: Zone, cut = false) => {
    client.removeZone(zone.id)
    setUndoable(zone.name)
    setWasCut(cut)
    setRemovedId(zone.id)
    setFocusUndo((n) => n + 1)
    setSaid(null)
    if (selected === zone.id) setSelected(null)
  }
  const turnCounters = (counters: Counter[], gesture?: string) => client.setRecipe({ ...client.recipe, counters }, recipeWords(t), gesture)
  // The counters are the only knobs written into a letter at a time; the rest are turned once and
  // are a step back each (L14).
  const counterTyping = useGesture('counter-field')
  // Which piece of material stands open in its row, and which one takes the focus next render: a
  // die or a counter just added from a ＋ opens with its fields and the key that added it is
  // followed by the row it made rather than by nothing.
  const [openMaterial, setOpenMaterial] = useState<MaterialKey | null>(null)
  const [focusMaterial, setFocusMaterial] = useState<MaterialKey | null>(null)
  const born = (key: MaterialKey) => {
    setOpenMaterial(key)
    setFocusMaterial(key)
  }
  const keys = useRef({ selected, setup, client, remove, t })
  keys.current = { selected, setup, client, remove, t }
  // En ny zon föds på ledig filt (#440 för ytan, #443 för högen). Uppställningen äger regeln och
  // kan säga nej till den; panelen frågar med samma funktion som lägger zonen, så att ett nej blir
  // ord på raden där allt annat den vägrar står — och aldrig ett kast ur `applyEdit` som fäller
  // fliken. De två zonerna får var sitt nej: en ruta på 300 × 120 mm och en kortrygg på 63 × 88 mm
  // slutar få plats vid olika tillfällen, så «ingen ledig filt» är två olika påståenden.
  const add = (kind: 'area' | 'pile') => {
    if ((kind === 'pile' ? newPileSpot(setup) : newAreaSpot(setup)) === null) {
      setSaid(t(kind === 'pile' ? 'setup.noRoomPile' : 'setup.noRoom'))
      setUndoable(null)
      return
    }
    setSelected(client.addZone(kind, t))
    setUndoable(null)
    setSaid(null)
  }
  // A zone at every seat, unless every seat has one already — then the press says so rather than
  // doing nothing without a word (#480).
  const addSeat = (role: 'mine' | 'counters') => {
    if (setup.seats.every((s) => setup.zones.some((z) => z.id === `${role}:${s}`))) {
      // The family's name, which is the seat's zone name without the seat (`zone-name.ts`).
      setSaid(t('setup.seatZone.all', { name: t(role === 'mine' ? 'zone.mine' : 'zone.counters', { seat: '' }).trim() }))
      setUndoable(null)
      return
    }
    client.addSeatZone(role, t)
    setSaid(null)
  }
  // Cut, copy and paste, bound to the window for the reason Delete already is: a handle on the
  // felt never has the focus, because the pointer that selects it is the pointer that starts a
  // drag. The clipboard is the editor's own and not the machine's — what is copied is a zone with
  // everything it carries, which is not a thing another program could be handed anyway.
  //
  // Copying a zone is the cheap half of an action: the expensive half is writing what the pile
  // can be asked for, and a copy carries that with it, because a step addresses *this pile* and
  // never a zone by name.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const key = e.key.toLowerCase()
      if (key !== 'c' && key !== 'x' && key !== 'v') return
      if (inAField(e)) return
      const now = keys.current
      if (key === 'v') {
        const held = clipboard.current
        if (!held) return
        e.preventDefault()
        // On free felt, by the rule new zones are born with (#440, #443, K22): two pastes were two
        // copies on one point, and a wide copy was born off the table.
        const geometry = pasteSpot(now.setup, held.zone, held.cut ? held.zone.geometry : undefined)
        if (geometry === null) {
          setSaid(now.t(held.zone.kind === 'pile' ? 'setup.noRoomPile' : 'setup.noRoom'))
          setUndoable(null)
          return
        }
        setSelected(now.client.insertZone({ ...held.zone, name: held.cut ? held.zone.name : now.t('zone.copy', { name: held.zone.name }), geometry }))
        // Pasted once, a cut is placed; the next paste is a copy of it.
        if (held.cut) clipboard.current = { zone: held.zone, cut: false }
        // The cut is placed, so what it said about the zone being gone is over too (#712).
        setUndoable(null)
        setSaid(null)
        return
      }
      // The zone chosen, or else the one whose row has the focus — the list is where a keyboard stands
      // on a zone, and a Ctrl+C there did nothing at all (#712).
      const row = document.activeElement instanceof Element ? document.activeElement.closest('[data-zone-row]')?.getAttribute('data-zone-row') : null
      const zone = now.setup.zones.find((z) => z.id === (now.selected ?? row))
      if (!zone) return
      e.preventDefault()
      // A hand is its seat's (C3), so it is never something to lay down a second copy of.
      if (zone.kind === 'hand') {
        setSaid(now.t('setup.fixed.hand'))
        return
      }
      if (key === 'x') {
        const why = fixed(now.setup, zone, now.t)
        if (why !== null) {
          setSaid(why)
          return
        }
        clipboard.current = { zone, cut: true }
        now.remove(zone, true)
        return
      }
      clipboard.current = { zone, cut: false }
      setSaid(now.t('setup.copied', { name: zone.name }))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  // What the felt names (#581, beslut B): the zones the list or the felt is pointed at, stood on
  // with the keyboard, or chosen. At 1024 the felt is 382 px across and every name drawn at once
  // lay over its neighbours; the list beside it names every zone already, so it is the legend, and
  // the felt answers what is asked of it. A family's row lights every zone it holds.
  const [pointed, setPointed] = useState<readonly string[]>([])
  const [stoodOn, setStoodOn] = useState<readonly string[]>([])
  const askedAbout = (target: EventTarget | null): string[] => {
    if (!(target instanceof Element)) return []
    // A piece of material lights the zone it lies in (#1292): it lies over the zone's handle.
    const one = target.closest('[data-zone-row], [data-zone-handle], [data-material-zone]')
    const id = one?.getAttribute('data-zone-row') ?? one?.getAttribute('data-zone-handle') ?? one?.getAttribute('data-material-zone')
    if (id) return [id]
    const role = target.closest('[data-zone-family]')?.getAttribute('data-zone-family')
    return role ? setup.zones.filter((z) => familyRole(z) === role).map((z) => z.id) : []
  }
  const lit = new Set([...pointed, ...stoodOn, ...(selected ? [selected] : [])])
  return (
    <Reading.Provider value={!client.mayEdit}>
    <div
      className="byd-setup"
      data-setup-editor
      onPointerOver={(event) => setPointed(askedAbout(event.target))}
      onPointerLeave={() => setPointed([])}
      onFocus={(event) => setStoodOn(askedAbout(event.target))}
      onBlur={(event) => {
        if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) setStoodOn([])
      }}
    >
      <div className="byd-setup-side">
        <GamePanel client={client} setup={setup} />
        <TableTree
          setup={setup}
          rows={doc.rows}
          selected={selected}
          opened={opened}
          onSelect={select}
          onOpen={(role) => setOpened((now) => (now.includes(role) ? now.filter((r) => r !== role) : [...now, role]))}
          onRemove={remove}
          onPatch={(id, patch, gesture) => client.patchZone(id, patch, gesture)}
          onHold={setHeld}
          onAdd={(what) => {
            if (what.kind === 'area' || what.kind === 'pile') add(what.kind)
            else if (what.kind === 'seat') addSeat(what.role)
            else if (what.kind === 'die') {
              const dice = setup.dice ?? []
              client.setDice([...dice, movedTo({ faces: 6, count: 1, zone: '' }, what.place)])
              born(`die:${dice.length}`)
            } else if (what.kind === 'counter') {
              const counters = client.recipe.counters
              turnCounters([...counters, newCounter(counters, t, what.role)])
              born(`counter:${counters.length}`)
            }
          }}
          openMaterial={openMaterial}
          onOpenMaterial={setOpenMaterial}
          focusMaterial={focusMaterial}
          onFocused={() => setFocusMaterial(null)}
          onDice={(dice) => client.setDice(dice)}
          onCounters={turnCounters}
          typing={counterTyping}
        />
      </div>
      <div className="byd-setup-canvas">
        {lead}
        <div className="byd-setup-said" data-setup-said>
          {undoable && (
            <span className="byd-setup-undo" role="status">
              {t(wasCut ? 'setup.cut' : 'setup.removed', { name: undoable })}
              <button
                ref={undoButton}
                type="button"
                onClick={() => {
                  client.undo()
                  setUndoable(null)
                  // The zone stands again; so does its row, which takes the focus.
                  const id = removedId
                  if (id) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-zone-row="${CSS.escape(id)}"] .byd-setup-name`)?.focus())
                }}
              >
                {t('setup.undo')}
              </button>
            </span>
          )}
          {said && (
            <span className="byd-setup-said-word" role="status">
              {said}
            </span>
          )}
          {/* Where the chosen zone stands, over the felt where the eye already is while it is
              dragged (#480, B5): the same numbers stood under the list's foot, out of sight. */}
          {/* To an editor the numbers are fields, where they already stood (#579, #554, beslut
              2026-09-29): a zone is moved and sized without dragging, and exactly. */}
          {selectedZone && selectedZone.id !== setup.floor && client.mayEdit && (
            <ZonePlace key={selectedZone.id} zone={selectedZone} floor={setup.zones.find((z) => z.id === setup.floor)?.geometry} onGeometry={(geometry) => client.patchZone(selectedZone.id, { geometry })} />
          )}
          {selectedZone && selectedZone.id !== setup.floor && !client.mayEdit && (
            <span className="byd-setup-coords" data-setup-coords>
              {selectedZone.name} · {Math.round(selectedZone.geometry.x)}, {Math.round(selectedZone.geometry.y)}
              {selectedZone.kind !== 'pile' ? ` · ${Math.round(selectedZone.geometry.w)} × ${Math.round(selectedZone.geometry.h)} mm` : ' mm'}
            </span>
          )}
          <Help topic={t('setup.help.topic')}>
            {client.mayEdit && <p>{t('setup.hint')}</p>}
            <p>{t('setup.help.resize')}</p>
            <p>{t('setup.help.keys')}</p>
            <p>{t('setup.help.list')}</p>
          </Help>
          {/* What just happened, after what the row already says (#698, L67): this row is where Bord
              says its quiet line, and a foot would have cost the columns their height (L66). */}
          <FootSaid />
        </div>
        {view ? (
          <Felt
            view={view}
            doc={doc}
            assetBase={assetBase}
            motifs={motifs}
            setup={setup}
            selected={selected}
            held={held}
            lit={lit}
            onSelect={(id) => {
              select(id)
              setUndoable(null)
              // The row is the other half of the choice (#480): brought into view in the list,
              // after the render that has opened its family.
              if (id) requestAnimationFrame(() => document.querySelector(`[data-zone-row="${CSS.escape(id)}"]`)?.scrollIntoView?.({ block: 'nearest' }))
            }}
            onGeometry={(id, geometry, gesture) => client.patchZone(id, { geometry }, gesture)}
            onRemove={remove}
            onPlace={client.mayEdit ? (line, center, gesture) => place(client, setup, t, line, center, gesture) : undefined}
          />
        ) : (
          <p role="alert" className="byd-setup-invalid">{t('setup.invalid')}</p>
        )}
      </div>
      {/* The third column: what a player is given, and the tables the game is running at. Both
          were under the felt before, a screenful down, where the designer had to leave the setup
          to reach them (#126).

          Och den viker undan medan en zon är vald, så att zonens handlingar får kolumnen (#330,
          L29). Den monteras inte av: listan över bord är serverns svar, och en avmarkering får
          inte betyda att den hämtas om. `hidden` tar bort den ur bilden, ur tabbordningen och ur
          skärmläsarens träd på en gång — och ur rutnätet, så att panelen hamnar i spåret den
          lämnade. */}
      <div className="byd-setup-beside" hidden={selectedZone?.kind === 'pile'}>
        {/* The sheet is a fold, like the groups in the list of tables under it: one row that says
            what it holds until it is asked for, and then the sheet itself (#301). The sheet is read
            out of the document on every render, so what opens is always the setup as it stands
            now — including every change made while it was folded. */}
        {view && (
          <section className="byd-setup-sheet">
            <button type="button" className="byd-setup-fold" aria-expanded={sheetShown} aria-controls={SHEET_PREVIEW_ID} onClick={() => setSheetShown((was) => !was)}>
              <span className="byd-setup-caret" aria-hidden="true">
                <ChevronGlyph to="right" />
              </span>
              {t(sheetShown ? 'setup.sheet.hide' : 'setup.sheet.show')}
            </button>
            {sheetShown && <SheetPreview view={view} seat={setup.seats[0] ?? null} />}
          </section>
        )}
        {beside}
      </div>
      {/* What the selected pile starts with and what it can be asked for (B5, K14), written as
          sentences, in the third column's place (#330, L29). Only a pile: an area and a hand have
          no ring to hang an action in, and a hand's contents are the seat's and not the
          designer's (C3).

          Den står efter kolumnen den ersätter och inte före: tabbordningen och läsordningen är
          DOM:ens, och panelen läses där spelararket hade stått. */}
      {selectedZone?.kind === 'pile' && (
        <ZoneActions doc={doc} zone={selectedZone} onPatch={(patch, gesture) => client.patchZone(selectedZone.id, patch, gesture)} onClose={() => close(selectedZone)} reading={!client.mayEdit} />
      )}
    </div>
    </Reading.Provider>
  )
}

// B: the felt with a handle on every zone but the floor. Dragging moves, the corner resizes,
// both in whole millimetres snapped to a small grid; the arrow keys nudge the focused one, and
// Delete takes the selected one away.
// A drag carries the token of the grab it belongs to (L14): the pointer reports one pull as a
// patch per frame, and all of those frames are one step back. The token is made where the grab
// begins, so the next grab of the same zone is the next step.
type Drag = { id: string; mode: 'move' | 'resize'; start: { x: number; y: number }; geometry: Geometry; gesture: string }
function Felt({
  view,
  doc,
  assetBase,
  motifs,
  setup,
  selected,
  held,
  lit,
  onSelect,
  onGeometry,
  onRemove,
  onPlace,
}: {
  view: NonNullable<ReturnType<typeof previewOf>>
  doc: ProjectDoc
  assetBase?: string | undefined
  motifs?: Record<string, Motif> | undefined
  setup: Setup
  selected: string | null
  held: string | null
  lit: ReadonlySet<string>
  onSelect(id: string | null): void
  onGeometry(id: string, geometry: Geometry, gesture?: string): void
  onRemove(zone: Zone): void
  // Where a piece of material was taken to (#1292); a reader has no hand on it.
  onPlace?: ((line: MaterialLine, center: { x: number; y: number }, gesture?: string) => boolean) | undefined
}) {
  const t = useT()
  const say = useSay()
  const keysId = useId()
  // What the back is compiled from, held by identity and by the parts of the document it is
  // actually made of. The wall can key these on the whole document because nothing redraws the
  // wall but the deck; the felt is dragged, and a zone moved a millimetre is a new document with
  // the same deck in it. Keyed on `doc` the back would be compiled again on every pointer move,
  // under the pile the designer is placing.
  const fonts = useMemo(() => previewFonts({ template: doc.template, fonts: doc.fonts }, assetBase), [doc.template, doc.fonts, assetBase])
  const icons = useMemo(() => previewIcons({ icons: doc.icons }, assetBase), [doc.icons, assetBase])
  // A back that draws nothing is not a back: a game made without the guided start has an empty
  // one, and compiling it would lay a blank white card on the pile — which reads as a fault and
  // not as "no back yet". Until there is something on it the pile keeps the tool's own stand-in.
  const drawn = doc.template.faces['back']
  const backFace = drawn && (drawn.base.length > 0 || Object.keys(drawn.variants).length > 0) ? drawn : null
  // The base back and not any one card's: a pile is shuffled and does not know what is on top, and
  // the base is the back every card of the deck inherits. A deck whose groups each have a back of
  // their own (#14) shows on the felt the one they are all variations of. The row is still handed
  // in, because a back may bind a field — a deck number, an expansion mark — and the first row is
  // what the canvas shows such a back with when the designer has picked no card.
  const row = useMemo(() => doc.rows[0]?.fields ?? {}, [doc.rows])
  const table = useRef<TableHandle | null>(null)
  const drag = useRef<Drag | null>(null)
  // Which zone the pointer is over (#424, decision D of 2026-09-22). A grip is drawn on the zone
  // the designer has taken hold of and on no other: at rest the felt carries none, so no name can
  // land on one, and the resting picture says the names on exactly the millimetres the played
  // felt says them (B5). Hovering counts as taking hold — a grip nobody can see until they have
  // already clicked is a grip nobody finds.
  const [under, setUnder] = useState<string | null>(null)
  const feltBox = useRef<HTMLDivElement | null>(null)
  // The one name in a drawn grip's way steps aside for as long as the grip is drawn (#424, D).
  // After layout and not during it: which name crosses which grip is a question about the boxes
  // the browser actually laid out, and nothing short of measuring them can answer it. It runs
  // again whenever the drawn grip changes or the felt is laid out afresh, and `stepAside` puts
  // back anything that no longer needs to move, so nothing is left displaced behind it.
  useLayoutEffect(() => {
    if (feltBox.current) stepAside(feltBox.current)
  })
  const grabs = useGesture('zone')
  // The zone that the last move held at the table's edge (beslut 2026-09-27, #480 fynd 2 A — the
  // rule #478 gave elements on a card): its middle stays on the table, and a word beside it says so
  // for as long as the hand keeps pushing. Past the edge a zone was clipped by the felt and could
  // not be taken hold of again, and at the table it did not show at all.
  const [kept, setKept] = useState<string | null>(null)
  const floorBox = setup.zones.find((z) => z.id === setup.floor)?.geometry
  const onTable = (z: Zone, g: Geometry): Geometry => {
    const { geometry, held } = onTableOf(floorBox, z, g)
    setKept(held ? z.id : null)
    return geometry
  }
  const toMm = (e: RPointerEvent) => table.current?.toTable(e.clientX, e.clientY) ?? { x: 0, y: 0 }
  const down = (e: RPointerEvent, z: Zone, mode: Drag['mode']) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const el = e.currentTarget as HTMLElement
    if (typeof el.setPointerCapture === 'function') el.setPointerCapture(e.pointerId)
    drag.current = { id: z.id, mode, start: toMm(e), geometry: { ...z.geometry }, gesture: grabs.begin() }
    onSelect(z.id)
  }
  const move = (e: RPointerEvent) => {
    const d = drag.current
    if (!d) return
    const p = toMm(e)
    const dx = snap(p.x - d.start.x)
    const dy = snap(p.y - d.start.y)
    const g = d.geometry
    const zone = setup.zones.find((z) => z.id === d.id)
    if (d.mode === 'move' && zone) return onGeometry(d.id, onTable(zone, { ...g, x: g.x + dx, y: g.y + dy }), d.gesture)
    if (zone) onGeometry(d.id, sizedBy(zone, g, dx, dy), d.gesture)
  }
  const up = () => {
    drag.current = null
    setKept(null)
  }
  const nudge = (e: RKeyboardEvent, z: Zone) => {
    // Enter and Space choose (#480): the focus alone does not, or Tab onto the felt would choose
    // the first pile and its panel would carry the keyboard off before the rest were reached.
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(z.id)
      return
    }
    const step = e.shiftKey ? NUDGE_MM * 5 : NUDGE_MM
    const d = e.key === 'ArrowLeft' ? { x: -step, y: 0 } : e.key === 'ArrowRight' ? { x: step, y: 0 } : e.key === 'ArrowUp' ? { x: 0, y: -step } : e.key === 'ArrowDown' ? { x: 0, y: step } : null
    if (!d) return
    e.preventDefault()
    // Alt and an arrow size the zone from its top left corner (#554, beslut 2026-09-29): the
    // corner was the only way, and only a pointer's. A pile has no size, so it answers nothing.
    if (e.altKey) {
      if (z.kind === 'pile') return
      const sized = sizedBy(z, z.geometry, d.x, d.y)
      onGeometry(z.id, sized)
      return say?.('polite', t('setup.sized', { name: z.owner ? `${z.name} · ${z.owner}` : z.name, w: Math.round(sized.w), h: Math.round(sized.h) }))
    }
    const to = onTable(z, { ...z.geometry, x: z.geometry.x + d.x, y: z.geometry.y + d.y })
    onGeometry(z.id, to)
    // The place a nudge left the zone, said where the page says things (#558): the text beside
    // the list changed, and nothing read it.
    say?.('polite', t('setup.moved', { name: z.owner ? `${z.name} · ${z.owner}` : z.name, x: Math.round(to.x), y: Math.round(to.y) }))
  }
  // Delete is bound to the window and not to the handle, because a handle chosen by the pointer
  // has no focus: the pointer that selects it is the pointer that starts a drag, and the drag takes
  // the default action — focus among it — away. So the key answers where the zone is and nowhere
  // else (#558): on the felt, on the zone's own row, and on nothing at all after a pointer chose
  // it. On the help's question mark or on «Spara» it took the chosen zone away unasked.
  const state = useRef({ selected, setup, onRemove })
  state.current = { selected, setup, onRemove }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (inAField(e)) return
      const at = e.target instanceof Element ? e.target : null
      const here = at === null || at === document.body || at.closest('.byd-setup-felt, [data-zone-row]') !== null
      if (!here) return
      const now = state.current
      const zone = now.setup.zones.find((z) => z.id === now.selected)
      if (!zone || fixed(now.setup, zone, t) !== null) return
      e.preventDefault()
      now.onRemove(zone)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [t])
  const floor = setup.zones.find((z) => z.id === setup.floor)
  // Where the selected pile's actions lay their cards (L30, #316): a card's outline at the point
  // `besidePile` gives, drawn while the pile's picker is held. Off the table it is an error and
  // not a hint, and stands for as long as the pile is selected, in amber with the words in it —
  // otherwise a pile could lay its cards past the felt's edge for anyone who never touched the
  // picker, which is the case the side became choosable for (K21).
  const landing = (fit: FeltFit) => {
    const z = setup.zones.find((x) => x.id === selected)
    if (!z || z.kind !== 'pile' || !floor) return null
    const at = landingOf(z, floor.geometry)
    if (held !== z.id && !at.off) return null
    return (
      <div
        className="byd-setup-landing"
        data-landing={z.id}
        data-at={`${at.x},${at.y}`}
        data-rot={at.rot}
        data-cards={at.cards}
        data-off={at.off ? 'true' : undefined}
        aria-hidden="true"
        style={{ left: fit.left(at.x), top: fit.top(at.y), width: fit.px(at.w), height: fit.px(at.h), transform: at.rot ? `rotate(${at.rot}deg)` : undefined }}
      >
        {at.off && <u>{t('setup.landing.off')}</u>}
      </div>
    )
  }
  // The game's material on the felt (#1292, beslut A): a handle on every piece the table is laid
  // with, from the same list it is laid from, so what is taken hold of is what the players get.
  // A line's pieces in one zone are one handle — a row of dice moves as the row it is — and every
  // seat's copy is a handle of its own, read back from that seat's chair.
  const material = useMemo(() => materialHandles(setup), [setup])
  const placing = useGesture('material')
  const carried = useRef<{ key: string; line: MaterialLine; start: { x: number; y: number }; center: { x: number; y: number }; gesture: string } | null>(null)
  const [target, setTarget] = useState<string | null>(null)
  const carry = (e: RPointerEvent, h: MaterialHandle) => {
    if (e.button !== 0 || !onPlace) return
    e.stopPropagation()
    e.preventDefault()
    const el = e.currentTarget as HTMLElement
    if (typeof el.setPointerCapture === 'function') el.setPointerCapture(e.pointerId)
    carried.current = { key: h.key, line: h.line, start: toMm(e), center: h.center, gesture: placing.begin() }
  }
  const carrying = (e: RPointerEvent) => {
    const c = carried.current
    if (!c || !onPlace) return
    const p = toMm(e)
    const center = { x: c.center.x + snap(p.x - c.start.x), y: c.center.y + snap(p.y - c.start.y) }
    if (onPlace(c.line, center, c.gesture)) setTarget(areaUnder(setup, center)?.id ?? null)
  }
  const put = () => {
    carried.current = null
    setTarget(null)
  }
  const shift = (e: RKeyboardEvent, h: MaterialHandle) => {
    const step = e.shiftKey ? NUDGE_MM * 5 : NUDGE_MM
    const d = e.key === 'ArrowLeft' ? { x: -step, y: 0 } : e.key === 'ArrowRight' ? { x: step, y: 0 } : e.key === 'ArrowUp' ? { x: 0, y: -step } : e.key === 'ArrowDown' ? { x: 0, y: step } : null
    if (!d || !onPlace) return
    e.preventDefault()
    const center = { x: h.center.x + d.x, y: h.center.y + d.y }
    if (!onPlace(h.line, center)) return
    const area = areaUnder(setup, center)
    if (area) say?.('polite', t('setup.material.moved', { what: whatOf(h, t), zone: area.name, x: Math.round(center.x - area.geometry.x), y: Math.round(center.y - area.geometry.y) }))
  }
  const pieces = (fit: FeltFit) =>
    material.map((h) => (
      <div
        key={h.key}
        className="byd-setup-material"
        role="button"
        tabIndex={onPlace ? 0 : -1}
        aria-label={t('setup.material.handle', { what: whatOf(h, t), zone: h.zoneName })}
        aria-describedby={onPlace ? materialKeysId : undefined}
        data-material={h.key}
        data-material-zone={h.zone}
        style={{ left: fit.left(h.box.x), top: fit.top(h.box.y), width: fit.px(h.box.w), height: fit.px(h.box.h) }}
        onPointerDown={(e) => carry(e, h)}
        onPointerMove={carrying}
        onPointerUp={put}
        onPointerCancel={put}
        onKeyDown={(e) => shift(e, h)}
      />
    ))
  const materialKeysId = useId()
  const overlay = (fit: FeltFit) => (
    <>
      {handles(fit)}
      {pieces(fit)}
      {landing(fit)}
    </>
  )
  const handles = (fit: FeltFit) =>
    setup.zones
      .filter((z) => z.id !== setup.floor)
      .map((z) => {
        const box = boxOf(z)
        return (
          <div
            key={z.id}
            className="byd-setup-handle"
            role="button"
            tabIndex={0}
            aria-label={
              // The handle's whole name, since it draws none (K19): the felt underneath says what
              // the zone is called, and whose it is comes along here rather than being lost with
              // the label that used to be printed in the handle's corner.
              t('setup.zone', { name: z.owner ? `${z.name} · ${z.owner}` : z.name })
            }
            aria-pressed={selected === z.id}
            aria-describedby={keysId}
            data-zone-handle={z.id}
            data-kind={z.kind}
            data-deck={z.id === setup.deckZone ? 'true' : undefined}
            style={{ left: fit.left(box.x), top: fit.top(box.y), width: fit.px(box.w), height: fit.px(box.h) }}
            onPointerDown={(e) => down(e, z, 'move')}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onClick={() => onSelect(z.id)}
            onKeyDown={(e) => nudge(e, z)}
            onPointerEnter={() => setUnder(z.id)}
            onPointerLeave={() => setUnder((now) => (now === z.id ? null : now))}
          >
            {kept === z.id && (
              <span className="byd-setup-kept" role="status">
                {t('setup.kept')}
              </span>
            )}
            {z.kind !== 'pile' && (selected === z.id || under === z.id) && <i className="byd-setup-corner" data-resize={z.id} onPointerDown={(e) => down(e, z, 'resize')} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />}
          </div>
        )
      })
  return (
    <div className="byd-setup-felt" ref={feltBox}>
      {/* What a handle answers to, said to every handle (#558): the arrows were in the help alone. */}
      <span id={keysId} className="byd-offscreen">
        {t('setup.handle.keys')}
      </span>
      <span id={materialKeysId} className="byd-offscreen">
        {t('setup.material.keys')}
      </span>
      {/* The handles carry no names of their own (K19): the felt underneath already names every
          area and every pile, and `seatNames` asks it for the one name this surface would
          otherwise be missing — whose hand is whose, which the played TV gets from its dock. The
          handle keeps the name in its `aria-label`, so the keyboard and the screen reader lose
          nothing by the name no longer being drawn twice. */}
      <TableRenderer
        ref={table}
        view={view}
        mode="tv"
        lit={target ? new Set([...lit, target]) : lit}
        // A card's width of dark around the table (L30): the outline that says a pile lays its
        // cards off the table has to be drawn *off the table*, and was clipped by the felt's edge
        // until the felt left room for it.
        margin={CARD_MM.w}
        overlay={overlay}
        // The deck's own back on every face-down card (L17). It goes through `compile`, the
        // one renderer there is for card templates (K9) — the same code the canvas and the wall
        // draw with — at the scale the felt is drawn in. This surface has no render farm behind
        // it and no saved version to render, so without this the pile wore a weave that belonged
        // to no game and a designer's back reached the table only after it was published.
        back={
          backFace
            ? (fit, at) => (
                <CardPreview
                  face={backFace}
                  row={row}
                  icons={icons}
                  fonts={fonts}
                  id={`byd-setup-back-${at}`}
                  scale={fit.px(1) / CSS_MM_PX}
                  assetBase={assetBase}
                  motifs={motifs}
                  palette={doc.palette}
                />
              )
            : undefined
        }
        seatNames
      />
    </div>
  )
}

// A pile is a point; its handle is a card's outline around it.
function boxOf(z: Zone): { x: number; y: number; w: number; h: number } {
  const g = z.geometry
  return z.kind === 'pile' ? { x: g.x - CARD_MM.w / 2, y: g.y - CARD_MM.h / 2, w: CARD_MM.w, h: CARD_MM.h } : { x: g.x, y: g.y, w: g.w, h: g.h }
}
const snap = (mm: number) => Math.round(mm / SNAP_MM) * SNAP_MM

// One handle for a line's pieces in one zone (#1292): the box around them on the felt, and the
// middle a drag or an arrow moves.
type MaterialHandle = { key: string; line: MaterialLine; zone: string; zoneName: string; faces?: number; name?: string; box: { x: number; y: number; w: number; h: number }; center: { x: number; y: number } }
function materialHandles(setup: Setup): MaterialHandle[] {
  const byKey = new Map<string, MaterialHandle>()
  for (const p of layMaterial(setup)) {
    const zone = setup.zones.find((z) => z.id === p.zone)
    if (!zone) continue
    const key = `${p.line.kind}:${p.line.index}@${p.zone}`
    const x = zone.geometry.x + p.x
    const y = zone.geometry.y + p.y
    const was = byKey.get(key)
    const box = was ? { x: Math.min(was.box.x, x), y: Math.min(was.box.y, y), w: Math.max(was.box.x + was.box.w, x + p.size) - Math.min(was.box.x, x), h: Math.max(was.box.y + was.box.h, y + p.size) - Math.min(was.box.y, y) } : { x, y, w: p.size, h: p.size }
    byKey.set(key, { key, line: p.line, zone: zone.id, zoneName: zone.name, ...(p.faces !== undefined ? { faces: p.faces } : {}), ...(p.name !== undefined ? { name: p.name } : {}), box, center: { x: box.x + box.w / 2, y: box.y + box.h / 2 } })
  }
  return [...byKey.values()]
}
const whatOf = (h: MaterialHandle, t: T): string => (h.line.kind === 'die' ? t('setup.material.die', { n: h.line.index + 1, kind: `d${h.faces ?? 6}` }) : t('setup.material.counter', { name: h.name ?? '' }))
// The innermost area under a point on the felt, the one a piece let go there lies in.
function areaUnder(setup: Setup, p: { x: number; y: number }): Zone | undefined {
  const g = (z: Zone) => z.geometry
  return setup.zones
    .filter((z) => z.kind === 'area' && p.x >= g(z).x && p.y >= g(z).y && p.x <= g(z).x + g(z).w && p.y <= g(z).y + g(z).h)
    .sort((a, b) => g(a).w * g(a).h - g(b).w * g(b).h)[0]
}
// A piece taken to a point (#1292): its line written where `placeLine` says it lies now, the dice
// as the whole list and a counter as the recipe it is part of, each one step back per grab (L14).
// False when nothing under the point can hold it, and the piece stays where it was.
function place(client: ProjectClient, setup: Setup, t: T, line: MaterialLine, center: { x: number; y: number }, gesture?: string): boolean {
  const next = placeLine(setup, line, center)
  if (!next) return false
  if (line.kind === 'die') client.setDice((setup.dice ?? []).map((d, i) => (i === line.index ? (next as Die) : d)), gesture)
  else client.setRecipe({ ...client.recipe, counters: client.recipe.counters.map((c, i) => (i === line.index ? (next as Counter) : c)) }, recipeWords(t), gesture)
  return true
}

// What the phone shows (C4), as one seat sees it: every target with its verb, the floor last.
// A sheet belongs to a seat, so the preview is taken for the first one — another seat's own area
// is not a place this player can play to, and a zone that only holds counters is no place for a
// card at all (B6, C4). Asked for the table as a whole it listed every seat's "Framför mig" and
// every counters zone, which is a sheet no phone ever draws.
const SHEET_PREVIEW_ID = 'byd-sheet-preview'
function SheetPreview({ view, seat }: { view: NonNullable<ReturnType<typeof previewOf>>; seat: string | null }) {
  const t = useT()
  const preview = targetsOf({ ...view, seat }, t)
  return (
    <div id={SHEET_PREVIEW_ID} className="byd-zones-preview" data-sheet-preview>
      <h2>{t('setup.sheet.title')}</h2>
      <p>{t('setup.sheet.play')} <strong>{t('setup.sheet.oneCard')}</strong> {t('setup.sheet.to')}</p>
      <div className="byd-sheet-targets">
        {preview.map((target) => (
          <div key={target.id} role="presentation">
            <span>{target.label}</span>
            <small>{target.kind === 'pile' ? t(target.at === 'bottom' ? 'setup.sheet.bottomIn' : 'setup.sheet.topIn', { name: target.name }) : t('setup.sheet.free')}</small>
          </div>
        ))}
      </div>
    </div>
  )
}

// Where a zone stands and how big it is, as fields in millimetres over the felt (#579, #554). Each
// takes its value when it is left or on Enter, and ↑/↓ step it as the handle's arrows do. A place
// is held where half the zone still stands on the table, as a drag and a nudge are (#480), and a
// size never goes under the least a zone may be.
type PlaceKey = 'x' | 'y' | 'w' | 'h'
function ZonePlace({ zone, floor, onGeometry }: { zone: Zone; floor: Geometry | undefined; onGeometry(geometry: Geometry): void }) {
  const t = useT()
  const name = zone.owner ? `${zone.name} · ${zone.owner}` : zone.name
  const write = (key: PlaceKey, value: number) => {
    const g = { ...zone.geometry, [key]: key === 'w' || key === 'h' ? Math.max(MIN_MM, value) : value }
    onGeometry(onTableOf(floor, zone, g).geometry)
  }
  const keys: PlaceKey[] = zone.kind === 'pile' ? ['x', 'y'] : ['x', 'y', 'w', 'h']
  return (
    <span className="byd-setup-coords byd-setup-place" data-setup-coords role="group" aria-label={t('setup.zoneAt.of', { name })}>
      <b>{name}</b>
      {keys.map((key) => (
        <PlaceField key={key} label={t(`setup.zoneAt.${key}`)} name={name} value={Math.round(zone.geometry[key])} onCommit={(value) => write(key, value)} />
      ))}
      <span aria-hidden="true">mm</span>
    </span>
  )
}
function PlaceField({ label, name, value, onCommit }: { label: string; name: string; value: number; onCommit(value: number): void }) {
  const typed = useNumberDraft({ value, onCommit })
  return (
    <label>
      <span aria-hidden="true">{label}</span>
      <input
        inputMode="numeric"
        aria-label={`${name} ${label} (mm)`}
        value={typed.value}
        onChange={typed.onChange}
        onBlur={typed.onBlur}
        onKeyDown={(event) => {
          if (typed.onKey(event)) return
          const by = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0
          if (by === 0 || event.altKey || event.ctrlKey || event.metaKey) return
          event.preventDefault()
          typed.drop()
          onCommit(value + by * (event.shiftKey ? NUDGE_MM * 5 : NUDGE_MM))
        }}
      />
    </label>
  )
}
