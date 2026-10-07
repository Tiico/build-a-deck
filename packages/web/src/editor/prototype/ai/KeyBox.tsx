// PROTOTYP — kastas (#940). Kontots nyckelruta: leverantör, nyckel, «Prövar nyckeln…», sparad med
// bara leverantör och de fyra sista tecknen, Byt / Ta bort, modell med standardval, och i vanliga
// ord vart spelets innehåll tar vägen. Ingen nyckel lämnar sidan; prövningen är en timer.
import { useEffect, useId, useRef, useState } from 'react'
import type { Provider } from './fake.js'

export type SavedKey = { provider: Provider; last4: string; model: string; at: string }

export const MODELS: Record<Provider, { id: string; name: string }[]> = {
  Anthropic: [
    { id: 'standard', name: 'Claude Sonnet 5.5 (standard)' },
    { id: 'opus', name: 'Claude Opus 5.5 — bäst, dyrare' },
    { id: 'haiku', name: 'Claude Haiku 4.5 — snabbast, billigast' },
  ],
  OpenAI: [
    { id: 'standard', name: 'GPT-5 (standard)' },
    { id: 'mini', name: 'GPT-5 mini — snabbare, billigare' },
  ],
}
const PLACEHOLDER: Record<Provider, string> = { Anthropic: 'sk-ant-…', OpenAI: 'sk-…' }
const WHERE: Record<Provider, string> = { Anthropic: 'Anthropic Console, under API Keys', OpenAI: 'OpenAI Platform, under API keys' }

export function modelName(key: SavedKey): string {
  return (MODELS[key.provider].find((m) => m.id === key.model)?.name ?? key.model).replace(/ —.*| \(standard\)/, '')
}

// Det som står i vanliga ord, alltid synligt och aldrig bakom ett frågetecken: det är en följd av
// en handling, och sådant flyttas inte till L32:s låda.
export function SentNote({ provider }: { provider: Provider }) {
  return (
    <p className="ux-ai-note">
      När du ber om hjälp skickas spelets innehåll — namn, fält, kort, mall och regelbok — till {provider}, och det betalas med din nyckel. Nyckeln sparas krypterad hos oss, visas aldrig igen och följer aldrig med när du exporterar ett spel.
    </p>
  )
}

