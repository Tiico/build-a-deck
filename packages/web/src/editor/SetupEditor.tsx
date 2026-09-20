import { useEffect, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import type { ProjectDoc } from '@byd/server'
import type { Motif } from '@byd/template'
import type { ZoneBeside } from '@byd/protocol'
import { targetsOf } from '../player/PlaySheet.js'
import { TableRenderer, type FeltFit, type TableHandle } from '../table/TableRenderer.js'
import { previewOf } from '../setup/preview.js'
import { MAX_PLAYERS, type Counter, type Geometry, type Setup, type Zone } from '@byd/server/doc'
import type { ProjectClient } from './ProjectClient.js'
import type { ZonePatch } from '@byd/server/doc'
import { useT, type Key, type T } from '../i18n/index.js'
import { recipeWords } from './fields.js'
import { useGesture } from './gesture.js'
import { CardPreview } from './CardPreview.js'
import { ZoneActions } from './ZoneActions.js'
import { nameOf, templateOf } from './zone-name.js'
import { previewIcons } from './assets.js'
import { previewFonts } from './fonts.js'

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

const PILE_MM = { w: 63, h: 88 }
// What one CSS millimetre is worth in pixels. A compiled card is laid out in millimetres, the
// felt in pixels, and this is the rate between them — so the zoom that makes the back the size of
// the card it lies on is the felt's own millimetre divided by this one.
const CSS_MM_PX = 96 / 25.4
const SNAP_MM = 5
// How far a pasted copy lands from the zone it was copied from, in table millimetres. A copy that
// lay exactly on the original could not be pointed at, and the list would show two rows that
// looked the same for two things in the same place.
const BESIDE_MM = 10

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
const NUDGE_MM = 10
const MIN_MM = 40

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
  // What the last key press said, when it was not a removal: a copy taken, or a refusal with its
  // reason. It stands where the removal's own word stands, because it is the same kind of news.
  const [said, setSaid] = useState<string | null>(null)
  // The editor's own clipboard, and what the key handler needs to read without being rebuilt on
  // every keystroke the panel beside it takes.
  const clipboard = useRef<Zone | null>(null)
  const view = previewOf(doc)
  const selectedZone = setup.zones.find((z) => z.id === selected)
  // Att välja en zon markerar dess rad, och den raden måste finnas: hör zonen till en familj fälls
  // familjen ut. En hopfälld familj som markeras vore en markering ingen ser.
  const select = (id: string | null) => {
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
  // Fokus går till raden i listan och aldrig till handtaget på filten: handtaget väljer zonen
  // redan när det får fokus, så vägen ut hade lett rakt in igen. Raden finns kvar att peka ut —
  // den ritas vare sig zonen är markerad eller inte, och `select` har redan fällt ut familjen den
  // ligger i — så den läses ur DOM:en på samma sätt som regelpanelen läser sin (#152).
  const close = (zone: Zone) => {
    select(null)
    document.querySelector<HTMLElement>(`[data-zone-row="${zone.id}"] .byd-setup-name`)?.focus()
  }
  const remove = (zone: Zone) => {
    client.removeZone(zone.id)
    setUndoable(zone.name)
    setSaid(null)
    if (selected === zone.id) setSelected(null)
  }
  const keys = useRef({ selected, setup, client, remove, t })
  keys.current = { selected, setup, client, remove, t }
  const add = (kind: 'area' | 'pile') => {
    setSelected(client.addZone(kind, t))
    setUndoable(null)
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
        const geometry = { ...held.geometry, x: held.geometry.x + held.geometry.w + BESIDE_MM }
        setSelected(now.client.insertZone({ ...held, name: now.t('zone.copy', { name: held.name }), geometry }))
        setSaid(null)
        return
      }
      const zone = now.setup.zones.find((z) => z.id === now.selected)
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
        clipboard.current = zone
        now.remove(zone)
        return
      }
      clipboard.current = zone
      setSaid(now.t('setup.copied', { name: zone.name }))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <div className="byd-setup" data-setup-editor>
      <div className="byd-setup-side">
        <SeatsPanel client={client} setup={setup} />
        <ZoneList
          setup={setup}
          selected={selected}
          opened={opened}
          onSelect={select}
          onOpen={(role) => setOpened((now) => (now.includes(role) ? now.filter((r) => r !== role) : [...now, role]))}
          onRemove={remove}
          onPatch={(id, patch, gesture) => client.patchZone(id, patch, gesture)}
          onDeck={(id) => client.setDeck(id)}
        />
        <div className="byd-setup-tools">
          <button type="button" onClick={() => add('area')}>{t('setup.addArea')}</button>
          <button type="button" onClick={() => add('pile')}>{t('setup.addPile')}</button>
          <button type="button" onClick={() => client.addSeatZone('mine', t)}>{t('setup.addSeatArea')}</button>
          <button type="button" onClick={() => client.addSeatZone('counters', t)}>{t('setup.addSeatCounters')}</button>
        </div>
      </div>
      <div className="byd-setup-canvas">
        <div className="byd-setup-said" data-setup-said>
          {undoable && (
            <span className="byd-setup-undo" role="status">
              {t('setup.removed', { name: undoable })}
              <button
                type="button"
                onClick={() => {
                  client.undo()
                  setUndoable(null)
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
          <span>{t('setup.hint')}</span>
        </div>
        {view ? (
          <Felt
            view={view}
            doc={doc}
            assetBase={assetBase}
            motifs={motifs}
            setup={setup}
            selected={selected}
            onSelect={(id) => {
              select(id)
              setUndoable(null)
            }}
            onGeometry={(id, geometry, gesture) => client.patchZone(id, { geometry }, gesture)}
            onRemove={remove}
          />
        ) : (
          <p role="alert" className="byd-setup-invalid">{t('setup.invalid')}</p>
        )}
        {/* What the selected pile starts with and what it can be asked for (B5, K14), written as
            sentences. Only a pile: an area and a hand have no ring to hang an action in, and a
            hand's contents are the seat's and not the designer's (C3). */}
        {selectedZone?.kind === 'pile' && (
          <ZoneActions doc={doc} zone={selectedZone} onPatch={(patch, gesture) => client.patchZone(selectedZone.id, patch, gesture)} onClose={() => close(selectedZone)} />
        )}
      </div>
      {/* The third column: what a player is given, and the tables the game is running at. Both
          were under the felt before, a screenful down, where the designer had to leave the setup
          to reach them (#126). */}
      <div className="byd-setup-beside">
        {view && <SheetPreview view={view} seat={setup.seats[0] ?? null} />}
        {beside}
      </div>
    </div>
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

// The knob the recipe still owns: who sits at the table, and what each seat keeps count of.
function SeatsPanel({ client, setup }: { client: ProjectClient; setup: Setup }) {
  const t = useT()
  const recipe = client.recipe
  // The counters are the only knobs written into a letter at a time; the rest are turned once and
  // are a step back each, as they always were (L14).
  const typing = useGesture('counter-field')
  const turn = (patch: Partial<typeof recipe>, gesture?: string) => client.setRecipe({ ...recipe, ...patch }, recipeWords(t), gesture)
  const setCounter = (i: number, patch: Partial<Counter>) => turn({ counters: recipe.counters.map((c, j) => (j === i ? { ...c, ...patch } : c)) }, typing.token())
  // Counters lie in the seats' counters zones (C4). A game whose seats have none draws no chips,
  // however long the list is, so the panel says so where the list is rather than leaving the
  // designer to wonder why the table looks the same.
  const homeless = recipe.counters.length > 0 && !setup.seats.some((s) => setup.zones.some((z) => z.id === `counters:${s}`))
  return (
    <aside className="byd-setup-recipe">
      <section>
        <h2 id="byd-setup-players">{t('setup.players')}</h2>
        <div className="byd-setup-players" role="group" aria-labelledby="byd-setup-players">
          {/* Every seat count the table can actually hold. It stopped at six while `MAX_PLAYERS`
              was eight, so the two counts a designer most needed to look at — the ones where an
              edge first carries two seats (K18) — were the two nobody could reach. */}
          {Array.from({ length: MAX_PLAYERS }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" className="byd-choice" aria-pressed={recipe.players === n} onClick={() => turn({ players: n })}>
              {n}
            </button>
          ))}
        </div>
        <p className="byd-setup-hint">{t('setup.seats.hint')}</p>
      </section>
      <section>
        <div className="byd-setup-counters">
          <h2>{t('setup.counters')}</h2>
          {recipe.counters.map((c, i) => (
            <div key={i} className="byd-setup-counter">
              <input aria-label={t('setup.counter.name', { n: i + 1 })} value={c.name} {...typing.visit} onChange={(e) => setCounter(i, { name: e.target.value })} />
              <span>{t('setup.counter.from')}</span>
              <input aria-label={t('setup.counter.start', { n: i + 1 })} type="number" value={c.start} {...typing.visit} onChange={(e) => setCounter(i, { start: Math.trunc(Number(e.target.value) || 0) })} />
              <button type="button" aria-label={t('setup.counter.remove', { n: i + 1 })} onClick={() => turn({ counters: recipe.counters.filter((_, j) => j !== i) })}>
                ×
              </button>
            </div>
          ))}
          <button type="button" onClick={() => turn({ counters: [...recipe.counters, recipe.counters.length === 0 ? { name: t('counter.score'), start: 0 } : { name: t('counter.life'), start: 20 }] })}>
            {t('setup.counter.add')}
          </button>
          {homeless && <p className="byd-setup-note" role="status">{t('setup.counters.homeless')}</p>}
          {/* A seat's counters change shape at the third one (C4, K18, #89): one or two lie side by
              side along the seat's own rim, where a finger can reach each of them and the table can
              read both at three metres; a third stacks them into one pile, because three targets of
              44 px want more room along the rim than a seat has to give without taking it from its
              neighbour. The designer cannot see that coming from the number, so it is said here,
              where the number is chosen, and before the third counter has been added. */}
          <p className="byd-setup-note">{t('setup.counter.stacks')}</p>
        </div>
      </section>
    </aside>
  )
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
// Vid platserna är raden familjens och inte zonens (#175): «Hand · 8 platser» är en rad, inte åtta,
// och trekanten fäller ut platserna när en enskild zon ska nås.
function ZoneList({
  setup,
  selected,
  opened,
  onSelect,
  onOpen,
  onRemove,
  onPatch,
  onDeck,
}: {
  setup: Setup
  selected: string | null
  opened: string[]
  onSelect(id: string | null): void
  onOpen(role: string): void
  onRemove(zone: Zone): void
  onPatch(id: string, patch: ZonePatch, gesture?: string): void
  onDeck(id: string): void
}) {
  const t = useT()
  const groups: [string, Row[]][] = [
    [t('setup.group.table'), setup.zones.filter((z) => z.owner === undefined).map((zone) => ({ kind: 'zone', zone }))],
    [t('setup.group.seats'), rowsOf(setup.zones.filter((z) => z.owner !== undefined))],
  ]
  const row = (zone: Zone) => <ZoneRow key={zone.id} zone={zone} setup={setup} selected={selected} onSelect={onSelect} onRemove={onRemove} onPatch={onPatch} onDeck={onDeck} />
  return (
    <div className="byd-setup-zones" data-zone-list>
      {groups.map(([title, rows]) =>
        rows.length === 0 ? null : (
          <section key={title}>
            <h2>{title}</h2>
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
          </section>
        ),
      )}
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
  const allFixed = why !== null && family.zones.every((zone) => fixed(setup, zone, t) !== null)
  return (
    <li data-zone-family={family.role} data-open={open ? 'true' : undefined}>
      <div className="byd-setup-row">
        <button type="button" className="byd-setup-name" aria-expanded={open} onClick={onOpen}>
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
          <span className="byd-setup-fast" title={why} aria-label={why}>
            {t('setup.fixed')}
          </span>
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
  selected,
  onSelect,
  onRemove,
  onPatch,
  onDeck,
}: {
  zone: Zone
  setup: Setup
  selected: string | null
  onSelect(id: string | null): void
  onRemove(zone: Zone): void
  onPatch(id: string, patch: ZonePatch, gesture?: string): void
  onDeck(id: string): void
}) {
  const t = useT()
  const why = fixed(setup, zone, t)
  const open = selected === zone.id
  const deck = setup.deckZone === zone.id
  return (
    <li data-zone-row={zone.id} data-open={open ? 'true' : undefined}>
      <div className="byd-setup-row">
        <button type="button" className="byd-setup-name" aria-expanded={open} onClick={() => onSelect(open ? null : zone.id)}>
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
          <span className="byd-setup-fast" title={why} aria-label={why}>
            {t('setup.fixed')}
          </span>
        )}
      </div>
      {open && <ZoneProps zone={zone} setup={setup} why={why} onPatch={(patch, gesture) => onPatch(zone.id, patch, gesture)} onDeck={() => onDeck(zone.id)} />}
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
  onSelect(id: string | null): void
  onGeometry(id: string, geometry: Geometry, gesture?: string): void
  onRemove(zone: Zone): void
}) {
  const t = useT()
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
  const grabs = useGesture('zone')
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
    onGeometry(d.id, d.mode === 'move' ? { ...g, x: g.x + dx, y: g.y + dy } : { ...g, w: Math.max(MIN_MM, g.w + dx), h: Math.max(MIN_MM, g.h + dy) }, d.gesture)
  }
  const up = () => {
    drag.current = null
  }
  const nudge = (e: RKeyboardEvent, z: Zone) => {
    const step = e.shiftKey ? NUDGE_MM * 5 : NUDGE_MM
    const d = e.key === 'ArrowLeft' ? { x: -step, y: 0 } : e.key === 'ArrowRight' ? { x: step, y: 0 } : e.key === 'ArrowUp' ? { x: 0, y: -step } : e.key === 'ArrowDown' ? { x: 0, y: step } : null
    if (!d) return
    e.preventDefault()
    onGeometry(z.id, { ...z.geometry, x: z.geometry.x + d.x, y: z.geometry.y + d.y })
  }
  // Delete is bound to the window and not to the handle, because a handle never has the focus: the
  // pointer that selects it is the pointer that starts a drag, and the drag takes the default
  // action — focus among it — away. Bound where the focus actually is, a field being typed in is
  // the one place the key means something else.
  const state = useRef({ selected, setup, onRemove })
  state.current = { selected, setup, onRemove }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (inAField(e)) return
      const now = state.current
      const zone = now.setup.zones.find((z) => z.id === now.selected)
      if (!zone || fixed(now.setup, zone, t) !== null) return
      e.preventDefault()
      now.onRemove(zone)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [t])
  const overlay = (fit: FeltFit) =>
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
            onFocus={() => onSelect(z.id)}
          >
            {z.kind !== 'pile' && <i className="byd-setup-corner" data-resize={z.id} onPointerDown={(e) => down(e, z, 'resize')} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />}
          </div>
        )
      })
  return (
    <div className="byd-setup-felt">
      {/* The handles carry no names of their own (K19): the felt underneath already names every
          area and every pile, and `seatNames` asks it for the one name this surface would
          otherwise be missing — whose hand is whose, which the played TV gets from its dock. The
          handle keeps the name in its `aria-label`, so the keyboard and the screen reader lose
          nothing by the name no longer being drawn twice. */}
      <TableRenderer
        ref={table}
        view={view}
        mode="tv"
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
  return z.kind === 'pile' ? { x: g.x - PILE_MM.w / 2, y: g.y - PILE_MM.h / 2, w: PILE_MM.w, h: PILE_MM.h } : { x: g.x, y: g.y, w: g.w, h: g.h }
}
const snap = (mm: number) => Math.round(mm / SNAP_MM) * SNAP_MM

