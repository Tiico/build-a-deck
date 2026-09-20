import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Where a test package asks for "any port at all", so that its own suite can refuse to let it.
//
// A fixture never takes its port with `listen(0)` (#58): that number comes out of the operating
// system's ephemeral range, which is the range every other worker on the machine draws from too,
// and what it costs lands somewhere else entirely — an EADDRINUSE inside whatever test happened to
// be running, about a port nothing in that test named. Each test package therefore takes its ports
// by number, out of its own block of a band well below that range; `packages/web/test/fixture.ts`
// has the reasoning and the blocks.
//
// The rule is one a new file breaks quietly, and that is twice how it has been broken. First the
// deaf server, written twice in two files, neither of which was about ports (#275). Then three
// fixtures outside the web package, which had the rule written down in a file they do not read
// (#289) — the collision the rule is about happens *between* packages, so a guard that only ever
// looked at one of them was always going to miss it.
//
// So it is asked of every file at once, in every package that binds anything. It lives here
// because a guard that each package writes for itself is a guard that drifts, and the two copies
// of the deaf server are what that looks like. `test-support/` is where the things every package's
// tests share already live.

/**
 * Every line under `dir` that asks `listen` for port 0, as `<path>:<line>` with the path relative
 * to `dir`. An empty list is the whole of what a package has to prove.
 */
export function askedForAnyPort(dir: string): string[] {
  return sources(dir).flatMap((path) =>
    readFileSync(join(dir, path), 'utf8')
      .split('\n')
      .flatMap((line, i) => (/\.listen\(\s*0\b/.test(line) ? [`${path}:${i + 1}`] : [])),
  )
}

// Every TypeScript source under `dir`, subdirectories included: a package that grows a folder of
// tests must not thereby grow a corner the rule does not reach.
function sources(dir: string, prefix = ''): string[] {
  return readdirSync(join(dir, prefix), { withFileTypes: true }).flatMap((entry) => {
    const path = prefix ? join(prefix, entry.name) : entry.name
    if (entry.isDirectory()) return sources(dir, path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}
