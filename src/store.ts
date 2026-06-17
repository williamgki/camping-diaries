import { create } from 'zustand'
import type { ArchiveData, Filters, LayerToggles, Patch, Trip } from './types'
import type { MomentAtT } from './lib/moments'

interface State {
  data: ArchiveData | null
  selectedTripId: string | null
  filters: Filters
  layers: LayerToggles
  reviewMode: boolean
  feedbackOpen: boolean
  drawerPageId: string | null
  playback: { playing: boolean; t: number; speed: number }
  currentMoments: MomentAtT[]
  epigraph: string | null
  patches: Patch[]
  // actions
  setData: (d: ArchiveData) => void
  selectTrip: (id: string | null) => void
  setFilters: (f: Partial<Filters>) => void
  toggleLayer: (k: keyof LayerToggles) => void
  setReviewMode: (v: boolean) => void
  setFeedbackOpen: (v: boolean) => void
  openDrawer: (pageId: string | null) => void
  setPlayback: (p: Partial<State['playback']>) => void
  setMoments: (m: MomentAtT[], epigraph: string | null) => void
  addPatch: (p: Patch) => void
  clearPatches: () => void
}

const storedPatches = (): Patch[] => {
  try {
    return JSON.parse(localStorage.getItem('cd-patches') ?? '[]')
  } catch {
    return []
  }
}

export const useStore = create<State>((set) => ({
  data: null,
  selectedTripId: null,
  filters: { decade: null, year: null, country: null, traveller: null, minConfidence: 0, status: 'all' },
  layers: { main: true, excursions: true, crossings: true, unresolved: true, allTrips: true },
  reviewMode: false,
  feedbackOpen: false,
  drawerPageId: null,
  playback: { playing: false, t: 0, speed: 1 },
  currentMoments: [],
  epigraph: null,
  patches: storedPatches(),
  setData: (data) => set({ data }),
  selectTrip: (selectedTripId) =>
    set({ selectedTripId, playback: { playing: false, t: 0, speed: 1 }, currentMoments: [], epigraph: null }),
  setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
  toggleLayer: (k) => set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),
  setReviewMode: (reviewMode) => set({ reviewMode }),
  setFeedbackOpen: (feedbackOpen) => set({ feedbackOpen }),
  openDrawer: (drawerPageId) => set({ drawerPageId }),
  setPlayback: (p) => set((s) => ({ playback: { ...s.playback, ...p } })),
  setMoments: (currentMoments, epigraph) => set({ currentMoments, epigraph }),
  addPatch: (p) =>
    set((s) => {
      const patches = [...s.patches, p]
      localStorage.setItem('cd-patches', JSON.stringify(patches))
      return { patches }
    }),
  clearPatches: () => {
    localStorage.removeItem('cd-patches')
    set({ patches: [] })
  },
}))

export function filteredTrips(data: ArchiveData | null, f: Filters): Trip[] {
  if (!data) return []
  return data.trips.filter((t) => {
    if (f.decade != null && (t.year == null || Math.floor(t.year / 10) * 10 !== f.decade)) return false
    if (f.year != null && t.year !== f.year) return false
    if (f.country && !t.countries.includes(f.country)) return false
    if (f.traveller && !t.travellers.includes(f.traveller)) return false
    if (f.minConfidence > 0 && (t.confidence ?? 0) < f.minConfidence) return false
    if (f.status !== 'all' && t.status !== f.status) return false
    return true
  })
}
