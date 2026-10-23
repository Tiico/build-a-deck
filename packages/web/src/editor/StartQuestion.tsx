import { useId, useRef, useState } from 'react'
import { useDoor } from '../doors.js'
import { useT } from '../i18n/index.js'
import { PlayGlyph } from '../glyphs.js'
import { useFocusTrap } from './focusTrap.js'
import { rememberedStart, type Seating, type StartAnswer } from './startAnswer.js'
import '../account/game-dialogs.css'
import './start-question.css'

// As long as a name may be anywhere a seat is claimed (`seat.claim`).
const NAME_MAX = 64

// «Starta» on a game without a table asks how you sit (L75, #1130), once, before the table exists.
//
// The answer chooses which screen the host gets — the TV view for a room around one screen, or a
// seat of her own at `/online` — and not a mode of the table (C2): the session is the same either
// way, and a mixed table works as before. It is a window and not a strip, the same window a game's
// name is changed in (#738): what is behind it is not what is being asked about, and it holds a
// field.
export function StartQuestion({ onStart, onCancel }: { onStart(answer: StartAnswer): void; onCancel(): void }) {
  const t = useT()
  const id = useId()
  const box = useRef<HTMLDivElement>(null)
  const [answer, setAnswer] = useState(rememberedStart)
  // The window opens on the answer that is chosen, which is where the arrow keys change it.
  useFocusTrap(box, { initial: () => box.current?.querySelector<HTMLElement>('input[type="radio"]:checked') ?? null })
  useDoor('standing', onCancel)
  const name = answer.name.trim()
  const ready = answer.seating === 'screen' || name !== ''
  const choice = (seating: Seating) => (
    <label className="byd-start-choice">
      <input
        type="radio"
        name={`${id}-how`}
        value={seating}
        checked={answer.seating === seating}
        aria-labelledby={`${id}-${seating}`}
        aria-describedby={`${id}-${seating}-body`}
        onChange={() => setAnswer((now) => ({ ...now, seating }))}
      />
      <b id={`${id}-${seating}`}>{t(`editor.start.${seating}`)}</b>
      <span id={`${id}-${seating}-body`}>{t(`editor.start.${seating}.body`)}</span>
    </label>
  )
  return (
    <div className="byd-game-scrim" role="presentation">
      <div ref={box} className="byd-game-dialog byd-start" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
        <h2 id={`${id}-title`}>{t('editor.start.title')}</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (ready) onStart({ seating: answer.seating, name })
          }}
        >
          <p id={`${id}-how`} className="byd-muted">
            {t('editor.start.how')}
          </p>
          <div className="byd-start-choices" role="radiogroup" aria-labelledby={`${id}-how`}>
            {choice('screen')}
            {choice('computer')}
          </div>
          {answer.seating === 'computer' && (
            <label className="byd-game-field">
              {t('editor.start.name')}
              <input type="text" value={answer.name} maxLength={NAME_MAX} aria-required="true" autoComplete="nickname" onChange={(event) => setAnswer((now) => ({ ...now, name: event.target.value }))} />
            </label>
          )}
          <div className="byd-game-dialog-actions">
            <button type="button" className="byd-secondary" onClick={onCancel}>
              {t('editor.cancel')}
            </button>
            <button type="submit" className="byd-primary" disabled={!ready}>
              <PlayGlyph /> {t(answer.seating === 'computer' ? 'editor.start.go.computer' : 'editor.start.go.screen')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
