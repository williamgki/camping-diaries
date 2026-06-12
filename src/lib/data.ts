import type { ArchiveData } from '../types'

const J = async <T>(path: string): Promise<T> => {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`${path}: ${res.status}`)
  return res.json()
}

export async function loadArchive(): Promise<ArchiveData> {
  const [trips, places, evidence, routes, excursions, sourcePages, reviewQueue, summary] =
    await Promise.all([
      J<ArchiveData['trips']>('data/trips.json'),
      J<ArchiveData['places']>('data/places.json'),
      J<ArchiveData['evidence']>('data/route_evidence.json'),
      J<ArchiveData['routes']>('data/routes.json'),
      J<ArchiveData['excursions']>('data/excursions.json'),
      J<ArchiveData['sourcePages']>('data/source_pages.json'),
      J<ArchiveData['reviewQueue']>('data/review_queue.json'),
      J<ArchiveData['summary']>('data/extraction_summary.json'),
    ])
  return { trips, places, evidence, routes, excursions, sourcePages, reviewQueue, summary }
}

const geometryCache = new Map<string, GeoJSON.FeatureCollection>()
export async function loadGeometry(tripId: string): Promise<GeoJSON.FeatureCollection> {
  const hit = geometryCache.get(tripId)
  if (hit) return hit
  const fc = await J<GeoJSON.FeatureCollection>(`data/geometry/${tripId}.json`)
  geometryCache.set(tripId, fc)
  return fc
}

export async function loadUnderlay(): Promise<GeoJSON.FeatureCollection> {
  return J<GeoJSON.FeatureCollection>('data/underlay.json')
}
