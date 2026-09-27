import { useRef, useState } from 'react'
import { useFocusTrap } from '../editor/focusTrap.js'
import { Refusal, type RefusalHandle } from '../status/Refusal.js'
import { useT } from '../i18n/index.js'

// A sheet says `aria-modal="true"`, so it holds the keyboard while it stands (#484 fynd 7): Tab
// cycles inside it, Escape closes it wherever the focus fell, and the focus goes back to the
// control that opened it. The editor's modal trap (#296), which does exactly those things. `quiet`
// names the answer the sheet opens on, where that is not the first thing in it.
function useSheetTrap(onClose: () => void, opensOn?: string) {
  const box = useRef<HTMLDivElement>(null)
  useFocusTrap(box, { onEscape: onClose, ...(opensOn ? { initial: () => box.current?.querySelector<HTMLElement>(opensOn) ?? null } : {}) })
  return box
}

// Flagging a moment (G3, prototype A): a sheet with an optional note. Sends at once.
export function FlagSheet({ onFlag, onClose, refusal }: { onFlag(note: string | undefined): void; onClose(): void; refusal?: RefusalHandle }) {
  const t = useT()
  const [note, setNote] = useState('')
  const box = useSheetTrap(onClose)
  return (
    <div className="byd-sheet-backdrop" onClick={onClose}>
      <div
        className="byd-sheet byd-session-sheet"
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby="flag-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="byd-sheet-title" id="flag-sheet-title">{t('flag.sheet.title')}</p>
        <p>{t('flag.sheet.body')}</p>
        <textarea placeholder={t('flag.sheet.note')} value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} />
        <div className="byd-sheet-actions">
          <button type="button" data-kind="flag" onClick={() => onFlag(note.trim() || undefined)} className={refusal?.notice ? 'byd-status-refused-control' : undefined} {...(refusal?.control ?? {})}>
            {t('flag.sheet.flag')}
          </button>
          <button type="button" data-kind="quiet" onClick={onClose}>
            {t('flag.sheet.cancel')}
          </button>
        </div>
        {refusal && <Refusal handle={refusal} />}
      </div>
    </div>
  )
}

// The way out (#31, prototype variant C). The phone's control row is full at 375 px, so the exit
// is not a fourth control beside the red one — it replaces it, and the sheet behind it asks which
// way out is meant. The two are told apart by what they cost, written under each of them: your
// seat, or everyone's table. Ending still asks its own question afterwards, so it is one press
// further away than it was rather than one nearer.
export function ExitSheet({ onLeave, onEnd, onClose, refusal }: { onLeave(): void; onEnd(): void; onClose(): void; refusal?: RefusalHandle }) {
  const t = useT()
  const box = useSheetTrap(onClose, '[data-kind="quiet"]')
  return (
    <div className="byd-sheet-backdrop" onClick={onClose}>
      <div
        className="byd-sheet byd-session-sheet byd-exit-sheet"
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby="exit-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="byd-sheet-title" id="exit-sheet-title">{t('exit.sheet.title')}</p>
        <div className="byd-exit-choice">
          <button type="button" data-kind="leave" onClick={onLeave} className={refusal?.notice ? 'byd-status-refused-control' : undefined} {...(refusal?.control ?? {})}>
            {t('exit.sheet.leave')}
          </button>
          <p>{t('exit.sheet.leave.body')}</p>
        </div>
        <div className="byd-exit-choice">
          <button type="button" data-kind="no" onClick={onEnd}>
            {t('exit.sheet.end')}
          </button>
          <p>{t('exit.sheet.end.body')}</p>
        </div>
        <div className="byd-sheet-actions">
          <button type="button" data-kind="quiet" onClick={onClose}>
            {t('exit.sheet.stay')}
          </button>
        </div>
        {refusal && <Refusal handle={refusal} />}
      </div>
    </div>
  )
}

// Ending the session (C9): says what it means, then does it for everyone.
export function EndSheet({ version, onEnd, onClose, refusal }: { version: string; onEnd(): void; onClose(): void; refusal?: RefusalHandle }) {
  const t = useT()
  const box = useSheetTrap(onClose, '[data-kind="quiet"]')
  return (
    <div className="byd-sheet-backdrop" onClick={onClose}>
      <div
        className="byd-sheet byd-session-sheet"
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby="end-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="byd-sheet-title" id="end-sheet-title">{t('end.sheet.title')}</p>
        <p>{t('end.sheet.body', { version })}</p>
        <div className="byd-sheet-actions">
          <button type="button" data-kind="no" onClick={onEnd} className={refusal?.notice ? 'byd-status-refused-control' : undefined} {...(refusal?.control ?? {})}>
            {t('end.sheet.end')}
          </button>
          <button type="button" data-kind="quiet" onClick={onClose}>
            {t('end.sheet.not')}
          </button>
        </div>
        {refusal && <Refusal handle={refusal} />}
      </div>
    </div>
  )
}
