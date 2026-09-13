import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import './a11y.css'
import './buttons.css'
// The felt's own face, on the entry and not on the felt's sheet: the bytes have to be in the
// document before the first painting, or the felt lays itself out in the fallback's measurements
// and then does it again (K19, #95). Loading it here puts it in the stylesheet the built
// `index.html` blocks on, whatever a route later decides to split.
import './fonts/felt-font.css'

const root = document.getElementById('root')
if (!root) throw new Error('index.html has no #root')
createRoot(root).render(<App />)
