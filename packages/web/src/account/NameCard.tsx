import { useState, type FormEvent } from 'react'
import { NAME_MAX, suggestedName } from '@byd/server/doc'
import { useT } from '../i18n/index.js'
import { useSay } from '../status/StatusLive.js'
import { colourOf, initialOf } from './face.js'
import { saveName } from './me.js'

// «Namn», first on the profile (#1254): what the others call the designer, where it is changed at any
// time. The field, a line on what the name is for or what standing without one means, and the row the
// name makes in Dela, drawn as she types. A name is cleared by emptying the field and saving.
export function NameCard({ http, email, initial }: { http: string; email: string; initial: string | null }) {
  const t = useT()
  const say = useSay()
  const [name, setName] = useState(initial ?? '')
  const [state, setState] = useState<'open' | 'busy' | 'saved' | 'failed'>('open')
  const shown = name.trim()
  const save = async (e: FormEvent) => {
    e.preventDefault()
    setState('busy')
    try {
      const saved = await saveName(http, shown === '' ? null : name)
      if (saved === false) return setState('failed')
      setName(saved.name ?? '')
      setState('saved')
      say?.('polite', t('profile.name.saved'))
    } catch {
      setState('failed')
    }
  }
  // The counter stands only near the ceiling, where it is something to know.
  const length = [...name].length
  return (
    <section className="byd-profile-card" aria-labelledby="byd-profile-name">
      <h2 id="byd-profile-name">{t('profile.name.title')}</h2>
      <p className="byd-profile-lead">{t('profile.name.lead')}</p>
      <form className="byd-profile-form byd-profile-name" onSubmit={(e) => void save(e)}>
        <div className="byd-profile-field">
          <label htmlFor="byd-profile-name-field">{t('profile.name.field')}</label>
          <input
            id="byd-profile-name-field"
            value={name}
            maxLength={NAME_MAX}
            placeholder={suggestedName(email) ?? t('profile.name.placeholder')}
            autoComplete="name"
            onChange={(e) => {
              setName(e.target.value)
              if (state !== 'busy') setState('open')
            }}
            {...(state === 'failed' ? { 'aria-invalid': true } : {})}
          />
          {length > NAME_MAX - 10 && <span className="byd-profile-quiet byd-profile-count">{t('profile.name.count', { n: length, max: NAME_MAX })}</span>}
        </div>
        <p className="byd-profile-quiet byd-profile-small">{t(shown === '' ? 'profile.name.none' : 'profile.name.change')}</p>
        {/* The row the name makes in Dela, in the face's own colour, which follows the address. */}
        <div className="byd-profile-seen" style={{ ['--who' as string]: colourOf(email) }}>
          <i aria-hidden="true">{initialOf(shown === '' ? email : shown)}</i>
          <span>
            <b>{shown === '' ? email : shown}</b>
            <small>{t('profile.name.preview')}</small>
          </span>
        </div>
        {state === 'failed' && (
          <p className="byd-profile-fail-line" role="alert">
            {t('profile.name.failed')}
          </p>
        )}
        <div className="byd-profile-row">
          {/* The outline, not the fill: the profile's one filled button is the AI key's, or the way back
              to the game (L13), and a name is saved beside it rather than instead of it. */}
          <button type="submit" className="byd-secondary byd-profile-button" disabled={state === 'busy'}>
            {t('profile.name.save')}
          </button>
          {state === 'saved' && <p className="byd-profile-ok-line">{t('profile.name.saved')}</p>}
        </div>
      </form>
    </section>
  )
}
