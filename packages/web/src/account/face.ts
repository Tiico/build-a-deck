// A person's face where the others see who has a game (D3): a coloured circle with one letter.
// The colour comes from the address, so it stays the same face when the name is changed (#1254),
// and the letter from what she is called — her name, or the address when she has given none.
export function colourOf(seed: string): string {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 360
  return `hsl(${h} 55% 55%)`
}

// The first letter as a reader sees it, an emoji or a letter with its accent whole.
export function initialOf(name: string): string {
  const first = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(name)[Symbol.iterator]().next().value?.segment ?? ''
  return first.toLocaleUpperCase()
}