export function KeyBox({ saved, onSave, onRemove, heading = 'h2', compact = false }: { saved: SavedKey | null; onSave(key: SavedKey): void; onRemove(): void; heading?: 'h2' | 'h3'; compact?: boolean }) {
  const [provider, setProvider] = useState<Provider>(saved?.provider ?? 'Anthropic')
  const [value, setValue] = useState('')
  const [phase, setPhase] = useState<'form' | 'prövar' | 'fel'>('form')
  const [changing, setChanging] = useState(saved === null)
  const [asking, setAsking] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const keepRef = useRef<HTMLButtonElement>(null)
  const id = useId()
  const H = heading
  useEffect(() => setChanging(saved === null), [saved])
  useEffect(() => {
    if (asking) keepRef.current?.focus()
  }, [asking])

  const test = () => {
    if (!value.trim()) {
      setPhase('fel')
      input.current?.focus()
      return
    }
    setPhase('prövar')
    window.setTimeout(() => {
      const bad = value.trim().length < 12 || /fel/i.test(value)
      if (bad) {
        setPhase('fel')
        input.current?.focus()
        return
      }
      onSave({ provider, last4: value.trim().slice(-4), model: saved?.provider === provider ? saved.model : 'standard', at: new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }) })
      setValue('')
      setPhase('form')
    }, 1400)
  }

  if (saved && !changing) {
    return (
      <section className="ux-ai-key" data-compact={compact ? '' : undefined} aria-labelledby={`${id}-h`}>
        <H id={`${id}-h`}>AI-nyckel</H>
        <p className="ux-ai-key-saved">
          <span className="ux-ai-key-tick" aria-hidden="true">
            ✓
          </span>
          <span>
            <strong>{saved.provider}</strong> · nyckeln som slutar på <code>…{saved.last4}</code>
            <span className="ux-ai-quiet"> · prövad i dag {saved.at}</span>
          </span>
        </p>
        <label className="ux-ai-field">
          <span>Modell</span>
          <select value={saved.model} onChange={(e) => onSave({ ...saved, model: e.target.value })}>
            {MODELS[saved.provider].map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <SentNote provider={saved.provider} />
        {asking ? (
          <div className="ux-ai-question" role="group" aria-label="Ta bort nyckeln?">
            <span>Ta bort nyckeln? AI-hjälpen i editorn slutar fungera tills du lägger in en ny.</span>
            <button ref={keepRef} type="button" className="byd-secondary" onClick={() => setAsking(false)}>
              Avbryt
            </button>
            <button
              type="button"
              className="ux-ai-danger"
              onClick={() => {
                setAsking(false)
                onRemove()
              }}
            >
              Ja, ta bort
            </button>
          </div>
        ) : (
          <div className="ux-ai-row">
            <button type="button" className="byd-secondary" onClick={() => setChanging(true)}>
              Byt nyckel
            </button>
            <button type="button" className="byd-secondary" onClick={() => setAsking(true)}>
              Ta bort
            </button>
          </div>
        )}
      </section>
    )
  }

  return (
    <section className="ux-ai-key" data-compact={compact ? '' : undefined} aria-labelledby={`${id}-h`}>
      <H id={`${id}-h`}>{saved ? 'Byt AI-nyckel' : 'AI-hjälp med din egen nyckel'}</H>
      {!saved && <p className="ux-ai-lead">Editorn kan föreslå mallar, fält och kort med AI. Det drivs av din egen nyckel hos Anthropic eller OpenAI, så du betalar leverantören direkt och vi tar inget för det.</p>}
      <form
        className="ux-ai-key-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (phase !== 'prövar') test()
        }}
      >
        <fieldset className="ux-ai-providers">
          <legend>Leverantör</legend>
          {(['Anthropic', 'OpenAI'] as const).map((p) => (
            <label key={p} className="ux-ai-provider">
              <input type="radio" name={`${id}-provider`} checked={provider === p} onChange={() => setProvider(p)} />
              {p}
            </label>
          ))}
        </fieldset>
        <label className="ux-ai-field">
          <span>API-nyckel</span>
          <input
            ref={input}
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={PLACEHOLDER[provider]}
            value={value}
            aria-invalid={phase === 'fel'}
            aria-describedby={`${id}-where ${phase === 'fel' ? `${id}-err` : ''}`}
            onChange={(e) => {
              setValue(e.target.value)
              if (phase === 'fel') setPhase('form')
            }}
          />
          <span id={`${id}-where`} className="ux-ai-quiet">
            Skapa en nyckel i {WHERE[provider]}.
          </span>
        </label>
        {phase === 'fel' && (
          <p id={`${id}-err`} className="ux-ai-fail" role="alert" data-kind="leverantör">
            <strong>{value.trim() ? `${provider} godtog inte nyckeln` : 'Klistra in en nyckel först'}</strong>
            {value.trim() && <span>Kontrollera att du kopierade hela nyckeln och att den är från {provider}. Inget sparades.</span>}
          </p>
        )}
        <SentNote provider={provider} />
        <div className="ux-ai-row">
          <button type="submit" className="byd-primary" aria-busy={phase === 'prövar'} aria-disabled={phase === 'prövar'}>
            {phase === 'prövar' ? 'Prövar nyckeln…' : 'Spara och pröva'}
          </button>
          {saved && (
            <button type="button" className="byd-secondary" onClick={() => setChanging(false)}>
              Avbryt
            </button>
          )}
        </div>
        <p className="ux-ai-sr" role="status">
          {phase === 'prövar' ? `Prövar nyckeln hos ${provider}…` : ''}
        </p>
      </form>
    </section>
  )
}

// Rutan som en dialog i editorn: dit «Byt nyckel…» och «Lägg in nyckel» leder.
export function KeyDialog({ open, onClose, saved, onSave, onRemove }: { open: boolean; onClose(): void; saved: SavedKey | null; onSave(key: SavedKey): void; onRemove(): void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} className="ux-ai-dialog" onClose={onClose} aria-label="AI-nyckel">
      <button type="button" className="ux-ai-close" aria-label="Stäng" onClick={onClose}>
        ×
      </button>
      <KeyBox saved={saved} onSave={onSave} onRemove={onRemove} />
    </dialog>
  )
}
