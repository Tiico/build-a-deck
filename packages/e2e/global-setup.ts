import { takeTheMachine } from '../../test-support/one-suite-at-a-time.js'
import { start } from './support/stack.js'

/**
 * The stack, once, for the whole run.
 *
 * Playwright starts the workers as children of this process, so what is set on `process.env` here
 * is what they are born with — which is how the origin reaches a test without a file or a port
 * agreed in advance.
 *
 * The machine is taken first and for the same reason every other suite in this repo takes it
 * (`test-support/one-suite-at-a-time.ts`): this one builds an app, starts a database, a server and
 * a browser, and a machine already carrying three worktrees' suites is not a machine any timeout
 * in here was measured against.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const release = await takeTheMachine()
  try {
    const stack = await start()
    process.env['BYD_E2E_ORIGIN'] = stack.origin
    process.env['BYD_E2E_STORE'] = stack.store
    return async () => {
      await stack.stop()
      await release()
    }
  } catch (cause) {
    await release()
    throw cause
  }
}
