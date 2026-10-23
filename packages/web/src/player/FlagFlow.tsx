import { useEffect, useId, useRef, useState } from 'react'
import type { Snapshot, VisibleComponentState } from '@byd/protocol'
import type { TableClient } from '../client.js'
import type { RefusalHandle } from '../status/Refusal.js'
import { useT } from '../i18n/index.js'
import { FlagSheet } from './SessionSheets.js'
import './flagflow.css'

// Flagging, from the press on «Flagga» to the line in the log (G3), on every surface that flags:
// the phone, the window online and the observer. One flow and not three, because what it does to
// the screen while a card is pointed out is the same everywhere.
//
// A flag may be about a card (#1142, beställarens val 2026-10-22: «B · peka efter flaggan»). The
// sheet asks first whether it is the moment or a card; «Ett kort…» puts the sheet away and makes
// the next press on a card point it out, and nothing else: it neither reads, plays, lifts nor
// drags the card, and nothing that is not a card answers at all. The sheet then comes back with
// the card in it and the note as it was left. A card is whatever a surface draws with its id —
// the felt's cards, the hands, the zones in front of you — so a face-down pile, which hands out
// none (K15), cannot be pointed out, exactly as the server would refuse it.
const CARDS = '[data-component], [data-hand-card], [data-area-card], [data-mine-card]'
const idOf = (el: Element): string | null => el.getAttribute('data-component') ?? el.getAttribute('data-hand-card') ?? el.getAttribute('data-area-card') ?? el.getAttribute('data-mine-card')

export type FlagFlowProps = {
  client: TableClient
  view: Snapshot
  // Where the textures are served from, for the card the sheet shows.
  faces: string | undefined
  refusal: RefusalHandle
  onClose(): void
  onFlagged(): void
}

export function FlagFlow({ client, view, faces, refusal, onClose, onFlagged }: FlagFlowProps) {
  const [note, setNote] = useState('')
  const [about, setAbout] = useState<VisibleComponentState | null>(null)
  const [pointing, setPointing] = useState(false)
  // The card as the view has it now, so a card that moved while the sheet stood is shown where it is.
  const card = about ? (view.components.find((c) => c.id === about.id) ?? about) : null
  if (pointing)
    return (
      <PointOut
        onPoint={(id) => {
          const found = view.components.find((c) => c.id === id)
          if (!found) return
          setAbout(found)
          setPointing(false)
        }}
        onCancel={() => setPointing(false)}
      />
    )
  return (
    <FlagSheet
      refusal={refusal}
      note={note}
      onNote={setNote}
      about={card ? { card, faces, onDrop: () => setAbout(null) } : null}
      onPoint={() => {
        refusal.clear()
        setPointing(true)
      }}
      onFlag={(said) => {
        void refusal.watch(client.send({ v: 'flag', ...(card ? { component: card.id } : {}), ...(said ? { note: said } : {}) })).then((result) => {
          if (result.ok) onFlagged()
        })
      }}
      onClose={() => {
        refusal.clear()
        onClose()
      }}
    />
  )
}

// The screen while a card is pointed out: a band that says what the next press does and how to
// get out of it, and every press caught before the surface under it hears it. Caught on the
// document in the capture phase, so the felt's drag, the strip's hold and the ring are never
// started; a disclosure (`summary`) still opens, since the card may lie folded away under one.
function PointOut({ onPoint, onCancel }: { onPoint(id: string): void; onCancel(): void }) {
  const t = useT()
  const id = useId()
  const band = useRef<HTMLDivElement>(null)
  const latest = useRef({ onPoint, onCancel })
  latest.current = { onPoint, onCancel }
  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-flag-pointing', 'true')
    band.current?.focus()
    const ours = (target: EventTarget | null): Element | null => {
      if (!(target instanceof Element)) return null
      if (band.current?.contains(target) || target.closest('summary')) return null
      return target
    }
    const still = (e: Event) => {
      const el = ours(e.target)
      if (!el) return
      e.stopPropagation()
      if (el.closest(CARDS)) e.preventDefault()
    }
    const press = (e: MouseEvent) => {
      const el = ours(e.target)
      if (!el) return
      e.stopPropagation()
      e.preventDefault()
      const card = el.closest(CARDS)
      const picked = card && idOf(card)
      if (picked) latest.current.onPoint(picked)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        e.preventDefault()
        latest.current.onCancel()
        return
      }
      if (e.key !== 'Enter' && e.key !== ' ') return
      const card = ours(e.target)?.closest(CARDS)
      const picked = card && idOf(card)
      if (!picked) return
      e.stopPropagation()
      e.preventDefault()
      latest.current.onPoint(picked)
    }
    const quiet = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'dblclick', 'contextmenu'] as const
    for (const type of quiet) document.addEventListener(type, still, true)
    document.addEventListener('click', press, true)
    document.addEventListener('keydown', key, true)
    return () => {
      root.removeAttribute('data-flag-pointing')
      for (const type of quiet) document.removeEventListener(type, still, true)
      document.removeEventListener('click', press, true)
      document.removeEventListener('keydown', key, true)
    }
  }, [])
  return (
    <div className="byd-flag-point" ref={band} tabIndex={-1} role="status" aria-labelledby={`${id}-ask`}>
      <span id={`${id}-ask`}>{t('flag.point.ask')}</span>
      <button type="button" onClick={onCancel}>
        {t('flag.point.cancel')}
      </button>
    </div>
  )
}
