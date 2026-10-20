import type { BrowserContext } from '@playwright/test'

/** One thing the page's Content-Security-Policy refused (#1008), as the browser said it. */
export type Violation = { directive: string; blocked: string; where: string; page: string }

/**
 * Every refusal of the Content-Security-Policy in the contexts a test opened.
 *
 * The suite runs the built app under the policy the box sends (DRIFT §14), so a refusal here is
 * either a source the product really uses and the policy forgot — which in production is a
 * picture that never appears, a socket that never opens, a face set in the fallback — or code
 * that should not be doing what it did. Both are failures, and neither shows on a screenshot: a
 * blocked picture is a blank, and a blank is something a journey can easily not look at.
 *
 * Two ears, because neither hears everything alone: the page's own `securitypolicyviolation`
 * event, which carries the directive and the address, and the console, where the browser says it
 * too and where a refusal is said even when the page's script never got as far as listening.
 */
export class CspWatch {
  private readonly seen: Violation[] = []
  private readonly watched = new WeakSet<BrowserContext>()

  async watch(context: BrowserContext): Promise<void> {
    if (this.watched.has(context)) return
    this.watched.add(context)
    await context.exposeBinding('__bydCspViolation', ({ page }, v: Omit<Violation, 'page'>) => {
      this.seen.push({ ...v, page: page.url() })
    })
    await context.addInitScript(() => {
      document.addEventListener(
        'securitypolicyviolation',
        (e) => {
          const say = (window as unknown as { __bydCspViolation?: (v: object) => void }).__bydCspViolation
          say?.({ directive: e.effectiveDirective, blocked: e.blockedURI, where: `${e.sourceFile}:${e.lineNumber}` })
        },
        true,
      )
    })
    context.on('console', (msg) => {
      if (/Content[- ]Security[- ]Policy/i.test(msg.text())) this.seen.push({ directive: 'console', blocked: msg.text(), where: `${msg.location().url}:${msg.location().lineNumber}`, page: msg.page()?.url() ?? '' })
    })
  }

  /** The refusals a test meant to cause, taken out so they are not counted against it. */
  take(match: (v: Violation) => boolean = () => true): Violation[] {
    const taken = this.seen.filter(match)
    for (const v of taken) this.seen.splice(this.seen.indexOf(v), 1)
    return taken
  }

  /** Throws with every refusal left, so the test that caused it fails and says what it was. */
  verify(): void {
    if (this.seen.length === 0) return
    const lines = this.seen.map((v) => `  ${v.directive}: ${v.blocked} (at ${v.where}, on ${v.page})`)
    throw new Error(`the Content-Security-Policy refused ${this.seen.length} thing(s) during the test (DRIFT §14):\n${lines.join('\n')}`)
  }
}
