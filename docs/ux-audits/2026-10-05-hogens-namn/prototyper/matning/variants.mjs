// The two forms the beställare chose to prototype for #789 (2026-10-05), as CSS injected into the
// real built app. Both are keyed on what #771 keyed the TV's caption on: the top card's state with
// a name in it. When the picture arrives the state is gone, and with it the name — in both forms,
// without any code knowing about it.
const T = ".byd-table-frame[data-mode='table']"
const HAS_NAME = '.byd-pile:has(> .byd-pile-top > .byd-texture-state > b)'

export const CSS = {
  nu: '',

  // C — #771's caption under the pile, on a plate of its own. It hangs from the handle (the pill
  // the pile is dragged by, K14), 2 px under it, so it turns with the pill on a quarter-turned felt
  // and stands wherever the pile's label stands. The plate is the felt's own plate colour
  // (--byd-felt-plate, the radial menu's and the action sheet's), opaque, so the ink's contrast is
  // the plate's and not whatever lies under it; the ink is the chalk the pill already writes in.
  // The card keeps only its ground, as on the TV.
  c: `
${T} .byd-pile-top > .byd-texture-state > b { display: none; }
${T} ${HAS_NAME} .byd-pile-caption {
  display: block; position: absolute; left: 50%; top: calc(100% + 2px); translate: -50% 0;
  max-width: 10em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; pointer-events: none;
  box-sizing: border-box; padding: 1px 8px; border-radius: 6px;
  background: var(--byd-felt-plate); color: var(--byd-felt-chalk);
  box-shadow: 0 0 0 1px var(--byd-felt-edge);
  font-size: 12px; line-height: 14px; font-weight: 600; letter-spacing: 0;
}
${T} .byd-pile:has(> .byd-pile-top > [data-texture='failed'] > b) .byd-pile-caption { color: #f4b9c7; }
`,

  // D — the name stays on the card, at the desk's floor (12 px, K26) instead of the clamp's 8, and
  // the state's own ellipsis cuts what does not fit. Nothing new on the felt.
  d: `
${T} .byd-pile-top > .byd-texture-state { padding: 6% 3px; }
${T} .byd-pile-top > .byd-texture-state > b { font-size: 12px; line-height: 14px; }
`,
}

// C's one rule CSS cannot say on its own: the caption hangs on the side of the handle away from
// the card. On a felt the viewer sees from the far side (seat B on /online, the felt turned half a
// turn) the handle stands above its card on screen, and «under the handle» would be on the card.
// The renderer knows the turn (`rotate` in TableRenderer.tsx); here it is read off the boxes.
export const JS = {
  c: `for (const cap of document.querySelectorAll('.byd-pile-caption')) {
    const pile = cap.closest('.byd-pile'), pill = cap.parentElement
    const a = pill.getBoundingClientRect(), k = pile.querySelector(':scope > .byd-pile-top').getBoundingClientRect()
    if (k.top + k.height / 2 > a.top + a.height / 2) { cap.style.top = 'auto'; cap.style.bottom = 'calc(100% + 2px)' }
  }`,
}
