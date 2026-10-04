/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin, type Rollup } from 'vite'
import react from '@vitejs/plugin-react'
import { reporting } from '../../test-support/report.js'
import { detectLang } from './src/i18n/detect.js'

// Each route's script and words are fetched when its address is opened (#760), and this keeps
// that from costing a round trip. Left to itself the entry would have to arrive and run before it
// could ask for the route's chunks; instead the built `index.html` carries a few lines that read
// the address and the reader's language and ask at once, beside the entry, for that route's chunks
// and for the parts of the catalogue it speaks in that language. The routes and their parts are
// read off `fetchPage` in `App.tsx` — the one place that says which module and which words draw
// which address — so a new route needs no edit here, and the language is decided by the very
// function the app decides it with (`detectLang`, whose source is inlined). `phone-bundle.spec.ts`
// holds the entry back on the wire and checks that the hand's chunk is asked for all the same.
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
        // A chunk and what it imports, less what the entry already brings.
        const closure = (facade: string, what: string): string[] => {
          const chunk = chunks.find((c) => c.facadeModuleId === fileURLToPath(new URL(facade, import.meta.url)))
          if (!chunk) throw new Error(`${what} is ${facade}, and the build has no chunk for it`)
          const files = new Set<string>()
          const walk = (name: string) => {
            if (files.has(name) || onEntry.has(name)) return
            files.add(name)
            for (const next of chunks.find((c) => c.fileName === name)?.imports ?? []) walk(next)
          }
          walk(chunk.fileName)
          return [...files].map((f) => `/${f}`)
        }
        const routes: Record<string, { js: string[]; words: string[] }> = {}
        const said = /path(\.startsWith\(|\s*===\s*)'([^']+)'\)?\)\s*return\s+surface\((?:import\('([^']+)'\)[^,]*|Promise\.resolve\(\w+\)),\s*\[([^\]]*)\]\)/g
        for (const [, test = '', path = '', spec, parts = ''] of app.matchAll(said)) {
          const js = spec ? closure(`./src/${spec.replace(/^\.\//, '').replace(/\.js$/, '.tsx')}`, `route ${path}`) : []
          // A route that answers for everything under a prefix is written with a trailing `*`.
          routes[test.startsWith('.') ? `${path}*` : path] = { js, words: [...parts.matchAll(/'([a-z]+)'/g)].map((m) => m[1] ?? '') }
        }
        if (Object.keys(routes).length < 8) throw new Error('read too few routes out of App.tsx; the route preload would quietly do nothing')
        const words: Record<string, Record<string, string[]>> = {}
        for (const lang of ['sv', 'en']) {
          const mine: Record<string, string[]> = {}
          for (const part of new Set(['status', ...Object.values(routes).flatMap((r) => r.words)])) mine[part] = closure(`./src/i18n/${lang}.${part}.ts`, `the ${lang} ${part} words`)
          words[lang] = mine
        }
        const script = `(function(r,w,p,lang){var hit=null;for(var k in r)if(k.slice(-1)==='*'?p.indexOf(k.slice(0,-1))===0:p===k){hit=r[k];break}var files=hit?hit.js.slice():[];['status'].concat(hit?hit.words:[]).forEach(function(x){files=files.concat(w[lang][x])});files.forEach(function(h){var l=document.createElement('link');l.rel='modulepreload';l.crossOrigin='';l.href=h;document.head.appendChild(l)})})(${JSON.stringify(routes)},${JSON.stringify(words)},location.pathname,(${detectLang.toString()})())`
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
