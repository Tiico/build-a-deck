import { svStatus } from './i18n/sv.status.js'
import { enStatus } from './i18n/en.status.js'
import { DEFAULT_TIMING } from './status/connection.js'
import type { Voice } from './status/notice.js'

// The shell: what the page says before the app has arrived (#749, beslut B 2026-10-06).
//
// On a slow line the document is down in half a second and the app in five to seven, and for all
// of that the page used to be white — a phone showed a blank screen and a TV in a living room a
// white one, and nobody could tell a slow page from a dead one. So `index.html` carries D5's
// loading notice in the page form `StatusNotice` draws it in, inside `#root`, where React replaces
// it on its first rendering. The app's first frame on a waiting route is that same form — the
// editor's Suspense reserve, the table's and the phone's «Ansluter» — so the handover changes the
// words and not the picture.
//
// The markup and its rules are below, and the build writes them into the document it ships: the
// rules into `<head>`, the markup into `#root`. The source `index.html` keeps an empty `#root`, which
// the web suite's measurements paste their own markup into. The rules name `#byd-shell`, so the
// app's stylesheet cannot restyle the shell when it lands, and the shell's ground is on `html` only
// while the shell stands, so nothing of it lingers under the app. Without JavaScript the loading
// words are hidden — they would be a promise nothing keeps — and a `<noscript>` line says why.
//
// Nothing here is part of the app's bundle. `vite.config.ts` reads it when it builds `index.html`:
// the words are written in from the catalogue's `status` part, so the shell and the app cannot say
// the same state in two wordings, and `fillShell` and `detectLang` are inlined by their source.

// When the shell offers a reload (D5 permits a reload only where nothing on the page can be lost,
// and before the app has arrived nothing is). Twenty seconds is five times D5's long wait: a line
// that has not brought the app by then is more likely stuck than slow.
export const SHELL_RELOAD_AFTER_MS = 20_000

// Which voice each address speaks in, as D5's routes speak: the table's two modes and the screens
// that watch it say «Dukar bordet…», the hand «Hämtar din hand…», the editor «Öppnar spelet…».
// Every other address — the seat picker, the start page, the wizard, a room code typed as an
// address — says the app's «Hämtar…». The seat picker is the one place this parts from the app's
// own voice (`voiceOf` in `App.tsx`): before a seat is chosen there is no hand to fetch.
export const SHELL_VOICES: Record<string, Exclude<Voice, 'app'>> = {
  '/table': 'table',
  '/observe': 'table',
  '/online': 'table',
  '/play': 'phone',
  '/editor': 'editor',
}

// D5's page form in `status.css`, with the wait's tone, at the same measures: the mark, the heading
// with its ring, the line under it, and a button in the status buttons' dress.
export const SHELL_STYLE = [
  'html:has(#byd-shell){background:#1f2637}',
  "#byd-shell{position:fixed;inset:0;display:grid;place-content:center;justify-items:start;gap:14px;box-sizing:border-box;padding:28px;background:#1f2637;color:#dfe7f7;font:14px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif}",
  '#byd-shell *{box-sizing:border-box;margin:0}',
  'html:not(.js) #byd-shell>:not(noscript){display:none}',
  '#byd-shell .m{font-size:12px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase}',
  '#byd-shell h1{display:flex;gap:10px;align-items:center;font-size:26px;line-height:1.25}',
  '#byd-shell p{max-width:46ch}',
  '#byd-shell .r{flex:none;width:22px;height:22px;border-radius:50%;border:3px solid;border-top-color:transparent;animation:byd-shell 900ms linear infinite}',
  '@keyframes byd-shell{to{transform:rotate(360deg)}}',
  '#byd-shell button{min-height:44px;padding:0 16px;border-radius:10px;border:1px solid #7d879f;background:#242938;color:#eef1f8;font:inherit;font-weight:600;cursor:pointer}',
  '#byd-shell button:focus-visible{outline:3px solid #7dd3a0;outline-offset:2px}',
  '@media (prefers-reduced-motion:reduce){#byd-shell .r{animation:none;border-style:dashed;border-top-color:currentcolor;opacity:.75}}',
  '@media (max-width:700px){#byd-shell{padding:20px}#byd-shell h1{font-size:22px}}',
].join('')

