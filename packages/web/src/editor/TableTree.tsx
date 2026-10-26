import { useContext, useEffect, useId, useRef, useState, type KeyboardEvent as RKeyboardEvent, type ReactNode } from 'react'
import type { ProjectDoc } from '@byd/server'
import type { ZoneBeside } from '@byd/protocol'
import { titleOfRow, type SeatRole, type Setup, type Zone, type ZonePatch } from '@byd/server/doc'
import { useT, type Key } from '../i18n/index.js'
import { ChevronGlyph, CloseGlyph } from '../glyphs.js'
import { Help } from './HelpDrawer.js'
import { useGesture } from './gesture.js'
import { landingOf } from './landing.js'
import { Reading, fixed, rowsOf, type Family } from './setup-rows.js'

// The table as a tree (#1403, beställarens beslut C): the list in Bord's column mirrors the felt,
// where everything lies in something. The floor is the root of what stands on the table — the
// piles, the areas — and «Varje plats» gathers what every seat has, one row per family and not
// one per seat (#175). A row whose zone can hold something carries a ＋, and the menu behind it
// says what can be laid *just there*, so a new kind of thing is a line in a menu and never a panel
// of its own in the column.
//
// The row is the handle a keyboard can reach and the only way to a zone that lies under another;
// opening one shows what the zone is, and the × takes it away — or says, where the × would be, why
// this one stays.
export type AddWhat = { kind: 'area' | 'pile' } | { kind: 'seat'; role: SeatRole } | { kind: 'die'; place: string } | { kind: 'counter'; role: string | undefined }
type AddItem = { label: string; pick(): void }

export function TableTree({
  setup,
  rows: deck,
  selected,
  opened,
  onSelect,
  onOpen,
  onRemove,
  onPatch,
  onHold,
  onAdd,
}: {
  setup: Setup
  rows: ProjectDoc['rows']
  selected: string | null
  opened: string[]
  onSelect(id: string | null): void
  onOpen(role: string): void
  onRemove(zone: Zone): void
  onPatch(id: string, patch: ZonePatch, gesture?: string): void
  onHold(id: string | null): void
  onAdd(what: AddWhat): void
}) {
  const t = useT()
  const floor = setup.zones.find((z) => z.id === setup.floor)
  const onTable = setup.zones.filter((z) => z.owner === undefined && z.id !== setup.floor)
  const atSeats = rowsOf(setup.zones.filter((z) => z.owner !== undefined))
  // An area every seat has is where a seat's die or counter can lie (K31): «Framför» first, since
  // it is the one the recipe lays and the one a designer means by «at the seats».
  const areaFamilies = atSeats.flatMap((row) => (row.kind === 'family' && row.family.first.kind === 'area' ? [row.family] : []))
  const seatArea = areaFamilies.find((f) => f.role === 'mine') ?? areaFamilies[0]
  const seats = setup.seats.length
  const zoneRow = (zone: Zone, add?: AddItem[]) => <ZoneRow key={zone.id} zone={zone} setup={setup} rows={deck} selected={selected} add={add} onSelect={onSelect} onRemove={onRemove} onPatch={onPatch} onHold={onHold} />
  const dieIn = (place: string): AddItem => ({ label: t('setup.die.add'), pick: () => onAdd({ kind: 'die', place }) })
  const floorAdds: AddItem[] = [
    { label: t('setup.addArea'), pick: () => onAdd({ kind: 'area' }) },
    { label: t('setup.addPile'), pick: () => onAdd({ kind: 'pile' }) },
    ...(floor ? [dieIn(`zone:${floor.id}`)] : []),
  ]
  const seatAdds: AddItem[] = [
    { label: t('setup.addSeatArea'), pick: () => onAdd({ kind: 'seat', role: 'mine' }) },
    { label: t('setup.addSeatCounters'), pick: () => onAdd({ kind: 'seat', role: 'counters' }) },
    { label: t('setup.counter.add'), pick: () => onAdd({ kind: 'counter', role: undefined }) },
    ...(seatArea ? [dieIn(`role:${seatArea.role}`)] : []),
  ]
  // A counter lies in the seats' counters zone unless the designer put it in another area each
  // seat has (K31): in the counters family it is a counter with no role to say.
  const familyAdds = (family: Family): AddItem[] | undefined =>
    family.first.kind === 'area' ? [dieIn(`role:${family.role}`), { label: t('setup.counter.add'), pick: () => onAdd({ kind: 'counter', role: family.role === 'counters' ? undefined : family.role }) }] : undefined
  const seatsAdd = useAddMenu(t('setup.seats.node'), seatAdds)
  return (
    <section className="byd-setup-zones" data-zone-list>
      <div className="byd-help-row">
        <h2 id="byd-setup-tree">{t('setup.tree')}</h2>
        <Help topic={t('setup.tree.help.topic')}>
          <p>{t('setup.tree.help')}</p>
          <p>{t('setup.dice.help')}</p>
          <p>{t('setup.counters.help')}</p>
        </Help>
      </div>
      <ul aria-labelledby="byd-setup-tree">
        {floor &&
          zoneRowWith(zoneRow, floor, floorAdds, <ul aria-label={floor.name}>{onTable.map((zone) => zoneRow(zone, zone.kind === 'area' ? [dieIn(`zone:${zone.id}`)] : undefined))}</ul>)}
        <li data-seats-root>
          <div className="byd-setup-row">
            <span className="byd-setup-name">
              <i aria-hidden="true" data-kind="hand" />
              <span>{t('setup.seats.node')}</span> <em>{t(seats === 1 ? 'setup.family.seats.one' : 'setup.family.seats.other', { n: seats })}</em>
            </span>
            {seatsAdd.button}
          </div>
          {seatsAdd.list}
          <ul aria-label={t('setup.seats.node')}>
            {atSeats.map((it) =>
              it.kind === 'zone' ? (
                zoneRow(it.zone)
              ) : (
                <FamilyRow key={it.family.role} family={it.family} setup={setup} open={opened.includes(it.family.role)} add={familyAdds(it.family)} onOpen={() => onOpen(it.family.role)}>
                  {it.family.zones.map((zone) => zoneRow(zone))}
                </FamilyRow>
              ),
            )}
          </ul>
        </li>
      </ul>
    </section>
  )
}

