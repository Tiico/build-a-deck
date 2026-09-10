import { useState } from 'react'
import { Refusal, type RefusalHandle } from '../status/Refusal.js'
import { useT } from '../i18n/index.js'

// Flagging a moment (G3, prototype A): a sheet with an optional note. Sends at once.
export function FlagSheet({ onFlag, onClose, refusal }: { onFlag(note: string | undefined): void; onClose(): void; refusal?: RefusalHandle }) {
  const t = useT()
  const [note, setNote] = useState('')
  return (
    <div className="byd-sheet-backdrop" onClick={onClose}>
      <div
        className="byd-sheet byd-session-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="flag-sheet-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
        }}
      >
        <p className="byd-sheet-title" id="flag-sheet-title">{t('flag.sheet.title')}</p>
        <p>{t('flag.sheet.body')}</p>
        <textarea placeholder={t('flag.sheet.note')} value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} autoFocus />
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
  return (
    <div className="byd-sheet-backdrop" onClick={onClose}>
      <div
        className="byd-sheet byd-session-sheet byd-exit-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="exit-sheet-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
        }}
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
          <button type="button" data-kind="quiet" onClick={onClose} autoFocus>
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
  return (
    <div className="byd-sheet-backdrop" onClick={onClose}>
      <div
        className="byd-sheet byd-session-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="end-sheet-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
        }}
      >
        <p className="byd-sheet-title" id="end-sheet-title">{t('end.sheet.title')}</p>
        <p>{t('end.sheet.body', { version })}</p>
        <div className="byd-sheet-actions">
          <button type="button" data-kind="no" onClick={onEnd} className={refusal?.notice ? 'byd-status-refused-control' : undefined} {...(refusal?.control ?? {})}>
            {t('end.sheet.end')}
          </button>
          <button type="button" data-kind="quiet" onClick={onClose} autoFocus>
            {t('end.sheet.not')}
          </button>
        </div>
        {refusal && <Refusal handle={refusal} />}
      </div>
    </div>
  )
}
