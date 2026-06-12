import { useMemo } from 'react'
import { filteredTrips, useStore } from '../store'
import type { Trip } from '../types'

export default function TimelinePanel() {
  const data = useStore((s) => s.data)
  const filters = useStore((s) => s.filters)
  const selectedTripId = useStore((s) => s.selectedTripId)
  const selectTrip = useStore((s) => s.selectTrip)
  const reviewMode = useStore((s) => s.reviewMode)

  const trips = useMemo(() => filteredTrips(data, filters), [data, filters])
  const byYear = useMemo(() => {
    const m = new Map<number | null, Trip[]>()
    for (const t of trips) {
      const y = t.year
      if (!m.has(y)) m.set(y, [])
      m.get(y)!.push(t)
    }
    return [...m.entries()].sort((a, b) => (a[0] ?? 9999) - (b[0] ?? 9999))
  }, [trips])

  if (!data) return null
  let lastDecade: number | null = null

  return (
    <nav className="timeline" aria-label="Trips by year">
      <div className="timeline-head">
        <span>{trips.length} trips</span>
        <span className="timeline-volumes">Vol. A & B</span>
      </div>
      <div className="timeline-scroll">
        {byYear.map(([year, yearTrips]) => {
          const decade = year ? Math.floor(year / 10) * 10 : null
          const showDecade = decade !== lastDecade
          lastDecade = decade
          return (
            <div key={year ?? 'unknown'}>
              {showDecade && <div className="timeline-decade">{decade != null ? `${decade}s` : 'Undated'}</div>}
              <div className="timeline-year">
                <span className="timeline-year-label">{year ?? '—'}</span>
                <ul>
                  {yearTrips.map((t) => (
                    <li key={t.id}>
                      <button
                        className={`trip-item ${t.id === selectedTripId ? 'trip-item-selected' : ''}`}
                        onClick={() => selectTrip(t.id === selectedTripId ? null : t.id)}
                      >
                        <span className="trip-item-title">{t.title}</span>
                        <span className="trip-item-meta">
                          {t.countries.filter((c) => c !== 'GB').join(' · ') || 'GB'}
                          {t.stats.distance_km ? ` · ${t.stats.distance_km.toLocaleString()} km` : ''}
                          {reviewMode && t.status === 'review' && <em className="badge-review"> review</em>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )
        })}
      </div>
    </nav>
  )
}
