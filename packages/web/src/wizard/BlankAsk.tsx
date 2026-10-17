import { Question } from '../editor/Question.js'
import { useT } from '../i18n/index.js'
import './wizard-ask.css'

// The question the door past the guided start asks before it leaves the guide's cards and fields
// behind (#732, L9, L42): the tool's one question, where the door was pressed. No first frame draws
// it, so it and its sheet travel behind a `lazy()` cut, as the overset marks do (#808), and not in
// the sheet the first painting blocks on (#366, L40).
export function BlankAsk({ onCancel, onConfirm }: { onCancel(): void; onConfirm(): void }) {
  const t = useT()
  return (
    <Question className="byd-wizard-blank-ask" label={t('wizard.blank.ask')} confirm={t('wizard.blank.ask.confirm')} onCancel={onCancel} onConfirm={onConfirm}>
      {t('wizard.blank.ask')}
    </Question>
  )
}
