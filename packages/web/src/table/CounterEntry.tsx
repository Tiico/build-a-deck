import { useEffect, useRef, useState, type KeyboardEvent as RKeyboardEvent } from 'react'
import type { Snapshot, VisibleComponentState } from '@byd/protocol'
import { ownerOf } from './keyboard.js'
import { useT } from '../i18n/index.js'

// "Sätt värde…" (C4, #67): a counter's value said outright. The phone's `CountersRow` asks with
// `prompt()`, and the table screen cannot answer that — it is a TV with a finger on it and no
// keyboard — so the number is written on the tool's own keys, laid over the felt where the ring
// was. A hand on a physical keyboard types straight into the same sheet; the keys are the same
// keys, only drawn.
//
// Its manners are `Question.tsx`'s and the address panel's: it takes the focus so it is answered
// where it is read, it answers Escape, and it traps nothing. The one thing it sends is
// `setCounter` with the number said, and nothing until it is said.
//
// It opens on the value the chip has, shown but not yet kept: the first key pressed replaces it
// rather than trailing it, because nobody who wants 5 wants 205. Erasing everything leaves no
// number to send, and the sheet says so by refusing to confirm rather than by sending a zero
// nobody asked for.
export type CounterEntryProps = {
  view: Snapshot
  c: VisibleComponentState
  onSet(value: number): void
  onClose(): void
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const

export function CounterEntry({ view, c, onSet, onClose }: CounterEntryProps) {
  const t = useT()
  const [typed, setTyped] = useState(String(c.counter ?? 0))
  const [fresh, setFresh] = useState(true)
  const root = useRef<HTMLDivElement | null>(null)
  useEffect(() => root.current?.focus(), [])
  const name = c.cardRef ?? ''
  const owner = ownerOf(view, c)
  const value = /^-?\d+$/.test(typed) ? Number(typed) : null

  const digit = (d: string) => {
    setTyped(fresh || typed === '0' ? d : typed === '-0' ? `-${d}` : typed + d)
    setFresh(false)
  }
  const erase = () => {
    setTyped(fresh ? '' : typed.slice(0, -1))
    setFresh(false)
  }
  const sign = () => {
    setTyped(typed.startsWith('-') ? typed.slice(1) : `-${typed}`)
    setFresh(false)
  }
  const confirm = () => {
    if (value === null) return
    onSet(value)
    onClose()
  }
  const onKeyDown = (e: RKeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
      return
    }
    // A button that has the focus answers Enter and Space on its own; taking Enter here as well
    // would say the value twice.
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON') {
      e.preventDefault()
      confirm()
      return
    }
    if (/^[0-9]$/.test(e.key)) digit(e.key)
    else if (e.key === 'Backspace') erase()
    else if (e.key === '-' || e.key === '+') sign()
    else return
    e.preventDefault()
  }

  return (
    <div className="byd-kbd-backdrop byd-set-value-backdrop" onClick={onClose}>
      <div
        ref={root}
        className="byd-set-value"
        data-set-value={c.id}
        role="dialog"
        // Not modal: the felt behind it is what the number is about.
        aria-modal="false"
        aria-label={t('counter.entry.label', { what: name })}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <h2>
          {name}
          {owner !== null && <small>{t('ring.counter.whose', { name: owner })}</small>}
        </h2>
        <output aria-label={t('counter.entry.value')} aria-live="polite">
          {typed}
        </output>
        <div className="byd-set-value-keys">
          {KEYS.map((k) => (
            <button key={k} type="button" onClick={() => digit(k)}>
              {k}
            </button>
          ))}
          <button type="button" aria-label={t('counter.entry.sign')} onClick={sign}>
            −
          </button>
          <button type="button" onClick={() => digit('0')}>
            0
          </button>
          <button type="button" aria-label={t('counter.entry.erase')} onClick={erase}>
            ⌫
          </button>
        </div>
        <div className="byd-set-value-foot">
          <button type="button" className="byd-secondary" onClick={onClose}>
            {t('counter.entry.cancel')}
          </button>
          <button type="button" className="byd-primary" disabled={value === null} onClick={confirm}>
            {t('counter.entry.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
