import { useMemo } from 'react'
import { LoginCard } from './LoginCard.js'
import { safeNext } from './next.js'
import './account.css'

// /login?next=/editor?project=…&server=http://…
export function LoginPage() {
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const http = params.get('server') ?? location.origin
  return (
    <div className="byd-account" data-page="login">
      <LoginCard http={http} next={safeNext(params.get('next'))} />
    </div>
  )
}