// The floor's row, with what lies on it under it: `ZoneRow` takes its children as the nested list.
function zoneRowWith(zoneRow: (zone: Zone, add?: AddItem[]) => ReactNode, floor: Zone, add: AddItem[], children: ReactNode): ReactNode {
  const row = zoneRow(floor, add) as React.ReactElement<{ children?: ReactNode }>
  return { ...row, props: { ...row.props, children } }
}

// The ＋ on a row and the menu behind it, as two pieces for the row to place: the button in its
// line, the list of what can be laid here under it, in the flow of the column rather than floating
// over it — the column scrolls, and a floating menu near its foot would be cut by its edge.
// A reader has no ＋: she reads the table and lays nothing on it (#489).
function useAddMenu(name: string, items: AddItem[] | undefined): { button: ReactNode; list: ReactNode } {
  const t = useT()
  const reading = useContext(Reading)
  const [open, setOpen] = useState(false)
  const id = useId()
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const away = (e: PointerEvent) => {
      const at = e.target instanceof Node ? e.target : null
      if (at && (menu.current?.contains(at) || button.current?.contains(at))) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', away, true)
    return () => document.removeEventListener('pointerdown', away, true)
  }, [open])
  if (reading || !items || items.length === 0) return { button: null, list: null }
  const label = t('setup.add.to', { name })
  const close = () => {
    button.current?.focus()
    setOpen(false)
  }
  const keys = (e: RKeyboardEvent) => {
    const all = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const at = all.indexOf(document.activeElement as HTMLElement)
    const go = (i: number) => {
      e.preventDefault()
      all[(i + all.length) % all.length]?.focus()
    }
    if (e.key === 'ArrowDown') go(at + 1)
    else if (e.key === 'ArrowUp') go(at - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(all.length - 1)
    else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    } else if (e.key === 'Tab') setOpen(false)
  }
  return {
    button: (
      <button ref={button} type="button" className="byd-setup-add" aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => (open ? close() : setOpen(true))}>
        ＋
      </button>
    ),
    list: open ? (
      <div ref={menu} role="menu" id={id} className="byd-setup-add-menu" aria-label={label} onKeyDown={keys}>
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            onClick={() => {
              close()
              item.pick()
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    ) : null,
  }
}

