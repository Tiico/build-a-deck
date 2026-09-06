// A stable colour per card until real textures exist: the same card always looks the same.
export function hue(cardRef: string): number {
  let h = 0
  for (const ch of cardRef) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}
