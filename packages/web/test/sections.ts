// Every section of the property panel open from the start (#478). The panel folds, and what a
// test of one control is about is that control — not whether its section happened to be open —
// so a file about the controls opens all of them, the way a designer who works in them would.
export function openAllSections(): void {
  localStorage.setItem('byd.props-open', JSON.stringify(['layout', 'content', 'text', 'picture', 'shape', 'fill', 'line', 'effects']))
}
