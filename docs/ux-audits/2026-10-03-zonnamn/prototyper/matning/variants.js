(() => {
  // Each variant is a whole rule: it is handed every zone name on the felt and places it, in the
  // reader's frame (felt px, turned the way the reader sees it). What it does not touch stays
  // where K19 puts it today.
  const info = (ctx, l) => {
    const Z = ctx.zoneR(l.z)
    const P = ctx.nowAt(l)
    const w = l.el.offsetWidth, h = l.el.offsetHeight
    const side = P.y + h <= Z.t + 1 ? 'above' : P.y >= Z.b - 1 ? 'below' : P.x + w <= Z.l + 1 ? 'left' : P.x >= Z.r - 1 ? 'right' : 'on'
    return { Z, P, w, h, side, rim: l.z.dataset.rim, grow: l.z.dataset.grow, area: l.z.dataset.area || '' }
  }
  const sideRim = (i) => i.rim === 'E' || i.rim === 'W'
  const RIM = 1
  const below = (ctx, l, i) => ctx.putAt(l, { x: i.P.x, y: i.Z.b + RIM })
  const above = (ctx, l, i, gap = RIM) => ctx.putAt(l, { x: i.P.x, y: i.Z.t - gap - i.h })
  const inside = (ctx, l, i, edge) => {
    const room = i.Z.r - i.Z.l - 12
    if (i.w > room) {
      l.el.style.maxWidth = `${Math.max(0, room)}px`
      l.el.style.overflow = 'hidden'
      l.el.style.textOverflow = 'ellipsis'
    }
    const w = Math.min(i.w, room)
    const x = Math.max(i.Z.l + 6, Math.min(i.P.x, i.Z.r - 6 - w))
    ctx.putAt(l, { x, y: edge === 'below' ? i.Z.b - 3 - i.h : i.Z.t + 3 })
  }
  const besideRim = (ctx, l, i) => {
    const x = i.rim === 'E' ? i.Z.l - 3 - i.w : i.Z.r + 3
    const y = i.grow === 'back' ? i.Z.b - i.h : i.Z.t
    ctx.putAt(l, { x, y })
  }
  const legend = (ctx, l, i, edge) => {
    l.el.style.background = ctx.frame?.dataset.mode === 'table' ? '#24613f' : '#161a22'
    l.el.style.padding = '0 4px'
    l.el.style.borderRadius = '4px'
    const w = l.el.offsetWidth, h = l.el.offsetHeight
    let x = i.P.x
    x = Math.max(i.Z.l + 8, Math.min(x, i.Z.r - 8 - w))
    ctx.putAt(l, { x, y: (edge === 'below' ? i.Z.b : i.Z.t) - h / 2 })
  }

  globalThis.PROTO_685_VARIANTS = {
    nu: () => undefined,

    // A — candidate 1: on the narrow felt an east or west name stands *below* its own zone,
    // still anchored at the rim end and growing inward. Nothing else moves.
    under: (ctx) => {
      if (!ctx.tight) return
      for (const l of ctx.labels) {
        const i = info(ctx, l)
        if (sideRim(i)) below(ctx, l, i)
      }
    },

    // B — candidate 2: on the narrow felt an east or west name stands *beside* its zone toward the
    // middle again, as before #76 (12 px type is kept).
    bredvid: (ctx) => {
      if (!ctx.tight) return
      for (const l of ctx.labels) {
        const i = info(ctx, l)
        if (sideRim(i)) besideRim(ctx, l, i)
      }
    },

    // C — candidate 3: a zone that only holds chips (Räknare) says its name inside its own box,
    // at the top, cut with an ellipsis if it does not fit. Every other name stays.
    inuti: (ctx) => {
      for (const l of ctx.labels) {
        const i = info(ctx, l)
        if (i.area.startsWith('counters:')) inside(ctx, l, i, 'above')
      }
    },

    // E — candidate 5, «fri sida»: the side K19 picks; if the name lands on another zone's box, a
    // badge, a hand, a pile or another name, it is lifted further out on the same side until it
    // clears every box it crosses; failing that, the other side of its own zone (lifted the same
    // way); failing that, inside its own box. The first that is free wins.
    fri: (ctx) => {
      const zonesR = () => [...ctx.felt.querySelectorAll(':scope > .byd-zone')].map((z) => ctx.zoneR(z))
      const lift = (i, T, side) => {
        let y = T.y, x = T.x
        for (let k = 0; k < 4; k++) {
          for (const R of zonesR()) {
            const across = side === 'above' || side === 'below' ? x < R.r && R.l < x + i.w : y < R.b && R.t < y + i.h
            if (!across) continue
            if (side === 'above' && y + i.h > R.t - 1 && y < R.b) y = R.t - 2 - i.h
            if (side === 'below' && y < R.b + 1 && y + i.h > R.t) y = R.b + 2
            if (side === 'left' && x + i.w > R.l - 1 && x < R.r) x = R.l - 3 - i.w
            if (side === 'right' && x < R.r + 1 && x + i.w > R.l) x = R.r + 3
          }
        }
        // Never past another box: a name lifted more than a line further out than it started has
        // left its own zone and reads as its neighbour's.
        if (Math.abs(y - T.y) > i.h || Math.abs(x - T.x) > i.h) return T
        return { x, y }
      }
      for (const l of ctx.labels) {
        if (!ctx.screenHitsAny(l)) continue
        const i = info(ctx, l)
        const opp = { above: 'below', below: 'above', left: 'right', right: 'left', on: 'below' }[i.side]
        const oppAt = opp === 'below' ? { x: i.P.x, y: i.Z.b + 6 } : opp === 'above' ? { x: i.P.x, y: i.Z.t - 6 - i.h } : opp === 'left' ? { x: i.Z.l - 3 - i.w, y: i.P.y } : { x: i.Z.r + 3, y: i.P.y }
        const tries = [lift(i, i.P, i.side), oppAt, lift(i, oppAt, opp)]
        // A name standing beside its zone may also go to either end of it — above or below,
        // anchored at the rim end and growing inward, which is #76's placement.
        if (i.side === 'left' || i.side === 'right') {
          const x = i.rim === 'E' ? i.Z.r - 14 - i.w : i.Z.l + 14
          const up = { x, y: i.Z.t - 2 - i.h }, down = { x, y: i.Z.b + 2 }
          tries.push(up, lift(i, up, 'above'), down, lift(i, down, 'below'))
        }
        let done = false
        for (const T of tries) {
          ctx.putAt(l, T)
          if (!ctx.screenHitsAny(l)) { done = true; break }
        }
        if (!done) inside(ctx, l, i, i.side === 'below' ? 'below' : 'above')
      }
    },

    // G — B and E together, «bredvid, sedan fri sida»: the narrow felt drops #76's exception, so
    // every east or west name stands beside its zone toward the middle as on every other felt;
    // then any name that still lands on another zone, a badge, a hand or a name is lifted or
    // flipped as in E.
    kombi: (ctx) => {
      globalThis.PROTO_685_VARIANTS.bredvid(ctx)
      globalThis.PROTO_685_VARIANTS.fri(ctx)
    },

    // A2 — candidate 1 made whole, «ytterändarna»: on the narrow felt an east or west seat's
    // names stand at the two outer ends of its own column — the zone nearer the column's start
    // says its name above itself, the one nearer the end below itself — so neither stands in the
    // 10 mm between the two. Anchored at the rim end and growing inward, as today.
    ytter: (ctx) => {
      if (!ctx.tight) return
      const all = ctx.labels.map((l) => ({ l, i: info(ctx, l) }))
      for (const { l, i } of all) {
        if (!sideRim(i)) continue
        const seat = i.area.split(':')[1]
        const mine = all.filter((o) => o.i.area.split(':')[1] === seat)
        const top = Math.min(...mine.map((o) => o.i.Z.t)), bot = Math.max(...mine.map((o) => o.i.Z.b))
        if ((i.Z.t + i.Z.b) / 2 > (top + bot) / 2) below(ctx, l, i)
      }
    },

    // F — something else: the name sits *on* its own border, centred on the line, on a plate the
    // felt's colour, like a fieldset's legend. Above-side names on the top border, below-side
    // names (north rim) on the bottom border; east/west on the top border.
    kant: (ctx) => {
      for (const l of ctx.labels) {
        const i = info(ctx, l)
        legend(ctx, l, i, i.side === 'below' ? 'below' : 'above')
      }
    },
  }
})()
