import type { PlaybackPath } from './playback'

export interface MomentImage {
  src: string
  w: number
  h: number
  caption: string
  type: string
}

export interface Moment {
  seq: number
  place_id: string
  lon: number
  lat: number
  place: string
  date: string | null
  role: string
  quote: string | null
  images: MomentImage[]
}

export interface TripMoments {
  trip_id: string
  epigraph: { quote: string } | null
  moments: Moment[]
}

/** A moment with its position `t` (0–1) along the playback path. */
export interface MomentAtT extends Moment {
  t: number
}

const cache = new Map<string, TripMoments>()
export async function loadMoments(tripId: string): Promise<TripMoments | null> {
  const hit = cache.get(tripId)
  if (hit) return hit
  try {
    const res = await fetch(`data/moments/${tripId}.json`)
    if (!res.ok) return null
    const tm = (await res.json()) as TripMoments
    cache.set(tripId, tm)
    return tm
  } catch {
    return null
  }
}

/** Project a lon/lat onto the path, returning the t (0–1) of the nearest vertex. */
export function projectToT(path: PlaybackPath, lon: number, lat: number): number {
  let bestI = 0
  let bestD = Infinity
  for (let i = 0; i < path.coords.length; i++) {
    const dx = path.coords[i][0] - lon
    const dy = path.coords[i][1] - lat
    const d = dx * dx + dy * dy
    if (d < bestD) {
      bestD = d
      bestI = i
    }
  }
  return path.totalKm > 0 ? path.cum[bestI] / path.totalKm : 0
}

/**
 * Attach t to each moment and thin out moments that land too close together
 * (keeps the one with imagery, else the earlier). Returns sorted by t.
 */
export function placeMoments(path: PlaybackPath, moments: Moment[], minGap = 0.035): MomentAtT[] {
  const withT = moments
    .map((m) => ({ ...m, t: projectToT(path, m.lon, m.lat) }))
    .sort((a, b) => a.t - b.t)
  const kept: MomentAtT[] = []
  for (const m of withT) {
    const prev = kept[kept.length - 1]
    if (prev && m.t - prev.t < minGap) {
      // collision: prefer the one with images
      const prevScore = prev.images.length
      const curScore = m.images.length
      if (curScore > prevScore) kept[kept.length - 1] = m
      continue
    }
    kept.push(m)
  }
  return kept
}

/** Index of the active moment for a given playback t (greatest t ≤ playback t). */
export function activeMomentIndex(moments: MomentAtT[], t: number): number {
  let idx = -1
  for (let i = 0; i < moments.length; i++) {
    if (moments[i].t <= t + 1e-4) idx = i
    else break
  }
  return idx
}
