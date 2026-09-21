import { Fragment, useEffect, useRef, useState, type RefObject } from 'react'
import { useDoor } from '../doors.js'
import { useT } from '../i18n/index.js'

// The discreet help (#224).
//
// A round `?` in the surface's lower right corner, always visible. The reason the owner chose it
// on: someone who does not know the commands exist has to be able to find them, which is the
// whole point — and a way in that only exists under a pointer does not exist for a keyboard or a
// finger. That was exactly the fault in #184.
//
// The list comes from outside and belongs to the surface, not to the button: the same component
// can stand on another surface and show that surface's own commands. It must not be put on a
// surface that does not *have* any yet, because then it promises something that is not there.
//
// The ways out are the ones already decided (#133, #152): Escape through `doors.ts`, a press
// outside, and the button itself. It traps nothing — tabbing past leaves it standing.

// One command can have more than one grip: the modifier click and the double click do the same
// thing, and two rows carrying one sentence is that sentence read twice for a single action.
export type Shortcut = { press: readonly string[]; what: string }

export function ShortcutHelp({ where, shortcuts }: { where: string; shortcuts: readonly Shortcut[] }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const opener = useRef<HTMLButtonElement | null>(null)
  const name = t('help.open', { where })
  // `?` is where help has lived since the terminal. It only opens: letting the same key close it
  // again would be one more way out, and the way out is Escape on every other surface in the tool.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '?' || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      const el = event.target
      if (el instanceof HTMLElement && (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return
      // A panel already standing open is what the key is about: the help must not lay itself over
      // the action list someone just opened on a card.
      if (el instanceof Element && el.closest('[role="dialog"]')) return
      event.preventDefault()
      setOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <div className="byd-shortcut-help">
      {open && <Panel name={name} where={where} shortcuts={shortcuts} opener={opener} onClose={() => setOpen(false)} />}
      {/* The disc is 34 px as the decision says; the button around it is 44, because `/online` is
          a surface held in a hand and C4 gives no target smaller than a fingertip. The two are not
          in conflict: one is what is drawn, the other what can be hit. */}
      <button ref={opener} type="button" className="byd-help-open" aria-expanded={open} aria-label={name} onClick={() => setOpen((was) => !was)}>
        <span>?</span>
      </button>
    </div>
  )
}

function Panel({ name, where, shortcuts, opener, onClose }: { name: string; where: string; shortcuts: readonly Shortcut[]; opener: RefObject<HTMLButtonElement | null>; onClose(): void }) {
  const t = useT()
  const panel = useRef<HTMLDivElement | null>(null)
  const latest = useRef({ opener, onClose })
  latest.current = { opener, onClose }
  useDoor('standing', () => {
    onClose()
    opener.current?.focus()
  })
  // It is read where it stands, so it takes focus on the way in — the same way as every other
  // panel over the work (`Question.tsx`, #17, #19). It has nothing to press, so focus sits on the
  // box itself.
  useEffect(() => {
    panel.current?.focus()
    const onDown = (event: Event) => {
      const now = latest.current
      const target = event.target
      if (!(target instanceof Element)) return
      // The button is left alone: it closes already, and closing on the way down would only let
      // the click that follows open it again.
      if (now.opener.current?.contains(target) || target.closest('[data-help-panel]')) return
      now.onClose()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [])
  return (
    <div ref={panel} className="byd-help-panel" data-help-panel role="dialog" aria-modal="false" aria-label={name} tabIndex={-1}>
      <h2>{t('help.title')}</h2>
      <p>{where}</p>
      <dl>
        {shortcuts.map((s) => (
          <Fragment key={s.press.join('/')}>
            <dt>
              {s.press.map((press) => (
                <kbd key={press}>{press}</kbd>
              ))}
            </dt>
            <dd>{s.what}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  )
}
