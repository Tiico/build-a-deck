import { useEffect, useMemo, useState } from 'react'
import { DecksterMark } from '../brand/DecksterMark.js'
import { ArrowGlyph, ChevronGlyph } from '../glyphs.js'
import { useLang, useT } from '../i18n/index.js'
import { usePageTitle } from '../status/DocumentTitle.js'
import { Inline } from './Inline.js'
import { textOf, type Document } from './beta.js'
import './terms-page.css'

// /villkor — the beta's terms and privacy text on one page (#1272, beställarens beslut 2026-10-24,
// variant B). Each section is a row that says what it means in one sentence («Kort sagt») and opens to
// the whole text, which is what applies; «Visa all text» opens every row, for whoever searches or
// prints. «Villkor» and «Integritet» lead to the page's two halves, and `#integritet` is the privacy
// text's own address, as the row on the login card, Mina spel and the phone links it (#757).
//
// The version is the one the box has in force (`GET /terms`, #1270), and its text is `beta.ts`'s.
// The page is open to everyone: the terms are read before anyone accepts them. It is marked a draft
// that is not legally reviewed until the beställare says otherwise (F4 beslut 3).
export function TermsPage() {
  const t = useT()
  const { lang, setLang } = useLang()
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const server = params.get('server')
  const http = server ?? location.origin
  // The version in force, as the box says it; the newest text there is until it has answered, and if
  // it never does — the text does not wait for a line.
  const [version, setVersion] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    fetch(`${http}/terms`)
      .then((res) => res.json() as Promise<{ current?: { version?: unknown } | null }>)
      .then((body) => live && typeof body.current?.version === 'string' && setVersion(body.current.version))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [http])
  const text = textOf(version)
  const [all, setAll] = useState<boolean | null>(null)
  // A link to a half of the page lands on it once it is drawn.
  useEffect(() => {
    const id = location.hash.slice(1)
    if (id === 'integritet' || id === 'villkor') document.getElementById(id)?.scrollIntoView()
  }, [])
  // Which half is being read, for the row at the top to say: the privacy text from when its heading
  // has passed under the row.
  const [here, setHere] = useState<'villkor' | 'integritet'>('villkor')
  useEffect(() => {
    const read = () => setHere((document.getElementById('integritet')?.getBoundingClientRect().top ?? Infinity) < 160 ? 'integritet' : 'villkor')
    read()
    addEventListener('scroll', read, { passive: true })
    return () => removeEventListener('scroll', read)
  }, [])
  usePageTitle({ state: null })
  const home = server ? `/?${new URLSearchParams({ server }).toString()}` : '/'
  const href = (part: 'villkor' | 'integritet') => `#${part}`
  return (
    <main className="byd-terms-page" data-page="terms">
      <div className="byd-terms-bar">
        <a className="byd-terms-brand" href={home}>
          <DecksterMark className="byd-terms-brand-mark" />
          <span>Deckster</span>
        </a>
        <button type="button" className="byd-terms-lang" lang={lang === 'sv' ? 'en' : 'sv'} onClick={() => setLang(lang === 'sv' ? 'en' : 'sv')}>
          {t('terms.page.lang')}
        </button>
        <a className="byd-terms-home" href={home}>
          <ArrowGlyph to="left" />
          {t('status.act.home.start')}
        </a>
      </div>
      <article className="byd-terms-doc">
        <header>
          <p className="byd-terms-draft">{t('terms.page.draft')}</p>
          <h1>{t('terms.page.title')}</h1>
          <p className="byd-terms-meta">{t('terms.page.version', { version: text.version })}</p>
          <p className="byd-terms-intro">{t('terms.page.lead')}</p>
          {lang !== 'sv' && <p className="byd-terms-intro">{t('terms.page.swedish')}</p>}
        </header>
        <div className="byd-terms-parts">
          <nav aria-label={t('terms.page.parts')}>
            <a href="#villkor" {...(here === 'villkor' ? { 'aria-current': 'true' } : {})}>
              {t('terms.page.terms')}
            </a>
            <a href="#integritet" {...(here === 'integritet' ? { 'aria-current': 'true' } : {})}>
              {t('terms.page.privacy')}
            </a>
          </nav>
          <button type="button" aria-pressed={all === true} onClick={() => setAll(all !== true)}>
            {t(all === true ? 'terms.page.none' : 'terms.page.all')}
          </button>
        </div>
        <Part id="villkor" doc={text.terms} all={all} href={href} full={t('terms.page.full')} />
        <Part id="integritet" doc={text.privacy} all={all} href={href} full={t('terms.page.full')} />
      </article>
    </main>
  )
}

// One half of the page: its heading and its sections, numbered as the text numbers them. «Visa all
// text» opens or closes them all at once; each can still be opened and closed on its own after it.
function Part({ id, doc, all, href, full }: { id: string; doc: Document; all: boolean | null; href(part: 'villkor' | 'integritet'): string; full: string }) {
  return (
    <section className="byd-terms-part" aria-labelledby={id} lang="sv">
      <h2 id={id}>{doc.title}</h2>
      <ol>
        {doc.sections.map((section, i) => (
          <li key={section.h}>
            {section.waits ? (
              // A section that waits for what it will be about (9, 10) has nothing more to open.
              <div className="byd-terms-row" data-waits="">
                <Head n={i + 1} section={section} href={href} />
              </div>
            ) : (
              <Row key={String(all)} open={all === true} n={i + 1} section={section} href={href} full={full} />
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

function Head({ n, section, href }: { n: number; section: Document['sections'][number]; href(part: 'villkor' | 'integritet'): string }) {
  return (
    <>
      <span className="byd-terms-nr">{n}</span>
      <b>{section.h}</b>
      <span className="byd-terms-ks">
        <Inline text={section.ks} href={href} />
      </span>
    </>
  )
}

function Row({ open, n, section, href, full }: { open: boolean; n: number; section: Document['sections'][number]; href(part: 'villkor' | 'integritet'): string; full: string }) {
  return (
    <details className="byd-terms-row" open={open}>
      <summary>
        <Head n={n} section={section} href={href} />
        <span className="byd-terms-open" aria-hidden="true">
          {full}
          <ChevronGlyph to="down" />
        </span>
      </summary>
      <div className="byd-terms-full">
        {section.body.map((block, i) =>
          typeof block === 'string' ? (
            <p key={i}>
              <Inline text={block} href={href} />
            </p>
          ) : (
            <ul key={i}>
              {block.list.map((item) => (
                <li key={item}>
                  <Inline text={item} href={href} />
                </li>
              ))}
            </ul>
          ),
        )}
      </div>
    </details>
  )
}
