// Atlas layout (design/views/generators/atlas.py, design/views/README.md). Pure and deterministic. Each
// Tree is an island and each leaf a peak as high as its words (1 word = 1 m). Islands are
// placed by packing: each Tree's leaves are packed into an island, then the islands are
// packed apart from each other. Each island has its own elevation field on a grid: for
// every leaf a Gaussian bump (height = words, σ = 11 + 0.5·√words) plus a lower, wider
// base (300, 1.55σ) that joins its peaks into one landmass, plus smoothed noise near land
// for a ragged coast; lakes are filled. Then the coast is the contour at 150, contour
// lines every 500 words (every 1,000 heavier), filled bands for the height tints, short
// hachures hanging downhill (darker away from the light, north-west), and water lines at
// fixed distances from the coast. Threads are sea routes.

import { contours } from 'd3-contour'
import { packEnclose, packSiblings } from 'd3-hierarchy'
import { treesOf } from '../../map/family'
import type { Box } from '../../map/layout'
import { textWidth } from '../../map/layout'
import type { Graph, GraphNode } from '../../model/graph'
import { ROOT } from '../../model/tree'

export const SEA = 150
const STEP = 500
const WATER = [5, 10, 16, 23, 31]

export interface Peak {
  id: string
  x: number
  y: number
  words: number
  island: string
  /** A leaf directly in its Tree (or a branch), drawn larger than a sub-leaf. */
  big: boolean
  label: { x: number; y: number; anchor: 'start' | 'end' | 'middle'; size: number; text: string }
}

export interface Island {
  id: string
  /** Filled bands, lowest first: the coast's land, then each level. */
  bands: { d: string; tint: number }[]
  /** Contour lines above the coast; `index` every 1,000. */
  lines: { d: string; index: boolean }[]
  coast: string
  water: { d: string; opacity: number }[]
  /** Hachures, in four groups by how dark they are. */
  hachures: { d: string; opacity: number }[]
  name: { x: number; y: number; size: number; text: string; sub: string }
  peaks: string[]
  total: number
}

export interface AtlasLayout {
  islands: Island[]
  peaks: Peak[]
  byId: Map<string, Peak>
  routes: { from: string; to: string; d: string; sea: boolean }[]
  /** The highest level drawn, for the legend's ramp. */
  top: number
  levels: number
  frame: Box
  graticule: { x: number[]; y: number[] }
  rose: { x: number; y: number }
  bounds: Box
}

const sigma = (w: number) => 11 + Math.sqrt(w) * 0.5
const f = (v: number) => Math.round(v * 10) / 10

/** Smooth value noise in [-1, 1]: a hashed random lattice every `cell` px, blended. */
function valueNoise(seed: number, cell: number) {
  const at = (i: number, j: number) => {
    let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 1442695041)) | 0
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    h ^= h >>> 16
    return ((h >>> 0) / 4294967296) * 2 - 1
  }
  const fade = (t: number) => t * t * (3 - 2 * t)
  return (x: number, y: number) => {
    const gx = x / cell
    const gy = y / cell
    const i = Math.floor(gx)
    const j = Math.floor(gy)
    const u = fade(gx - i)
    const v = fade(gy - j)
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * u
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * u
    return a + (b - a) * v
  }
}

/** Distance (px) from every cell to the nearest land cell: a two-pass chamfer transform. */
function distanceFromLand(land: Uint8Array, w: number, h: number, cell: number): Float32Array {
  const d = new Float32Array(w * h).fill(1e9)
  for (let i = 0; i < w * h; i++) if (land[i]) d[i] = 0
  const D = cell
  const DD = cell * Math.SQRT2
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (x > 0) d[i] = Math.min(d[i]!, d[i - 1]! + D)
      if (y > 0) {
        d[i] = Math.min(d[i]!, d[i - w]! + D)
        if (x > 0) d[i] = Math.min(d[i]!, d[i - w - 1]! + DD)
        if (x < w - 1) d[i] = Math.min(d[i]!, d[i - w + 1]! + DD)
      }
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x
      if (x < w - 1) d[i] = Math.min(d[i]!, d[i + 1]! + D)
      if (y < h - 1) {
        d[i] = Math.min(d[i]!, d[i + w]! + D)
        if (x < w - 1) d[i] = Math.min(d[i]!, d[i + w + 1]! + DD)
        if (x > 0) d[i] = Math.min(d[i]!, d[i + w - 1]! + DD)
      }
    }
  return d
}

