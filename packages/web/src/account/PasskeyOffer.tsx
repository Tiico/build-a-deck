import { useEffect, useState } from 'react'
import { useT } from '../i18n/index.js'
import { useSay } from '../status/StatusLive.js'
import { CheckGlyph, KeyGlyph } from '../glyphs.js'
import { offerable, here, savePasskey, useKeychain } from './passkey.js'

// The offer on Mina spel (#1180, beslut A): a green band under the heading, in the account's green
// as «Pågår nu» is, where the reader lands after the link anyway. It can be passed by; «Inte nu» is
// remembered in this browser, and so is a passkey saved here, so the offer is made once.
export function PasskeyOffer({ http }: { http: string }) {
  const t = useT()
  const say = useSay()
  const keychain = useKeychain()
  const [state, setState] = useState<'hidden' | 'open' | 'busy' | 'failed' | 'saved' | 'already'>('hidden')
  useEffect(() => {
    let live = true
    void offerable(keychain).then((yes) => live && yes && setState('open'))
    return () => {
      live = false
    }
  }, [keychain])
  if (state === 'hidden') return null
  if (state === 'saved' || state === 'already') {
    return (
      // Drawn with its text and said once in the page's live region, as the claim's banner is (#555).
      <p className="byd-home-claimed byd-passkey-done">
        <CheckGlyph />
        {t(state === 'saved' ? 'passkey.offer.saved' : 'passkey.offer.already')}
      </p>
    )
  }
  const save = () => {
    setState('busy')
    void savePasskey(http, keychain).then((saved) => {
      if (saved === 'saved' || saved === 'already') say?.('polite', t(saved === 'saved' ? 'passkey.offer.saved' : 'passkey.offer.already'))
      setState(saved === 'cancelled' ? 'open' : saved)
    })
  }
  return (
    <section className="byd-passkey-offer" aria-label={t('passkey.offer.label')}>
      <KeyGlyph />
      <p>
        <b>{t('passkey.offer.title')}</b> {t('passkey.offer.body')}
        {state === 'failed' && (
          <span className="byd-passkey-failed" role="alert">
            {' '}
            {t('passkey.offer.failed')}
          </span>
        )}
      </p>
      <div className="byd-passkey-offer-answers">
        <button type="button" className="byd-primary" disabled={state === 'busy'} onClick={save}>
          {t('passkey.offer.save')}
        </button>
        <button
          type="button"
          className="byd-secondary"
          onClick={() => {
            here.decline()
            setState('hidden')
          }}
        >
          {t('passkey.offer.later')}
        </button>
      </div>
    </section>
  )
}
