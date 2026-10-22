import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { ConsoleMailer, ResendMailer, mailerFromEnv } from '../src/auth.js'
import { corpusFromEnv } from '../src/corpus.js'

// What the box hands the container (DRIFT §7, §11). The stack is the only place the account
// settings can reach the process, and the only place a development flag could slip into
// production. Both are contracts worth a test: without mail nobody can log in, and without a
// public origin the session cookie loses `Secure`.
const compose = readFileSync(new URL('../../../docker-compose.yml', import.meta.url), 'utf8')
// The overlay for a box that already carries a reverse proxy (DRIFT §2), merged on top of the
// stack by COMPOSE_FILE. The base file knows nothing about it.
const overlay = readFileSync(new URL('../../../docker-compose.traefik.yml', import.meta.url), 'utf8')

function serviceLines(yaml: string, service: string): string[] {
  const lines = yaml.split('\n')
  const first = lines.findIndex((line) => line === `  ${service}:`)
  if (first < 0) throw new Error(`no service ${service}`)
  const end = lines.slice(first + 1).findIndex((line) => /^ {0,2}\S/.test(line))
  return lines.slice(first + 1, end < 0 ? undefined : first + 1 + end)
}

function serviceEnvironment(yaml: string, service: string): Record<string, string> {
  const env: Record<string, string> = {}
  let inside = false
  for (const line of serviceLines(yaml, service)) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue
    if (/^ {4}\S/.test(line)) inside = line.trim() === 'environment:'
    else if (inside) {
      const pair = /^ {6}([A-Za-z0-9_]+): ?(.*)$/.exec(line)
      if (pair) env[pair[1] as string] = pair[2] as string
    }
  }
  return env
}

// mem_limit in megabytes, so the budget can be added up rather than read.
function memLimit(yaml: string, service: string): number {
  const line = serviceLines(yaml, service).find((l) => l.trim().startsWith('mem_limit:'))
  const value = /mem_limit: *(\d+)([mg])/.exec(line ?? '')
  if (!value) throw new Error(`no mem_limit for ${service}`)
  return Number(value[1]) * (value[2] === 'g' ? 1024 : 1)
}

describe('the stack hands the app its configuration', () => {
  it('passes the account settings through to the container', () => {
    const env = serviceEnvironment(compose, 'app')
    expect(Object.keys(env)).toEqual(expect.arrayContaining(['DATABASE_URL', 'PUBLIC_ORIGIN', 'RESEND_API_KEY', 'MAIL_FROM']))
  })

  // The replay corpus's door (#1011, DRIFT §7) is set in the box's .env and nowhere else; a name
  // the stack does not pass is a door that never opens, however carefully the list was written.
  it('passes the corpus consent list and the operator through, empty when unset', () => {
    const env = serviceEnvironment(compose, 'app')
    expect(env['BYD_CORPUS_ACCOUNTS']).toBe('${BYD_CORPUS_ACCOUNTS:-}')
    expect(env['BYD_OPERATOR']).toBe('${BYD_OPERATOR:-}')
  })

  // Where a beta tester turns (#757, DRIFT §8) is the box's to say. Left out of the stack, the
  // contact line, the mail's foot and /health.contact stayed empty on the box from the day they
  // were built, and every test of them passed because none ran the stack.
  it('passes the contact through, empty when unset', () => {
    const env = serviceEnvironment(compose, 'app')
    expect(env['BYD_CONTACT']).toBe('${BYD_CONTACT:-}')
  })

  it('leaves room on a box that is not only ours', () => {
    // DRIFT §1 budgeted the whole 8 GB for this stack; the box it actually runs on was
    // already carrying its own containers and swapping. The three that are always up have
    // to fit in the share we are allowed, and the caps are what keeps the OOM killer from
    // choosing for us.
    expect(memLimit(compose, 'postgres')).toBe(768)
    expect(memLimit(compose, 'app')).toBe(512)
    expect(memLimit(compose, 'render')).toBe(1500)
    const always = ['postgres', 'app', 'render'].reduce((total, s) => total + memLimit(compose, s), 0)
    expect(always).toBeLessThanOrEqual(3 * 1024)
  })

  it('hands both the app and the worker the endpoint the buckets answer on', () => {
    // R2 has more than one endpoint. A bucket created in a jurisdiction is invisible on the
    // account's default one and answers 403 to credentials that are perfectly good, so the box
    // has to be able to say which — and it has to reach the two containers that read from R2,
    // not only the archiver, which already had it.
    expect(Object.keys(serviceEnvironment(compose, 'app'))).toContain('R2_ENDPOINT')
    expect(Object.keys(serviceEnvironment(compose, 'render'))).toContain('R2_ENDPOINT')
  })

  it('keeps the development flags out of the box', () => {
    const env = serviceEnvironment(compose, 'app')
    expect(Object.keys(env)).not.toContain('AUTH_BYPASS')
    expect(Object.keys(env)).not.toContain('WEB_ORIGIN')
    // The fake providers a test stack talks to (#999): the box always reaches the real ones.
    expect(Object.keys(env)).not.toContain('AI_ANTHROPIC_URL')
    expect(Object.keys(env)).not.toContain('AI_OPENAI_URL')
  })

  it('hands the app the AI keys’ master key, and nothing that makes backups hands it on (#999)', () => {
    // DRIFT §5: the master key lives in the box's environment and only there. The app needs it;
    // the database and the agent that archives it to R2 must never see it, or a leaked backup
    // leaks every designer's key with it.
    expect(serviceEnvironment(compose, 'app')['AI_KEY_SECRET']).toBe('${AI_KEY_SECRET:-}')
    for (const service of ['postgres', 'backup', 'render']) expect(serviceLines(compose, service).join('\n')).not.toContain('AI_KEY_SECRET')
    expect(readFileSync(new URL('../../../.env.example', import.meta.url), 'utf8')).toMatch(/^AI_KEY_SECRET=$/m)
  })
})

