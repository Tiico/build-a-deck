import { useId, useRef, useState, type ReactNode } from 'react'
import type { ActionAmount, ActionStep, ActionTarget, CardQuery, ZoneAction, ZoneBeside } from '@byd/protocol'
import type { ProjectDoc } from '@byd/server'
import type { Zone } from '@byd/server/doc'
import { placedProps, usePlacement } from './placement.js'
import { queryColumns } from './queries.js'
import { fieldsOf } from './fields.js'
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

  return (
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
  )
}

// ── The sentence for one step ─────────────────────────────────────────────────────────────────

function Step({ step, columns, zones, beside, t, onChange }: { step: ActionStep; columns: ReturnType<typeof queryColumns>; zones: readonly Zone[]; beside: ZoneBeside; t: T; onChange(next: ActionStep): void }) {
  const amount = (a: ActionAmount, set: (next: ActionAmount) => void) => <AmountSlot key="n" amount={a} zones={zones} t={t} onChange={set} />
  const place = (to: ActionTarget, set: (next: ActionTarget) => void) => <TargetSlot key="p" target={to} zones={zones} beside={beside} t={t} onChange={set} />
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
  if (step.v === 'movePile') return <>{parts(t('setup.step.movePile'), { place: place(step.to, (to) => onChange({ ...step, to })) })}</>
  if (step.v === 'take')
    return (
      <>
        {parts(t('setup.step.take'), {
          which: (
            <QuerySlot key="w" query={step.which} columns={columns} label={step.which.length > 0 ? queryWords(step.which, t) : t('setup.query.any')} onChange={(which) => onChange({ ...step, which })} t={t} />
          ),
          face: side(step.face, LANDS, (face) => onChange({ ...step, face: face as typeof step.face })),
          place: place(step.to, (to) => onChange({ ...step, to })),
        })}
      </>
    )
  if (step.v === 'deal')
    return (
      <>
        {parts(t('setup.step.deal'), {
          n: amount(step.each, (each) => onChange({ ...step, each })),
          place: place(step.to, (to) => onChange({ ...step, to })),
          face: side(step.face, LANDS, (face) => onChange({ ...step, face: face as typeof step.face })),
        })}
      </>
    )
  return (
    <>
      {parts(t('setup.step.split'), {
        n: amount(step.count, (count) => onChange({ ...step, count })),
        face: side(step.face, LANDS, (face) => onChange({ ...step, face: face as typeof step.face })),
        place: place(step.to, (to) => onChange({ ...step, to })),
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

function AmountSlot({ amount, zones, t, onChange }: { amount: ActionAmount; zones: readonly Zone[]; t: T; onChange(next: ActionAmount): void }) {
  return (
    <Slot label={amountWords(amount, zones, t)}>
      {(close) => (
        <>
          <label>
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
          {AMOUNTS.filter((of) => of !== 'number' && of !== 'zone').map((of) => (
            <button key={of} type="button" onClick={() => { onChange(of === 'seats' ? { of: 'seats' } : { of: 'ask' }); close() }}>
              {t(`setup.amount.${of}` as Key)}
            </button>
          ))}
          {zones.map((z) => (
            <button key={z.id} type="button" onClick={() => { onChange({ of: 'zone', zone: z.id }); close() }}>
              {t('setup.amount.zone', { zone: z.name })}
            </button>
          ))}
        </>
      )}
    </Slot>
  )
}

function TargetSlot({ target, zones, beside, t, onChange }: { target: ActionTarget; zones: readonly Zone[]; beside: ZoneBeside; t: T; onChange(next: ActionTarget): void }) {
  return (
    <Slot label={targetWords(target, zones, t, beside)}>
      {(close) => (
        <>
          {(['beside', 'hands', 'mine'] as const).map((at) => (
            <button key={at} type="button" onClick={() => { onChange({ at }); close() }}>
              {targetWords({ at }, zones, t, beside)}
            </button>
          ))}
          {zones.map((z) => (
            <button key={z.id} type="button" onClick={() => { onChange({ at: 'zone', zone: z.id }); close() }}>
              {z.name}
            </button>
          ))}
        </>
      )}
    </Slot>
  )
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
const targetWords = (target: ActionTarget, zones: readonly Zone[], t: T, beside: ZoneBeside): string =>
  target.at === 'zone'
    ? t('setup.place.zone', { zone: zones.find((z) => z.id === target.zone)?.name ?? target.zone })
    : t((target.at === 'beside' ? `setup.place.beside.${beside}` : `setup.place.${target.at}`) as Key)

// A catalogue sentence with named holes, filled with things rather than with text. The holes are
// written `{name}`; the order they come in is the language's business and not this file's (A4).
function parts(template: string, holes: Record<string, ReactNode>): ReactNode[] {
  return template.split(/(\{[a-z]+\})/i).map((piece, i) => {
    const name = /^\{([a-z]+)\}$/i.exec(piece)?.[1]
    return <span key={i}>{(name === undefined ? undefined : holes[name]) ?? piece}</span>
  })
}
