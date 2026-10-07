import { useEffect, useState } from 'react'
import { useT } from '../i18n/index.js'

// Where a beta tester turns, and what she quotes back (#757, beställarens beslut, prototyp A): a
// quiet line last in the login card and last on Mina spel. The contact is the box's own setting
// (`BYD_CONTACT`) and the version the release it runs, both read from `/health`; a contact that is
// an address on the web is linked as it is, anything else as mail. Without a contact only the
// version is said, and without either nothing at all — the line never invents what the box did
// not say.
type About = { release?: string; contact?: string }

export function AboutLine({ http }: { http: string }) {
  const t = useT()
  const [about, setAbout] = useState<About | null>(null)
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
  if (!about || (!about.release && !about.contact)) return null
  const href = about.contact ? (/^https?:\/\//.test(about.contact) ? about.contact : `mailto:${about.contact}`) : null
  return (
    <p className="byd-about" data-about>
      {href && <a href={href}>{t('about.contact')}</a>}
      {href && about.release && ' · '}
      {about.release && t('about.version', { release: about.release })}
    </p>
  )
}
