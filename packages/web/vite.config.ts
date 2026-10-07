/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, transformWithEsbuild, type Plugin, type Rollup } from 'vite'
import react from '@vitejs/plugin-react'
import { reporting } from '../../test-support/report.js'
import { detectLang } from './src/i18n/detect.js'
import { fillShell, shellMarkup, shellNoscript, shellTimes, shellWords, SHELL_STYLE, SHELL_VOICES } from './src/shell.js'

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
        for (const [, test = '', path = '', spec = ''] of app.matchAll(/path(\.startsWith\(|\s*===\s*)'([^']+)'\)?\)\s*return\s+import\('([^']+)'\)/g)) {
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
          // A route that answers for everything under a prefix is written with a trailing `*`.
          routes[test.startsWith('.') ? `${path}*` : path] = [...files].map((f) => `/${f}`)
        }
        if (Object.keys(routes).length === 0) throw new Error('read no routes out of App.tsx; the route preload would silently do nothing')
        const script = `(function(r,p){for(var k in r)if(k.slice(-1)==='*'?p.indexOf(k.slice(0,-1))===0:p===k)r[k].forEach(function(h){var l=document.createElement('link');l.rel='modulepreload';l.crossOrigin='';l.href=h;document.head.appendChild(l)})})(${JSON.stringify(routes)},location.pathname)`
        // Before the entry, in the head. A classic script waits for every sheet above it, and the
        // entry's sheet is the largest thing the page fetches; it stands after #root now (`shell`
        // below), so nothing above this line is a sheet to wait for.
        const at = html.indexOf('<script type="module"')
        if (at < 0) throw new Error('the built index.html has no entry script to put the route preload before')
        return `${html.slice(0, at)}<script>${script}</script>\n    ${html.slice(at)}`
      },
    },
  }
}

// The shell (#749): what `index.html` says before the app has arrived, and the stylesheet moved out
// of its way. `src/shell.ts` says why the shell is what it is; this writes it into the document.
//
// Its words come from the catalogue's `status` part, written in here and nowhere else, so the shell
// cannot say a state in other words than the app says it in. The language is chosen by the app's
// own `detectLang` and the words filled in by `fillShell`, both inlined by their source.
//
// And the entry's stylesheet leaves `<head>` for the end of `<body>`, after `#root` (L20, tillägg
// #749). In the head it held every painting, the shell's included — 105 kB brotli with the felt's
// face inside, five to seven seconds on the speltest's line. After `#root` it holds nothing the
// shell needs; and it still holds the app, because the entry is a module script, and a module
// script does not run while a stylesheet the parser has met is still loading. So the felt's face
// is in the document before the app's first frame (K20) — which `shell.spec.ts` measures with the
// sheet held on the wire rather than takes on trust.
//
// Moving it has one consequence the cascade cares about. Every sheet fetched later — the editor's,
// the rulebook drawer's, the help box's (L20) — is linked by Vite's preload helper at the end of
// <head>, which with the entry's sheet in <body> stands *before* it, and a tie between two rules
// then goes to the entry's instead of to the sheet written to override it. So the helper links a
// stylesheet at the end of <body>, after the entry's, where the order is again the order they come
// in. The helper is Vite's own module and the line is matched exactly, so a Vite that writes it
// differently fails the build here rather than quietly reordering the cascade.
const VITE_PRELOAD_HELPER = '\0vite/preload-helper.js'
const LINKS_IN_HEAD = 'document.head.appendChild(link);'
function shell(): Plugin {
  const minify = async (code: string) => (await transformWithEsbuild(code, 'shell.js', { minify: true, target: 'es2020', charset: 'utf8' })).code.trim().replace(/<\//g, '<\\/')
  return {
    name: 'byd-shell',
    transform(code, id) {
      if (id !== VITE_PRELOAD_HELPER) return
      if (!code.includes(LINKS_IN_HEAD)) throw new Error(`Vite's preload helper no longer says ${LINKS_IN_HEAD}; the sheets it links would stand before the entry's (vite.config.ts, shell)`)
      return { code: code.replace(LINKS_IN_HEAD, '(isCss ? document.body : document.head).appendChild(link);'), map: null }
    },
    transformIndexHtml: {
      order: 'post',
      async handler(html, { bundle }) {
        const root = '<div id="root"></div>'
        if (!html.includes(root) || !html.includes('</head>')) throw new Error(`index.html has no empty ${root} or no </head> for the shell to stand in`)
        const lang = await minify(`document.documentElement.lang=(${detectLang.toString()})();document.documentElement.classList.add('js')`)
        const fill = await minify(`(${fillShell.toString()})(document,${JSON.stringify(shellWords())},${JSON.stringify(SHELL_VOICES)},${JSON.stringify(shellTimes())})`)
        html = html.replace('</head>', () => `  <style id="byd-shell-style">${SHELL_STYLE}</style>\n    <script id="byd-shell-lang">${lang}</script>\n  </head>`)
        html = html.replace(root, () => `<div id="root">${shellMarkup(shellNoscript())}<script id="byd-shell-fill">${fill}</script></div>`)
        // Only the build links a stylesheet; the development server injects its CSS from script.
        if (!bundle) return html
        const head = html.slice(0, html.indexOf('</head>'))
        const sheets = [...head.matchAll(/\s*<link rel="stylesheet"[^>]*>/g)].map((m) => m[0])
        if (sheets.length === 0) throw new Error('the built index.html has no stylesheet in its head to move after #root')
        for (const sheet of sheets) html = html.replace(sheet, '')
        return html.replace('</body>', () => `${sheets.map((s) => `  ${s.trim()}\n`).join('')}  </body>`)
      },
    },
  }
}

export default defineConfig({
  plugins: [react(), routePreload(), shell()],
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
