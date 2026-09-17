import { RULE_COLUMN_MM, type RenderedBlock } from '@byd/template'

// A picture in the rulebook (B7, #173), drawn the same way on every surface it is read on.
//
// The size is not worked out here and never twice: `renderRules` measured the figure in
// millimetres against the booklet's column, and all a surface does is scale those millimetres by
// its own column. That scaling is one line of CSS — the millimetres and the column both arrive as
// custom properties, so the column is never written into a stylesheet as a number somebody would
// have to keep in step with the page it came from.
//
// The aspect ratio is the file's own, so the picture that narrowed to fit the page's height is
// still the whole picture: a cropped setup picture is a setup picture that lies.
export type RuleImageBlock = Extract<RenderedBlock, { kind: 'image' }>

// `found` is the editor's alone: the column beside the book can go to a picture that carries no alt
// text, and the mark has to sit on the figure it went to rather than on a box drawn around it.
export function RuleFigure({ block, src, found }: { block: RuleImageBlock; src: string; found?: boolean | undefined }) {
  return (
    <figure
      className="byd-rules-figure"
      data-fit={block.fit}
      {...(found ? { 'data-found': 'true' } : {})}
      style={{ '--byd-rule-image-w': block.mm.w, '--byd-rule-image-h': block.mm.h, '--byd-rule-column': RULE_COLUMN_MM } as React.CSSProperties}
    >
      {/* An empty alt is HTML's own word for decorative, and `aria-hidden` is what keeps a picture
          that stands for nothing out of the reading order as well as out of the name. Both are
          written out rather than left off: an `img` with neither is announced by its file name,
          which here is the hash of its bytes. */}
      <img src={src} alt={block.alt} {...(block.alt === '' ? { 'aria-hidden': true } : {})} />
      {/* The caption is the designer's own line and is read beside the picture by somebody who can
          already see it; the alt text is written for whoever cannot, and they never swap places. */}
      {block.caption && <figcaption>{block.caption}</figcaption>}
    </figure>
  )
}
