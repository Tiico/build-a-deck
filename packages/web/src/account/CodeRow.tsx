import { useCodeField } from '../join/codeField.js'
import { useT } from '../i18n/index.js'

// The start page's way in for whoever came to play and not to make (#675, beslut C 2026-10-06): a
// row under the login card — the card itself stays as it is — with a field for the room's code and
// a button that takes it to the room's own address. The question is the field's visible name, so
// what is read out is what is written (WCAG 2.5.3).
export function CodeRow({ server, onNavigate }: { server: string | null; onNavigate(url: string): void }) {
  const t = useT()
  const { field, says, pressed, saysId, input, submit } = useCodeField({ id: 'byd-code-row', server, onOpen: onNavigate })
  return (
    <form
      className="byd-code-row"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <label htmlFor="byd-code-row-field">{t('home.code.ask')}</label>
      <input id="byd-code-row-field" ref={field} {...input} />
      <button type="submit" className="byd-secondary">
        {t('home.code.go')}
      </button>
      {says && (
        <p className="byd-code-says" id={saysId} {...(pressed ? { role: 'alert' } : {})}>
          {says}
        </p>
      )}
    </form>
  )
}
