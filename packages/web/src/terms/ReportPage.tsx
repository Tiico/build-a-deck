import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { DecksterMark } from '../brand/DecksterMark.js'
import { ArrowGlyph } from '../glyphs.js'
import { useLang, useT } from '../i18n/index.js'
import { usePageTitle } from '../status/DocumentTitle.js'
import { myAccount } from '../account/api.js'
import './terms-page.css'
import './report-page.css'

// /villkor/anmal — a report of a picture (#1274, beställarens beslut 2026-10-25, variant A): one page in
// the terms page's form, reached from «Anmäl» on the row (#757) and from section 11 of the terms. Five
// fields and the good-faith box, in the order DSA art. 16 counts them: what, where, why, who, and that
// it is said in good faith. «Var» takes a room code, a link or the game's name, since a room code lasts
// three hours and a report may come later. Only pictures in the beta (beslut 5): a text goes through
// Kontakt, which the page says when the box has one.
//
// The page is open to everyone: whoever saw a picture at a table need not have an account. Name and
// address may be left out, since a report of sexual content involving children needs neither; without
// an address there is no receipt, and the page says so when it is sent. Whoever is logged in finds her
// name and address filled in, where she sees them, and can empty either (#1376, beställarens beslut
// 2026-10-25); nothing she has typed is written over.
type Field = 'what' | 'where' | 'why' | 'name' | 'email'
type Sent = { id: string; email: string }
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function ReportPage() {
  const t = useT()
  const { lang, setLang } = useLang()
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const server = params.get('server')
  const http = server ?? location.origin
  usePageTitle({ state: null })
  const [contact, setContact] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    fetch(`${http}/health`)
      .then((res) => res.json() as Promise<{ contact?: unknown }>)
      .then((body) => live && typeof body.contact === 'string' && setContact(body.contact))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [http])
  const [values, setValues] = useState<Record<Field, string>>({ what: '', where: '', why: '', name: '', email: '' })
  useEffect(() => {
    let live = true
    myAccount(http)
      .then((me) => {
        if (!live || !me) return
        setValues((had) => ({ ...had, name: had.name === '' ? (me.name ?? '') : had.name, email: had.email === '' ? me.email : had.email }))
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [http])
  const [goodFaith, setGoodFaith] = useState(false)
  const [tried, setTried] = useState(false)
  const [sending, setSending] = useState(false)
  const [failed, setFailed] = useState(false)
  const [sent, setSent] = useState<Sent | null>(null)
  // The receipt takes the place of the form, and the focus the form had goes to its heading (#1362):
  // the next Tab goes on from the receipt, and a screen reader reads where it now is.
  const receipt = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (sent) receipt.current?.focus()
  }, [sent])
  const missing = {
    what: values.what.trim() === '',
    where: values.where.trim() === '',
    why: values.why.trim() === '',
    email: values.email.trim() !== '' && !EMAIL.test(values.email.trim()),
    goodFaith: !goodFaith,
  }
  const wrong = (key: keyof typeof missing) => tried && missing[key]
  const home = server ? `/?${new URLSearchParams({ server }).toString()}` : '/'
  // Section 11 itself, which opens on arrival (#1361).
  const terms = `/villkor${server ? `?${new URLSearchParams({ server }).toString()}` : ''}#villkor-11`

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setTried(true)
    setFailed(false)
    if (Object.values(missing).some(Boolean)) {
      const first = (['what', 'where', 'why', 'email', 'goodFaith'] as const).find((k) => missing[k])
      document.getElementById(`report-${first}`)?.focus()
      return
    }
    setSending(true)
    try {
      const res = await fetch(`${http}/reports`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ what: values.what, where: values.where, why: values.why, name: values.name, email: values.email.trim(), goodFaith: true, lang }),
      })
      if (!res.ok) throw new Error(String(res.status))
      const { id } = (await res.json()) as { id: string }
      setSent({ id, email: values.email.trim() })
    } catch {
      setFailed(true)
    } finally {
      setSending(false)
    }
  }

  const field = (key: Field, multiline: boolean, extra: { hint?: string; note?: string; error?: string; type?: string; autoComplete?: string }) => {
    const id = `report-${key}`
    const noteId = extra.note ? `${id}-note` : undefined
    const errorId = extra.error ? `${id}-error` : undefined
    const described = [noteId, errorId].filter(Boolean).join(' ') || undefined
    const common = {
      id,
      value: values[key],
      onChange: (event: { target: { value: string } }) => setValues((had) => ({ ...had, [key]: event.target.value })),
      ...(extra.hint ? { placeholder: extra.hint } : {}),
      ...(extra.error ? { 'aria-invalid': true as const } : {}),
      ...(described ? { 'aria-describedby': described } : {}),
    }
    return (
      <div className="byd-report-field">
        <label htmlFor={id}>{t(`report.${key}`)}</label>
        {multiline ? <textarea {...common} rows={3} /> : <input {...common} type={extra.type ?? 'text'} {...(extra.autoComplete ? { autoComplete: extra.autoComplete } : {})} />}
        {extra.note && <small id={noteId}>{extra.note}</small>}
        {extra.error && (
          <span id={errorId} className="byd-report-error">
            {extra.error}
          </span>
        )}
      </div>
    )
  }

  return (
    <main className="byd-terms-page" data-page="report">
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
          <a className="byd-report-back" href={terms}>
            <ArrowGlyph to="left" />
            {t('report.back')}
          </a>
          <h1>{t('report.title')}</h1>
          <p className="byd-terms-intro">{t('report.lead')}</p>
          {contact && <p className="byd-terms-intro">{t('report.text', { contact })}</p>}
        </header>
        {sent ? (
          <div className="byd-report-sent" role="status">
            <h2 ref={receipt} tabIndex={-1}>
              {t('report.sent')}
            </h2>
            <p>{sent.email !== '' ? t('report.sent.receipt', { email: sent.email, id: sent.id }) : t('report.sent.none', { id: sent.id })}</p>
            {sent.email !== '' && <p>{t('report.sent.next')}</p>}
            <a className="byd-report-home" href={home}>
              {t('report.home')}
            </a>
          </div>
        ) : (
          <form className="byd-report-form" onSubmit={(event) => void submit(event)} noValidate>
            {field('what', true, { hint: t('report.what.hint'), ...(wrong('what') ? { error: t('report.missing.what') } : {}) })}
            {field('where', false, { hint: t('report.where.hint'), note: t('report.where.note'), ...(wrong('where') ? { error: t('report.missing.where') } : {}) })}
            {field('why', true, { hint: t('report.why.hint'), ...(wrong('why') ? { error: t('report.missing.why') } : {}) })}
            <div className="byd-report-two">
              {field('name', false, { autoComplete: 'name' })}
              {field('email', false, { type: 'email', autoComplete: 'email', note: t('report.email.note'), ...(wrong('email') ? { error: t('report.missing.email') } : {}) })}
            </div>
            <div className="byd-report-field">
              <label className="byd-report-tick">
                <input id="report-goodFaith" type="checkbox" checked={goodFaith} onChange={(event) => setGoodFaith(event.target.checked)} {...(wrong('goodFaith') ? { 'aria-invalid': true, 'aria-describedby': 'report-goodFaith-error' } : {})} />
                <span>{t('report.goodFaith')}</span>
              </label>
              {wrong('goodFaith') && (
                <span id="report-goodFaith-error" className="byd-report-error">
                  {t('report.missing.goodFaith')}
                </span>
              )}
            </div>
            <p className="byd-report-note">{t('report.children')}</p>
            {failed && (
              <p className="byd-report-error" role="alert">
                {t('report.failed')}
              </p>
            )}
            <div>
              <button type="submit" className="byd-report-send" disabled={sending}>
                {t(sending ? 'report.sending' : 'report.send')}
              </button>
            </div>
          </form>
        )}
      </article>
    </main>
  )
}
