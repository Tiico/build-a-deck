import { useEffect, useRef } from 'react'
import type { Intent, Snapshot, VisibleComponentState } from '@byd/protocol'
import { placesFor, verbsFor, type Place, type Thing } from './keyboard.js'
import { useT } from '../i18n/index.js'
import './keyboard.css'

// The address panel (#1, #2, variant C). Enter on anything on the felt or in the hand opens it:
// **Gör** — the verbs the pointer's ring already has — and **Flytta till** — every place that has
// a name at all. A point on the felt has no name, so the panel says so in its own row rather than
// pretending it can be reached; that honesty is the whole cost of this model.
//
// Its manners are `Question.tsx`'s, settled in #17 and #19 and applied here to a list of verbs
// and places instead of an answer: it takes the focus so it is answered where it is read, it
// answers Escape, it hands the focus back to whatever opened it, and it traps nothing — a person
// who tabs past it simply leaves it standing.
export type ActionPanelProps = {
  view: Snapshot
  thing: Thing
  // The cards this panel acts on when several are marked in the hand (K3); empty means the thing.
  cards: readonly string[]
  onClose(): void
  // Runs one envelope and says where the focus should stand once the table has answered. What
  // went through is announced by the activity feed, in `describeActivity`'s own words.
  onRun(intents: Intent[], landedOn?: string): void
  onLook(c: VisibleComponentState): void
  intentsFor(place: Place, moving: readonly string[]): Intent[]
  landedKey(place: Place): string
}

export function ActionPanel({ view, thing, cards, onClose, onRun, onLook, intentsFor, landedKey }: ActionPanelProps) {
  const t = useT()
  const moving = cards.length > 0 ? [...cards] : thing.kind === 'card' ? [thing.id] : []
  const verbs = verbsFor(view, thing, t)
  // A thing is never offered the place it already is: a card its own zone, a pile itself —
  // the table refuses "cannot split a pile onto itself", so the panel does not ask.
  const places = placesFor(view, new Set(moving), thing.kind === 'card' ? thing.zone : thing.pile, t)
  const first = useRef<HTMLButtonElement | null>(null)
  useEffect(() => first.current?.focus(), [])
  // Several marked cards are counted; a single thing is called what it is called, which for a
  // card and a zone is the designer's word (B5).
  const what = cards.length > 1 ? t('play.cards.other', { n: cards.length }) : thing.name

  return (
    <div className="byd-kbd-backdrop" onClick={onClose}>
      <div
        className="byd-kbd-panel"
        role="dialog"
        // Not modal: the felt behind it is what the answer is about, and it must stay readable
        // and reachable. Nothing here takes the keyboard hostage.
        aria-modal="false"
        aria-label={t('kbd.panel.label', { what })}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return
          e.stopPropagation()
          onClose()
        }}
      >
        <h2>{what}</h2>
        {verbs.length > 0 && <h3>{t('kbd.panel.do')}</h3>}
        <div className="byd-kbd-list">
          {verbs.map((a, i) => (
            <button
              key={a.key}
              type="button"
              disabled={a.intents === null}
              ref={i === 0 ? first : undefined}
              onClick={() => {
                if (a.look !== undefined) {
                  const c = view.components.find((x) => x.id === a.look)
                  if (c) onLook(c)
                  return
                }
                if (a.intents) onRun(a.intents)
              }}
            >
              <span>{a.label}</span>
              {a.hint !== undefined && <small>{a.hint}</small>}
            </button>
          ))}
        </div>
        <h3>{t('kbd.panel.moveTo')}</h3>
        <div className="byd-kbd-list">
          {places.map((p) => (
            <button key={p.key} type="button" onClick={() => onRun(intentsFor(p, moving), landedKey(p))}>
              <span>{p.label}</span>
              <small>{p.hint}</small>
            </button>
          ))}
          {/* The one address a keyboard cannot say. It is a row and not a silence. */}
          <button type="button" disabled className="byd-kbd-no">
            <span>{t('kbd.panel.free')}</span>
            <small>{t('kbd.panel.free.hint')}</small>
          </button>
        </div>
        <button type="button" className="byd-kbd-close" onClick={onClose}>
          {t('kbd.panel.close')}
        </button>
      </div>
    </div>
  )
}
