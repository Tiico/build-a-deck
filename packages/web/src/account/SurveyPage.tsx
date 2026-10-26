import { useEffect, useMemo, useState } from 'react'
import { myPlayed, type Played } from './api.js'
import { Unauthorized, loginUrl } from './session.js'
import { AccountStatus, spent } from './AccountStatus.js'
import { Survey } from '../player/Survey.js'
import { submitSurvey } from '../player/surveyApi.js'
import { useHasRulebook } from '../rules/sessionRules.js'
import { useT } from '../i18n/index.js'
import { noticeFor } from '../status/notice.js'
import { maskedWord, maskedWords } from '../masked.js'

// /survey?session=…&server=…  — «Svara på enkäten» on Mina spel (#1143, variant B). A table that is
// over has no way in, so the account answers for the seat it claimed (G1) from its own login: the
// phone's survey, the same questions and the same one answer per seat (#1021), with the way back to
// Mina spel under the thanks. Without a login it goes to the login page, which comes back here.
//
// It asks for the phone's words, so it is a play surface to the first-frame gate (#760, #984), and
// draws nothing of the account's sheet: the survey is the phone's, and the notices the shell's.
export type SurveyPageProps = { onNavigate?(url: string): void }

const go = (url: string): void => location.assign(url)

export function SurveyPage({ onNavigate = go }: SurveyPageProps) {
  const t = useT()
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const session = params.get('session') ?? ''
  const server = params.get('server')
  const http = server ?? location.origin
  // The account's seat at this table: undefined while asked, null for none to answer for, and
  // 'out' for a reader with no login.
  const [mine, setMine] = useState<Played | null | 'out' | undefined>(undefined)
  const [offline, setOffline] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let live = true
    setOffline(false)
    myPlayed(http).then(
      (played) => live && setMine(played.find((p) => p.session === session && p.ended && !p.deleted) ?? null),
      (cause: unknown) => live && (cause instanceof Unauthorized ? setMine('out') : setOffline(true)),
    )
    return () => {
      live = false
    }
  }, [http, session, attempt])
  const rulebook = useHasRulebook(http, session, mine !== undefined && mine !== null && mine !== 'out')
  useEffect(() => {
    if (mine === 'out') onNavigate(loginUrl(location.pathname + location.search, server))
  }, [mine, server, onNavigate])

  const home = `/${server ? `?${new URLSearchParams({ server }).toString()}` : ''}`
  if (offline) return <AccountStatus page="survey" notice={noticeFor('offline', 'app', t)} server={server} signedIn={false} onRetry={() => setAttempt((n) => n + 1)} />
  if (mine === undefined || mine === 'out') return <AccountStatus page="survey" notice={noticeFor('loading', 'app', t)} server={server} signedIn={false} />
  if (mine === null) return <AccountStatus page="survey" notice={spent(t('survey-page.gone.heading'), t('survey-page.gone.text'), t)} server={server} signedIn />
  const seat = mine.seat
  return (
    <Survey
      who={maskedWord(mine.name, 'seat-name', maskedWords(t))}
      version={mine.version}
      rulebook={rulebook}
      remember={`${session}:${seat ?? mine.name}`}
      onSubmit={(answers) => submitSurvey(http, session, { who: mine.name, seat, ...(mine.kind === 'observer' ? { observer: true } : {}), answers })}
      onward={
        <a
          className="byd-survey-save"
          href={home}
          onClick={(e) => {
            e.preventDefault()
            onNavigate(home)
          }}
        >
          {t('survey-page.home')}
        </a>
      }
    />
  )
}
