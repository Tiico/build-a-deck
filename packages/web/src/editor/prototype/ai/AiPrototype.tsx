// PROTOTYP — kastas (#940). «Hur arbetar en designer med AI-hjälp i editorn?»
// Tre strukturellt olika svar, monterade i den riktiga editorn: ?ai=A (samtalspanel), ?ai=B
// (riktade handlingar), ?ai=C (spöken på väggen), och ?ai=nyckel för kontots nyckelruta.
// &nyckel=0 visar editorn för den som inte har någon nyckel, &utfall=nyckel|oanvandbart visar
// felen, &skala=4 gör provleken fyra gånger så stor, &ren döljer prototypens växel.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ProjectDoc } from '../../types.js'
import type { Mode } from '../../EditorTabs.js'
import { useMarked } from '../../marked.js'
import { scaled, type Outcome } from './fake.js'
import { useAiSession, type AiView, type Session } from './session.js'
import { KeyDialog, type SavedKey } from './KeyBox.js'
import { Into, useSlots } from './parts.js'
import { VariantA } from './VariantA.js'
import { VariantB } from './VariantB.js'
import { VariantC } from './VariantC.js'
import css from './ai.css?inline'

export type Stageable = 'wall' | 'canvas' | 'table'
export type Props = { doc: ProjectDoc; http: string; rev: number; mode: Mode; row: string | null; onRow(row: string | null): void; onStage(stage: Stageable): void; onView(view: AiView | null): void }
export type Shared = {
  s: Session
  doc: ProjectDoc
  http: string
  mode: Mode
  row: string | null
  marked: readonly string[]
  saved: SavedKey | null
  openKey(): void
  onStage(stage: Stageable): void
  setPreview(on: boolean): void
  preview: boolean
  setSaved(key: SavedKey | null): void
}

const NAMES: Record<string, string> = { A: 'Samtalspanel', B: 'Riktade handlingar', C: 'Spöken på väggen', nyckel: 'Kontots nyckelruta' }
const KEYS = ['A', 'B', 'C', 'nyckel']

export function useInlineCss() {
  useEffect(() => {
    const style = document.createElement('style')
    style.dataset['proto'] = 'ai-940'
    style.textContent = css
    document.head.appendChild(style)
    return () => style.remove()
  }, [])
}

export function useParam(name: string): [string | null, (value: string | null) => void] {
  const [value, setValue] = useState(() => new URLSearchParams(location.search).get(name))
  return [
    value,
    (next) => {
      const url = new URL(location.href)
      if (next === null) url.searchParams.delete(name)
      else url.searchParams.set(name, next)
      history.replaceState(null, '', url)
      setValue(next)
    },
  ]
}

export const DEMO_KEY: SavedKey = { provider: 'Anthropic', last4: 'x7Qd', model: 'standard', at: '09:41' }

export default function AiPrototype({ doc, http, rev, mode, row, onRow, onStage, onView }: Props) {
  useInlineCss()
  const [variant] = useParam('ai')
  const [keyParam] = useParam('nyckel')
  const [outcomeParam] = useParam('utfall')
  const [scaleParam] = useParam('skala')
  const [saved, setSaved] = useState<SavedKey | null>(keyParam === '0' ? null : DEMO_KEY)
  const [keyOpen, setKeyOpen] = useState(false)
  const outcome: Outcome = outcomeParam === 'nyckel' || outcomeParam === 'oanvandbart' ? outcomeParam : 'svar'
  // Leken prototypen utgår från tas en gång: en redigering i den riktiga editorn under tiden syns
  // inte medan ett förslag ligger lokalt godtaget (prototypens gräns, se NOTES).
  const first = useRef(doc)
  const times = Math.max(1, Math.min(6, Number(scaleParam ?? 1) || 1))
  const base = useMemo(() => scaled(first.current, times), [times])
  const s = useAiSession({ base, outcome, provider: saved?.provider ?? 'Anthropic' })
  const [preview, setPreview] = useState(variant === 'C')
  const [marked] = useMarked()
  const markedIds = useMemo(() => [...marked], [marked])

  const view = useMemo(() => {
    const v = s.view(preview || variant === 'C' || (variant === 'B' && s.showing?.face !== undefined), rev)
    return v ?? (times > 1 ? { doc: base } : null)
  }, [s.view, preview, variant, rev, times, base, s.showing])
  useEffect(() => onView(view), [view, onView])
  useEffect(() => () => onView(null), [onView])
  // Ett förslag som inte längre står öppet ligger inte kvar på väggen i A.
  useEffect(() => {
    if (variant !== 'C' && !s.showing) setPreview(false)
  }, [s.showing, variant])

  const shared: Shared = { s, doc: s.accepted, http, mode, row, marked: markedIds, saved, openKey: () => setKeyOpen(true), onStage, preview, setPreview, setSaved }
  void onRow
  return (
    <>
      {variant === 'A' && <VariantA {...shared} />}
      {variant === 'B' && <VariantB {...shared} />}
      {variant === 'C' && <VariantC {...shared} />}
      {(variant === 'C' || (variant === 'A' && preview)) && <Ghosts s={s} choose={variant === 'C'} />}
      <KeyDialog open={keyOpen} onClose={() => setKeyOpen(false)} saved={saved} onSave={(k) => setSaved(k)} onRemove={() => setSaved(null)} />
      <AiSwitch variant={variant ?? 'A'} hasKey={saved !== null} onKey={(on) => setSaved(on ? DEMO_KEY : null)} onReset={s.reset} />
    </>
  )
}

