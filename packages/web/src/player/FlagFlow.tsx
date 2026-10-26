import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { Snapshot, VisibleComponentState } from '@byd/protocol'
import type { TableClient } from '../client.js'
import { Refusal, type RefusalHandle } from '../status/Refusal.js'
import { useT } from '../i18n/index.js'
import { Texture } from '../table/Texture.js'
import { cardName } from '../table/keyboard.js'
import { describeActivity, sayable } from '../table/describe.js'
import { ClockGlyph, CloseGlyph, FlagGlyph } from '../glyphs.js'
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
//
// Where the screen has a board — `/online` with its felt, the observer at a desk — the flag is not
// the phone's sheet but a panel docked beside the felt (`docked`, #1255, beställarens val B): the
// table is not dimmed, and while the panel stands a press on a card points it out, with no mode
// in between. The phone keeps its sheet.

// What a card that can be pointed out carries its id in: a card on the felt, in a hand, in a target,
// in front of a seat, and the face up top of a pile on the felt (#1397).
const MARKS = ['data-component', 'data-hand-card', 'data-area-card', 'data-mine-card', 'data-pile-top'] as const
const CARDS = MARKS.map((mark) => `[${mark}]`).join(', ')
const idOf = (el: Element): string | null => MARKS.reduce<string | null>((id, mark) => id ?? el.getAttribute(mark), null)

// The card a flag is about keeps the ring the pointer draws on it, wherever it is drawn, until the
// flag is sent, cancelled or rid of it (#1397, the prototype `play-arken.html?v=A`): with the
// mouse gone to the note, nothing else says which card the flag is about. A rule rather than an
// attribute set on the card, since the card is drawn anew where it moves, and a rule finds it
// there too. The look is `flagflow.css`'s ring under the pointer.
function PointedRing({ id }: { id: string }) {
  const at = MARKS.map((mark) => `:root[data-flag-pointing='panel'] [${mark}="${CSS.escape(id)}"]`).join(', ')
  return <style>{`${at} { outline: 3px solid var(--byd-warn, #ffd98a); outline-offset: 2px; }`}</style>
}

export type FlagFlowProps = {
  client: TableClient
  view: Snapshot
  // Where the textures are served from, for the card the sheet shows.
  faces: string | undefined
  refusal: RefusalHandle
  onClose(): void
  onFlagged(): void
  docked?: boolean
}

export function FlagFlow({ client, view, faces, refusal, onClose, onFlagged, docked = false }: FlagFlowProps) {
  const [note, setNote] = useState('')
  const [about, setAbout] = useState<VisibleComponentState | null>(null)
  const [pointing, setPointing] = useState(false)
  // The card as the view has it now, so a card that moved while the sheet stood is shown where it is.
  const card = about ? (view.components.find((c) => c.id === about.id) ?? about) : null
  const flag = (said: string | undefined) => {
    void refusal.watch(client.send({ v: 'flag', ...(card ? { component: card.id } : {}), ...(said ? { note: said } : {}) })).then((result) => {
      if (result.ok) onFlagged()
    })
  }
  const close = () => {
    refusal.clear()
    onClose()
  }
  if (docked)
    return (
      <FlagPanel
        client={client}
        view={view}
        faces={faces}
        refusal={refusal}
        note={note}
        onNote={setNote}
        card={card}
        onPoint={(id) => {
          const found = view.components.find((c) => c.id === id)
          if (found) setAbout(found)
        }}
        onDrop={() => setAbout(null)}
        onFlag={flag}
        onClose={close}
      />
    )
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
      onFlag={flag}
      onClose={close}
    />
  )
}

// The screen while a card is pointed out: a band that says what the next press does and how to
// get out of it, and every press caught before the surface under it hears it.
function PointOut({ onPoint, onCancel }: { onPoint(id: string): void; onCancel(): void }) {
  const t = useT()
  const id = useId()
  const band = useRef<HTMLDivElement>(null)
  useEffect(() => band.current?.focus(), [])
  usePointOut({ how: 'band', keep: band, onPoint, onEscape: onCancel })
  return (
    <div className="byd-flag-point" ref={band} tabIndex={-1} role="status" aria-labelledby={`${id}-ask`}>
      <span id={`${id}-ask`}>{t('flag.point.ask')}</span>
      <button type="button" onClick={onCancel}>
        {t('flag.point.cancel')}
      </button>
    </div>
  )
}

// Every press outside `keep` caught before the surface under it hears it, and a press on a card
// pointing it out. Caught on the document in the capture phase, so the felt's drag, the strip's hold
// and the ring are never started; a disclosure (`summary`) still opens, and a tab still turns
// (#1147), since the card may lie folded away under one or on a tab that is not open. `how` is what
// the root says while it lasts: the band rings every card it can point out, the panel the one under
// the pointer.
//
// Put up and taken down in the commit that draws and removes the band or the panel, and not an
// effect later (#1390): a passive effect runs after the commit, so for a while after the panel had
// left the screen every button stood dimmed and the next press — «Lämna…» — was caught and eaten.
function usePointOut({ how, keep, onPoint, onEscape }: { how: 'band' | 'panel'; keep: RefObject<HTMLElement | null>; onPoint(id: string): void; onEscape(): void }) {
  const latest = useRef({ onPoint, onEscape })
  latest.current = { onPoint, onEscape }
  useLayoutEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-flag-pointing', how)
    const ours = (target: EventTarget | null): Element | null => {
      if (!(target instanceof Element)) return null
      if (keep.current?.contains(target) || target.closest('summary, [role="tab"]')) return null
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
        latest.current.onEscape()
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
  }, [how, keep])
}

