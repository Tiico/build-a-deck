import { useRef, type ReactNode } from 'react'
import { INK, symbolName, symbolPreview } from './symbols.js'
import { RoleList, type Meaning } from './SymbolList.js'
import { SymbolSample, SymbolSheet } from './SymbolSample.js'
import { placedProps, usePlacement } from './placement.js'
import { PickList } from './picking.js'
import { pickKeyOf, type BracePart, type BracePick, type BraceSection } from './brace.js'
import { useT, type Key } from '../i18n/index.js'

// The box a symbol and its meaning are chosen in, at the brace in a cell (L34, #302; L57, #631).
//
// It proposes from the game first (L57): what the deck already writes, ready to go in with one
// click; then the game's own icons; and the library as the second click, behind «Hela
// biblioteket» at the foot. The parts are one run to the keys — `active` counts across all of
// them — and each part is drawn as its own list under its own heading, because a heading is what
// tells the designer which of the three she is looking at.
//
// Two questions in one box: which symbol, and — when the game has named meanings — which of them
// to draw it in. The meanings are not names beside abstract colour dots; they are coloured copies
// of the very symbol the designer chose, and the icons above follow the meaning the keys are on,
// so what she gets is seen before it is inserted. «Utan betydelse» stands first among them and
// costs no extra step. A token the deck already writes carries its meaning with it and asks
// nothing more. The foot says the exact string the box will write, which is the product's own
// syntax and nothing of the box's — the picker is a road to the same string the hand would type,
// not a replacement for it.
//
// A game with no meanings has no meaning step at all. The box says why in one line and the
// symbol is inserted in ink; nothing is skipped, because there is nothing to skip.
//
// Every sample stands on the card's paper: a symbol drawn in the card's ink against the editor's
// dark panel is no preview, and «utan betydelse» was invisible in the first draft.

// A symbol the box can draw: one of the game's icons, or one from the library.
export type Pickable = Extract<BracePick, { kind: 'icon' } | { kind: 'library' }>

export type SymbolBoxProps = {
  sections: readonly BraceSection[]
  // The one the keys are on, counted across every part.
  active: number
  // The symbol chosen, once one has been — the meanings are copies of it. Before that they are
  // copies of the one the keys are on, so the row is never about nothing.
  picked: Pickable | null
  // The game's meanings, with «utan betydelse» first. Empty when the game has named none.
  meanings: readonly Meaning[]
  // The meaning the keys are on, or null while they are still among the symbols.
  meaningActive: number | null
  // The card's ground: what every sample stands on.
  paper: string
  palette: Record<string, string> | undefined
  // The game's icons as pictures, by name.
  icons: Record<string, string>
  // How many symbols the library holds, said on the way into it.
  libraryCount: number
  // The list ids the cell points at with `aria-activedescendant`.
  listId(part: BracePart): string
  meaningsId: string
  className: string
  // The string the box will write, exactly.
  writes: string
  // How a token is written in this cell: `{name|role}` in text, a bare name in an icon row.
  token(name: string, role: string | null): string
  onPick(pick: BracePick): void
  onPickMeaning(role: string | null): void
}

const HEADS: Record<Exclude<BracePart, 'more'>, { label: Key; hint?: Key }> = {
  written: { label: 'table.brace.written', hint: 'table.brace.written.hint' },
  icons: { label: 'table.brace.icons' },
  found: { label: 'table.brace.found', hint: 'table.brace.found.hint' },
  library: { label: 'table.symbols' },
}

