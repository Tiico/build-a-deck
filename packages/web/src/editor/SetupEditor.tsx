import { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { useSay } from '../status/StatusLive.js'
import type { ProjectDoc } from '@byd/server'
import type { Motif } from '@byd/template'
import type { ZoneBeside } from '@byd/protocol'
import { targetsOf } from '../player/PlaySheet.js'
import { stepAside } from './grips.js'
import { TableRenderer, type FeltFit, type TableHandle } from '../table/TableRenderer.js'
import { previewOf } from '../setup/preview.js'
import { MIN_MM, NUDGE_MM, onTableOf, sizedBy } from './zone-geometry.js'
import { useNumberDraft } from './number-draft.js'
import { Stepper } from '../Stepper.js'
import { MAX_PLAYERS, counterId, newAreaSpot, newPileSpot, pasteSpot, titleOfRow, type Counter, type Geometry, type Setup, type Zone } from '@byd/server/doc'
import type { ProjectClient } from './ProjectClient.js'
import type { ZonePatch } from '@byd/server/doc'
import { useT, type Key, type T } from '../i18n/index.js'
import { Help } from './HelpDrawer.js'
import { recipeWords } from './fields.js'
import { useGesture } from './gesture.js'
import { CardPreview } from './CardPreview.js'
import { ZoneActions } from './ZoneActions.js'
import { nameOf, templateOf } from './zone-name.js'
import { landingOf } from './landing.js'
import { CARD_MM } from '../table/drop.js'
import { previewIcons } from './assets.js'
import { previewFonts } from './fonts.js'
import { FootSaid } from './said.js'

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

export function SetupEditor({ doc, client, assetBase, motifs, beside }: SetupEditorProps) {
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
    const one = target.closest('[data-zone-row], [data-zone-handle]')
    const id = one?.getAttribute('data-zone-row') ?? one?.getAttribute('data-zone-handle')
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
        <SeatsPanel client={client} setup={setup} />
        <ZoneList
          setup={setup}
          rows={doc.rows}
          selected={selected}
          opened={opened}
          onSelect={select}
          onOpen={(role) => setOpened((now) => (now.includes(role) ? now.filter((r) => r !== role) : [...now, role]))}
          onRemove={remove}
          onPatch={(id, patch, gesture) => client.patchZone(id, patch, gesture)}
          onDeck={(id) => client.setDeck(id)}
          onHold={setHeld}
          adds={{
            table: (
              <>
                <button type="button" onClick={() => add('area')}>{t('setup.addArea')}</button>
                <button type="button" onClick={() => add('pile')}>{t('setup.addPile')}</button>
              </>
            ),
            seats: (
              <>
                {/* The heading says «per seat»; the name read out says it whole. */}
                <button type="button" aria-label={t('setup.addSeatArea')} onClick={() => addSeat('mine')}>
                  {t('setup.addSeatArea.short')}
                </button>
                <button type="button" aria-label={t('setup.addSeatCounters')} onClick={() => addSeat('counters')}>
                  {t('setup.addSeatCounters.short')}
                </button>
              </>
            ),
          }}
        />
      </div>
      <div className="byd-setup-canvas">
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
          {/* Hjälptexten viker undan när fälten står i raden (#710, L50): den säger hur en zon dras,
              och det är det fälten redan visar, medan dess bredd var den som bröt fälten till en
              andra rad och flyttade filten under handen. Frågetecknet står kvar. */}
          {client.mayEdit && !(selectedZone && selectedZone.id !== setup.floor) && <span>{t('setup.hint')}</span>}
          <Help topic={t('setup.help.topic')}>
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
                ▸
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

// Why a zone cannot be taken away, in the words that say what to do instead — or nothing at all,
// which means it can go. One rule, read by the list, by the felt's Delete and by the actor, so the
// three never disagree about what the table cannot be without.
function fixed(setup: Setup, zone: Zone, t: T): string | null {
  if (zone.id === setup.floor) return t('setup.fixed.floor')
  if (zone.kind === 'hand') return t('setup.fixed.hand')
  if (zone.id === setup.deckZone) return t('setup.fixed.deck')
  return null
}

// Whether the table is read rather than written (#489): what a zone is stays there to read, and
// nothing in it takes a keystroke.
const Reading = createContext(false)

// The knob the recipe still owns: who sits at the table, and what each seat keeps count of.
function SeatsPanel({ client, setup }: { client: ProjectClient; setup: Setup }) {
  const t = useT()
  const recipe = client.recipe
  // The counters are the only knobs written into a letter at a time; the rest are turned once and
  // are a step back each, as they always were (L14).
  const typing = useGesture('counter-field')
  const turn = (patch: Partial<typeof recipe>, gesture?: string) => client.setRecipe({ ...recipe, ...patch }, recipeWords(t), gesture)
  // A counter is named in the rules by its id (#708), so the id is written down before the name
  // changes: one made before counters had ids is known by its name, and would otherwise lose every
  // rule that names it at the first letter typed.
  const setCounter = (i: number, patch: Partial<Counter>) => turn({ counters: recipe.counters.map((c, j) => (j === i ? { ...c, id: counterId(c), ...patch } : c)) }, typing.token())
  // Counters lie in the seats' counters zones (C4). A game whose seats have none draws no chips,
  // however long the list is, so the panel says so where the list is rather than leaving the
  // designer to wonder why the table looks the same.
  const homeless = recipe.counters.length > 0 && !setup.seats.some((s) => setup.zones.some((z) => z.id === `counters:${s}`))
  return (
    <aside className="byd-setup-recipe">
      <section>
        <div className="byd-help-row">
          <h2 id="byd-setup-players">{t('setup.players')}</h2>
          <Help topic={t('setup.seats.help.topic')}>
            <p>{t('setup.seats.help')}</p>
          </Help>
        </div>
        <div className="byd-setup-players" role="group" aria-labelledby="byd-setup-players">
          {/* Every seat count the table can actually hold. It stopped at six while `MAX_PLAYERS`
              was eight, so the two counts a designer most needed to look at — the ones where an
              edge first carries two seats (K18) — were the two nobody could reach. Since #620 it
              is the guided start's stepper and not eight buttons: one row of three targets where
              eight wrapped onto two, and the section 124 px tall became one about 80. */}
          <Stepper value={recipe.players} min={1} max={MAX_PLAYERS} onChange={(players) => turn({ players })} label={t('players.count', { min: 1, max: MAX_PLAYERS })} fewer={t('players.fewer')} more={t('players.more')} readOnly={!client.mayEdit} />
        </div>
      </section>
      <section>
        <div className="byd-setup-counters">
          {/* A seat's counters change shape at the third one (C4, K18, #89): one or two lie side by
              side along the seat's own rim, where a finger can reach each of them and the table can
              read both at three metres; a third stacks them into one pile, because three targets of
              44 px want more room along the rim than a seat has to give without taking it from its
              neighbour. The designer cannot see that coming from the number, so it is said here,
              where the number is chosen — behind the question mark, since it is an explanation
              and not a cost (L32). */}
          <div className="byd-help-row">
            <h2>{t('setup.counters')}</h2>
            <Help topic={t('setup.counters.help.topic')}>
              <p>{t('setup.counters.help')}</p>
            </Help>
          </div>
          {recipe.counters.map((c, i) => (
            <div key={i} className="byd-setup-counter">
              <input aria-label={t('setup.counter.name', { n: i + 1 })} value={c.name} readOnly={!client.mayEdit} {...typing.visit} onChange={(e) => setCounter(i, { name: e.target.value })} />
              <span>{t('setup.counter.from')}</span>
              <input aria-label={t('setup.counter.start', { n: i + 1 })} type="number" value={c.start} readOnly={!client.mayEdit} {...typing.visit} onChange={(e) => setCounter(i, { start: Math.trunc(Number(e.target.value) || 0) })} />
              <button type="button" aria-label={t('setup.counter.remove', { n: i + 1 })} onClick={() => turn({ counters: recipe.counters.filter((_, j) => j !== i) })}>
                ×
              </button>
            </div>
          ))}
          <button type="button" onClick={() => turn({ counters: [...recipe.counters, newCounter(recipe.counters, t)] })}>
            {t('setup.counter.add')}
          </button>
          {homeless && <p className="byd-setup-note" role="status">{t('setup.counters.homeless')}</p>}
        </div>
      </section>
    </aside>
  )
}

// A new counter: the first is the score, the rest are lives — under a name no counter has yet, the
// way new piles get one (#480). Two «Liv» were two «LIV» on the phone and the TV (#713).
function newCounter(counters: readonly Counter[], t: T): Counter {
  const [base, start] = counters.length === 0 ? [t('counter.score'), 0] : [t('counter.life'), 20]
  const taken = new Set(counters.map((c) => c.name))
  let name = base
  for (let n = 2; taken.has(name); n++) name = `${base} ${n}`
  // And an id no counter has, which the rules name it by however it is renamed later (#708).
  const ids = new Set(counters.map(counterId))
  let id = counterId({ name })
  for (let n = 2; ids.has(id); n++) id = `${counterId({ name })}-${n}`
  return { id, name, start }
}

// Vilken zonfamilj en zon hör till, eller ingen (#175). En zon är per plats när dess id är rollen
// och platsen — `hand:A`, `mine:A`, `counters:A` — och platsen är den som äger zonen. En zon
// designern själv lagt till och gett en ägare heter `yta-3` och hamnar därför aldrig i en familj:
// den är en zon vid en plats, inte samma zon vid var sin.
function familyRole(zone: Zone): string | null {
  if (zone.owner === undefined) return null
  const at = zone.id.lastIndexOf(':')
  if (at <= 0) return null
  return zone.id.slice(at + 1) === zone.owner ? zone.id.slice(0, at) : null
}

// Namnmallen och ordgränsregeln bor i `zone-name.ts`: rutorna i `ZoneActions` ställer samma
// fråga om samma namn (#255), och två kopior av uttrycket är ett fel som väntar.

// En zonfamilj: samma zon vid var sin plats. `first` är den zon som står först i dokumentet — den
// familjen tar sin plats i listan efter, och den raden läser sitt slag och sitt «fast» ur. `differ`
// är de platser vars namn inte följer familjens mall: en upplysning på raden, inte en lista som
// öppnar sig själv.
type Family = { role: string; name: string; first: Zone; zones: Zone[]; differ: Zone[] }
type Row = { kind: 'family'; family: Family } | { kind: 'zone'; zone: Zone }

// Listans rader ur bordets zoner, i dokumentets egen ordning: en familj tar den plats dess första
// zon hade. Listan grupperar; modellen aldrig — filten ritar var och en av dem för sig.
function rowsOf(zones: Zone[]): Row[] {
  const rows: Row[] = []
  const at = new Map<string, Family>()
  for (const zone of zones) {
    const role = familyRole(zone)
    const family = role === null ? undefined : at.get(role)
    if (family) {
      family.zones.push(zone)
      continue
    }
    if (role === null) {
      rows.push({ kind: 'zone', zone })
      continue
    }
    const made: Family = { role, name: '', first: zone, zones: [zone], differ: [] }
    at.set(role, made)
    rows.push({ kind: 'family', family: made })
  }
  return rows.map((row) => (row.kind === 'family' ? { kind: 'family', family: settle(row.family) } : row))
}

// Vilken mall familjen står för, och vilka platser som avviker från den: den mall flest platser
// delar, och vid lika den som står först i dokumentet.
function settle(family: Family): Family {
  const counts = new Map<string, number>()
  for (const zone of family.zones) {
    const template = templateOf(zone)
    counts.set(template, (counts.get(template) ?? 0) + 1)
  }
  let best = templateOf(family.first)
  for (const [template, n] of counts) if (n > (counts.get(best) ?? 0)) best = template
  return { ...family, name: nameOf(best) || family.first.name, differ: family.zones.filter((zone) => templateOf(zone) !== best) }
}

// Every zone the table has, in two groups: what stands on the table, and what belongs to a seat.
// The row is the handle a keyboard can reach and the only way to a zone that lies under another;
// opening one shows what the zone is, and the × takes it away — or says, where the × would be, why
// this one stays.
//
// Each group carries the ways to add to it under its heading (#711, beställarens beslut B): they
// stood last in the column, and at 1024 × 640 none of them showed without scrolling it. Under the
// heading they say what they add to, and a group is drawn for them even when it holds no zone.
//
// Vid platserna är raden familjens och inte zonens (#175): «Hand · 8 platser» är en rad, inte åtta,
// och trekanten fäller ut platserna när en enskild zon ska nås.
function ZoneList({
  setup,
  rows: deck,
  selected,
  opened,
  onSelect,
  onOpen,
  onRemove,
  onPatch,
  onDeck,
  onHold,
  adds,
}: {
  setup: Setup
  rows: ProjectDoc['rows']
  selected: string | null
  opened: string[]
  onSelect(id: string | null): void
  onOpen(role: string): void
  onRemove(zone: Zone): void
  onPatch(id: string, patch: ZonePatch, gesture?: string): void
  onDeck(id: string): void
  onHold(id: string | null): void
  adds: { table: ReactNode; seats: ReactNode }
}) {
  const t = useT()
  const groups: [string, Row[], ReactNode][] = [
    [t('setup.group.table'), setup.zones.filter((z) => z.owner === undefined).map((zone) => ({ kind: 'zone', zone })), adds.table],
    [t('setup.group.seats'), rowsOf(setup.zones.filter((z) => z.owner !== undefined)), adds.seats],
  ]
  const row = (zone: Zone) => <ZoneRow key={zone.id} zone={zone} setup={setup} rows={deck} selected={selected} onSelect={onSelect} onRemove={onRemove} onPatch={onPatch} onDeck={onDeck} onHold={onHold} />
  return (
    <div className="byd-setup-zones" data-zone-list>
      {groups.map(([title, rows, add]) => (
        <section key={title}>
          <h2>{title}</h2>
          <div className="byd-setup-tools">{add}</div>
          {rows.length > 0 && (
            <ul aria-label={title}>
              {rows.map((it) =>
                it.kind === 'zone' ? (
                  row(it.zone)
                ) : (
                  <FamilyRow key={it.family.role} family={it.family} setup={setup} open={opened.includes(it.family.role)} onOpen={() => onOpen(it.family.role)}>
                    {it.family.zones.map(row)}
                  </FamilyRow>
                ),
              )}
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}

// En familjs rad: vad zonen är, hur många platser som har den, och — när platserna inte är lika —
// att de inte är det. Raden fäller aldrig ut sig själv: en lista som ändrar form utan att någon
// rört den är svår att lita på, och avvikelsen är en upplysning innan den är ett ärende.
function FamilyRow({ family, setup, open, onOpen, children }: { family: Family; setup: Setup; open: boolean; onOpen(): void; children: ReactNode }) {
  const t = useT()
  const n = family.zones.length
  const seats = setup.seats.length
  const why = fixed(setup, family.first, t)
  const whyId = useId()
  const allFixed = why !== null && family.zones.every((zone) => fixed(setup, zone, t) !== null)
  return (
    <li data-zone-family={family.role} data-open={open ? 'true' : undefined}>
      <div className="byd-setup-row">
        <button type="button" className="byd-setup-name" aria-expanded={open} onClick={onOpen} {...(allFixed ? { 'aria-describedby': whyId } : {})}>
          <i className="byd-setup-caret" aria-hidden="true" />
          <i aria-hidden="true" data-kind={family.first.kind} />
          {/* Mellanrummen är läsordningen och inte layouten: raden är en flexrad, som inte ritar
              tomrum, men namnet den läses upp med sätts ihop av texten i knappen — utan dem säger
              skärmläsaren «Framför8 platser». */}
          <span>{family.name}</span>{' '}
          <em>{n === seats ? t(n === 1 ? 'setup.family.seats.one' : 'setup.family.seats.other', { n }) : t('setup.family.some', { n, of: seats })}</em>
          {family.differ.length > 0 && <> <em data-differ="true">{t('setup.family.differ', { n: family.differ.length })}</em></>}
        </button>
        {allFixed && (
          <>
            <span className="byd-setup-fast" title={why}>
              {t('setup.fixed')}
            </span>
            {/* Why it stays, said to the keyboard as the row's description (#558): a title is
                reached by a pointer alone, and an aria-label on a span with no role by nothing. */}
            <span id={whyId} className="byd-offscreen">
              {why}
            </span>
          </>
        )}
      </div>
      {open && <ul aria-label={family.name}>{children}</ul>}
    </li>
  )
}

// En enskild zons rad, i listan eller i en utfälld familj: namnet, vems den är, och × som tar bort
// den — eller, där × skulle stått, varför just den står kvar.
function ZoneRow({
  zone,
  setup,
  rows,
  selected,
  onSelect,
  onRemove,
  onPatch,
  onDeck,
  onHold,
}: {
  zone: Zone
  setup: Setup
  rows: ProjectDoc['rows']
  selected: string | null
  onSelect(id: string | null): void
  onRemove(zone: Zone): void
  onPatch(id: string, patch: ZonePatch, gesture?: string): void
  onDeck(id: string): void
  onHold(id: string | null): void
}) {
  const t = useT()
  const reading = useContext(Reading)
  const why = fixed(setup, zone, t)
  const whyId = useId()
  const open = selected === zone.id
  const deck = setup.deckZone === zone.id
  return (
    <li data-zone-row={zone.id} data-open={open ? 'true' : undefined}>
      <div className="byd-setup-row">
        <button type="button" className="byd-setup-name" aria-expanded={open} onClick={() => onSelect(open ? null : zone.id)} {...(why !== null ? { 'aria-describedby': whyId } : {})}>
          <i aria-hidden="true" data-kind={zone.kind} />
          <span>{zone.name}</span>
          {zone.owner !== undefined && <> <em>{zone.owner}</em></>}
          {deck && <> <strong>{t('setup.deck.mark')}</strong></>}
        </button>
        {why === null ? (
          <button type="button" className="byd-setup-x" aria-label={t('setup.remove.of', { name: zone.name })} onClick={() => onRemove(zone)}>
            ×
          </button>
        ) : (
          <>
            <span className="byd-setup-fast" title={why}>
              {t('setup.fixed')}
            </span>
            <span id={whyId} className="byd-offscreen">
              {why}
            </span>
          </>
        )}
      </div>
      {open &&
        (reading ? (
          // A reader reads the zone's properties and writes none of them (#489).
          <fieldset className="byd-reading-set" disabled>
            <ZoneProps zone={zone} setup={setup} rows={rows} why={why} onPatch={(patch, gesture) => onPatch(zone.id, patch, gesture)} onDeck={() => onDeck(zone.id)} onHold={onHold} />
          </fieldset>
        ) : (
          <ZoneProps zone={zone} setup={setup} rows={rows} why={why} onPatch={(patch, gesture) => onPatch(zone.id, patch, gesture)} onDeck={() => onDeck(zone.id)} onHold={onHold} />
        ))}
    </li>
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
  const overlay = (fit: FeltFit) => (
    <>
      {handles(fit)}
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
      {/* The handles carry no names of their own (K19): the felt underneath already names every
          area and every pile, and `seatNames` asks it for the one name this surface would
          otherwise be missing — whose hand is whose, which the played TV gets from its dock. The
          handle keeps the name in its `aria-label`, so the keyboard and the screen reader lose
          nothing by the name no longer being drawn twice. */}
      <TableRenderer
        ref={table}
        view={view}
        mode="tv"
        lit={lit}
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

// What a zone is, opened inside its row. Everything about it is the designer's — its name, its
// verb on the phone, whose it is and who sees into it — because the table is theirs; a hand is the
// exception, and the seat that owns it is the reason.
function ZoneProps({ zone, setup, rows, why, onPatch, onDeck, onHold }: { zone: Zone; setup: Setup; rows: ProjectDoc['rows']; why: string | null; onPatch(patch: ZonePatch, gesture?: string): void; onDeck(): void; onHold(id: string | null): void }) {
  const t = useT()
  // The two fields that are written into a letter at a time. What is chosen rather than typed —
  // where a pile is entered, whose the zone is, who may see it — is written once and is its own
  // step back, as it always was (L14).
  const typing = useGesture('zone-field')
  const floor = zone.id === setup.floor
  const hand = zone.kind === 'hand'
  const g = zone.geometry
  // Whether this pile's chosen side lays its cards off the table (L30): the felt shows the
  // outline in amber for as long as the pile is selected, and the panel says what to do about it.
  const ground = setup.zones.find((z) => z.id === setup.floor)
  const offTable = zone.kind === 'pile' && ground !== undefined && landingOf(zone, ground.geometry).off
  return (
    <div className="byd-setup-props" data-zone-props={zone.id}>
      {/* A hand has no name of its own to give. Whoever sits at it names it: the felt lays that
          seat's name card on the hand (K9, K19) and the keyboard's list of places offers it under
          the same name, so a name typed here was a string no surface ever drew — it lived in this
          field and in an `aria-label`, and nowhere else. The field is gone and the reason stands
          in its place, because a hole explains nothing (L4). */}
      {hand ? (
        <p className="byd-setup-hint">{t('setup.name.seat')}</p>
      ) : (
        <label>
          {t('setup.name')}
          <input aria-label={t('setup.name.of', { name: zone.name })} value={zone.name} {...typing.visit} onChange={(e) => onPatch({ name: e.target.value }, typing.token())} />
        </label>
      )}
      {!floor && !hand && (
        <label>
          {t('setup.shortcut')}
          <input aria-label={t('setup.shortcut.of', { name: zone.name })} placeholder={zone.name} value={zone.shortcut?.label ?? ''} {...typing.visit} onChange={(e) => onPatch({ shortcut: e.target.value ? { label: e.target.value, at: zone.shortcut?.at ?? 'top' } : undefined }, typing.token())} />
        </label>
      )}
      {zone.kind === 'pile' && (
        <>
          <label>
            {t('setup.at')}
            <select aria-label={t('setup.at.of', { name: zone.name })} value={zone.shortcut?.at ?? 'top'} onChange={(e) => onPatch({ shortcut: { label: zone.shortcut?.label ?? zone.name, at: e.target.value === 'bottom' ? 'bottom' : 'top' } })}>
              <option value="top">{t('setup.at.top')}</option>
              <option value="bottom">{t('setup.at.bottom')}</option>
            </select>
          </label>
          {/* Which side of this pile is "beside it" (K21): where Dra 1, Dela på hälften and every
              action that lays cards beside the pile put them, in the pile's own rotation. Left is
              what a pile that says nothing has always meant (#87), so it is the value the list
              opens on rather than a blank. */}
          <label>
            {t('setup.beside')}
            <select
              aria-label={t('setup.beside.of', { name: zone.name })}
              value={zone.beside ?? 'left'}
              onChange={(e) => onPatch({ beside: e.target.value === 'left' ? undefined : (e.target.value as ZoneBeside) })}
              // While the picker is held the felt shows where the cards land (L30): hovered or
              // focused, so the keyboard gets the same as the mouse.
              onMouseEnter={() => onHold(zone.id)}
              onMouseLeave={() => onHold(null)}
              onFocus={() => onHold(zone.id)}
              onBlur={() => onHold(null)}
            >
              {(['left', 'right', 'above', 'below'] as const).map((side) => (
                <option key={side} value={side}>
                  {t(`setup.beside.${side}` as Key)}
                </option>
              ))}
            </select>
          </label>
          {offTable && (
            <p className="byd-setup-landing-warn" data-landing-warn>
              {t('setup.landing.warn', { name: zone.name })}
            </p>
          )}
          {/* The pile's bottom card (K23, variant A): one specific row of the deck, named here by
              the title the designer gave it, and the side it lies on. It lies last from the start,
              a shuffle leaves it there, and back in this pile it lies last again. A pile without one
              has no side to choose, so the second list only stands once a card is named. */}
          <label>
            {t('setup.bottom')}
            <select aria-label={t('setup.bottom.of', { name: zone.name })} value={zone.bottom?.cardRef ?? ''} onChange={(e) => onPatch({ bottom: e.target.value ? { cardRef: e.target.value, face: zone.bottom?.face ?? 'back' } : undefined })}>
              <option value="">{t('setup.bottom.none')}</option>
              {/* A title that repeats says which row of Tabell it is (#480, K23): four «Duel» in
                  the list could not be told apart, and the bottom card is one specific row. */}
              {rows.map((r, i) => {
                const title = titleOfRow(r)
                const twin = rows.some((o) => o.id !== r.id && titleOfRow(o) === title)
                return (
                  <option key={r.id} value={r.id}>
                    {twin ? t('setup.bottom.row', { title, n: i + 1 }) : title}
                  </option>
                )
              })}
            </select>
          </label>
          {zone.bottom !== undefined && (
            <label>
              {t('setup.bottom.face')}
              <select aria-label={t('setup.bottom.face.of', { name: zone.name })} value={zone.bottom.face} onChange={(e) => onPatch({ bottom: { cardRef: zone.bottom?.cardRef ?? '', face: e.target.value === 'front' ? 'front' : 'back' } })}>
                <option value="front">{t('setup.bottom.front')}</option>
                <option value="back">{t('setup.bottom.back')}</option>
              </select>
            </label>
          )}
          {/* The deck is a role a pile carries (B5, K10): a designer may call any pile the deck,
              and the cards are dealt from wherever the role is. Moving it is also the only way to
              be rid of the pile it lies in. */}
          {setup.deckZone === zone.id ? (
            <p className="byd-setup-hint">{t('setup.deck.here')}</p>
          ) : (
            <button type="button" onClick={onDeck}>
              {t('setup.deck.move', { name: zone.name })}
            </button>
          )}
        </>
      )}
      {!hand && (
        <>
          <label>
            {t('setup.owner')}
            <select aria-label={t('setup.owner.of', { name: zone.name })} value={zone.owner ?? ''} onChange={(e) => onPatch({ owner: e.target.value || undefined })}>
              <option value="">{t('setup.owner.none')}</option>
              {setup.seats.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('setup.visibility')}
            <select aria-label={t('setup.visibility.of', { name: zone.name })} value={zone.visibility} onChange={(e) => onPatch({ visibility: e.target.value === 'owner' ? 'owner' : e.target.value === 'none' ? 'none' : 'all' })}>
              <option value="all">{t('setup.visible.all')}</option>
              <option value="owner">{t('setup.visible.owner')}</option>
              <option value="none">{t('setup.visible.none')}</option>
            </select>
          </label>
        </>
      )}
      <span className="byd-setup-where" data-zone-where>
        {Math.round(g.x)}, {Math.round(g.y)}
        {zone.kind !== 'pile' ? ` · ${Math.round(g.w)} × ${Math.round(g.h)} mm` : ' mm'}
      </span>
      {why !== null && <p className="byd-setup-why">{why}</p>}
    </div>
  )
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
