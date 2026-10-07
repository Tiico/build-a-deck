// PROTOTYP — kastas (#940). Kontots nyckelruta där den hör hemma: på «Mina spel», bakom ett
// «AI-nyckel» i raden med e-posten, «Logga ut» och språket — det finns ingen kontosida i dag, och
// raden är redan där kontots egna saker står. Den riktiga startsidan monteras; rutan hängs in.
import { useState } from 'react'
import { HomePage } from '../../../account/HomePage.js'
import { KeyBox, type SavedKey } from './KeyBox.js'
import { Into, useSlots } from './parts.js'
import { AiSwitch, DEMO_KEY, useInlineCss, useParam } from './AiPrototype.js'

export default function AccountKey() {
  useInlineCss()
  const [keyParam] = useParam('nyckel')
  const [saved, setSaved] = useState<SavedKey | null>(keyParam === '0' ? null : DEMO_KEY)
  const [open, setOpen] = useState(true)
  const who = useSlots('.byd-home > header .byd-who')
  const under = useSlots('.byd-home', 'after-header', 'div')
  return (
    <div className="ux-ai-account">
      <HomePage />
      <Into slot={who[0]}>
        <button type="button" className="ux-ai-who-link" aria-expanded={open} aria-controls="ux-ai-account-key" onClick={() => setOpen(!open)}>
          AI-nyckel
        </button>
      </Into>
      <Into slot={under[0]}>
        {open && (
          <div id="ux-ai-account-key" className="ux-ai-account-box">
            <KeyBox saved={saved} onSave={setSaved} onRemove={() => setSaved(null)} />
          </div>
        )}
      </Into>
      <AiSwitch variant="nyckel" hasKey={saved !== null} onKey={(on) => setSaved(on ? DEMO_KEY : null)} onReset={() => setSaved(keyParam === '0' ? null : DEMO_KEY)} />
    </div>
  )
}
