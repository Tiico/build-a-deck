import { createRoot } from 'react-dom/client'
import './first-frame-sheets.js'
import { App, loadPage } from './App.js'
import { continueShellClock } from './status/waitClock.js'
import './a11y.css'
import './buttons.css'
import './dropping.css'
// The felt's own face, on the entry and not on the felt's sheet: the bytes have to be in the
// document before the app's first frame, or the felt lays itself out in the fallback's
// measurements and then does it again (K19, #95). Loading it here puts it in the entry's
// stylesheet, which the entry waits for before it runs (L20, tillägg #749), whatever a route later
// decides to split.
import './fonts/felt-font.css'

const root = document.getElementById('root')
if (!root) throw new Error('index.html has no #root')
// The shell in `index.html` has said «laddar» since the page was asked for (#749), and React
// replaces it on its first rendering. The app's first wait is the same wait, so its clock goes on
// from the shell's rather than starting again at mount (`waitClock.ts`).
if (document.getElementById('byd-shell')) continueShellClock()
// The surface's own script first, then the app's first frame (#760): what replaces the shell is the
// page that was asked for, never a fallback that gives way to it a moment later.
void loadPage().then((Page) => createRoot(root).render(<App Page={Page} />))
