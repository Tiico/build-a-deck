import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import './a11y.css'

const root = document.getElementById('root')
if (!root) throw new Error('index.html has no #root')
createRoot(root).render(<App />)