describe('handing the app to a reverse proxy that is already there', () => {
  const labels = serviceLines(overlay, 'app')
    .filter((line) => line.trim().startsWith('- "traefik.'))
    .map((line) => line.trim().replace(/^- "|"$/g, ''))

  it('routes the host the public origin names, on the port the app listens to', () => {
    expect(labels).toContain('traefik.enable=true')
    expect(labels).toContain('traefik.docker.network=t2_proxy')
    // The host is not written into the repository: one box's name is not the stack's business.
    expect(labels.find((l) => l.includes('.rule='))).toMatch(/Host\(`\$\{BYD_HOSTNAME[:?}]/)
    expect(labels).toContain('traefik.http.services.byd-svc.loadbalancer.server.port=8080')
  })

  it('never puts the house door in front of a product with its own', () => {
    // The guests of a table are strangers with a room code and no account (DRIFT §9); an SSO in
    // front of the page would turn every one of them away before the code was ever read.
    const middlewares = labels.find((l) => l.includes('.middlewares=')) ?? ''
    expect(middlewares).toContain('chain-no-auth@file')
    expect(middlewares).not.toContain('authelia')
  })

  it('reaches the proxy without leaving the stack it belongs to', () => {
    expect(serviceLines(overlay, 'app').some((l) => /^ {4}networks:/.test(l))).toBe(true)
    expect(overlay).toMatch(/t2_proxy:\n {4}external: true/)
    // The base stack stays portable: nothing in it may name the box's proxy.
    expect(compose).not.toContain('t2_proxy')
  })
})

describe('a host the service has moved away from (A5, #1080)', () => {
  // deck.ockelberg.com became deckster.se. Login links already sent, bookmarks and the QR codes
  // on printed table cards still name the old host, so it answers 301 to the new one with the path
  // and the query kept. The redirect is the proxy's: the app knows one origin, PUBLIC_ORIGIN.
  const moved = readFileSync(new URL('../../../docker-compose.traefik-moved.yml', import.meta.url), 'utf8')
  const labels = serviceLines(moved, 'app')
    .filter((line) => line.trim().startsWith('- "traefik.'))
    .map((line) => line.trim().replace(/^- "|"$/g, ''))
  const label = (suffix: string) => labels.find((l) => l.endsWith(suffix) || l.includes(`${suffix}=`))?.split('=').slice(1).join('=') ?? ''
  // What compose makes of a label: the box's hosts filled in, and `$$` a literal `$`.
  const interpolate = (value: string) => value.replace(/(?<!\$)\$\{([A-Z_]\w*)(?::\?[^}]*)?\}/g, (_, name: string) => ({ BYD_HOSTNAME: 'deckster.se', BYD_MOVED_FROM: 'deck.ockelberg.com' })[name] ?? '').replace(/\$\$/g, '$')

  it('routes the old host, named in .env, and only it', () => {
    expect(label('byd-moved-rtr.rule')).toMatch(/^Host\(`\$\{BYD_MOVED_FROM:\?[^}]+\}`\)$/)
    expect(label('byd-moved-rtr.entrypoints')).toBe('https')
    expect(label('byd-moved-rtr.tls')).toBe('true')
    expect(label('byd-moved-rtr.middlewares')).toBe('byd-moved')
  })

  it('answers 301 to the same path and query on the new host', () => {
    expect(label('byd-moved.redirectregex.permanent')).toBe('true')
    // Traefik matches the whole URL, scheme to query, and Go's regexp reads this one as JS does.
    const regex = new RegExp(interpolate(label('byd-moved.redirectregex.regex')))
    const replacement = interpolate(label('byd-moved.redirectregex.replacement')).replace(/\$\{(\d+)\}/g, '$$$1')
    const to = (from: string) => from.replace(regex, replacement)
    expect(to('https://deck.ockelberg.com/ABCD?x=1')).toBe('https://deckster.se/ABCD?x=1')
    expect(to('https://deck.ockelberg.com/auth/verify?token=abc')).toBe('https://deckster.se/auth/verify?token=abc')
    expect(to('https://deck.ockelberg.com/')).toBe('https://deckster.se/')
  })

  it('is an overlay of its own, so a box that never moved names no old host', () => {
    expect(overlay).not.toContain('BYD_MOVED_FROM')
    expect(compose).not.toContain('BYD_MOVED_FROM')
  })
})

describe('where the box keeps the checkout is the box‚Äôs business', () => {
  const unit = readFileSync(new URL('../../../ops/byd-deploy.service', import.meta.url), 'utf8')
  const install = readFileSync(new URL('../../../ops/install.sh', import.meta.url), 'utf8')

  it('names no directory of its own', () => {
    // A path written into the unit is a path that has to be edited by hand the day the checkout
    // lives somewhere else ‚Äî and then the repository says one thing and the box does another.
    expect(unit).not.toMatch(/=\/(opt|srv|home|var)\//)
    expect(unit.match(/%DIR%/g) ?? []).toHaveLength(3)
  })

  it('is installed by a script that fills the directory in from where it stands', () => {
    expect(install).toContain('%DIR%')
    expect(install).toMatch(/cd "\$\(dirname "\$0"\)\/\.\." && pwd/)
  })
})

describe('mailerFromEnv', () => {
  it('writes the link to the log when there is no key', () => {
    expect(mailerFromEnv({})).toBeInstanceOf(ConsoleMailer)
    expect(mailerFromEnv({ RESEND_API_KEY: '' })).toBeInstanceOf(ConsoleMailer)
  })

  it('sends through Resend when there is one', () => {
    const mailer = mailerFromEnv({ RESEND_API_KEY: 'key', MAIL_FROM: 'Deckster <login@deck.example>' })
    expect(mailer).toBeInstanceOf(ResendMailer)
    expect((mailer as ResendMailer).from).toBe('Deckster <login@deck.example>')
  })

  it('never sends from an empty address', () => {
    const mailer = mailerFromEnv({ RESEND_API_KEY: 'key', MAIL_FROM: '' })
    expect((mailer as ResendMailer).from).toMatch(/@/)
  })
})

// The consent list is typed by hand into the box's .env (#1011), so it is read the way a person
// writes it: spaces after the commas, an address in capitals, a trailing comma. An address is the
// account's as the login stores it — trimmed and in lower case.
describe('corpusFromEnv', () => {
  it('opens nothing unless both the operator and at least one account are named', () => {
    expect(corpusFromEnv({})).toBeUndefined()
    expect(corpusFromEnv({ BYD_CORPUS_ACCOUNTS: '', BYD_OPERATOR: '' })).toBeUndefined()
    expect(corpusFromEnv({ BYD_CORPUS_ACCOUNTS: 'ada@example.com' })).toBeUndefined()
    expect(corpusFromEnv({ BYD_OPERATOR: 'op@example.com' })).toBeUndefined()
    expect(corpusFromEnv({ BYD_CORPUS_ACCOUNTS: ' , ', BYD_OPERATOR: 'op@example.com' })).toBeUndefined()
  })

  it('reads the addresses as the login stores them', () => {
    expect(corpusFromEnv({ BYD_CORPUS_ACCOUNTS: ' Ada@Example.com, bo@example.com ,', BYD_OPERATOR: ' Op@Example.com ' })).toEqual({ operator: 'op@example.com', accounts: ['ada@example.com', 'bo@example.com'] })
  })
})

// What the app image can actually build (DRIFT §7). CI runs lint, typecheck and the suite on every
// pull request, but it only builds the images when a `v*` tag is pushed — so a Dockerfile that
// cannot build the web app is invisible on the trunk and surfaces as a failed release, which is
// the worst place to find it. `vite build` loads `vite.config.ts` before it builds anything, and a
// static import in that file is a file the build context has to carry. It did not: the config
// imports the run's own reporter from `test-support/` (#111) and the Dockerfile copied only
// `packages/`, so every image build from that commit on failed on `Could not resolve`.
describe('the app image carries everything the web build reads', () => {
  const dockerfile = readFileSync(new URL('../../../Dockerfile', import.meta.url), 'utf8')
  const viteConfig = readFileSync(new URL('../../web/vite.config.ts', import.meta.url), 'utf8')

  // Where the build stage copies from, as repo-relative paths. `COPY --from=` copies out of an
  // earlier stage rather than out of the context, so it carries nothing in and is not one of these.
  const copied = dockerfile
    .split('\n')
    .filter((line) => /^COPY /.test(line) && !line.includes('--from='))
    .flatMap((line) => line.replace(/^COPY /, '').trim().split(/\s+/).slice(0, -1))

  // The relative imports in the config that leave the package they sit in — the ones whose file
  // has to be copied in by a line of its own, because `COPY packages` does not reach them.
  const escaping = [...viteConfig.matchAll(/^import .* from '(\.\.[^']*)'/gm)]
    .map((match) => match[1] as string)
    .filter((specifier) => specifier.startsWith('../../'))
    .map((specifier) => specifier.replace(/^\.\.\/\.\.\//, '').replace(/\.js$/, ''))

  it('copies in every file outside the package that vite.config.ts imports', () => {
    expect(escaping.length).toBeGreaterThan(0)
    for (const path of escaping) {
      expect(copied.some((source) => path === source || path.startsWith(`${source}/`)), `${path} is imported by packages/web/vite.config.ts but no COPY in the Dockerfile brings it into the build context`).toBe(true)
    }
  })
})

// The HTML part reaches the provider (#1098): Resend takes `html` beside `text`, and a mail without
// one is sent as text alone, as every mail was before.
describe('the Resend mailer sends the HTML part (#1098)', () => {
  it('posts html when the mail has one, and leaves it out when it has none', async () => {
    const calls: unknown[] = []
    const fetchMock = async (_url: string, init: { body: string }) => {
      calls.push(JSON.parse(init.body))
      return new Response('{}', { status: 200 })
    }
    const mailer = new ResendMailer('key', 'Deckster <login@deck.example>', fetchMock as unknown as typeof fetch)
    await mailer.send({ to: 'a@b.se', subject: 's', text: 't', html: '<p>h</p>' })
    await mailer.send({ to: 'a@b.se', subject: 's', text: 't' })
    expect(calls).toEqual([
      { from: 'Deckster <login@deck.example>', to: ['a@b.se'], subject: 's', text: 't', html: '<p>h</p>' },
      { from: 'Deckster <login@deck.example>', to: ['a@b.se'], subject: 's', text: 't' },
    ])
  })
})
