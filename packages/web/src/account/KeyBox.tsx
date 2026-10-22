import { useEffect, useId, useRef, useState, type MouseEvent } from 'react'
import { Question } from '../editor/Question.js'
import { useSay } from '../status/StatusLive.js'
import { readerLocale, useLang, useT, type Key, type T } from '../i18n/index.js'
import { marked } from './marked.js'
import { AI_PROVIDER_LIST, KEY_PAGES, PROVIDER_NAMES, chooseAiModel, listAiModels, modelNameOf, removeAiKey, saveAiKey, type AiKey, type AiModel, type AiProvider, type KeyRefusal } from './ai-key.js'
import { CheckGlyph } from '../glyphs.js'

// The key box (#999), built from the prototype the beställare chose (#940's key box on #998's page,
// variant A): the provider, the key pasted once, «Prövar nyckeln…», why the provider said no, the
// saved key as its provider and last four, the model with the provider's standard first, «Byt
// nyckel» and «Ta bort» with a question first (L9), and in plain words where the game goes when help
// is asked for. Nothing here ever holds a saved key: the server describes it and that is all.

// Where a designer the editor sent here goes back to once her key is saved (#998): the game, by name.
export type WayBack = { href: string; name: string; onGo(e: MouseEvent<HTMLAnchorElement>): void }

type Phase = { kind: 'form' } | { kind: 'busy' } | { kind: 'refused'; why: KeyRefusal | 'empty' }

