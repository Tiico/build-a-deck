import { useCallback, useEffect, useState } from 'react'
import { Question } from '../editor/Question.js'
import { useLang, useT, type Key } from '../i18n/index.js'
import { useSay } from '../status/StatusLive.js'
import { KeyGlyph, TrashGlyph } from '../glyphs.js'
import { provedWhen } from './KeyBox.js'
import { here, myPasskeys, removePasskey, savePasskey, useKeychain, type Passkey } from './passkey.js'

// The passkeys on the profile (#1180, beslut A): a card of their own between the AI key and the
// language, a row per passkey — the keychain it lives in, the browser it was saved from, «Den här
// webbläsaren» for this one — and the bin, with the one question first (L9). A browser with none of
// its own may save one here too.
export function PasskeyBox({ http }: { http: string }) {
  const t = useT()
  const { lang } = useLang()
  const say = useSay()
  const keychain = useKeychain()
  const [list, setList] = useState<Passkey[] | null>(null)
  const [asking, setAsking] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const load = useCallback(() => myPasskeys(http).then(setList, () => setFailed(true)), [http])
  useEffect(() => {
    void load()
  }, [load])
  if (!list) return null
  const nameOf = (p: Passkey) => t(`passkey.keychain.${p.keychain ?? 'unknown'}` as Key)
  // A keychain the service cannot name is not named in the question either.
  const ask = (p: Passkey) => (p.keychain ? t('profile.passkeys.remove.ask', { name: nameOf(p) }) : t('profile.passkeys.remove.ask.unknown'))
  const mine = here.id()
  const canAdd = keychain.supported() && mine !== 'known' && !list.some((p) => p.id === mine)
  return (
    <section className="byd-profile-card" aria-labelledby="byd-profile-passkeys">
      <h2 id="byd-profile-passkeys">{t('profile.passkeys.title')}</h2>
      <p className="byd-profile-lead">{t('profile.passkeys.lead')}</p>
      {list.length === 0 ? (
        <p className="byd-profile-quiet byd-profile-small">{t('profile.passkeys.none')}</p>
      ) : (
        <ul className="byd-passkeys">
          {list.map((p) => (
            <li key={p.id}>
              <span className="byd-passkey-icon">
                <KeyGlyph />
              </span>
              <span className="byd-passkey-text">
                <b>{nameOf(p)}</b>
                <small>{p.device}</small>
                {p.id === mine && <small className="byd-passkey-here">{t('profile.passkeys.here')}</small>}
                <small>{p.lastUsedAt ? t('profile.passkeys.used', { created: provedWhen(p.createdAt, lang, t), used: provedWhen(p.lastUsedAt, lang, t) }) : t('profile.passkeys.unused', { created: provedWhen(p.createdAt, lang, t) })}</small>
              </span>
              <button type="button" className="byd-passkey-remove" title={t('profile.passkeys.remove', { name: nameOf(p) })} aria-label={t('profile.passkeys.remove', { name: nameOf(p) })} onClick={() => setAsking(p.id)}>
                <TrashGlyph />
              </button>
              {asking === p.id && (
                <Question
                  className="byd-profile-question"
                  label={ask(p)}
                  confirm={t('profile.passkeys.remove.confirm')}
                  cancel={t('profile.passkeys.remove.keep')}
                  onCancel={() => setAsking(null)}
                  onConfirm={() => {
                    setAsking(null)
                    setFailed(false)
                    void removePasskey(http, p.id).then(
                      () => {
                        say?.('polite', t('profile.passkeys.removed'))
                        return load()
                      },
                      () => setFailed(true),
                    )
                  }}
                >
                  {ask(p)}
                </Question>
              )}
            </li>
          ))}
        </ul>
      )}
      {canAdd && (
        <div className="byd-profile-row">
          <button
            type="button"
            className="byd-secondary byd-profile-button byd-passkey-add"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              setFailed(false)
              void savePasskey(http, keychain).then(async (saved) => {
                if (saved === 'failed') setFailed(true)
                if (saved === 'saved' || saved === 'already') await load()
                setBusy(false)
              })
            }}
          >
            <KeyGlyph />
            {t('profile.passkeys.add')}
          </button>
        </div>
      )}
      {failed && (
        <p className="byd-profile-fail-line" role="alert">
          {t('profile.passkeys.failed')}
        </p>
      )}
    </section>
  )
}