// The markup, empty of words: `fillShell` writes them in for the address and the language before the
// first painting. The `<noscript>` lines are the exception, since nothing runs to write them.
export const shellMarkup = (noscript: { sv: string; en: string }): string => {
  const text = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<div id="byd-shell" role="status"><span class="m" data-k="m"></span><h1><span class="r"></span><span data-k="h"></span></h1><p data-k="t"></p><button type="button" hidden onclick="location.reload()"></button><noscript><p>${text(noscript.sv)}</p><p lang="en">${text(noscript.en)}</p></noscript></div>`
}

// One language's words: the mark while loading and while slow, the reload button, and per voice
// the loading heading and text and the slow heading and text.
export type ShellWords = { m: string; n: string; r: string } & Record<Voice, [string, string, string, string]>

const VOICES: Voice[] = ['app', 'table', 'phone', 'editor']

function wordsOf(w: Record<keyof typeof svStatus, string>): ShellWords {
  // The voice's own wording where it has one, the app's where it does not (D5: a voice rewrites
  // what it says differently and inherits the rest). The slow text is the shell's own: the
  // catalogue's asks the reader to press «försök igen», and the shell has nothing to press.
  const key = (voice: Voice, state: string, part: string) => (voice === 'app' ? `status.${state}.${part}` : `status.${state}.${voice}.${part}`)
  const said = (voice: Voice, state: string, part: string): string => {
    const found = (w as Record<string, string | undefined>)[key(voice, state, part)] ?? (w as Record<string, string | undefined>)[key('app', state, part)]
    if (found === undefined) throw new Error(`the catalogue has no ${key('app', state, part)} for the shell to say`)
    return found
  }
  const words = { m: w['status.loading.mark'], n: w['status.slow.mark'], r: w['status.shell.reload'] } as ShellWords
  for (const voice of VOICES) words[voice] = [said(voice, 'loading', 'heading'), said(voice, 'loading', 'text'), said(voice, 'slow', 'heading'), said(voice, 'shell.slow', 'text')]
  return words
}

export const shellWords = (): Record<'sv' | 'en', ShellWords> => ({ sv: wordsOf(svStatus), en: wordsOf(enStatus) })

// What the page says when nothing can run: both languages, since nothing has run to choose one.
export const shellNoscript = (): { sv: string; en: string } => ({ sv: svStatus['status.shell.noscript'], en: enStatus['status.shell.noscript'] })

// When the shell changes its words, on the document's own clock: `performance.now()` counts from the
// navigation's start, so «tar längre tid» comes at the same moment however late the shell was
// painted — and the app goes on from that same clock when it takes over (`status/waitClock.ts`).
export const shellTimes = (): [number, number] => [DEFAULT_TIMING.slowAfterMs, SHELL_RELOAD_AFTER_MS]

// Fills the shell's words in for this address and this language, and changes them when the wait
// grows long. It runs in the page before anything else has arrived, inlined by its source, so it
// reaches for nothing outside itself: everything it needs is handed to it.
export function fillShell(d: Document, all: Record<'sv' | 'en', ShellWords>, voices: Record<string, Voice | undefined>, at: [number, number]): void {
  const shell = d.getElementById('byd-shell')
  if (!shell) return
  const w = all[d.documentElement.lang === 'en' ? 'en' : 'sv']
  const said = w[voices[location.pathname] ?? 'app']
  const put = (k: string, text: string) => {
    const el = shell.querySelector(`[data-k="${k}"]`)
    if (el) el.textContent = text
  }
  const button = shell.querySelector('button')
  const after = (ms: number, then: () => void) => setTimeout(then, Math.max(0, ms - performance.now()))
  put('m', w.m)
  put('h', said[0])
  put('t', said[1])
  if (button) button.textContent = w.r
  after(at[0], () => {
    put('m', w.n)
    put('h', said[2])
    put('t', said[3])
    shell.setAttribute('data-slow', '')
  })
  after(at[1], () => {
    if (button) button.hidden = false
  })
}
