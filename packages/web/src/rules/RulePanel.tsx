import type { Ref } from 'react'
import type { RenderedRules } from '@byd/template'
import { RuleBlockView } from './RuleDrawer.js'
import { findRules } from './search.js'
import { useT } from '../i18n/index.js'
import './rules.css'

// Luckans insida, i en modul för sig (#346). Den enda som hämtar `rules.css`, och den hämtas
// själv först när någon har tryckt på `Regler` — så arket följer med då och ligger inte i den
// stilmall den första målningen väntar på. Knappen som öppnar luckan står kvar i `RuleDrawer`
// med sitt eget ark, eftersom den ritas på första bildrutan.
//
// Att det är en dynamisk import och inte bara ett senare `<link>` är vad som gör att luckan
// aldrig visas oklädd: bygget lägger chunkens ark bredvid dess kod, och `import()` blir klar
// först när båda är hämtade. Det som väntar är alltså luckan och aldrig knappen.
export type RulePanelProps = {
  rules: RenderedRules | null
  assets?: string | undefined
  query: string
  onQuery: (q: string) => void
  onClose: () => void
  body?: Ref<HTMLDivElement> | undefined
}

export function RulePanel({ rules, assets, query, onQuery, onClose, body }: RulePanelProps) {
  const t = useT()
  const hits = rules ? findRules(rules, query) : []
  return (
    <aside className="byd-rules-panel" role="dialog" aria-label={t('rules.drawer.open')}>
      <div className="byd-rules-ask">
        <input type="search" aria-label={t('rules.drawer.ask')} placeholder={t('rules.drawer.ask')} value={query} onChange={(e) => onQuery(e.target.value)} />
        <button type="button" aria-label={t('rules.drawer.close')} onClick={onClose}>
          ×
        </button>
      </div>
      <div className="byd-rules-body" ref={body}>
        {rules === null ? (
          <p>{t('rules.drawer.loading')}</p>
        ) : query.trim() ? (
          hits.length === 0 ? (
            <p className="byd-rules-none">{t('rules.drawer.none')}</p>
          ) : (
            <ol className="byd-rules-hits">
              {hits.map((h) => (
                <li key={h.id}>
                  <h3>{h.heading}</h3>
                  <p>{h.text}</p>
                </li>
              ))}
            </ol>
          )
        ) : (
          <article className="byd-rules-page">
            <h2>{rules.title}</h2>
            {/* Each block says which one it is, so that a reader's place in the book can be
                carried between two boxes of different widths (#227). It is the same mark the
                editor's own page carries, and the only thing the two books have in common
                once their measures differ. */}
            {rules.blocks.map((b) => (
              <div key={b.id} data-block={b.id}>
                <RuleBlockView block={b} assets={assets} />
              </div>
            ))}
          </article>
        )}
      </div>
    </aside>
  )
}
