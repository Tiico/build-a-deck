import { useEffect, useState } from 'react'
import { useT } from '../i18n/index.js'

// Where a beta tester turns, and what she quotes back (#757, beställarens beslut, prototyp A): a
// quiet line last in the login card and last on Mina spel. The terms and the privacy text come first
// on it (#1272), and they are always there: they are the app's own page. The contact is the box's
// own setting (`BYD_CONTACT`) and the version the release it runs, both read from `/health`; a
// contact that is an address on the web is linked as it is, anything else as mail. Without a contact
// «Kontakt» is left out, and without a release the version — the line never invents what the box
// did not say.
type About = { release?: string; contact?: string }

export function AboutLine({ http }: { http: string }) {
  const t = useT()
  const [about, setAbout] = useState<About>({})
  useEffect(() => {
    let live = true
    fetch(`${http}/health`)
      .then((res) => res.json() as Promise<About>)
      .then((body) => live && setAbout({ ...(typeof body.release === 'string' ? { release: body.release } : {}), ...(typeof body.contact === 'string' ? { contact: body.contact } : {}) }))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [http])
  const href = about.contact ? (/^https?:\/\//.test(about.contact) ? about.contact : `mailto:${about.contact}`) : null
  const server = new URLSearchParams(location.search).get('server')
  const terms = `/villkor${server ? `?${new URLSearchParams({ server }).toString()}` : ''}`
  return (
    <p className="byd-muted byd-about" data-about>
      <a href={terms}>{t('about.terms')}</a>
      {' · '}
      <a href={`${terms}#integritet`}>{t('about.privacy')}</a>
      {href && (
        <>
          {' · '}
          <a href={href}>{t('about.contact')}</a>
        </>
      )}
      {about.release && ` · ${t('about.version', { release: about.release })}`}
    </p>
  )
}
