/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin, type Rollup } from 'vite'
import react from '@vitejs/plugin-react'
import { CODE_ALPHABET, CODE_LENGTH, ROUTE_WORDS } from '../protocol/src/rooms.js'
import { routesOf } from './scripts/route-table.js'
import { reporting } from '../../test-support/report.js'

// Each route's script is fetched when its address is opened (#760), and this keeps that from
// costing a round trip. Left to itself the entry would have to arrive and run before it could ask
// for the route's chunk; instead the built `index.html` carries a few lines that read the address
// and ask for that route's chunks at once, beside the entry. The routes are read off
// `fetchPage` in `App.tsx` — the one place that says which module draws which address — so a new
// route needs no edit here. `phone-bundle.spec.ts` holds the entry back on the wire and checks
// that the hand's chunk is asked for all the same.
function routePreload(): Plugin {
  return {
    name: 'byd-route-preload',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, { bundle }) {
        if (!bundle) return
        const app = readFileSync(fileURLToPath(new URL('./src/App.tsx', import.meta.url)), 'utf8')
        const chunks = Object.values(bundle).filter((c): c is Rollup.OutputChunk => c.type === 'chunk')
        const entry = chunks.find((c) => c.isEntry)
        const onEntry = new Set([entry?.fileName, ...(entry?.imports ?? [])])
        const routes: Record<string, string[]> = {}
        for (const { kind, path, spec } of routesOf(app)) {
          const facade = fileURLToPath(new URL(`./src/${spec.replace(/^\.\//, '').replace(/\.js$/, '.tsx')}`, import.meta.url))
          const chunk = chunks.find((c) => c.facadeModuleId === facade)
          if (!chunk) throw new Error(`route ${path} imports ${spec}, and the build has no chunk for it`)
          const files = new Set<string>()
          const walk = (name: string) => {
            if (files.has(name) || onEntry.has(name)) return
            files.add(name)
            for (const next of chunks.find((c) => c.fileName === name)?.imports ?? []) walk(next)
          }
          walk(chunk.fileName)
          // A route that answers for everything under a prefix is written with a trailing `*`, and a
          // room's own address (#675) as `?`: one path step of the code's length and alphabet.
          routes[kind === 'prefix' ? `${path}*` : kind === 'code' ? '?' : path] = [...files].map((f) => `/${f}`)
        }
        if (Object.keys(routes).length === 0) throw new Error('read no routes out of App.tsx; the route preload would silently do nothing')
        // A room's address is asked of the same rule the router asks it of — the code's alphabet and
        // length, and none of the app's own words — written out here as data for the few lines.
        const code = { re: `^/[${CODE_ALPHABET}]{${CODE_LENGTH}}$`, not: ROUTE_WORDS }
        const script = `(function(r,p,c){var q=new RegExp(c.re,'i').test(p)&&c.not.indexOf(p.slice(1).toLowerCase())<0;for(var k in r)if(k==='?'?q:k.slice(-1)==='*'?p.indexOf(k.slice(0,-1))===0:p===k)r[k].forEach(function(h){var l=document.createElement('link');l.rel='modulepreload';l.crossOrigin='';l.href=h;document.head.appendChild(l)})})(${JSON.stringify(routes)},location.pathname,${JSON.stringify(code)})`
        // Before the stylesheet and not after it: a classic script waits for every sheet above it, and
        // the blocking sheet is the largest thing the page fetches.
        const at = html.indexOf('<script type="module"')
        if (at < 0) throw new Error('the built index.html has no entry script to put the route preload before')
        return `${html.slice(0, at)}<script>${script}</script>\n    ${html.slice(at)}`
      },
    },
  }
}

export default defineConfig({
  plugins: [react(), routePreload()],
  // PORT lets a preview pick a free port when 5173 is taken; the default stays 5173.
  server: { port: Number(process.env['PORT'] ?? 5173), strictPort: true },
  // A licence is not a comment to be tidied away. The felt's face is baked into the stylesheet as
  // bytes, which makes that stylesheet a copy of the font software, and OFL 1.1 asks every copy to
  // carry the copyright notice and the licence — so the `/*! … */` above it has to survive the
  // minifier. esbuild drops legal comments by default; this is what keeps them (K20, E4).
  esbuild: { legalComments: 'inline' },
  build: {
    // The felt's face travels inside the stylesheet instead of in a round trip of its own (#95).
    // A face that arrives later is not a flash to look at: the felt lays every name out in the
    // fallback's measurements first and again when the face lands — 88.6 px against 75.5 for
    // `Räknare A` — and for that stretch the table stands in the state `felt-names.test.tsx`
    // fells. The default limit is 4 kB, which no useful subset of a face fits under, so the
    // question is asked by name rather than by size. `test/felt-font.test.ts` checks the answer
    // in the built files.
    assetsInlineLimit: (file) => (file.endsWith('.woff2') ? true : undefined),
  },
  // One test run at a time on this machine, whoever started it (#92 and its sequel). The
  // budgets say how long a test may take; this says how much the machine may be asked to do at
  // once, which is what makes those numbers mean anything. See the file for what was measured.
  //
  // And the run leaves its own account on disk beside the one it prints, so a failure survives
  // whatever anyone pipes the output through (#111): that is the whole of what that issue is
  // about, and it has now happened twice.
  test: { setupFiles: ['./test/setup.ts'], globalSetup: ['../../test-support/one-suite-at-a-time.ts'], ...reporting() },
})
