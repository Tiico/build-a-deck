import { createRoot } from 'react-dom/client'
import './first-frame-sheets.js'
import { App, loadPage } from './App.js'
import './a11y.css'
import './buttons.css'
import './dropping.css'
// The felt's own face, on the entry and not on the felt's sheet: the bytes have to be in the
// document before the first painting, or the felt lays itself out in the fallback's measurements
// and then does it again (K19, #95). Loading it here puts it in the stylesheet the built
// `index.html` blocks on, whatever a route later decides to split.
import './fonts/felt-font.css'

const root = document.getElementById('root')
if (!root) throw new Error('index.html has no #root')
// The surface's own script first, then the first painting (#760): what the screen shows first is
// the page that was asked for, never a fallback that gives way to it a moment later.
void loadPage().then((Page) => createRoot(root).render(<App Page={Page} />))
