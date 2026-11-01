import { useT } from '../i18n/index.js'
import { BookGlyph } from '../glyphs.js'

// The read-only mode on Mina spel (#1492, beställarens beslut variant A, G5): the account's
// subscription has lapsed, and the games over the free tier's ceilings may be opened, read and
// exported but not changed. Said once, in the band under the heading, second in its queue after the
// terms (#1272) and before the name (#1254) and the passkey (L78); each game says its own reason on
// its row. «Stäng» closes it for this lapse in this browser; the marks on the games remain.
export function ReadOnlyOffer({ count, onClose }: { count: number; onClose(): void }) {
  const t = useT()
  return (
    <section className="byd-passkey-offer byd-read-only-offer" aria-label={t('home.readOnly.label')}>
      <BookGlyph />
      <p>
        <b>{t(count === 1 ? 'home.readOnly.title.one' : 'home.readOnly.title.other', { n: count })}</b> {t('home.readOnly.body')}
        <small>{t('home.readOnly.way')}</small>
      </p>
      <div className="byd-passkey-offer-answers">
        <button type="button" className="byd-secondary" onClick={onClose}>
          {t('home.readOnly.close')}
        </button>
      </div>
    </section>
  )
}