// Förslagets kort på den riktiga väggen: streckad kant och «Förslag» på nya kort, «Ändrat» på
// ändrade, och i C en knapp per kort för att ta med det eller lämna det.
function Ghosts({ s, choose }: { s: Session; choose: boolean }) {
  const marks = s.marks
  const ids = marks ? [...marks.added, ...marks.changed] : []
  const selector = ids.length ? ids.map((id) => `.byd-wall-card[data-card-ref="${CSS.escape(id)}"]`).join(',') : '.ux-ai-none'
  const slots = useSlots(selector)
  if (!marks) return null
  const rule = (list: string[], body: string) => (list.length ? `${list.map((id) => `.byd-wall-card[data-card-ref="${CSS.escape(id)}"] > .byd-wall-face`).join(',')} { ${body} }` : '')
  const left = new Set(marks.left)
  return (
    <>
      <style>
        {rule(marks.added, 'outline: 2px dashed var(--ux-ai-mark); outline-offset: 4px;')}
        {rule(marks.changed, 'outline: 2px solid var(--ux-ai-mark); outline-offset: 4px;')}
        {rule(marks.left, 'opacity: .38; filter: grayscale(.6);')}
      </style>
      {slots.map((slot) => {
        const id = slot.dataset['host'] ?? ''
        const added = marks.added.includes(id)
        const part = id
        const open = s.open !== null
        return (
          <Into key={id} slot={slot}>
            <span className="ux-ai-ghost">
              {choose && open ? (
                <button
                  type="button"
                  className="ux-ai-ghost-keep"
                  aria-pressed={!left.has(part)}
                  aria-label={`${added ? 'Föreslaget kort' : 'Föreslagen ändring'} ${id}: ${left.has(part) ? 'lämnas' : 'tas med'}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    s.toggle(part)
                  }}
                >
                  <span className="ux-ai-ghost-tag">
                    {left.has(part) ? '○' : '✓'} {added ? 'Förslag' : 'Ändrat'}
                  </span>
                </button>
              ) : (
                <span className="ux-ai-ghost-tag">{added ? 'Förslag' : 'Ändrat'}</span>
              )}
            </span>
          </Into>
        )
      })}
    </>
  )
}

// Prototypens växel (samma form som `PrototypeSwitcher`, men för `ai` och med nyckeln och utfallet).
export function AiSwitch({ variant, hasKey, onKey, onReset }: { variant: string; hasKey: boolean; onKey(on: boolean): void; onReset(): void }) {
  const [ren] = useParam('ren')
  const [outcome, setOutcome] = useParam('utfall')
  const [scale, setScale] = useParam('skala')
  const [open, setOpen] = useState(false)
  const go = (key: string) => {
    const url = new URL(location.href)
    url.searchParams.set('ai', key)
    location.assign(url)
  }
  const index = Math.max(0, KEYS.indexOf(variant))
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (!event.altKey || target?.closest('input, textarea, select, [contenteditable]')) return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      go(KEYS[(index + (event.key === 'ArrowLeft' ? -1 : 1) + KEYS.length) % KEYS.length]!)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [index])
  if (ren !== null) return null
  const original = new URL(location.href)
  for (const k of ['ai', 'nyckel', 'utfall', 'skala']) original.searchParams.delete(k)
  return (
    <nav className="ux-ai-switch" aria-label="Prototypvarianter" data-open={open ? '' : undefined}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        <small>PROTOTYP #940</small> {variant} {open ? '▾' : '▸'}
      </button>
      {open && (
        <div className="ux-ai-switch-body">
          {KEYS.map((k) => (
            <button key={k} type="button" aria-pressed={k === variant} onClick={() => go(k)}>
              {k === 'nyckel' ? 'Nyckel' : k} — {NAMES[k]}
            </button>
          ))}
          <label>
            <input type="checkbox" checked={hasKey} onChange={(e) => onKey(e.target.checked)} /> Har en nyckel
          </label>
          <label>
            Utfall{' '}
            <select value={outcome ?? 'svar'} onChange={(e) => setOutcome(e.target.value === 'svar' ? null : e.target.value)}>
              <option value="svar">Ett vanligt svar</option>
              <option value="nyckel">Leverantören säger nej</option>
              <option value="oanvandbart">Förslaget går inte att använda</option>
            </select>
          </label>
          <label>
            Lek{' '}
            <select
              value={scale ?? '1'}
              onChange={(e) => {
                setScale(e.target.value === '1' ? null : e.target.value)
                location.reload()
              }}
            >
              <option value="1">Provleken, 77 kort</option>
              <option value="4">Skalad, 308 kort</option>
            </select>
          </label>
          <button type="button" onClick={onReset}>
            Återställ
          </button>
          <a href={original.href}>Original</a>
          <small>Alt + ← → byter variant</small>
        </div>
      )}
    </nav>
  )
}