// What a zone is, opened inside its row. Everything about it is the designer's — its name, its
// verb on the phone, whose it is and who sees into it — because the table is theirs; a hand is the
// exception, and the seat that owns it is the reason.
function ZoneProps({ zone, setup, why, onPatch, onDeck }: { zone: Zone; setup: Setup; why: string | null; onPatch(patch: ZonePatch, gesture?: string): void; onDeck(): void }) {
  const t = useT()
  // The two fields that are written into a letter at a time. What is chosen rather than typed —
  // where a pile is entered, whose the zone is, who may see it — is written once and is its own
  // step back, as it always was (L14).
  const typing = useGesture('zone-field')
  const floor = zone.id === setup.floor
  const hand = zone.kind === 'hand'
  const g = zone.geometry
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
            <select aria-label={t('setup.beside.of', { name: zone.name })} value={zone.beside ?? 'left'} onChange={(e) => onPatch({ beside: e.target.value === 'left' ? undefined : (e.target.value as ZoneBeside) })}>
              {(['left', 'right', 'above', 'below'] as const).map((side) => (
                <option key={side} value={side}>
                  {t(`setup.beside.${side}` as Key)}
                </option>
              ))}
            </select>
          </label>
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
function SheetPreview({ view, seat }: { view: NonNullable<ReturnType<typeof previewOf>>; seat: string | null }) {
  const t = useT()
  const preview = targetsOf({ ...view, seat }, t)
  return (
    <div className="byd-zones-preview" data-sheet-preview>
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