// En familjs rad: vad zonen är, hur många platser som har den, och — när platserna inte är lika —
// att de inte är det. Raden fäller aldrig ut sig själv: en lista som ändrar form utan att någon
// rört den är svår att lita på, och avvikelsen är en upplysning innan den är ett ärende.
function FamilyRow({ family, setup, open, add, onOpen, children }: { family: Family; setup: Setup; open: boolean; add?: AddItem[] | undefined; onOpen(): void; children: ReactNode }) {
  const t = useT()
  const n = family.zones.length
  const seats = setup.seats.length
  const why = fixed(setup, family.first, t)
  const whyId = useId()
  const allFixed = why !== null && family.zones.every((zone) => fixed(setup, zone, t) !== null)
  const adding = useAddMenu(family.name, add)
  return (
    <li data-zone-family={family.role} data-open={open ? 'true' : undefined}>
      <div className="byd-setup-row">
        <button type="button" className="byd-setup-name" aria-expanded={open} onClick={onOpen} {...(allFixed ? { 'aria-describedby': whyId } : {})}>
          <i className="byd-setup-caret" aria-hidden="true">
            <ChevronGlyph to="right" />
          </i>
          <i aria-hidden="true" data-kind={family.first.kind} />
          {/* Mellanrummen är läsordningen och inte layouten: raden är en flexrad, som inte ritar
              tomrum, men namnet den läses upp med sätts ihop av texten i knappen — utan dem säger
              skärmläsaren «Framför8 platser». */}
          <span>{family.name}</span>{' '}
          <em>{n === seats ? t(n === 1 ? 'setup.family.seats.one' : 'setup.family.seats.other', { n }) : t('setup.family.some', { n, of: seats })}</em>
          {family.differ.length > 0 && <> <em data-differ="true">{t('setup.family.differ', { n: family.differ.length })}</em></>}
        </button>
        {adding.button}
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
      {adding.list}
      {open && <ul aria-label={family.name}>{children}</ul>}
    </li>
  )
}

// En enskild zons rad, i listan eller i en utfälld familj: namnet, vems den är, och × som tar bort
// den — eller, där × skulle stått, varför just den står kvar. Det som ligger i zonen står under
// raden, efter dess panel när den är öppen.
function ZoneRow({
  zone,
  setup,
  rows,
  selected,
  add,
  onSelect,
  onRemove,
  onPatch,
  onHold,
  children,
}: {
  zone: Zone
  setup: Setup
  rows: ProjectDoc['rows']
  selected: string | null
  add?: AddItem[] | undefined
  onSelect(id: string | null): void
  onRemove(zone: Zone): void
  onPatch(id: string, patch: ZonePatch, gesture?: string): void
  onHold(id: string | null): void
  children?: ReactNode
}) {
  const t = useT()
  const reading = useContext(Reading)
  const why = fixed(setup, zone, t)
  const whyId = useId()
  const open = selected === zone.id
  const deck = setup.deckZone === zone.id
  const adding = useAddMenu(zone.name, add)
  return (
    <li data-zone-row={zone.id} data-open={open ? 'true' : undefined}>
      <div className="byd-setup-row">
        <button type="button" className="byd-setup-name" aria-expanded={open} onClick={() => onSelect(open ? null : zone.id)} {...(why !== null ? { 'aria-describedby': whyId } : {})}>
          <i aria-hidden="true" data-kind={zone.kind} />
          <span>{zone.name}</span>
          {zone.owner !== undefined && <> <em>{zone.owner}</em></>}
          {deck && <> <strong>{t('setup.deck.mark')}</strong></>}
        </button>
        {adding.button}
        {why === null ? (
          <button type="button" className="byd-setup-x" aria-label={t('setup.remove.of', { name: zone.name })} onClick={() => onRemove(zone)}>
            <CloseGlyph />
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
      {adding.list}
      {open &&
        (reading ? (
          // A reader reads the zone's properties and writes none of them (#489).
          <fieldset className="byd-reading-set" disabled>
            <ZoneProps zone={zone} setup={setup} rows={rows} why={why} onPatch={(patch, gesture) => onPatch(zone.id, patch, gesture)} onHold={onHold} />
          </fieldset>
        ) : (
          <ZoneProps zone={zone} setup={setup} rows={rows} why={why} onPatch={(patch, gesture) => onPatch(zone.id, patch, gesture)} onHold={onHold} />
        ))}
      {children}
    </li>
  )
}

// What a zone is, opened inside its row. Everything about it is the designer's — its name, its
// verb on the phone, whose it is and who sees into it — because the table is theirs; a hand is the
// exception, and the seat that owns it is the reason.
function ZoneProps({ zone, setup, rows, why, onPatch, onHold }: { zone: Zone; setup: Setup; rows: ProjectDoc['rows']; why: string | null; onPatch(patch: ZonePatch, gesture?: string): void; onHold(id: string | null): void }) {
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
          {/* The deck is a role a pile carries (B5, K10), chosen under Spelet (#1403); the pile
              that carries it says so here, and why it cannot go. */}
          {setup.deckZone === zone.id && <p className="byd-setup-hint">{t('setup.deck.here')}</p>}
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

