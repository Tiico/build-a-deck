// PROTOTYP — släng mig. Öppnas på /prototype/icon-loading.html?variant=A|B|C från Vite i packages/web.
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../src/a11y.css'
import '../src/buttons.css'
import '../src/editor/editor.css'
import { holdWords, Language } from '../src/i18n/index.js'
import { sv } from '../src/i18n/sv.js'
import { loadIconCatalog, type CatalogIcon } from '../src/editor/icon-catalog.js'
import { IconCatalogVariant, type Variant } from './IconCatalogVariants.prototype.js'

holdWords('sv', sv)

const style = document.createElement('style')
style.textContent = `
body { margin: 0; background: #16181d; font-family: system-ui, sans-serif; color: #e8e8ea; }
.proto-frame { height: 100vh; display: grid; }
.proto-stage { display: grid; place-items: start center; padding-top: 24px; }
.proto-card { width: 210px; height: 294px; border-radius: 10px; background: #f4ead8; box-shadow: 0 10px 30px #0008; }
.proto-libs-line { flex: none; margin: 0; padding: 6px 12px 0; font-size: 11px; color: var(--byd-editor-quiet); }
.proto-libs-tile { grid-column: 1 / -1; display: flex; align-items: center; gap: 12px; border: 1px dashed var(--byd-editor-line); border-radius: 10px; padding: 8px 12px; font-size: 12px; color: var(--byd-editor-quiet); }
.proto-libs-ghosts { display: flex; gap: 6px; }
.proto-libs-ghosts span { width: 36px; height: 36px; border-radius: 6px; background: var(--byd-editor-line); opacity: .6; animation: proto-pulse 1.4s ease-in-out infinite; }
.proto-libs-ghosts span:nth-child(2) { animation-delay: .2s } .proto-libs-ghosts span:nth-child(3) { animation-delay: .4s }
@keyframes proto-pulse { 50% { opacity: .25 } }
.proto-bar { position: fixed; left: 50%; top: 12px; transform: translateX(-50%); z-index: 99; display: flex; gap: 6px; align-items: center; padding: 6px 10px; border-radius: 999px; background: #000c; border: 1px solid #fff3; font-size: 12px; }
.proto-bar button { font: inherit; border-radius: 999px; border: 1px solid #fff4; background: transparent; color: #fff; padding: 3px 10px; cursor: pointer; }
.proto-bar button[aria-pressed='true'] { background: #fff; color: #000; }
`
document.head.append(style)

const NAMES: Record<Variant, string> = { A: 'A · rad ovanför', B: 'B · i rutnätet', C: 'C · hyllor och fot' }

function Proto() {
  const params = new URLSearchParams(location.search)
  const [variant, setVariant] = useState<Variant>((params.get('variant') as Variant) ?? 'A')
  const [loaded, setLoaded] = useState<CatalogIcon[] | null>(null)
  const [held, setHeld] = useState(true)
  useEffect(() => void loadIconCatalog('sv').then((icons) => setLoaded(icons.filter((i) => i.source !== 'deckster'))), [])
  const pick = (v: Variant) => {
    setVariant(v)
    const u = new URL(location.href)
    u.searchParams.set('variant', v)
    history.replaceState(null, '', u)
  }
  return (
    <div className="byd-editor proto-frame">
      <div className="byd-canvas-main">
        <div className="proto-stage">
          <div className="proto-card" />
        </div>
        <IconCatalogVariant key={variant} variant={variant} libs={held ? null : loaded} colour="#a8322d" paper="#f4ead8" target="för typ = Anfall" />
      </div>
      <div className="proto-bar">
        {(['A', 'B', 'C'] as const).map((v) => (
          <button key={v} type="button" aria-pressed={v === variant} onClick={() => pick(v)}>
            {NAMES[v]}
          </button>
        ))}
        <button type="button" onClick={() => setHeld(!held)}>
          {held ? 'Släpp biblioteken' : 'Håll biblioteken igen'}
        </button>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <Language lang="sv">
    <Proto />
  </Language>,
)
