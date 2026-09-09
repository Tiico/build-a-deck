import { useT } from '../i18n/index.js'
import { noticeFor } from './notice.js'
import { StatusNotice } from './StatusNotice.js'

// Before #12 an unknown path fell through to the start page, so a link with a character missing
// quietly showed someone their games and never said the page did not exist. A 404 has to be a
// route of its own before "sidan finns inte" can ever be shown.
export function NotFoundPage() {
  const t = useT()
  return (
    <div data-page="not-found" className="byd-status-page">
      <StatusNotice notice={noticeFor('missing', 'app', t)} surface="page" links={{ home: '/' }} />
    </div>
  )
}
