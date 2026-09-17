// What a file picker has to be, wherever one stands in the tool (#193).
//
// A native file control is a button and a filename drawn by the platform, so every one of these is
// dressed as a label — and the tool used to do that dressing by stretching the real input
// transparently across the label it was hiding behind. That shape puts the one thing the eye can
// never find in the exact place the pointer always lands, which is how a transparent `{ }` button
// came to swallow clicks meant for the cell under it (#140) and how four pickers came to be
// invisible controls lying over the editor and the wizard. The sanctioned shape is the other way
// round: the input stands off the screen, still focusable and still announced, and the label is
// the only thing that is both drawn and hit.
//
// So the questions are the ones a designer would ask of the control in front of her. Is it called
// anything. Does the thing under my pointer turn out to be the label I am pointing at. Does the
// keyboard reach it, and does something light up when it does. Is it as big as a thumb.
//
// This runs inside the page, handed straight to `$$eval`, so it closes over nothing in this file
// and reads no number out of it: a ring is asked to exist, not to be three pixels, and a target is
// held to the 44 the whole audit is written around. What comes back is one complaint per picker
// that is wrong and nothing at all for one that is right.
export const filePickerFaults = (els: Element[]): { pickers: number; faults: string[] } => {
  // Laid out, whether or not it is painted. Asking about opacity here instead would drop the very
  // control this is looking for and report a picker that had vanished rather than one that is
  // wrong — so transparency is a fault below, and never a way out of the count.
  const seen = els.filter((el) => el.checkVisibility())
  return {
    // Counted as well as read: a surface that drew no picker would otherwise report a clean room,
    // which is the shape of guard this repo keeps finding it needs.
    pickers: seen.length,
    faults: seen.flatMap((el) => {
      const input = el as HTMLInputElement
      const label = input.closest('label')
      // Brought into view first: `elementFromPoint` answers about the window and nothing else, so
      // a picker below the fold — which the card step is, at a phone's width in an 800 px page —
      // would be read as a control that hands its pointer to nobody rather than as one that is
      // simply further down.
      ;(label ?? input).scrollIntoView({ block: 'center' })
      const box = (label ?? input).getBoundingClientRect()
      const name = (input.getAttribute('aria-label') ?? label?.textContent ?? '').trim()
      const under = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
      // Asked of the input's own box as well, which is the whole of the bug in one reading: a
      // control the eye cannot find must not be the thing a click lands on anywhere, not merely
      // not in the middle of the label. Off the screen it is clipped out of the hit test
      // altogether and this point answers the label behind it.
      const ownBox = input.getBoundingClientRect()
      const onItself = document.elementFromPoint(ownBox.left + ownBox.width / 2, ownBox.top + ownBox.height / 2) === input
      input.focus()
      const reached = document.activeElement === input
      // The ring is the label's, because the focus belongs to an input the eye cannot follow.
      const ring = label === null ? 0 : parseFloat(getComputedStyle(label).outlineWidth)
      const lit = label !== null && getComputedStyle(label).outlineStyle !== 'none' && ring > 0
      input.blur()
      const wrong: string[] = []
      if (!input.checkVisibility({ opacityProperty: true, visibilityProperty: true })) wrong.push('is a transparent layer over its label')
      if (label === null) wrong.push('stands in no label')
      if (name === '') wrong.push('is called nothing')
      if (under === input || onItself) wrong.push('takes the pointer itself')
      else if (label === null || under === null || !label.contains(under)) wrong.push('does not hand the pointer to its label')
      if (!reached) wrong.push('cannot take focus')
      if (!lit) wrong.push('lights nothing when it takes focus')
      if (box.width < 44 || box.height < 44) wrong.push(`is ${Math.round(box.width)}×${Math.round(box.height)}`)
      return wrong.map((fault) => `${name.slice(0, 24) || input.tagName} ${fault}`)
    }),
  }
}
