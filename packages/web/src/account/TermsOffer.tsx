import { useT } from '../i18n/index.js'
import { BookGlyph } from '../glyphs.js'

// The terms on Mina spel for an account that was there before them (#1272, variant B), or that put
// them off: first in the band queue, before the name (#1254) and the passkey (L78), one band at a
// time. «Läs och godkänn» opens the step as a dialog; «Inte nu» puts it off for the visit, and the
// next band in the queue takes its place. A material change says the version that is new (#1268,
// section 14); the first terms say that Deckster has them.
export function TermsOffer({ version, changed, onRead, onLater }: { version: string; changed: boolean; onRead(): void; onLater(): void }) {
  const t = useT()
  return (
    <section className="byd-passkey-offer byd-terms-offer" aria-label={t('terms.offer.label')}>
      <BookGlyph />
      <p>
        <b>{t(changed ? 'terms.offer.changed.title' : 'terms.offer.new.title')}</b> {changed ? t('terms.offer.changed.body', { version }) : t('terms.offer.new.body')}
      </p>
      <div className="byd-passkey-offer-answers">
        <button type="button" className="byd-primary" onClick={onRead}>
          {t('terms.offer.read')}
        </button>
        <button type="button" className="byd-secondary" onClick={onLater}>
          {t('terms.offer.later')}
        </button>
      </div>
    </section>
  )
}