export function layoutAtlas(graph: Graph): AtlasLayout {
  const leaves = [...graph.nodes.values()].filter((n) => n.kind === 'leaf')
  const treeOf = (n: GraphNode) => {
    let t = n
    while (t.parent !== ROOT && t.parent !== null) t = graph.nodes.get(t.parent)!
    return t.id
  }
  const groups = treesOf(graph)
    .map((id) => ({ id, leaves: leaves.filter((l) => treeOf(l) === id) }))
    .filter((g) => g.leaves.length)

  // Each island: its leaves packed, the largest first, far enough apart to be peaks.
  const local = new Map<string, { x: number; y: number }>()
  const islands = groups.map((g) => {
    const circles = [...g.leaves]
      .sort((a, b) => b.words - a.words)
      .map((l) => ({ id: l.id, x: 0, y: 0, r: Math.max(26, sigma(l.words) * 1.35) }))
    packSiblings(circles)
    const e = packEnclose(circles)!
    for (const c of circles) local.set(c.id, { x: c.x - e.x, y: c.y - e.y })
    return { id: g.id, leaves: g.leaves, x: 0, y: 0, r: e.r + 70 }
  })
  // Then the islands apart from each other, with open sea between.
  packSiblings(islands)

  // The grid is finer for a small Family, coarser for a large one.
  const area = islands.reduce((s, i) => s + (2 * i.r) ** 2, 0)
  const cell = Math.max(2, Math.ceil(Math.sqrt(area / 110_000)))

  const peaks: Peak[] = []
  const coarse = valueNoise(5, 28)
  const medium = valueNoise(7, 16)
  const fine = valueNoise(9, 8)
  let top = SEA
  const built: Island[] = []
  const landAt: { x0: number; y0: number; w: number; h: number; land: Uint8Array }[] = []

  for (const island of islands) {
    const members = island.leaves.map((l) => {
      const p = local.get(l.id)!
      return { n: l, x: island.x + p.x, y: island.y + p.y }
    })
    const x0 = island.x - island.r
    const y0 = island.y - island.r
    const w = Math.ceil((2 * island.r) / cell)
    const h = w
    const field = new Float32Array(w * h)
    for (const m of members) {
      const s = sigma(m.n.words)
      const reach = s * 1.55 * 3.2
      const i0 = Math.max(0, Math.floor((m.x - reach - x0) / cell))
      const i1 = Math.min(w - 1, Math.ceil((m.x + reach - x0) / cell))
      const j0 = Math.max(0, Math.floor((m.y - reach - y0) / cell))
      const j1 = Math.min(h - 1, Math.ceil((m.y + reach - y0) / cell))
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const dx = x0 + (i + 0.5) * cell - m.x
          const dy = y0 + (j + 0.5) * cell - m.y
          const d2 = dx * dx + dy * dy
          field[j * w + i]! +=
            m.n.words * Math.exp(-d2 / (2 * s * s)) + 300 * Math.exp(-d2 / (2 * (s * 1.55) ** 2))
        }
    }
    // A ragged coast: noise where there is land, none out at sea; the window's edge is sea.
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const k = j * w + i
        const px = x0 + (i + 0.5) * cell
        const py = y0 + (j + 0.5) * cell
        const hint = Math.min(1, Math.max(0, field[k]! / 220))
        field[k]! += (coarse(px, py) * 130 + medium(px, py) * 90 + fine(px, py) * 40) * hint
        if (i < 2 || j < 2 || i >= w - 2 || j >= h - 2) field[k] = 0
      }
    // No lakes: sea not reached from the window's edge becomes lowland.
    const reached = new Uint8Array(w * h)
    const stack: number[] = []
    for (let i = 0; i < w; i++) stack.push(i, (h - 1) * w + i)
    for (let j = 0; j < h; j++) stack.push(j * w, j * w + w - 1)
    while (stack.length) {
      const k = stack.pop()!
      if (reached[k] || field[k]! >= SEA) continue
      reached[k] = 1
      const i = k % w
      const j = (k - i) / w
      if (i > 0) stack.push(k - 1)
      if (i < w - 1) stack.push(k + 1)
      if (j > 0) stack.push(k - w)
      if (j < h - 1) stack.push(k + w)
    }
    let peak = 0
    const land = new Uint8Array(w * h)
    for (let k = 0; k < w * h; k++) {
      if (!reached[k] && field[k]! < SEA) field[k] = SEA + 20
      if (field[k]! >= SEA) land[k] = 1
      peak = Math.max(peak, field[k]!)
    }
    top = Math.max(top, peak)
    landAt.push({ x0, y0, w, h, land })

    // `holes` keeps only a polygon's inner rings: a water line's outer ring is the window.
    const toPath = (multi: { coordinates: number[][][][] }, holes = false) => {
      let d = ''
      for (const polygon of multi.coordinates)
        for (const [r, ring] of polygon.entries()) {
          if (ring.length < 4 || (holes && r === 0)) continue
          d += `M${ring.map(([x, y]) => `${f(x0 + x! * cell)},${f(y0 + y! * cell)}`).join(' L')}Z`
        }
      return d
    }
    const levels = [SEA]
    for (let l = STEP; l < peak; l += STEP) levels.push(l)
    const shapes = contours().size([w, h]).thresholds(levels)(Array.from(field))
    const paths = shapes.map((c) => toPath(c))
    const bands = paths.map((d, i) => ({ d, tint: Math.round(7 + i * 5.5) }))
    const lines = paths.slice(1).map((d, i) => ({ d, index: levels[i + 1]! % 1000 === 0 }))

    // Water lines: distances from the coast, fading out to sea.
    const dist = distanceFromLand(land, w, h, cell)
    const water = contours()
      .size([w, h])
      .thresholds(WATER)(Array.from(dist))
      .map((c, i) => ({ d: toPath(c, true), opacity: Math.round((0.34 - i * 0.055) * 100) / 100 }))

    // Hachures: short strokes hanging downhill from each contour, darker away from the light.
    const value = (i: number, j: number) =>
      field[Math.min(h - 1, Math.max(0, j)) * w + Math.min(w - 1, Math.max(0, i))]!
    const buckets: string[][] = [[], [], [], []]
    let strokes = 0
    for (const [li, shape] of shapes.entries())
      for (const polygon of shape.coordinates)
        for (const ring of polygon) {
          for (let p = 0; p < ring.length - 1; p += Math.max(1, Math.round(3.6 / cell))) {
            if (strokes > 9000) break
            const [gx, gy] = ring[p]!
            const i = Math.round(gx!)
            const j = Math.round(gy!)
            const sx = (value(i + 1, j) - value(i - 1, j)) / (2 * cell)
            const sy = (value(i, j + 1) - value(i, j - 1)) / (2 * cell)
            const slope = Math.hypot(sx, sy)
            if (slope < 4) continue
            const ux = -sx / slope
            const uy = -sy / slope
            const shade = 0.5 + 0.5 * (ux * 0.6 + uy * 0.8)
            const coast = li === 0
            if (coast && shade < 0.72) continue
            const len = coast
              ? Math.min(4, Math.max(2, (300 / slope) * 0.4))
              : Math.min(11, Math.max(2.5, (500 / slope) * 0.55))
            const opacity = 0.05 + 0.5 * shade ** 1.6
            if (opacity < 0.09) continue
            const bucket = Math.min(3, Math.floor((opacity - 0.09) / 0.12))
            buckets[bucket]!.push(
              `M${f(x0 + gx! * cell)},${f(y0 + gy! * cell)}l${f(ux * len)},${f(uy * len)}`,
            )
            strokes++
          }
        }
    const hachures = buckets.map((b, i) => ({ d: b.join(''), opacity: 0.15 + i * 0.12 }))

    for (const m of members)
      peaks.push({
        id: m.n.id,
        x: f(m.x),
        y: f(m.y),
        words: m.n.words,
        island: island.id,
        big: m.n.parent === island.id || graph.nodes.get(m.n.parent ?? '')?.kind === 'branch',
        label: {
          x: 0,
          y: 0,
          anchor: 'start',
          size: 12,
          text: m.n.icon ? `${m.n.icon} ${m.n.title}` : m.n.title,
        },
      })
    const node = graph.nodes.get(island.id)!
    built.push({
      id: island.id,
      bands,
      lines,
      coast: paths[0] ?? '',
      water,
      hachures,
      name: { x: 0, y: 0, size: 15, text: node.title.toUpperCase(), sub: '' },
      peaks: members.map((m) => m.n.id),
      total: node.total,
    })
  }

  // Peak labels: beside the peak, the first spot that covers no other label or peak.
  type B = [number, number, number, number]
  const marks: B[] = peaks.map((p) => {
    const s = p.big ? 6 : 4.5
    return [p.x - s - 1, p.y - s - 1, p.x + s + 1, p.y + s + 1]
  })
  const placed: B[] = []
  const overlaps = (b: B, list: B[]) =>
    list.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])
  for (const p of [...peaks].sort((a, b) => b.words - a.words)) {
    const s = p.big ? 6 : 4.5
    const size = p.big ? 14 : 12
    const tw = Math.max(
      textWidth(p.label.text, size) * 0.93,
      textWidth(p.words.toLocaleString('en-US'), 9.5) * 1.05,
    )
    const hh = size + 12
    const options: [number, number, Peak['label']['anchor']][] = [
      [p.x + s + 5, p.y - 2, 'start'],
      [p.x - s - 5, p.y - 2, 'end'],
      [p.x, p.y - s - 16, 'middle'],
      [p.x, p.y + s + size + 2, 'middle'],
      [p.x + s + 5, p.y + 10, 'start'],
      [p.x - s - 5, p.y + 10, 'end'],
    ]
    const boxOf = ([tx, ty, anchor]: (typeof options)[number]): B => {
      const left = anchor === 'start' ? tx : anchor === 'end' ? tx - tw : tx - tw / 2
      return [left - 1, ty - size * 0.8, left + tw + 1, ty - size * 0.8 + hh]
    }
    const pick =
      options.find((o) => {
        const b = boxOf(o)
        return !overlaps(b, placed) && !overlaps(b, marks)
      }) ?? options[0]!
    placed.push(boxOf(pick))
    p.label = { ...p.label, x: f(pick[0]), y: f(pick[1]), anchor: pick[2], size }
  }

  // Island names in open sea beside each island: above, below, right or left.
  const nearLand = (b: B) =>
    landAt.some(({ x0, y0, w, h, land }) => {
      const i0 = Math.max(0, Math.floor((b[0] - 10 - x0) / cell))
      const i1 = Math.min(w - 1, Math.ceil((b[2] + 10 - x0) / cell))
      const j0 = Math.max(0, Math.floor((b[1] - 10 - y0) / cell))
      const j1 = Math.min(h - 1, Math.ceil((b[3] + 10 - y0) / cell))
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (land[j * w + i]) return true
      return false
    })
  const largest = Math.max(...built.map((i) => i.total))
  for (const [k, island] of built.entries()) {
    const geo = islands[k]!
    const mine = peaks.filter((p) => p.island === island.id)
    const size = island.total === largest ? 21 : 15
    const sub = `${island.total >= 1000 ? `${(island.total / 1000).toFixed(1)}k` : island.total} words · ${mine.length} peak${mine.length === 1 ? '' : 's'}`
    const tw = island.name.text.length * size * 0.94 + 4
    const bw = Math.max(tw, sub.length * 6.4)
    const lx0 = Math.min(...mine.map((p) => p.x)) - 50
    const lx1 = Math.max(...mine.map((p) => p.x)) + 50
    const ly0 = Math.min(...mine.map((p) => p.y)) - 50
    const ly1 = Math.max(...mine.map((p) => p.y)) + 50
    const mx = (lx0 + lx1) / 2
    const candidates: [number, number][] = []
    for (let off = 0; off < 110; off += 6)
      for (const dx of [0, -40, 40, -80, 80])
        candidates.push([mx + dx, ly0 - 22 - off], [mx + dx, ly1 + 24 + off])
    for (let off = 0; off < 110; off += 6)
      for (const dy of [0, -40, 40]) {
        candidates.push([lx1 + 14 + bw / 2 + off, (ly0 + ly1) / 2 + dy])
        candidates.push([lx0 - 14 - bw / 2 - off, (ly0 + ly1) / 2 + dy])
      }
    const boxAt = ([nx, ny]: [number, number]): B => [
      nx - bw / 2 - 4,
      ny - size * 0.85,
      nx + bw / 2 + 4,
      ny + 20,
    ]
    const spot = candidates.find((c) => !nearLand(boxAt(c)) && !overlaps(boxAt(c), placed)) ?? [
      mx,
      geo.y - geo.r + 10,
    ]
    placed.push(boxAt(spot as [number, number]))
    island.name = { x: f(spot[0]), y: f(spot[1]), size, text: island.name.text, sub }
  }

  const byId = new Map(peaks.map((p) => [p.id, p]))
  const routes = graph.threads
    .filter((t) => byId.has(t.from) && byId.has(t.to))
    .map((t) => {
      const a = byId.get(t.from)!
      const b = byId.get(t.to)!
      const sea = a.island !== b.island
      const bend = sea ? 0.18 : 0.1
      const qx = (a.x + b.x) / 2 - (b.y - a.y) * bend
      const qy = (a.y + b.y) / 2 + (b.x - a.x) * bend
      return { from: t.from, to: t.to, d: `M${a.x},${a.y} Q${f(qx)},${f(qy)} ${b.x},${b.y}`, sea }
    })

  // The chart's frame, with room for the cartouche and the compass rose.
  let fx0 = Infinity
  let fy0 = Infinity
  let fx1 = -Infinity
  let fy1 = -Infinity
  for (const i of islands) {
    fx0 = Math.min(fx0, i.x - i.r)
    fy0 = Math.min(fy0, i.y - i.r)
    fx1 = Math.max(fx1, i.x + i.r)
    fy1 = Math.max(fy1, i.y + i.r)
  }
  for (const b of placed) {
    fx0 = Math.min(fx0, b[0] - 20)
    fy0 = Math.min(fy0, b[1] - 20)
    fx1 = Math.max(fx1, b[2] + 20)
    fy1 = Math.max(fy1, b[3] + 20)
  }
  if (!islands.length) [fx0, fy0, fx1, fy1] = [-300, -200, 300, 200]
  fx0 -= 40
  fy0 -= 150
  fx1 += 140
  fy1 += 40
  const frame = { x0: f(fx0), y0: f(fy0), x1: f(fx1), y1: f(fy1) }
  const graticule = { x: [] as number[], y: [] as number[] }
  for (let x = Math.ceil(fx0 / 180) * 180; x < fx1; x += 180) graticule.x.push(x)
  for (let y = Math.ceil(fy0 / 180) * 180; y < fy1; y += 180) graticule.y.push(y)
  const levels = Math.max(2, Math.ceil((top - SEA) / STEP) + 1)
  return {
    islands: built,
    peaks,
    byId,
    routes,
    top,
    levels,
    frame,
    graticule,
    rose: { x: f(fx1 - 90), y: f(fy0 + 90) },
    bounds: { x0: frame.x0 - 10, y0: frame.y0 - 10, x1: frame.x1 + 10, y1: frame.y1 + 10 },
  }
}
