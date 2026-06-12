// Playback engine: walks the selected trip's concatenated main-route legs by
// distance fraction t ∈ [0,1], returning the marker position and the partial
// line drawn so far. Pure math (no turf) — runs per animation frame.

export interface PlaybackPath {
  /** flat list of [lon, lat] along the whole main route, in leg order */
  coords: [number, number][]
  /** cumulative km at each coordinate */
  cum: number[]
  totalKm: number
  /** index ranges per leg, with mode, for styling the drawn portion */
  legRanges: { start: number; end: number; mode: string }[]
}

const R = 6371
function havKm(a: [number, number], b: [number, number]) {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLon = toRad(b[0] - a[0])
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

export function buildPath(fc: GeoJSON.FeatureCollection): PlaybackPath | null {
  const coords: [number, number][] = []
  const cum: number[] = []
  const legRanges: PlaybackPath['legRanges'] = []
  let total = 0
  const mainLegs = fc.features
    .filter((f) => f.properties?.kind === 'main' && f.geometry.type === 'LineString')
    .sort((a, b) => (a.properties?.seq ?? 0) - (b.properties?.seq ?? 0))
  for (const leg of mainLegs) {
    const line = (leg.geometry as GeoJSON.LineString).coordinates as [number, number][]
    const start = coords.length
    for (const c of line) {
      if (coords.length) total += havKm(coords[coords.length - 1], c)
      coords.push(c)
      cum.push(total)
    }
    legRanges.push({ start, end: coords.length - 1, mode: leg.properties?.mode ?? 'road' })
  }
  if (coords.length < 2) return null
  return { coords, cum, totalKm: total, legRanges }
}

export function pointAt(path: PlaybackPath, t: number): { pos: [number, number]; drawn: [number, number][] } {
  const target = Math.max(0, Math.min(1, t)) * path.totalKm
  // binary search cum for target
  let lo = 0
  let hi = path.cum.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (path.cum[mid] < target) lo = mid + 1
    else hi = mid
  }
  const i = Math.max(1, lo)
  const segLen = path.cum[i] - path.cum[i - 1] || 1e-9
  const f = (target - path.cum[i - 1]) / segLen
  const a = path.coords[i - 1]
  const b = path.coords[i]
  const pos: [number, number] = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]
  return { pos, drawn: [...path.coords.slice(0, i), pos] }
}
