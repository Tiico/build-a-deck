import { defineConfig } from '@playwright/test'
import { playwrightReporting } from '../../test-support/report.js'

// The end-to-end suite: the product as a person gets it (D4).
//
// This is the layer D4 asked for on top of deterministic replay — "E2E med flera samtidiga
// klienter för anslutning, telefon och QR". What belongs here is what only a real stack can be
// wrong about: the built bundle, same-origin sockets, a room code travelling from a television to
// a telephone, two clients disagreeing, a connection coming back. What does not belong here is
// anything a cheaper test already settles. The engine's rules are `packages/engine`'s, the wire's
// shapes are `packages/server`'s, and a measurement of one surface is the web suite's.
//
// There is one project and not one per device, because a journey here is usually several devices
// at once: a television and two telephones looking at the same table is the case the whole layer
// exists for, and that is a viewport per context rather than a project per run. A spec that is
// about one surface says so with `test.use({ viewport })`; `support/devices.ts` holds the shapes
// so that no two specs invent their own idea of a telephone.
export default defineConfig({
  testDir: './test',
  // Two kinds of test share the stack, and are kept apart because they answer different
  // questions and fail for different reasons.
  //
  // `journeys` is what D4 asks for: several clients, a wire, a database, a person getting from
  // one screen to another. `surfaces` is the other half of what a real browser is for — a
  // measurement. A distance, a contrast, a duration under `prefers-reduced-motion`: facts about
  // what the engine actually laid out, which jsdom cannot answer because it lays nothing out.
  //
  // Those measurements used to be made in the web suite by rendering into jsdom, lifting the
  // markup out, and handing it to Chromium as a string. What they measured was therefore a
  // *snapshot* of the app and the app's stylesheet *sources*. Here they measure the built app,
  // running, with the stylesheet it ships — which is the difference #95 and #186 were both
  // about, and it is only reachable because the stack is already standing.
  projects: [
    { name: 'journeys', testDir: './test' , testIgnore: 'surfaces/**' },
    { name: 'surfaces', testDir: './test/surfaces' },
  ],
  // The stack is built, migrated and started once; every spec shares it and makes its own table.
  globalSetup: './global-setup.ts',
  // A journey crosses a network, a database and a browser. Vitest's five seconds is the wrong
  // number for that class of work for the same reason it was the wrong number in the web suite
  // (#92, #122): the budget has to be measured against a loaded machine, not an idle one.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Parallel is safe because a table is a test's own: every spec creates its session and never
  // reads another's. It is capped because the stack is one server and one Postgres, and the
  // machine is already held for this run.
  workers: process.env['CI'] ? 2 : 4,
  fullyParallel: true,
  // A test that only passes on the second go is a test that is telling you something, and this
  // repo has paid for ignoring that (#111). Retries stay off so a flake is visible as a flake.
  retries: 0,
  forbidOnly: !!process.env['CI'],
  // The account that survives a pipe, asked for in the one place both runners agree on. The web
  // suite writes `.vitest-report.json` beside itself for exactly this reason (#111): a gate read
  // through `tail` or `grep` has said its failure into a closed pipe, and then the failure has to
  // be reopened as an issue about not knowing what failed. A file is not pipeable.
  reporter: playwrightReporting() as unknown as ReturnType<typeof playwrightReporting>[number][],
  use: {
    baseURL: process.env['BYD_E2E_ORIGIN'],
    // Kept only where something went wrong: a green run should leave nothing behind, and a red
    // one should leave everything needed to see it without being run again.
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
})
