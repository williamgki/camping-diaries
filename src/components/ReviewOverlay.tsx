import { useMemo, useState } from 'react'
import { useStore } from '../store'
import type { Patch, ReviewItem } from '../types'

function download(filename: string, content: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

export default function ReviewOverlay() {
  const data = useStore((s) => s.data)
  const selectedTripId = useStore((s) => s.selectedTripId)
  const patches = useStore((s) => s.patches)
  const addPatch = useStore((s) => s.addPatch)
  const clearPatches = useStore((s) => s.clearPatches)
  const openDrawer = useStore((s) => s.openDrawer)
  const selectTrip = useStore((s) => s.selectTrip)
  const [onlyTrip, setOnlyTrip] = useState(true)
  const [noteFor, setNoteFor] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')

  const queue = useMemo(() => {
    let q = data?.reviewQueue ?? []
    if (onlyTrip && selectedTripId) q = q.filter((i) => i.trip_id === selectedTripId)
    return q.filter((i) => i.status === 'open' && !patches.some((p) => p.review_id === i.id))
  }, [data, onlyTrip, selectedTripId, patches])

  if (!data) return null

  const dismiss = (item: ReviewItem, reason: string) => {
    const idx = data.reviewQueue.findIndex((q) => q.id === item.id)
    const patch: Patch = {
      target_file: 'review_queue.json',
      json_pointer: `/${idx}/status`,
      op: 'replace',
      value: 'dismissed',
      reason: reason || 'reviewed: not an issue',
      review_id: item.id,
      author: 'family-review',
      created_at: new Date().toISOString(),
    }
    addPatch(patch)
    setNoteFor(null)
    setNoteText('')
  }

  const counts = data.summary.counts

  return (
    <aside className="review">
      <div className="review-head">
        <h3>Route audit</h3>
        <p className="review-stats">
          {counts.resolved_trips}/{counts.trips} trips resolved · {counts.cited_stop_pct}% stops cited ·{' '}
          {counts.review_queue} queue items
        </p>
        <label className="review-scope">
          <input type="checkbox" checked={onlyTrip} onChange={(e) => setOnlyTrip(e.target.checked)} />
          selected trip only
        </label>
      </div>

      <ul className="review-list">
        {queue.length === 0 && <li className="review-empty">No open items{onlyTrip ? ' for this trip' : ''}.</li>}
        {queue.slice(0, 80).map((item) => (
          <li key={item.id} className={`review-item review-${item.type}`}>
            <div className="review-item-head">
              <span className="review-type">{item.type.replace(/_/g, ' ')}</span>
              {item.trip_id && (
                <button className="cite" onClick={() => selectTrip(item.trip_id)}>
                  {item.trip_id}
                </button>
              )}
              {item.page_id && (
                <button className="cite" onClick={() => openDrawer(item.page_id)}>
                  {item.page_id}
                </button>
              )}
            </div>
            <p className="review-detail">{item.detail}</p>
            {item.candidates.length > 0 && (
              <p className="review-candidates">alternatives: {item.candidates.slice(0, 3).join(' · ')}</p>
            )}
            {noteFor === item.id ? (
              <div className="review-note">
                <input
                  autoFocus
                  placeholder="why is this fine / what is correct?"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && dismiss(item, noteText)}
                />
                <button className="btn" onClick={() => dismiss(item, noteText)}>
                  save
                </button>
              </div>
            ) : (
              <button className="btn btn-small" onClick={() => setNoteFor(item.id)}>
                resolve…
              </button>
            )}
          </li>
        ))}
      </ul>

      <div className="review-foot">
        <span>{patches.length} pending corrections</span>
        <button
          className="btn"
          disabled={!patches.length}
          onClick={() => download(`patches-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(patches, null, 2))}
        >
          Export patches
        </button>
        <button className="btn" disabled={!patches.length} onClick={clearPatches}>
          Clear
        </button>
      </div>
      <p className="review-hint">
        Drop exported files into <code>patches/</code> and re-run <code>npm run assemble</code> to bake corrections in.
      </p>
    </aside>
  )
}
