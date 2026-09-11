import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { ConsoleMailer, ResendMailer, mailerFromEnv } from '../src/auth.js'

// What the box hands the container (DRIFT §7, §11). The stack is the only place the account
// settings can reach the process, and the only place a development flag could slip into
// production. Both are contracts worth a test: without mail nobody can log in, and without a
// public origin the session cookie loses `Secure`.
const compose = readFileSync(new URL('../../../docker-compose.yml', import.meta.url), 'utf8')

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

  it('keeps the development flags out of the box', () => {
    const env = serviceEnvironment(compose, 'app')
    expect(Object.keys(env)).not.toContain('AUTH_BYPASS')
    expect(Object.keys(env)).not.toContain('WEB_ORIGIN')
  })
})

describe('mailerFromEnv', () => {
  it('writes the link to the log when there is no key', () => {
    expect(mailerFromEnv({})).toBeInstanceOf(ConsoleMailer)
    expect(mailerFromEnv({ RESEND_API_KEY: '' })).toBeInstanceOf(ConsoleMailer)
  })

  it('sends through Resend when there is one', () => {
    const mailer = mailerFromEnv({ RESEND_API_KEY: 'key', MAIL_FROM: 'build-your-deck <login@deck.example>' })
    expect(mailer).toBeInstanceOf(ResendMailer)
    expect((mailer as ResendMailer).from).toBe('build-your-deck <login@deck.example>')
  })

  it('never sends from an empty address', () => {
    const mailer = mailerFromEnv({ RESEND_API_KEY: 'key', MAIL_FROM: '' })
    expect((mailer as ResendMailer).from).toMatch(/@/)
  })
})
