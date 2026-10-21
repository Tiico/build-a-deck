import { useRef } from 'react'
import type { Paint } from '@byd/template'
import { useT, type Key } from '../i18n/index.js'
import { useGesture } from './gesture.js'
import { fieldLabel } from './fields.js'
import { INK } from './symbols.js'
import type { Element } from './types.js'

type Icons = Extract<Element, { kind: 'icons' }>

// What an icon is being chosen for, when the libraries' sheet is opened from this panel.
export type IconTarget = { kind: 'fixed' } | { kind: 'value'; value: string } | { kind: 'else' }

// The three things an icon layer can show (#1087, L71). One icon on every card is the layer's
// own; an icon per value of a column is a card type drawn as a picture without the deck knowing
// what the picture is called; and the icons a column writes is the icon row the layer always was.
type Look = 'fixed' | 'pick' | 'cell'
const lookOf = (el: Icons): Look => ('literal' in el.bind ? 'fixed' : el.pick ? 'pick' : 'cell')

export type IconLookProps = {
  el: Icons
  fields: string[]
  valuesIn(field: string): string[]
  // Where a name in the game's set is drawn from, to show it on the card's paper (L34).
  srcOf(name: string): string | undefined
  paper: string
  onPatch(patch: Partial<Element>, gesture?: string): void
  onChoose(target: IconTarget): void
}

