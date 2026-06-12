import { useMemo } from 'react'
import { useStore } from '../store'
import type { EvidenceStop, StopRole } from '../types'

const ROLE_LABEL: Record<StopRole, string> = {
  home: 'home',
  departure: 'departure',
  overnight_base: 'overnight',
  main_stop: 'stop',
  transit_stop: 'via',
  crossing_terminal: 'port',
  inferred_anchor: 'area',
  unresolved: 'unplaced',
}

function ConfidenceBadge({ c }: { c: number | null }) {
  if (c == null) return null
  const cls = c >= 0.85 ? 'conf-high' : c >= 0.65 ? 'conf-mid' : 'conf-low'
  return (
    <span className={`conf ${cls}`} title={`confidence ${c.toFixed(2)}`}>
      {c.toFixed(2)}
    </span>
  )
}

function Citation({ stop }: { stop: { source_page_id: string | null } }) {
  const openDrawer = useStore((s) => s.openDrawer)
  if (!stop.source_page_id) return null
  return (
    <button className="cite" onClick={() => openDrawer(stop.source_page_id)} title="Open diary page">
      {stop.source_page_id.replace(/_/g, ' ')}
    </button>
  )
}

export default function TripDetailPanel() {
  const data = useStore((s) => s.data)
  const selectedTripId = useStore((s) => s.selectedTripId)
  const reviewMode = useStore((s) => s.reviewMode)
  const playback = useStore((s) => s.playback)
  const setPlayback = useStore((s) => s.setPlayback)
  const selectTrip = useStore((s) => s.selectTrip)

  const trip = data?.trips.find((t) => t.id === selectedTripId)
  const stops = useMemo(
    () =>
      (data?.evidence ?? [])
        .filter((e) => e.trip_id === selectedTripId)
        .sort((a, b) => a.seq - b.seq),
    [data, selectedTripId],
  )
  const excursions = useMemo(
    () => (data?.excursions ?? []).filter((e) => e.trip_id === selectedTripId),
    [data, selectedTripId],
  )
  const route = data?.routes.find((r) => r.trip_id === selectedTripId)

  if (!data || !trip) return null

  const dateLine =
    trip.start_date && trip.end_date
      ? `${trip.start_date} → ${trip.end_date}`
      : trip.start_date ?? (trip.year ? String(trip.year) : 'undated')

  return (
    <aside className="detail">
      <div className="detail-head">
        <button className="detail-close" onClick={() => selectTrip(null)} aria-label="Close trip">
          ×
        </button>
        <h2>{trip.title}</h2>
        <p className="detail-dates">{dateLine}</p>
        {trip.travellers.length > 0 && <p className="detail-travellers">{trip.travellers.join(' · ')}</p>}
        {trip.summary && <p className="detail-summary">{trip.summary}</p>}
        <p className="detail-stats">
          {trip.stats.distance_km ? `${trip.stats.distance_km.toLocaleString()} km · ` : ''}
          {stops.length} stops
          {trip.stats.crossings ? ` · ${trip.stats.crossings} crossing${trip.stats.crossings > 1 ? 's' : ''}` : ''}
          {excursions.length ? ` · ${excursions.length} excursions` : ''}
          {trip.diary_pages ? ` · diary pp. ${trip.diary_pages[0]}–${trip.diary_pages[1]}` : ''}
        </p>
        {reviewMode && trip.status === 'review' && (
          <p className="detail-review-flag">
            ⚠ {trip.unresolved_stops} unresolved · review queue has items for this trip
          </p>
        )}
      </div>

      <div className="playbar">
        <button
          className="btn btn-play"
          onClick={() => setPlayback({ playing: !playback.playing, t: playback.t >= 1 ? 0 : playback.t })}
        >
          {playback.playing ? 'Pause' : playback.t > 0 && playback.t < 1 ? 'Resume' : 'Play journey'}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.002}
          value={playback.t}
          onChange={(e) => setPlayback({ t: Number(e.target.value), playing: false })}
          aria-label="Journey position"
        />
        <select
          value={playback.speed}
          onChange={(e) => setPlayback({ speed: Number(e.target.value) })}
          aria-label="Playback speed"
        >
          <option value={0.5}>½×</option>
          <option value={1}>1×</option>
          <option value={2}>2×</option>
        </select>
      </div>

      <ol className="stops">
        {stops.map((s: EvidenceStop) => {
          const place = data.places[s.place_id]
          return (
            <li key={`${s.seq}-${s.place_id}`} className={`stop stop-${s.role}`}>
              <span className="stop-marker" aria-hidden />
              <div className="stop-body">
                <div className="stop-line">
                  <span className="stop-name">{place?.normalized_name ?? s.original_wording ?? s.place_id}</span>
                  <span className="stop-role">{ROLE_LABEL[s.role]}</span>
                  {s.approximate && <span className="stop-approx" title="representative anchor for a region">≈</span>}
                  {s.inferred && <span className="stop-inferred" title={s.inference_reason ?? 'inferred'}>inferred</span>}
                  {reviewMode && <ConfidenceBadge c={s.confidence} />}
                </div>
                {s.original_wording && place && s.original_wording !== place.normalized_name && (
                  <div className="stop-wording">“{s.original_wording}”</div>
                )}
                {s.excerpt && <blockquote className="stop-excerpt">“{s.excerpt}”</blockquote>}
                <Citation stop={s} />
              </div>
            </li>
          )
        })}
      </ol>

      {route && route.legs.some((l) => l.mode !== 'road') && (
        <div className="crossings-note">
          {route.legs
            .filter((l) => l.mode !== 'road')
            .map((l) => (
              <p key={l.seq}>
                <span className="crossing-glyph">⛴</span> {l.from} → {l.to}
                {l.inferred ? ' (inferred)' : ''} · {l.distance_km.toLocaleString()} km {l.mode}
              </p>
            ))}
        </div>
      )}

      {excursions.length > 0 && (
        <section className="excursions">
          <h3>Excursions</h3>
          {excursions.map((ex) => (
            <div key={ex.excursion_id} className="excursion">
              <h4>{ex.label}</h4>
              <ul>
                {ex.stops.map((s, i) => (
                  <li key={i} className="stop-line">
                    <span className="stop-name">{s.normalized_name}</span>
                    {!s.resolved && <span className="stop-approx">unplaced</span>}
                    {reviewMode && <ConfidenceBadge c={s.confidence} />}
                    <Citation stop={s} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
    </aside>
  )
}
