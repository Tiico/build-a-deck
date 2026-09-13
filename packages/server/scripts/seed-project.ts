// Creates the seed game as a project on a running server, so the editor has a real game to open.
// Usage: pnpm --filter @byd/server seed:project [http://localhost:8080] [projectId] [email]
// Projects belong to accounts (G1), so the script logs in first — which needs the server started
// with AUTH_BYPASS=true, since the magic link otherwise lands in a mailbox the script cannot read.
import { spelkortDoc } from './spelkort.js'

const base = process.argv[2] ?? 'http://localhost:8080'
const id = process.argv[3] ?? 'demo'
const email = process.argv[4] ?? 'demo@example.com'

const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
if (login.status !== 200 || !cookie) {
  console.error('login failed', login.status, await login.text())
  console.error('start the server with AUTH_BYPASS=true, so the login answers with the cookie instead of a mail')
  process.exit(1)
}
const res = await fetch(`${base}/projects`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ id, ...spelkortDoc() }) })
console.log(res.status, await res.text())
const web = process.env['WEB_ORIGIN'] ?? 'http://localhost:5173'
console.log(`  editor: ${web}/editor?project=${id}&server=${encodeURIComponent(base)}`)
