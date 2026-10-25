import { useState, type FormEvent } from 'react'
import { useT } from '../i18n/index.js'
import { useSay } from '../status/StatusLive.js'
import { PersonGlyph } from '../glyphs.js'
import { NAME_MAX, saveName, suggestedName } from './api.js'

// The question on Mina spel for an account that was made before the name (#1254, variant C): the
// welcome step's question, in the passkey band's form (L78) and in its place, with the suggestion
// filled in. «Inte nu» keeps no name and is the answer all the same: the band is not shown again,
// here or in another browser. Only one band at a time — the passkey's waits until this one is
// answered (beslutet om banden).
export function NameOffer({ http, email, onAnswered }: { http: string; email: string; onAnswered(name: string | null): void }) {
  const t = useT()
  const say = useSay()
  const [name, setName] = useState(() => suggestedName(email) ?? '')
  const [state, setState] = useState<'open' | 'busy' | 'failed'>('open')
  const answer = async (given: string | null) => {
    setState('busy')
    try {
      const saved = await saveName(http, given)
      if (saved === false) return setState('failed')
      if (saved.name !== null) say?.('polite', t('name.offer.saved'))
      onAnswered(saved.name)
    } catch {
      setState('failed')
    }
  }
  const save = (e: FormEvent) => {
    e.preventDefault()
    void answer(name.trim() === '' ? null : name)
  }
  return (
    <section className="byd-passkey-offer byd-name-offer" aria-label={t('name.offer.label')}>
      <PersonGlyph />
      <p>
        <b>{t('name.offer.title')}</b> {t('name.offer.body')}
        {state === 'failed' && (
          <span className="byd-passkey-failed" role="alert">
            {' '}
            {t('name.offer.failed')}
          </span>
        )}
      </p>
      <form className="byd-passkey-offer-answers" onSubmit={save}>
        <input value={name} maxLength={NAME_MAX} aria-label={t('name.offer.field')} placeholder={t('name.offer.field')} autoComplete="name" onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="byd-primary" disabled={state === 'busy'}>
          {t('name.offer.save')}
        </button>
        <button type="button" className="byd-secondary" disabled={state === 'busy'} onClick={() => void answer(null)}>
          {t('name.offer.later')}
        </button>
      </form>
    </section>
  )
}
