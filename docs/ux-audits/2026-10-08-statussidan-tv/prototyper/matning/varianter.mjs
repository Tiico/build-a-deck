// Varianterna till #925, som CSS som läggs ovanpå det byggda appens egen: D5:s sidform
// (`.byd-status[data-surface='page']`) och skalet (`#byd-shell`, #749) får samma mått, så att
// övertagandet fortfarande byter ord och inte bild. `data-yta` säger TV:n eller bordsläget och
// `data-v` varianten; båda sätts på <html> av shoot.mjs.

const PAGE = ":is(.byd-status[data-surface='page'], #byd-shell)"

// Ett mått per ord på sidan. `vh` och px blandas fritt; varje tal är det CSS säger.
export const VARIANTS = {
  nu: { name: 'Nu', tv: null, table: null },
  a: {
    name: 'A · Golvet',
    tv: { mark: '24px', h: '36px', text: '24px', btn: '24px', btnH: '56px', spin: '30px', gap: '18px', pad: '48px', measure: '40ch' },
    table: null,
  },
  b: {
    name: 'B · Rummets brödtext',
    tv: { mark: '24px', h: '48px', text: '32px', btn: '28px', btnH: '64px', spin: '40px', gap: '22px', pad: '64px', measure: '36ch' },
    table: { mark: '24px', h: '36px', text: '24px', btn: '24px', btnH: '56px', spin: '30px', gap: '18px', pad: '48px', measure: '40ch' },
  },
  c: {
    name: 'C · Skylten',
    tv: { mark: 'max(24px, 2.2vh)', h: '7vh', text: 'max(24px, 3.2vh)', btn: 'max(24px, 2.8vh)', btnH: 'max(56px, 6vh)', spin: '5vh', gap: '2vh', pad: '6vh', measure: '34ch' },
    table: { mark: 'max(24px, 2.2vh)', h: '7vh', text: 'max(24px, 3.2vh)', btn: 'max(24px, 2.8vh)', btnH: 'max(56px, 6vh)', spin: '5vh', gap: '2vh', pad: '6vh', measure: '34ch' },
  },
}

const rules = (scope, s) => `
${scope} ${PAGE} { font-size: ${s.text}; gap: ${s.gap}; padding: ${s.pad}; }
${scope} ${PAGE} :is(.byd-status-mark, .m) { font-size: ${s.mark}; letter-spacing: 0.08em; }
${scope} ${PAGE} h1 { font-size: ${s.h}; gap: 0.4em; }
${scope} ${PAGE} p { max-width: ${s.measure}; }
${scope} ${PAGE} :is(.byd-status-act, button) { font-size: ${s.btn}; min-height: ${s.btnH}; padding: 0 0.9em; border-radius: 12px; }
${scope} ${PAGE} .byd-status-acts { gap: 12px; padding-top: 6px; }
${scope} ${PAGE} :is(.byd-status-spin, .r) { width: ${s.spin}; height: ${s.spin}; border-width: calc(${s.spin} / 8); }
${scope} ${PAGE} .byd-status-countdown { gap: 0.4em; }
${scope} ${PAGE} .byd-status-countdown .byd-status-spin { width: 0.9em; height: 0.9em; border-width: 0.12em; }
`

export const css = () =>
  Object.entries(VARIANTS)
    .flatMap(([v, d]) => ['tv', 'table'].filter((y) => d[y]).map((y) => rules(`html[data-v='${v}'][data-yta='${y}']`, d[y])))
    .join('\n')
