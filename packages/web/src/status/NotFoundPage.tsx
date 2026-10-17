import { useEffect, useState } from 'react'
import { useT } from '../i18n/index.js'
import { whoAmI } from '../account/session.js'
import { noticeFor, signedOut } from './notice.js'
import { StatusNotice } from './StatusNotice.js'

// Before #12 an unknown path fell through to the start page, so a link with a character missing
// quietly showed someone their games and never said the page did not exist. A 404 has to be a
// route of its own before "sidan finns inte" can ever be shown.
//
// The way out leads to `/`, which is the reader's games when signed in and the login card
// otherwise (#475). Until the page knows which, it says "Till startsidan", which is true of both.
export function NotFoundPage() {
  const t = useT()
  const server = new URLSearchParams(location.search).get('server')
  const [signedIn, setSignedIn] = useState(false)
  useEffect(() => {
    let live = true
    void whoAmI(server ?? location.origin).then(
      (email) => live && setSignedIn(email !== null),
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [server])
  const notice = noticeFor('missing', 'app', t)
  const said = signedIn ? notice : signedOut(notice, t)
  const home = server ? `/?${new URLSearchParams({ server }).toString()}` : '/'
  return (
    <div data-page="not-found" className="byd-status-page">
      <StatusNotice notice={said} surface="page" links={{ home }} />
    </div>
  )
}