export function KeyBox({ http, initial, wayBack }: { http: string; initial: AiKey | null; wayBack: WayBack | null }) {
  const t = useT()
  const { lang } = useLang()
  const say = useSay()
  const id = useId()
  const [saved, setSaved] = useState<AiKey | null>(initial)
  const [models, setModels] = useState<AiModel[] | null>(null)
  const [changing, setChanging] = useState(false)
  const [provider, setProvider] = useState<AiProvider>(initial?.provider ?? 'anthropic')
  const [value, setValue] = useState('')
  const [phase, setPhase] = useState<Phase>({ kind: 'form' })
  const [asking, setAsking] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [modelFailed, setModelFailed] = useState(false)
  const [removeFailed, setRemoveFailed] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const changeButton = useRef<HTMLButtonElement>(null)
  const removeButton = useRef<HTMLButtonElement>(null)
  // Where the focus goes once what had it is gone, so it never falls to <body>.
  // Each ask is a new object, so the last one asked is the one that lands, however the renders fall.
  const [focus, focusOn] = useState<{ to: 'heading' | 'input' | 'change' | 'remove' } | null>(null)
  const setFocus = (to: 'heading' | 'input' | 'change' | 'remove') => focusOn({ to })
  useEffect(() => {
    if (focus) ({ heading, input, change: changeButton, remove: removeButton })[focus.to].current?.focus()
  }, [focus])

  // The models of a key saved before this visit are asked for when the page opens; a key saved now
  // brought its own with it.
  const showing = saved && !changing
  useEffect(() => {
    if (!showing || models) return
    let live = true
    void listAiModels(http).then((list) => {
      if (live && list) setModels(list.models)
    })
    return () => {
      live = false
    }
  }, [showing, models, http])

  const name = PROVIDER_NAMES[provider]
  const submit = async () => {
    if (phase.kind === 'busy') return
    if (!value.trim()) {
      setPhase({ kind: 'refused', why: 'empty' })
      setFocus('input')
      return
    }
    setPhase({ kind: 'busy' })
    say?.('polite', t('profile.key.saving.said', { provider: name }))
    const answer = await saveAiKey(http, provider, value.trim())
    if (!answer.ok) {
      setPhase({ kind: 'refused', why: answer.why })
      setFocus('input')
      return
    }
    setSaved(answer.key)
    setModels(answer.models)
    setValue('')
    setPhase({ kind: 'form' })
    setChanging(false)
    setJustSaved(true)
    setModelFailed(false)
    setFocus('heading')
    say?.('polite', t('profile.key.saved.said', { provider: PROVIDER_NAMES[answer.key.provider] }))
  }

  if (saved && !changing) {
    const savedName = PROVIDER_NAMES[saved.provider]
    const choices = modelChoices(saved, models, t)
    return (
      <section className="byd-profile-card byd-profile-key" aria-labelledby={`${id}-h`}>
        <h2 id={`${id}-h`} ref={heading} tabIndex={-1}>
          {t('profile.key.title')}
        </h2>
        <p className="byd-profile-saved">
          <span className="byd-profile-tick" aria-hidden="true">
            <CheckGlyph />
          </span>
          <span>
            {marked(t('profile.key.saved'), { provider: <strong>{savedName}</strong>, last4: <code>…{saved.last4}</code> })}
            <span className="byd-profile-quiet"> · {t('profile.key.proved', { when: provedWhen(saved.verifiedAt, lang, t) })}</span>
          </span>
        </p>
        {justSaved && wayBack && (
          <p className="byd-profile-done" role="status">
            <span>{t('profile.key.done')}</span>
            <a className="byd-primary byd-profile-button" href={wayBack.href} onClick={wayBack.onGo}>
              {t('profile.back.game', { game: wayBack.name })}
            </a>
          </p>
        )}
        <div className="byd-profile-field">
          <label htmlFor={`${id}-model`}>{t('profile.key.model')}</label>
          <select
            id={`${id}-model`}
            value={saved.model ?? ''}
            onChange={(e) => {
              const model = e.target.value || null
              setModelFailed(false)
              void chooseAiModel(http, model).then(
                (key) => {
                  if (!key) return setSaved(null)
                  setSaved(key)
                  say?.('polite', t('profile.key.model.said', { model: choices.find((c) => c.value === (model ?? ''))?.label ?? model ?? '' }))
                },
                () => setModelFailed(true),
              )
            }}
          >
            {choices.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
          {modelFailed && (
            <span className="byd-profile-fail-line" role="alert">
              {t('profile.key.model.failed')}
            </span>
          )}
        </div>
        <SentNote provider={savedName} t={t} />
        {asking ? (
          <Question
            className="byd-profile-question"
            label={t('profile.key.remove.ask')}
            confirm={t('profile.key.remove.confirm')}
            cancel={t('profile.key.remove.keep')}
            onCancel={() => {
              setAsking(false)
              setFocus('remove')
            }}
            onConfirm={() => {
              setAsking(false)
              setRemoveFailed(false)
              void removeAiKey(http).then(
                () => {
                  setSaved(null)
                  setModels(null)
                  setJustSaved(false)
                  setPhase({ kind: 'form' })
                  setFocus('heading')
                  say?.('polite', t('profile.key.removed'))
                },
                () => {
                  setRemoveFailed(true)
                  setFocus('remove')
                },
              )
            }}
          >
            {t('profile.key.remove.ask')}
          </Question>
        ) : (
          <div className="byd-profile-row">
            <button
              ref={changeButton}
              type="button"
              className="byd-secondary byd-profile-button"
              onClick={() => {
                setProvider(saved.provider)
                setPhase({ kind: 'form' })
                setChanging(true)
                setFocus('input')
              }}
            >
              {t('profile.key.change')}
            </button>
            <button ref={removeButton} type="button" className="byd-secondary byd-profile-button" onClick={() => setAsking(true)}>
              {t('profile.key.remove')}
            </button>
          </div>
        )}
        {removeFailed && (
          <p className="byd-profile-fail-line" role="alert">
            {t('profile.key.remove.failed')}
          </p>
        )}
      </section>
    )
  }

  const refused = phase.kind === 'refused' ? phase.why : null
  const busy = phase.kind === 'busy'
  return (
    <section className="byd-profile-card byd-profile-key" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} ref={heading} tabIndex={-1}>
        {t(saved ? 'profile.key.title.change' : 'profile.key.title')}
      </h2>
      {!saved && <p className="byd-profile-lead">{t('profile.key.lead')}</p>}
      <form
        className="byd-profile-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <fieldset className="byd-profile-providers">
          <legend>{t('profile.key.provider')}</legend>
          {AI_PROVIDER_LIST.map((p) => (
            <label key={p} className="byd-profile-provider">
              <input
                type="radio"
                name={`${id}-provider`}
                checked={provider === p}
                onChange={() => {
                  setProvider(p)
                  if (refused && refused !== 'empty') setPhase({ kind: 'form' })
                }}
              />
              {PROVIDER_NAMES[p]}
            </label>
          ))}
        </fieldset>
        <div className="byd-profile-field">
          <label htmlFor={`${id}-key`}>{t('profile.key.field')}</label>
          <input
            ref={input}
            id={`${id}-key`}
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={provider === 'anthropic' ? 'sk-ant-…' : 'sk-…'}
            value={value}
            aria-invalid={refused ? true : undefined}
            aria-describedby={[`${id}-create`, refused ? `${id}-error` : ''].filter(Boolean).join(' ')}
            onChange={(e) => {
              setValue(e.target.value)
              if (refused) setPhase({ kind: 'form' })
            }}
          />
          <span id={`${id}-create`} className="byd-profile-quiet">
            {t('profile.key.create.lead')}{' '}
            <a href={KEY_PAGES[provider]} target="_blank" rel="noreferrer noopener">
              {t('profile.key.create.link', { provider: name })}
              <span aria-hidden="true"> ↗</span>
              <span className="byd-offscreen"> {t('profile.key.newTab')}</span>
            </a>
          </span>
        </div>
        {refused && <Refusal id={`${id}-error`} why={refused} provider={name} t={t} />}
        <SentNote provider={name} t={t} />
        <div className="byd-profile-row">
          <button type="submit" className="byd-primary byd-profile-button" aria-busy={busy || undefined} aria-disabled={busy || undefined}>
            {t(busy ? 'profile.key.saving' : 'profile.key.save')}
          </button>
          {saved && (
            <button
              type="button"
              className="byd-secondary byd-profile-button"
              onClick={() => {
                setValue('')
                setPhase({ kind: 'form' })
                setChanging(false)
                setFocus('change')
              }}
            >
              {t('profile.key.cancel')}
            </button>
          )}
        </div>
      </form>
    </section>
  )
}

