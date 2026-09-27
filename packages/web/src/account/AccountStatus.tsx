import { noticeFor, signedOut, type Notice } from '../status/notice.js'
import { StatusNotice } from '../status/StatusNotice.js'
import { useT } from '../i18n/index.js'

// A page of its own for every state the account's link pages stand in while they are not doing
// their work (D5, #475): the wait, the link that is not one, the refusal, the lost line. They were
// bare lines on a white page and red sentences with nothing to press; now they are the status
// family's, with the focus on the heading and a way on.
//
// The way home is to the reader's games when the page knows someone is signed in, and to the start
// page when it does not (`signedOut`).
export type AccountStatusProps = {
  page: string
  notice: Notice
  server: string | null
  signedIn: boolean
  onRetry?: () => void
}

export function AccountStatus({ page, notice, server, signedIn, onRetry }: AccountStatusProps) {
  const t = useT()
  const home = server ? `/?${new URLSearchParams({ server }).toString()}` : '/'
  const said = signedIn ? notice : signedOut(notice, t)
  return (
    <div data-page={page} className="byd-status-page">
      <StatusNotice notice={said} surface="page" links={{ home }} {...(onRetry ? { onRetry } : {})} />
    </div>
  )
}

// The wait, said as what is being waited for.
export function waiting(heading: string, t: ReturnType<typeof useT>): Notice {
  return { ...noticeFor('loading', 'app', t), heading }
}

// A link that leads nowhere, said as what it was meant to do.
export function spent(heading: string, text: string, t: ReturnType<typeof useT>): Notice {
  return { ...noticeFor('missing', 'app', t), heading, text }
}