// The panel a screen with a board flags from (#1255): what the flag stamps — the moment, said as
// the last line of the log, and the card if one is pointed out, large enough to read — and the
// note under them. It is no modal window: the felt beside it is live for pointing, Tab leaves it
// for the cards, and Escape, Avbryt and the cross all close it. The focus goes to the note, and
// back to whatever had it when the panel closes.
type FlagPanelProps = {
  client: TableClient
  view: Snapshot
  faces: string | undefined
  refusal: RefusalHandle
  note: string
  onNote(note: string): void
  card: VisibleComponentState | null
  onPoint(id: string): void
  onDrop(): void
  onFlag(note: string | undefined): void
  onClose(): void
}

function FlagPanel({ client, view, faces, refusal, note, onNote, card, onPoint, onDrop, onFlag, onClose }: FlagPanelProps) {
  const t = useT()
  const id = useId()
  const box = useRef<HTMLElement>(null)
  const text = useRef<HTMLTextAreaElement>(null)
  usePointOut({ how: 'panel', keep: box, onPoint, onEscape: onClose })
  useEffect(() => {
    const from = document.activeElement
    const panel = box.current
    text.current?.focus()
    return () => {
      // Only a focus that went with the panel is given back; one the reader moved on is left.
      const now = document.activeElement
      if (now && now !== document.body && !panel?.contains(now)) return
      if (from instanceof HTMLElement && from.isConnected) from.focus()
    }
  }, [])
  // The last thing that happened at the table, which a flag or a line on the notepad is not.
  const last = sayable(client.activity).reverse().find((l) => l.intent.v !== 'flag' && !l.intent.v.startsWith('note.'))
  const send = () => onFlag(note.trim() || undefined)
  return (
    <aside className="byd-flag-panel" ref={box} role="dialog" aria-labelledby={`${id}-title`}>
      {card ? <PointedRing id={card.id} /> : null}
      <header className="byd-flag-panel-head">
        <FlagGlyph />
        <h2 id={`${id}-title`}>{t('flag.panel.title')}</h2>
        <button type="button" className="byd-flag-panel-x" onClick={onClose} aria-label={t('flag.panel.close')} title={t('flag.panel.close')}>
          <CloseGlyph />
        </button>
      </header>
      <section className="byd-flag-panel-part">
        <h3>{t('flag.panel.moment')}</h3>
        <p className="byd-flag-panel-moment">
          <ClockGlyph />
          <span>{last ? describeActivity(last, view, t) : t('flag.panel.moment.none')}</span>
        </p>
        <small>{t('flag.panel.moment.sub')}</small>
      </section>
      <section className="byd-flag-panel-part">
        <h3>
          {t('flag.panel.card')} <span>{t('flag.panel.card.optional')}</span>
        </h3>
        {card ? (
          <div className="byd-flag-panel-card">
            <span className="byd-flag-panel-face">
              <Texture faces={faces} c={card} />
            </span>
            <div>
              <b>{cardName(card, t)}</b>
              <small>{t('flag.sheet.card.seen')}</small>
              <small>{t('flag.panel.card.swap')}</small>
              <button type="button" className="byd-flag-panel-drop" onClick={onDrop}>
                {t('flag.panel.card.drop')}
              </button>
            </div>
          </div>
        ) : (
          <p className="byd-flag-panel-pick">
            <b>{t('flag.panel.pick')}</b>
            {t('flag.panel.pick.sub')}
          </p>
        )}
      </section>
      <section className="byd-flag-panel-part byd-flag-panel-note">
        <h3>
          <label htmlFor={`${id}-note`}>{t('flag.panel.note')}</label>
        </h3>
        <textarea
          id={`${id}-note`}
          ref={text}
          placeholder={t('flag.sheet.note')}
          value={note}
          maxLength={280}
          onChange={(e) => onNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey)) return
            e.preventDefault()
            send()
          }}
        />
      </section>
      <footer className="byd-flag-panel-foot">
        <small aria-hidden="true">
          <kbd>{MOD}</kbd>
          <kbd>↵</kbd> {t('flag.panel.keys')}
        </small>
        <button type="button" data-kind="quiet" onClick={onClose}>
          {t('flag.sheet.cancel')}
        </button>
        <button type="button" data-kind="flag" onClick={send} className={refusal.notice ? 'byd-status-refused-control' : undefined} {...refusal.control}>
          {t('flag.sheet.flag')}
        </button>
      </footer>
      <Refusal handle={refusal} />
    </aside>
  )
}

// The key that sends with Enter, as the keyboard in front of the reader names it.
const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'
