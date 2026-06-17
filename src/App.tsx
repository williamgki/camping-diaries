import { useEffect, useState } from 'react'
import { useStore } from './store'
import { loadArchive } from './lib/data'
import { useUrlSync } from './lib/useUrlSync'
import MapCanvas from './components/MapCanvas'
import TopBar from './components/TopBar'
import TimelinePanel from './components/TimelinePanel'
import TripDetailPanel from './components/TripDetailPanel'
import ScanDrawer from './components/ScanDrawer'
import ReviewOverlay from './components/ReviewOverlay'
import PlaybackMoments from './components/PlaybackMoments'
import FeedbackPanel from './components/FeedbackPanel'

export default function App() {
  const data = useStore((s) => s.data)
  const setData = useStore((s) => s.setData)
  const selectedTripId = useStore((s) => s.selectedTripId)
  const reviewMode = useStore((s) => s.reviewMode)
  const drawerPageId = useStore((s) => s.drawerPageId)
  const [error, setError] = useState<string | null>(null)
  useUrlSync()

  useEffect(() => {
    loadArchive().then(setData).catch((e) => setError(String(e)))
  }, [setData])

  return (
    <div className="app">
      <TopBar />
      <div className="app-body">
        <MapCanvas />
        {data && <TimelinePanel />}
        {data && selectedTripId && <TripDetailPanel />}
        {data && selectedTripId && <PlaybackMoments />}
        {data && reviewMode && <ReviewOverlay />}
        {data && <FeedbackPanel />}
        {data && drawerPageId && <ScanDrawer />}
        {!data && !error && <div className="boot">Reading the diaries…</div>}
        {error && <div className="boot boot-error">Data not built yet — run the pipeline. ({error})</div>}
      </div>
    </div>
  )
}
