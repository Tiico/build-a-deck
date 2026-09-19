import { createContext, Fragment, useContext, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { ActionAmount, ActionStep, ActionTarget, CardQuery, ZoneAction, ZoneBeside } from '@byd/protocol'
import type { ProjectDoc } from '@byd/server'
import type { Zone } from '@byd/server/doc'
import { placedProps, usePlacement } from './placement.js'
import { queryColumns } from './queries.js'
import { fieldsOf } from './fields.js'
import { ownerOf } from './zone-name.js'
import { useT, type Key, type T } from '../i18n/index.js'

// Authoring what a pile starts with and what it can be asked for, as sentences (prototyped
// 2026-09-15).
//
// Three shapes were built against each other: the zone row growing to hold it, a form panel of
// dropdowns beside the felt, and this. The form won nothing — a step became four dropdowns that
// wrapped, and three actions scrolled sideways — and the row was worse, because 320 px turns one
// column of chips into three lines. The sentence wins because what the designer reads is what
// will happen: "Leta fram varje kort där rarity är Diamant och lägg dem uppvända bredvid högen"
// is the specification, word for word, and there is nothing else to check it against.
//
// The knobs sit inside the text. Each one is a slot: a button wearing the words it stands for,
// which opens the list of what it could be instead. The sentence itself is a catalogue string
// with named holes, so a language may put the holes in another order (A4) — which is the whole
// reason it is not assembled out of fragments here.
export type ZoneActionsProps = {
  doc: ProjectDoc
  zone: Zone
  onPatch(patch: { fill?: CardQuery | undefined; actions?: ZoneAction[] }, gesture?: string): void
}

const AMOUNTS: ActionAmount['of'][] = ['number', 'seats', 'zone', 'ask']
const LANDS = ['keep', 'front', 'back'] as const
const TURNS = ['toggle', 'front', 'back'] as const
const VERBS: ActionStep['v'][] = ['split', 'deal', 'take', 'shuffle', 'flipTop', 'movePile']
// Var korten ligger, och vart de går. Prepositionen sitter i platsen och aldrig i steget (#285),
// så en mening säger vilken form den vill ha genom att namnge hålet `{at}` eller `{to}` — och
// vilken form ett verb styr är därmed språkets sak och inte den här filens (A4).
type PlaceForm = 'at' | 'to'

const blank = (v: ActionStep['v']): ActionStep =>
  v === 'shuffle'
    ? { v }
    : v === 'flipTop'
      ? { v, face: 'toggle' }
      : v === 'movePile'
        ? { v, to: { at: 'beside' } }
        : v === 'deal'
          ? { v, each: { of: 'number', n: 1 }, to: { at: 'hands' }, face: 'keep' }
          : v === 'take'
            ? { v, which: [], to: { at: 'beside' }, face: 'keep' }
            : { v, count: { of: 'number', n: 1 }, to: { at: 'beside' }, face: 'keep' }

export function ZoneActions({ doc, zone, onPatch }: ZoneActionsProps) {
  const t = useT()
  const actions = zone.actions ?? []
  const setAction = (id: string, next: ZoneAction, gesture?: string) => onPatch({ actions: actions.map((a) => (a.id === id ? next : a)) }, gesture)
  const columns = queryColumns(doc.rows, fieldsOf(doc))
  const others = doc.setup.zones.filter((z) => z.id !== zone.id)
  // What has been chosen in this panel's boxes (#230). It is the panel's and not each slot's: a
  // place picked in one step is the likely place of the next, and that is the whole of what makes
  // the block worth its room.
  const [chosen, setChosen] = useState<readonly string[]>([])
  const remembered = useMemo(
    () => ({ keys: chosen, remember: (key: string) => setChosen((was) => [key, ...was.filter((k) => k !== key)].slice(0, REMEMBERED)) }),
    [chosen],
  )

  return (
    <Chosen.Provider value={remembered}>
      <div className="byd-zone-actions" data-zone-actions={zone.id}>
        <p className="byd-sentence">
          {parts(t('setup.fill.sentence'), {
            zone: <b key="z">{zone.name}</b>,
            what: (
              <QuerySlot
                key="w"
                query={zone.fill ?? []}
                columns={columns}
                label={zone.fill && zone.fill.length > 0 ? t('setup.fill.some', { what: queryWords(zone.fill, t) }) : t('setup.fill.none')}
                onChange={(fill) => onPatch({ fill: fill.length > 0 ? fill : undefined }, `fill:${zone.id}`)}
                t={t}
              />
            ),
          })}
        </p>

        <h3>{t('setup.actions.heading')}</h3>
        {actions.map((a) => (
          <div key={a.id} className="byd-zone-action">
            <input
              value={a.label}
              aria-label={t('setup.actions.name', { name: a.label })}
              onChange={(e) => setAction(a.id, { ...a, label: e.target.value }, `action:${zone.id}:${a.id}`)}
            />
            <ol>
              {a.steps.map((step, i) => (
                <li key={i}>
                  <span className="byd-sentence">
                    <Step step={step} columns={columns} zones={others} beside={zone.beside ?? 'left'} t={t} onChange={(next) => setAction(a.id, { ...a, steps: a.steps.map((s, j) => (j === i ? next : s)) })} />
                  </span>
                  <button
                    type="button"
                    className="byd-zone-action-x"
                    aria-label={t('setup.actions.removeStep', { n: i + 1 })}
                    onClick={() => {
                      const steps = a.steps.filter((_, j) => j !== i)
                      // An action with no steps is not an action: the last step going takes it with
                      // it, which is also the only way to be rid of one.
                      if (steps.length > 0) setAction(a.id, { ...a, steps })
                      else onPatch({ actions: actions.filter((x) => x.id !== a.id) })
                    }}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ol>
            <label className="byd-zone-step-add">
              <span>{t('setup.actions.andThen', { name: a.label })}</span>
              <select
                value=""
                onChange={(e) => e.target.value !== '' && setAction(a.id, { ...a, steps: [...a.steps, blank(e.target.value as ActionStep['v'])] })}
              >
                <option value="">{t('setup.actions.andThen.pick')}</option>
                {VERBS.map((v) => (
                  <option key={v} value={v}>
                    {t(`setup.verb.${v}` as Key)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ))}
        <button type="button" className="byd-zone-action-new" onClick={() => onPatch({ actions: [...actions, { id: `a${Date.now().toString(36)}`, label: t('setup.actions.newName'), steps: [blank('split')] }] })}>
          {t('setup.actions.new')}
        </button>
      </div>
    </Chosen.Provider>
  )
}

// ── The sentence for one step ─────────────────────────────────────────────────────────────────

function Step({ step, columns, zones, beside, t, onChange }: { step: ActionStep; columns: ReturnType<typeof queryColumns>; zones: readonly Zone[]; beside: ZoneBeside; t: T; onChange(next: ActionStep): void }) {
  const amount = (a: ActionAmount, set: (next: ActionAmount) => void) => <AmountSlot key="n" amount={a} zones={zones} t={t} onChange={set} />
  // Båda formerna räcks fram och meningen tar den den namngett; den andra renderas aldrig.
  const place = (to: ActionTarget, set: (next: ActionTarget) => void): Record<PlaceForm, ReactNode> => ({
    at: <TargetSlot key="at" form="at" target={to} zones={zones} beside={beside} t={t} onChange={set} />,
    to: <TargetSlot key="to" form="to" target={to} zones={zones} beside={beside} t={t} onChange={set} />,
  })
  const side = (f: string, opts: readonly string[], set: (next: string) => void) => (
    <Slot key="f" label={t(`setup.face.${f}` as Key)}>
      {(close) =>
        opts.map((o) => (
          <button key={o} type="button" onClick={() => { set(o); close() }}>
            {t(`setup.face.${o}` as Key)}
          </button>
        ))
      }
    </Slot>
  )
  if (step.v === 'shuffle') return <>{t('setup.step.shuffle')}</>
  if (step.v === 'flipTop') return <>{parts(t('setup.step.flipTop'), { face: side(step.face, TURNS, (face) => onChange({ ...step, face: face as typeof step.face })) })}</>
  if (step.v === 'movePile') return <>{parts(t('setup.step.movePile'), place(step.to, (to) => onChange({ ...step, to })))}</>
  if (step.v === 'take')
    return (
      <>
        {parts(t('setup.step.take'), {
          which: (
            <QuerySlot key="w" query={step.which} columns={columns} label={step.which.length > 0 ? queryWords(step.which, t) : t('setup.query.any')} onChange={(which) => onChange({ ...step, which })} t={t} />
          ),
          face: side(step.face, LANDS, (face) => onChange({ ...step, face: face as typeof step.face })),
          ...place(step.to, (to) => onChange({ ...step, to })),
        })}
      </>
    )
  if (step.v === 'deal')
    return (
      <>
        {parts(t('setup.step.deal'), {
          n: amount(step.each, (each) => onChange({ ...step, each })),
          ...place(step.to, (to) => onChange({ ...step, to })),
          face: side(step.face, LANDS, (face) => onChange({ ...step, face: face as typeof step.face })),
        })}
      </>
    )
  return (
    <>
      {parts(t('setup.step.split'), {
        n: amount(step.count, (count) => onChange({ ...step, count })),
        face: side(step.face, LANDS, (face) => onChange({ ...step, face: face as typeof step.face })),
        ...place(step.to, (to) => onChange({ ...step, to })),
      })}
    </>
  )
}

// ── The slots ─────────────────────────────────────────────────────────────────────────────────

// A knob inside the text: the words it stands for, and the list of what it could be instead.
// It is `Question.tsx`'s manner applied to a word (L9): it answers where it is read, Escape puts
// it away, and it traps nothing — tabbing past leaves it standing.
function Slot({ label, children }: { label: string; children(close: () => void): ReactNode }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  // The box opens where there is room for it (#229). Opened straight down, as it was, a slot near
  // the foot of the page pushed the page into scrolling — which moves the very thing the designer
  // had her eye on.
  const pop = useRef<HTMLSpanElement>(null)
  const place = usePlacement(open, pop)
  return (
    <span className="byd-slot-wrap">
      <button type="button" className="byd-slot" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        {label}
      </button>
      {open && (
        <span ref={pop} className="byd-slot-pop" id={id} {...placedProps(place)} onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
          {children(() => setOpen(false))}
        </span>
      )}
    </span>
  )
}

// How many of the last chosen stand at the top of a box. Three, by the requester's decision of
// 2026-09-18: two is barely a list, five pushes the headings under it out of sight.
const RECENT = 3
// How far back a panel remembers at all. Each box shows the three most recent among its own
// choices, so the memory has to be longer than three for the amount box and the place box not to
// wipe each other out.
const REMEMBERED = 12

// What has been chosen in this panel's boxes, most recent first, by the choice's own key.
const Chosen = createContext<{ keys: readonly string[]; remember(key: string): void }>({ keys: [], remember: () => undefined })

// A choice in a box: the words it is read and searched by, the block it belongs to, and what
// picking it does. A choice that is not a plain button — the number, which is typed rather than
// picked — brings its own node and is searched by the same words all the same.
type Choice = { key: string; words: string; said?: string; label?: ReactNode; group: string; node?: ReactNode; pick?(): void }

// A box of choices, searched rather than scrolled (#230). In a game of twenty zones it holds
// forty-seven of them in four blocks nobody can see, and the last is six scrolls away. The
// requester's decision of 2026-09-18 is one box and not four steps: everything stays in it, but it
// is searchable, the last chosen stand at the top, and the headings really do separate the blocks.
// She who knows what she wants reaches it in one step; she who does not still sees everything.
function ChoiceSlot({ label, choices, t }: { label: string; choices: readonly Choice[]; t: T }) {
  return <Slot label={label}>{(close) => <Choices choices={choices} close={close} t={t} />}</Slot>
}

function Choices({ choices, close, t }: { choices: readonly Choice[]; close(): void; t: T }) {
  const [query, setQuery] = useState('')
  const memory = useContext(Chosen)
  const id = useId()
  const field = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLSpanElement>(null)
  // The field takes focus when the box opens: open, type, Enter is then the shortest way through
  // it. `preventScroll`, because the box has just been put where there was room for it (#229) and
  // scrolling the field into view would move the very sentence the designer has her eye on.
  useEffect(() => field.current?.focus({ preventScroll: true }), [])
  // One search across the whole box and not one per block: "hand" is both a place the sentence
  // knows and zones the game has, and the designer who types it means either.
  const lastChosen = t('setup.slot.recent')
  const term = query.toLocaleLowerCase('sv').trim()
  const found = choices.filter((c) => c.words.toLocaleLowerCase('sv').includes(term))
  // The same zone is chosen over and over while a setup is built, so the last few stand at the top
  // where no typing is needed to reach them. They take nothing away: every one of them is still
  // down in the block it belongs to. Under a search they stand down, because then the box is
  // already answering a question.
  const recent =
    term === ''
      ? memory.keys
          .map((key) => choices.find((c) => c.key === key && c.node === undefined))
          .filter((c) => c !== undefined)
          .slice(0, RECENT)
          .map((c) => ({ ...c, key: `recent:${c.key}`, group: lastChosen, was: c.key }))
      : []
  const shown: (Choice & { was?: string })[] = [...recent, ...found]
  // The blocks are in the box already; they are simply not visible. A heading is what separates
  // them — for the eye and for the reader who listens her way down the box, which is why a block
  // is a group wearing its heading as its name.
  const blocks = [...new Set(shown.map((c) => c.group))]
  const one = (c: Choice & { was?: string }) =>
    c.node !== undefined ? (
      <Fragment key={c.key}>{c.node}</Fragment>
    ) : (
      <button
        key={c.key}
        type="button"
        // Bara där raden har mer att säga än den visar. En etikett som upprepar radens egen text
        // är inte en upplysning utan en andra kopia av den.
        aria-label={c.said}
        onClick={() => {
          memory.remember(c.was ?? c.key)
          c.pick?.()
          close()
        }}
      >
        {c.label ?? c.words}
      </button>
    )
  // The field is where the box opens, so it cannot be a dead end: the arrows walk out of it and
  // down the list, and back up into it from the first choice. The list is read off the document
  // rather than kept in a second list of its own, because what the arrows walk is exactly what the
  // search left standing.
  const walk = (from: EventTarget, by: number) => {
    const options = [...(list.current?.querySelectorAll('button') ?? [])]
    const at = from === field.current ? -1 : options.indexOf(from as HTMLButtonElement)
    // Something in the box that is neither the field nor a choice is the number, which is typed
    // and not picked. There the arrows are the field's own — they step the value — so the box
    // keeps its hands off them.
    if (at < 0 && from !== field.current) return false
    const next = at + by
    if (next >= options.length) return false
    ;(next < 0 ? field.current : options[next])?.focus()
    return true
  }
  const arrows = (e: KeyboardEvent<HTMLElement>) => {
    const by = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
    if (by !== 0 && walk(e.target, by)) e.preventDefault()
    // Open, type, Enter — the whole of the keyboard's way through the box. What is left standing
    // at the top is what Enter takes, which is the choice the search was narrowed down to.
    if (e.key === 'Enter' && e.target === field.current && term !== '') {
      list.current?.querySelector('button')?.click()
      e.preventDefault()
    }
  }
  return (
    <>
      <input
        ref={field}
        className="byd-slot-find"
        // A filter and not a site search: `type="search"` clears itself on Escape in a browser,
        // and Escape here is the way out of the box (the requester's decision of 2026-09-18).
        type="text"
        aria-label={t('setup.slot.search')}
        placeholder={t('setup.slot.search')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={arrows}
      />
      <span ref={list} className="byd-slot-list" onKeyDown={arrows}>
        {shown.length === 0 && <i className="byd-slot-nothing">{t('setup.slot.nothing')}</i>}
        {blocks.map((group, i) => (
          <span key={group} className="byd-slot-block" data-recent={group === lastChosen ? 'true' : undefined} role="group" aria-labelledby={`${id}b${i}`}>
            <i id={`${id}b${i}`}>{group}</i>
            {shown.filter((c) => c.group === group).map(one)}
          </span>
        ))}
      </span>
    </>
  )
}

function AmountSlot({ amount, zones, t, onChange }: { amount: ActionAmount; zones: readonly Zone[]; t: T; onChange(next: ActionAmount): void }) {
  const choices: Choice[] = [
    {
      key: 'amount:number',
      words: t('setup.amount.number'),
      group: t('setup.slot.group.amount'),
      node: (
        <label key="amount:number">
          {t('setup.amount.number')}
          <input
            type="number"
            min="1"
            step="1"
            defaultValue={amount.of === 'number' ? amount.n : 1}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (Number.isInteger(n) && n > 0) onChange({ of: 'number', n })
            }}
          />
        </label>
      ),
    },
    ...AMOUNTS.filter((of) => of !== 'number' && of !== 'zone').map((of) => ({
      key: `amount:${of}`,
      words: t(`setup.amount.${of}` as Key),
      group: t('setup.slot.group.amount'),
      pick: () => onChange(of === 'seats' ? { of: 'seats' } : { of: 'ask' }),
    })),
    // Den sammansatta zonen går in som ett hål i antalets egen mening, så samma nyckel bär båda
    // rutorna och ingen text sätts ihop här.
    ...zones.map((z) => {
      const zw = zoneWords(z, t)
      return {
        key: `amount:zone:${z.id}`,
        words: t('setup.amount.zone', { zone: zw.words }),
        said: zw.said === undefined ? undefined : t('setup.amount.zone', { zone: zw.said }),
        label: zw.label === undefined ? undefined : parts(t('setup.amount.zone'), { zone: zw.label }),
        group: t('setup.slot.group.amountZone'),
        pick: () => onChange({ of: 'zone', zone: z.id }),
      }
    }),
  ]
  return <ChoiceSlot label={amountWords(amount, zones, t)} choices={choices} t={t} />
}

function TargetSlot({ target, zones, beside, form, t, onChange }: { target: ActionTarget; zones: readonly Zone[]; beside: ZoneBeside; form: PlaceForm; t: T; onChange(next: ActionTarget): void }) {
  const choices: Choice[] = [
    ...(['beside', 'hands', 'mine'] as const).map((at) => ({
      key: `place:${at}`,
      // Raden bär samma form som meningen den hamnar i, så det som väljs är ordagrant det som står
      // där efteråt.
      words: targetWords({ at }, zones, t, beside, form),
      group: t('setup.slot.group.place'),
      pick: () => onChange({ at }),
    })),
    ...zones.map((z) => ({ key: `place:zone:${z.id}`, ...zoneWords(z, t), group: t('setup.slot.group.zone'), pick: () => onChange({ at: 'zone', zone: z.id }) })),
  ]
  return <ChoiceSlot label={targetWords(target, zones, t, beside, form)} choices={choices} t={t} />
}

// Vems zonen är, i raden man väljer bland (#255). Åtta platser ger åtta zoner som heter «Hand»,
// och prototypen mätte följden: 21 av 47 rader i platsrutan var kopior av en annan rad, fördelade
// på fyra familjer och inte bara på händerna. Efterledet är zonlistans egen bricka — namnet, och
// platsens bokstav i en ram efter det — så att ramen säger vems ordet är: `Hand A` får inte bli
// omöjlig att skilja från `Framför A`, som designern verkligen döpt en zon till (A4).
//
// Sammansättningen är katalogens och aldrig ytans: här skickas de två orden var för sig, och
// noden skickas som nod och inte som text (K21). `ownerOf` svarar inget alls när namnet redan bär
// platsen, och då är raden namnet självt — `Framför A`, aldrig `Framför A A`.
//
// `words` är det söket läser, och efterledet står därför i den: «hand a» går från noll träffar
// till en, vilket är rutans enda väg till en enskild hand (#230). `label` är det ögat ser, och
// det är samma sammansättning en gång till — med bokstaven som nod i stället för som text, för
// annars vore brickan märkning ytan hittat på och inte något katalogen sagt.
//
// `said` är det örat hör, och det är en tredje nyckel och inte de två andra: brickan säger med
// sin ram vad bokstaven är, och en uppläsning hör ingen ram. Ordet står sist och inte före
// bokstaven, för det som syns måste stå i det som sägs — annars får en röststyrd användare som
// säger raden hon läser ingen träff (WCAG 2.5.3).
function zoneWords(zone: Zone, t: T): { words: string; said?: string; label?: ReactNode } {
  const owner = ownerOf(zone)
  if (owner === undefined) return { words: zone.name }
  return {
    words: t('setup.slot.zone.owned', { zone: zone.name, owner }),
    said: t('setup.slot.zone.owned.tail', { zone: zone.name, owner }),
    label: parts(t('setup.slot.zone.owned'), { zone: zone.name, owner: <em>{owner}</em> }),
  }
}

// The question as chips, which is the grip the data table already taught (L4): values in one
// column are alternatives, columns are conditions.
function QuerySlot({ query, columns, label, onChange, t }: { query: CardQuery; columns: ReturnType<typeof queryColumns>; label: string; onChange(next: CardQuery): void; t: T }) {
  const toggle = (field: string, value: string) => {
    const clause = query.find((c) => c.field === field)
    const is = clause ? (clause.is.includes(value) ? clause.is.filter((v) => v !== value) : [...clause.is, value]) : [value]
    onChange([...query.filter((c) => c.field !== field), ...(is.length > 0 ? [{ field, is }] : [])])
  }
  return (
    <Slot label={label}>
      {() => (
        <span className="byd-slot-chips">
          {columns.length === 0 && <i>{t('setup.query.noColumns')}</i>}
          {columns.map((col) => (
            <span key={col.field}>
              <i>{col.field}</i>
              {col.values.map((v) => (
                <button key={v} type="button" data-on={query.find((c) => c.field === col.field)?.is.includes(v) ? 'true' : 'false'} onClick={() => toggle(col.field, v)}>
                  {v}
                </button>
              ))}
            </span>
          ))}
        </span>
      )}
    </Slot>
  )
}

// ── The words ─────────────────────────────────────────────────────────────────────────────────

export const queryWords = (q: CardQuery, t: T): string =>
  q.map((c) => t('setup.query.clause', { field: c.field, values: c.is.join(t('setup.query.or')) })).join(t('setup.query.and'))

const amountWords = (a: ActionAmount, zones: readonly Zone[], t: T): string =>
  a.of === 'number' ? String(a.n) : a.of === 'seats' ? t('setup.amount.seats') : a.of === 'ask' ? t('setup.amount.ask') : t('setup.amount.zone', { zone: zones.find((z) => z.id === a.zone)?.name ?? a.zone })

// "Bredvid högen" är inte en riktning förrän högen sagt vilken (K21), och meningen ska säga vad
// som kommer att hända: den skriver ut sidan högen bär, inte ordet den bär den under.
//
// Frasen är hel och kommer ur katalogen med sin preposition i (#285). Ingenting sätts ihop här:
// den här funktionen väljer en nyckel och fyller ett hål, och det är allt den får göra.
const targetWords = (target: ActionTarget, zones: readonly Zone[], t: T, beside: ZoneBeside, form: PlaceForm): string =>
  target.at === 'zone'
    ? t(`setup.place.${form}.zone` as Key, { zone: zones.find((z) => z.id === target.zone)?.name ?? target.zone })
    : t((target.at === 'beside' ? `setup.place.${form}.beside.${beside}` : `setup.place.${form}.${target.at}`) as Key)

// A catalogue sentence with named holes, filled with things rather than with text. The holes are
// written `{name}`; the order they come in is the language's business and not this file's (A4).
function parts(template: string, holes: Record<string, ReactNode>): ReactNode[] {
  return template.split(/(\{[a-z]+\})/i).map((piece, i) => {
    const name = /^\{([a-z]+)\}$/i.exec(piece)?.[1]
    return <span key={i}>{(name === undefined ? undefined : holes[name]) ?? piece}</span>
  })
}