// What is sent where, said before a key is saved and beside it afterwards (E4's follow-on demand).
function SentNote({ provider, t }: { provider: string; t: T }) {
  return <p className="byd-profile-note">{t('profile.key.sent', { provider })}</p>
}

function Refusal({ id, why, provider, t }: { id: string; why: KeyRefusal | 'empty'; provider: string; t: T }) {
  if (why === 'empty') {
    return (
      <p id={id} className="byd-profile-fail" role="alert">
        <strong>{t('profile.key.error.empty')}</strong>
      </p>
    )
  }
  return (
    <p id={id} className="byd-profile-fail" role="alert">
      <strong>{t(`profile.key.error.${why}` as Key, { provider })}</strong>
      <span>{t(`profile.key.error.${why}.text` as Key, { provider })}</span>
    </p>
  )
}

// The picker: the provider's standard first, named as the model it is today, then the rest of the
// key's list; a model chosen once and since gone from the list stays, so the picker never lies about
// what is chosen.
function modelChoices(saved: AiKey, models: AiModel[] | null, t: T): { value: string; label: string }[] {
  const list = models ?? []
  const standard = modelNameOf(list, saved.defaultModel)
  const rest = list.filter((m) => m.id !== saved.defaultModel).map((m) => ({ value: m.id, label: m.name }))
  const kept = saved.model && !rest.some((m) => m.value === saved.model) ? [{ value: saved.model, label: saved.model }] : []
  return [{ value: '', label: t('profile.key.model.standard', { model: standard }) }, ...rest, ...kept]
}

// «i dag 09:41», «i går 18:02», or the date for anything older.
function provedWhen(iso: string, lang: ReturnType<typeof useLang>['lang'], t: T): string {
  const at = new Date(iso)
  const locale = readerLocale(lang)
  const time = at.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((day(new Date()) - day(at)) / 86400_000)
  if (days === 0) return t('profile.key.when.today', { time })
  if (days === 1) return t('profile.key.when.yesterday', { time })
  return at.toLocaleDateString(locale)
}
