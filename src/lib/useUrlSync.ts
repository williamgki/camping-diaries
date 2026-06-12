import { useEffect, useRef } from 'react'
import { useStore } from '../store'

// Two-way sync of ?trip=&page=&review= with the store, via replaceState.
export function useUrlSync() {
  const applied = useRef(false)
  const selectTrip = useStore((s) => s.selectTrip)
  const openDrawer = useStore((s) => s.openDrawer)
  const setReviewMode = useStore((s) => s.setReviewMode)
  const data = useStore((s) => s.data)
  const selectedTripId = useStore((s) => s.selectedTripId)
  const drawerPageId = useStore((s) => s.drawerPageId)
  const reviewMode = useStore((s) => s.reviewMode)

  // Apply URL once data is loaded.
  useEffect(() => {
    if (!data || applied.current) return
    applied.current = true
    const q = new URLSearchParams(location.search)
    const trip = q.get('trip')
    if (trip && data.trips.some((t) => t.id === trip)) selectTrip(trip)
    const page = q.get('page')
    if (page) openDrawer(page)
    if (q.get('review') === '1') setReviewMode(true)
  }, [data, selectTrip, openDrawer, setReviewMode])

  // Reflect state back into the URL.
  useEffect(() => {
    if (!applied.current) return
    const q = new URLSearchParams()
    if (selectedTripId) q.set('trip', selectedTripId)
    if (drawerPageId) q.set('page', drawerPageId)
    if (reviewMode) q.set('review', '1')
    const qs = q.toString()
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname)
  }, [selectedTripId, drawerPageId, reviewMode])
}
