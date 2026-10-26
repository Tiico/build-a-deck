import { useId, useState } from 'react'
import { MAX_PLAYERS, type Setup } from '@byd/server/doc'
import type { ProjectClient } from './ProjectClient.js'
import { Stepper } from '../Stepper.js'
import { Help } from './HelpDrawer.js'
import { useT } from '../i18n/index.js'
import { recipeWords } from './fields.js'
import { ChevronGlyph } from '../glyphs.js'

// What is the game's and not the zones' (#1403, beställarens beslut C): how many play, whether
// the game goes in turns (K30), and which pile the deck lies in (B5). They stand first in Bord's
// column as one strip that says all three in a breath, and open into their fields when pressed —
// so the list of what lies on the table starts a row down, not a screenful.
//
// The deck is chosen here and nowhere else. It was a button in every *other* pile's panel («Lägg
// leken i Kasthög»), which moved a role of the game while reading as an action on that pile, and
// nobody could tell what it was for. The pile the deck lies in still wears the word in the list,
// and still cannot be removed while it does.
export function GamePanel({ client, setup }: { client: ProjectClient; setup: Setup }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const body = useId()
  const recipe = client.recipe
  const deck = setup.zones.find((z) => z.id === setup.deckZone)
  const piles = setup.zones.filter((z) => z.kind === 'pile')
  const turns = setup.turns ?? null
  const players = recipe.players
  const summary = [
    players === 1 ? t('setup.game.players.one') : t('setup.game.players.other', { n: players }),
    t(turns === null ? 'setup.game.turns.none' : `setup.game.turns.${turns}`),
    t('setup.game.deck', { name: deck?.name ?? '' }),
  ]
  const head = (
    <button type="button" className="byd-setup-game" aria-expanded={open} aria-controls={open ? body : undefined} onClick={() => setOpen((was) => !was)}>
      <span className="byd-setup-caret" aria-hidden="true">
        <ChevronGlyph to="right" />
      </span>
      <span className={open ? undefined : 'byd-offscreen'}>{t('setup.game')}</span>
      {!open &&
        summary.map((part, i) => (
          <span key={i} className="byd-setup-game-part">
            {i > 0 && <i aria-hidden="true">·</i>}
            {part}
          </span>
        ))}
    </button>
  )
  if (!open) return head
  return (
    <aside className="byd-setup-recipe byd-setup-game-open" id={body}>
      <div className="byd-help-row">
        {head}
        <Help topic={t('setup.game.help.topic')}>
          <p>{t('setup.game.help')}</p>
        </Help>
      </div>
      <section>
        <div className="byd-help-row">
          <h2 id="byd-setup-players">{t('setup.players')}</h2>
          <Help topic={t('setup.seats.help.topic')}>
            <p>{t('setup.seats.help')}</p>
          </Help>
        </div>
        <div className="byd-setup-players" role="group" aria-labelledby="byd-setup-players">
          {/* Every seat count the table can hold, as the guided start's stepper (#620). */}
          <Stepper value={players} min={1} max={MAX_PLAYERS} onChange={(n) => client.setRecipe({ ...recipe, players: n }, recipeWords(t))} label={t('players.count', { min: 1, max: MAX_PLAYERS })} fewer={t('players.fewer')} more={t('players.more')} readOnly={!client.mayEdit} />
        </div>
      </section>
      {/* Whether the game goes in turns (K30): one of three, each a version and a step back. */}
      <section className="byd-setup-turns-panel">
        <div className="byd-help-row">
          <h2 id="byd-setup-turns">{t('setup.turns')}</h2>
          <Help topic={t('setup.turns.help.topic')}>
            <p>{t('setup.turns.help')}</p>
          </Help>
        </div>
        <div className="byd-setup-turns" role="group" aria-labelledby="byd-setup-turns">
          {([null, 'clockwise', 'counterclockwise'] as const).map((choice) => (
            <button key={choice ?? 'none'} type="button" className="byd-choice" aria-pressed={turns === choice} disabled={!client.mayEdit} onClick={() => turns !== choice && client.setTurns(choice)}>
              {t(choice === null ? 'setup.turns.none' : `setup.turns.${choice}`)}
            </button>
          ))}
        </div>
      </section>
      {/* The deck is a role a pile carries (B5, K10): the cards are dealt from wherever it is, and
          the hands return there. A designer may lay it in any pile, and moving it is also the only
          way to be rid of the pile the wizard laid it in. */}
      <section>
        <label>
          <h2>{t('setup.deck.from')}</h2>
          <select aria-label={t('setup.deck.from')} value={setup.deckZone} disabled={!client.mayEdit} onChange={(e) => e.target.value !== setup.deckZone && client.setDeck(e.target.value)}>
            {piles.map((z) => (
              <option key={z.id} value={z.id}>
                {z.owner !== undefined ? `${z.name} · ${z.owner}` : z.name}
              </option>
            ))}
          </select>
        </label>
        <p className="byd-setup-hint">{t('setup.deck.from.hint')}</p>
      </section>
    </aside>
  )
}
