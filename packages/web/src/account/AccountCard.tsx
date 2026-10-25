import { useRef, useState, type ReactNode } from 'react'
import { Question } from '../editor/Question.js'
import { useLang, useT, type Lang } from '../i18n/index.js'
import { ImportGlyph, TrashGlyph } from '../glyphs.js'
import { marked } from './marked.js'
import { deleteAccount, downloadMyData, myDeletion, type Deletion } from './api.js'
import { logout } from './session.js'

// The Konto card (#1280, beställarens beslut A): the address, the way to log out, and the account's
// two rights under the same heading — the extract as a file straight away (art. 15 och 20), and
// «Radera kontot…» with L9's one question, a strip where it was asked that names every game that
// goes, who else loses it, the tables it ends and the games it leaves. Games with co-editors go with
// the account, as when the owner takes them away one by one.
export function AccountCard({ http, email, onLoggedOut, onErased }: { http: string; email: string; onLoggedOut(): void; onErased(): void }) {
  const t = useT()
  const { lang } = useLang()
  const [data, setData] = useState<{ state: 'idle' | 'busy' | 'failed' } | { state: 'done'; name: string }>({ state: 'idle' })
  const [asking, setAsking] = useState<Deletion | null>(null)
  const [deleting, setDeleting] = useState<'idle' | 'busy' | 'failed'>('idle')
  const opener = useRef<HTMLButtonElement>(null)
  return (
    <section className="byd-profile-card" aria-labelledby="byd-profile-account">
      <h2 id="byd-profile-account">{t('profile.account.title')}</h2>
      <dl className="byd-profile-facts">
        <dt>{t('profile.account.email')}</dt>
        <dd>{email}</dd>
      </dl>
      <p className="byd-profile-quiet byd-profile-small">{t('profile.account.note')}</p>
      <div className="byd-profile-row">
        <button type="button" className="byd-secondary byd-profile-button" onClick={() => void logout(http).then(onLoggedOut)}>
          {t('profile.account.logout')}
        </button>
      </div>

      <div className="byd-profile-part" aria-labelledby="byd-profile-data">
        <h3 id="byd-profile-data">{t('profile.data.title')}</h3>
        <p className="byd-profile-lead">{t('profile.data.lead')}</p>
        {data.state === 'done' ? (
          <p className="byd-profile-saved" role="status">
            <span className="byd-profile-tick" aria-hidden="true">
              ✓
            </span>
            <span>{marked(t('profile.data.done'), { file: <b>{data.name}</b> })}</span>
          </p>
        ) : (
          <div className="byd-profile-row">
            <button
              type="button"
              className="byd-secondary byd-profile-button"
              disabled={data.state === 'busy'}
              onClick={() => {
                setData({ state: 'busy' })
                void downloadMyData(http, lang).then(
                  ({ file, name }) => {
                    save(file, name)
                    setData({ state: 'done', name })
                  },
                  () => setData({ state: 'failed' }),
                )
              }}
            >
              <ImportGlyph />
              {t(data.state === 'busy' ? 'profile.data.busy' : 'profile.data.download')}
            </button>
          </div>
        )}
        {data.state === 'failed' && (
          <p className="byd-profile-fail-line" role="alert">
            {t('profile.data.failed')}
          </p>
        )}
      </div>

      <div className="byd-profile-part" aria-labelledby="byd-profile-delete">
        <h3 id="byd-profile-delete">{t('profile.delete.title')}</h3>
        <p className="byd-profile-quiet byd-profile-small">{t('profile.delete.lead')}</p>
        {asking ? (
          <Question
            className="byd-profile-question byd-profile-question-list"
            label={t('profile.delete.ask')}
            confirm={t('profile.delete.confirm')}
            cancel={t('profile.delete.keep')}
            onCancel={() => {
              setAsking(null)
              requestAnimationFrame(() => opener.current?.focus())
            }}
            onConfirm={() => {
              setDeleting('busy')
              void deleteAccount(http, lang).then(
                // The door says it in a status of its own, so it is not said twice here.
                () => onErased(),
                () => {
                  setDeleting('failed')
                  setAsking(null)
                },
              )
            }}
            more={<ul>{whatGoes(asking, t, lang)}</ul>}
          >
            {marked(t('profile.delete.ask.strip'), { ask: <b>{t('profile.delete.ask.short')}</b> })}
          </Question>
        ) : (
          <div className="byd-profile-row">
            <button
              ref={opener}
              type="button"
              className="byd-secondary byd-profile-button"
              disabled={deleting === 'busy'}
              onClick={() => {
                setDeleting('idle')
                void myDeletion(http).then(setAsking, () => setDeleting('failed'))
              }}
            >
              <TrashGlyph />
              {t('profile.delete.open')}
            </button>
          </div>
        )}
        {deleting === 'failed' && (
          <p className="byd-profile-fail-line" role="alert">
            {t('profile.delete.failed')}
          </p>
        )}
      </div>
    </section>
  )
}

const save = (file: Blob, name: string) => {
  const a = document.createElement('a')
  const url = URL.createObjectURL(file)
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// «Stjärnhandel, Skogens råd och Hamnen», each name in bold: a list in the reader's language whose
// parts are the designer's own words (A4).
function namesOf(names: readonly string[], lang: Lang): ReactNode[] {
  return new Intl.ListFormat(lang === 'en' ? 'en-GB' : 'sv-SE', { style: 'long', type: 'conjunction' })
    .formatToParts(names)
    .map((part, i) => (part.type === 'element' ? <b key={i}>{part.value}</b> : part.value))
}
const plainNames = (names: readonly string[], lang: Lang): string => new Intl.ListFormat(lang === 'en' ? 'en-GB' : 'sv-SE', { style: 'long', type: 'conjunction' }).format(names)

// Whose a game is, as the reader's language says it of a name (#1198): «Saras», «Lars», «Sara's».
export function ownersWord(name: string, lang: Lang): string {
  if (lang === 'en') return `${name}’s`
  return /[sxz]$/i.test(name) ? name : `${name}s`
}

// What the strip says goes, one line each: the games, who else loses each shared one, the tables
// that end, the games it leaves, and the logging out.
function whatGoes(d: Deletion, t: ReturnType<typeof useT>, lang: Lang): ReactNode[] {
  const lines: ReactNode[] = []
  if (d.games.length > 0) lines.push(<li key="games">{marked(t(d.games.length === 1 ? 'profile.delete.game' : 'profile.delete.games'), { games: namesOf(d.games.map((g) => g.name), lang), game: <b>{d.games[0]?.name}</b> })}</li>)
  for (const g of d.games) {
    if (g.others.length > 0) lines.push(<li key={`others-${g.id}`}>{t(g.others.length === 1 ? 'profile.delete.other' : 'profile.delete.others', { people: plainNames(g.others, lang), game: g.name })}</li>)
  }
  for (const g of d.games) {
    if (g.playing > 0) lines.push(<li key={`playing-${g.id}`}>{t(g.playing === 1 ? 'profile.delete.playing.one' : 'profile.delete.playing.other', { game: g.name, n: g.playing })}</li>)
  }
  for (const g of d.leaving) lines.push(<li key={`leaving-${g.id}`}>{g.owner ? t('profile.delete.leaving', { game: g.name, owners: ownersWord(g.owner, lang) }) : t('profile.delete.leaving.unnamed', { game: g.name })}</li>)
  lines.push(<li key="out">{t(d.tables > 0 ? 'profile.delete.out' : 'profile.delete.out.only')}</li>)
  return lines
}
