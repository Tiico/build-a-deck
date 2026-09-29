import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ESLint } from 'eslint'

// A hook placed after a component's early returns is called only on the renders that get past
// them (#534, #562): `EditorPage` called `useLang` only once its project had come, and nothing but
// React's own warning in a Linux run said so. Lint says it now, with the repo's own configuration,
// on a file where a component would stand.
const root = join(import.meta.dirname, '..', '..', '..')
const lint = async (code: string) => {
  const eslint = new ESLint({ cwd: root, overrideConfigFile: join(root, 'eslint.config.js') })
  const [result] = await eslint.lintText(code, { filePath: join(root, 'packages/web/src/probe-562.tsx') })
  return (result?.messages ?? []).map((m) => m.ruleId)
}

describe('lint knows the rules of hooks (#562)', () => {
  it('fails a hook called after an early return', async () => {
    const code = `import { useState } from 'react'
export function Probe({ ready }: { ready: boolean }) {
  if (!ready) return null
  const [n] = useState(0)
  return <p>{n}</p>
}
`
    expect(await lint(code)).toContain('react-hooks/rules-of-hooks')
  }, 60_000)

  it('leaves the same component alone with the hook before the return', async () => {
    const code = `import { useState } from 'react'
export function Probe({ ready }: { ready: boolean }) {
  const [n] = useState(0)
  if (!ready) return null
  return <p>{n}</p>
}
`
    expect(await lint(code)).toEqual([])
  }, 60_000)
})