// «Ikon och färg» (#1087, beslut A): the icon and its colour side by side, and for a card type a
// row per value of the column — a table to fill in, the way a fill that follows a column is (L16).
// Pressing an icon opens the libraries' sheet under the card for that row and no other.
export function IconLook({ el, fields, valuesIn, srcOf, paper, onPatch, onChoose }: IconLookProps) {
  const t = useT()
  // A colour picker writes all the way through a drag of it (L14).
  const picking = useGesture('icon-colour')
  const look = lookOf(el)
  const colour = el.color
  const rule = typeof colour === 'object' ? colour : null
  const plain = typeof colour === 'string' ? colour : (rule?.else ?? INK)
  const field = 'field' in el.bind ? el.bind.field : (fields[0] ?? '')
  // A rule that follows the column the layer reads, so the type's icon and its colour are one row.
  const ruleOn = (on: string, from: Paint | undefined): Paint => (typeof from === 'object' ? { ...from, field: on } : { field: on, map: {}, else: from ?? INK })

  // The icon a layer showed on every card before it was given a column, so one icon on every card
  // is the way back to that icon and not to a blank — the way a picture's way back to its column
  // is not a guess (#320). Held here and not in the element: the model says what the card is.
  const was = useRef(new Map<string, string>())
  const setLook = (next: Look) => {
    if (next === look || (field === '' && next !== 'fixed')) return
    if ('literal' in el.bind && el.bind.literal !== '') was.current.set(el.id, el.bind.literal)
    const back = was.current.get(el.id) ?? (el.pick ? Object.values(el.pick.map)[0] : undefined) ?? ''
    if (next === 'fixed') onPatch({ bind: { literal: back }, pick: undefined, ...(rule ? { color: plain } : {}) })
    else if (next === 'pick') onPatch({ bind: { field }, pick: { map: {} }, ...(colour !== undefined ? { color: ruleOn(field, colour) } : {}) })
    else onPatch({ bind: { field }, pick: undefined, ...(rule ? { color: plain } : {}) })
  }
  const setField = (next: string) => onPatch({ bind: { field: next }, ...(look === 'pick' && colour !== undefined ? { color: ruleOn(next, colour) } : {}) })
  const setColoured = (on: boolean) => onPatch({ color: on ? (look === 'pick' ? ruleOn(field, undefined) : INK) : undefined })

  const values = look === 'pick' ? [...new Set([...valuesIn(field), ...Object.keys(el.pick?.map ?? {})])] : []
  const colourFor = (value: string | null): string => (rule ? ((value === null ? undefined : rule.map[value]) ?? rule.else ?? INK) : plain)
  const writeColour = (value: string | null, next: string, gesture: string) => {
    if (look !== 'pick') return onPatch({ color: next }, gesture)
    const base = ruleOn(field, colour) as Exclude<Paint, string>
    onPatch({ color: value === null ? { ...base, else: next } : { ...base, map: { ...base.map, [value]: next } } }, gesture)
  }
  const sample = (name: string | undefined, value: string | null) => {
    const src = name === undefined ? undefined : srcOf(name)
    const mask = src === undefined ? undefined : `url("${src}")`
    return (
      <span className="byd-icon-paper byd-icon-paper-small" style={{ background: paper }}>
        {mask ? <span className="byd-icon-sample" style={{ background: colour === undefined ? INK : colourFor(value), WebkitMaskImage: mask, maskImage: mask }} /> : <span className="byd-icon-empty" aria-hidden="true">＋</span>}
      </span>
    )
  }
  const row = (target: IconTarget, label: string, name: string | undefined, value: string | null, clear?: () => void) => (
    <li key={target.kind === 'value' ? `value:${target.value}` : target.kind} className="byd-icon-look-row" data-value={value ?? ''}>
      <button type="button" className="byd-icon-look-pick" aria-label={t('canvas.props.icon.choose', { target: label })} onClick={() => onChoose(target)}>
        {sample(name, value)}
      </button>
      <span className="byd-icon-look-what">
        {target.kind === 'fixed' ? (name ?? t('canvas.props.icon.none')) : label}
        {target.kind !== 'fixed' && <small>{name ?? t('canvas.props.icon.none')}</small>}
      </span>
      {colour !== undefined && (
        <input type="color" aria-label={t('canvas.props.icon.colourFor', { target: label })} value={colourFor(value)} {...picking.visit} onChange={(e) => writeColour(value, e.target.value, picking.token())} />
      )}
      {clear && name !== undefined && (
        <button type="button" className="byd-icon-look-clear" aria-label={t('canvas.props.icon.clear', { target: label })} onClick={clear}>
          ×
        </button>
      )}
    </li>
  )
  const fixedName = 'literal' in el.bind && el.bind.literal !== '' ? el.bind.literal : undefined
  const pick = el.pick ?? { map: {} }
  const unpick = (value: string | null) => () => onPatch({ pick: value === null ? { map: pick.map } : { ...pick, map: Object.fromEntries(Object.entries(pick.map).filter(([k]) => k !== value)) } })

  return (
    <div className="byd-icon-look">
      <label>
        {t('canvas.props.icon.look')}
        <select value={look} onChange={(e) => setLook(e.target.value as Look)}>
          {(['fixed', 'pick', 'cell'] as const).map((l) => (
            <option key={l} value={l} disabled={l !== 'fixed' && fields.length === 0}>
              {t(`canvas.props.icon.look.${l}` as Key)}
            </option>
          ))}
        </select>
      </label>
      {look !== 'fixed' && (
        <label>
          {t('canvas.props.icon.column')}
          <select value={field} onChange={(e) => setField(e.target.value)}>
            {[...new Set([...fields, field])].map((f) => (
              <option key={f} value={f}>
                {fieldLabel(f, t)}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="byd-props-switch">
        <input type="checkbox" checked={colour !== undefined} onChange={(e) => setColoured(e.target.checked)} />
        {t('canvas.props.icon.colour.on')}
      </label>
      <ul className="byd-icon-look-rows">
        {look === 'fixed' && row({ kind: 'fixed' }, t('canvas.props.icon.for.all'), fixedName, null)}
        {look === 'pick' && values.map((value) => row({ kind: 'value', value }, value, pick.map[value], value, unpick(value)))}
        {look === 'pick' && row({ kind: 'else' }, t('canvas.props.icon.for.else'), pick.else, null, unpick(null))}
        {look === 'cell' && colour !== undefined && (
          <li className="byd-icon-look-row">
            <span className="byd-icon-look-what">{t('canvas.props.icon.cellColour')}</span>
            <input type="color" aria-label={t('canvas.props.icon.colourFor', { target: t('canvas.props.icon.for.all') })} value={plain} {...picking.visit} onChange={(e) => writeColour(null, e.target.value, picking.token())} />
          </li>
        )}
      </ul>
    </div>
  )
}