export function SymbolBox({ sections, active, picked, meanings, meaningActive, paper, palette, icons, libraryCount, listId, meaningsId, className, writes, token, onPick, onPickMeaning }: SymbolBoxProps) {
  const t = useT()
  const box = useRef<HTMLDivElement>(null)
  // The box opens where there is room for it (#229), as every list of this kind does. It is the
  // box that is placed and not the lists inside it, because the parts, the meanings and the foot
  // go up or down together.
  const place = usePlacement(true, box)
  const flat = sections.flatMap((s) => s.picks)
  const under = flat[active]
  const shown: Pickable | null = picked ?? (under && (under.kind === 'icon' || under.kind === 'library') ? under : null)
  // The meaning the symbols are drawn in: the one the keys are on, once they are among the meanings.
  const inked = meaningActive === null ? null : (meanings[meaningActive]?.role ?? null)
  // A library symbol is not in the game yet, so the sample's icon set is the symbol itself under
  // the name it will get — the same name the string in the foot is written with.
  const sample = (symbol: Pickable, role: string | null) => {
    const name = symbol.kind === 'icon' ? symbol.name : symbolName(symbol.symbol, t)
    const url = symbol.kind === 'icon' ? icons[symbol.name] : symbolPreview(symbol.symbol)
    return <SymbolSample written={`{${name}${role === null ? '' : `|${role}`}}`} symbols={{ icons: url ? { [name]: url } : {}, palette }} paper={paper} />
  }
  const isPicked = (pick: BracePick) => picked !== null && pick.kind === picked.kind && pickKeyOf(pick) === pickKeyOf(picked)
  const row = (pick: BracePick): ReactNode => {
    switch (pick.kind) {
      case 'written':
        return (
          <>
            <SymbolSample written={`{${pick.name}${pick.role === null ? '' : `|${pick.role}`}}`} symbols={{ icons, palette }} paper={paper} />
            <code>{token(pick.name, pick.role)}</code>
            <small>{t('table.brace.count', { n: pick.count })}</small>
          </>
        )
      case 'icon':
        return (
          <>
            {sample(pick, inked)}
            <span>{pick.name}</span>
          </>
        )
      case 'library':
        return (
          <>
            {sample(pick, inked)}
            <span>{symbolName(pick.symbol, t)}</span>
            <small>{pick.inGame ? t('table.brace.inGame') : t(pick.symbol.category)}</small>
          </>
        )
      case 'more':
        return t('table.brace.more', { n: libraryCount })
      case 'back':
        return t('table.brace.back')
    }
  }
  let from = 0
  const lists = sections.map((section) => {
    const start = from
    from += section.picks.length
    if (section.part === 'more') return null
    const head = HEADS[section.part]
    return (
      <div key={section.part} className="byd-symbol-box-part">
        {/* The heading is what the list is called, said where the eye is; the list carries the
            same words as its name, so it is not read twice. The library alone needs none: it is
            the whole box, as it always was. */}
        {section.part !== 'library' && (
          <p className="byd-symbol-box-head" aria-hidden="true">
            <span>{t(head.label)}</span>
            {head.hint && <small>{t(head.hint)}</small>}
          </p>
        )}
        <PickList
          id={listId(section.part)}
          className={`byd-symbol-list byd-symbol-box-${section.part}`}
          label={t(head.label)}
          options={section.picks}
          keyOf={pickKeyOf}
          attrs={(pick) => (pick.kind === 'icon' ? { 'data-symbol': pick.name } : pick.kind === 'library' ? { 'data-symbol': symbolName(pick.symbol, t) } : {})}
          active={picked ? section.picks.findIndex(isPicked) : active - start}
          onPick={onPick}
        >
          {row}
        </PickList>
      </div>
    )
  })
  const way = sections.find((s) => s.part === 'more')
  const wayStart = flat.length - (way?.picks.length ?? 0)
  return (
    <div ref={box} className={`byd-symbol-box ${className}`} role="group" aria-label={t('table.symbol.box')} {...placedProps(place)}>
      <SymbolSheet />
      {lists}
      {meanings.length === 0 ? (
        <p className="byd-symbol-none">{t('table.meanings.none')}</p>
      ) : (
        shown && (
          <RoleList
            id={meaningsId}
            className="byd-symbol-box-meanings"
            roles={meanings}
            active={meaningActive ?? -1}
            label={t('table.roles')}
            none={t('table.meaning.none')}
            sample={({ role }) => sample(shown, role)}
            onPick={onPickMeaning}
          />
        )
      )}
      <div className="byd-symbol-writes">
        {way && (
          <PickList
            id={listId('more')}
            className="byd-symbol-box-way"
            label={t('table.brace.library')}
            options={way.picks}
            keyOf={pickKeyOf}
            active={picked ? -1 : active - wayStart}
            onPick={onPick}
          >
            {row}
          </PickList>
        )}
        {writes && (
          <p>
            <span>{t('table.writes')}</span> <code>{writes}</code>
          </p>
        )}
      </div>
    </div>
  )
}

// The meanings as the box offers them: «utan betydelse» first, in the card's ink, and then the
// game's own. An empty palette is an empty list, which is what tells the box there is no step.
export function meaningsOf(palette: Record<string, string> | undefined): Meaning[] {
  const named = Object.entries(palette ?? {}).map(([role, colour]) => ({ role, colour }))
  return named.length === 0 ? [] : [{ role: null, colour: INK }, ...named]
}
