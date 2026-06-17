import { useMemo, useState } from 'react'
import { useStore } from '../store'
import SearchBox from './SearchBox'

export default function TopBar() {
  const data = useStore((s) => s.data)
  const filters = useStore((s) => s.filters)
  const setFilters = useStore((s) => s.setFilters)
  const layers = useStore((s) => s.layers)
  const toggleLayer = useStore((s) => s.toggleLayer)
  const reviewMode = useStore((s) => s.reviewMode)
  const setReviewMode = useStore((s) => s.setReviewMode)
  const feedbackOpen = useStore((s) => s.feedbackOpen)
  const setFeedbackOpen = useStore((s) => s.setFeedbackOpen)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const countries = useMemo(
    () => [...new Set(data?.trips.flatMap((t) => t.countries) ?? [])].sort(),
    [data],
  )
  const travellers = useMemo(
    () => [...new Set(data?.trips.flatMap((t) => t.travellers) ?? [])].sort(),
    [data],
  )
  const decades = useMemo(
    () =>
      [...new Set((data?.trips ?? []).map((t) => t.year && Math.floor(t.year / 10) * 10).filter(Boolean))].sort() as number[],
    [data],
  )

  const activeFilterCount =
    (filters.decade != null ? 1 : 0) +
    (filters.country ? 1 : 0) +
    (filters.traveller ? 1 : 0) +
    (filters.minConfidence > 0 ? 1 : 0) +
    (filters.status !== 'all' ? 1 : 0)

  return (
    <header className="topbar">
      <div className="topbar-title">
        <h1>Camping Diaries</h1>
        <span className="topbar-era">1989–2022</span>
      </div>
      <SearchBox />
      <div className="topbar-actions">
        <button
          className={`btn ${filtersOpen || activeFilterCount ? 'btn-active' : ''}`}
          onClick={() => setFiltersOpen((v) => !v)}
        >
          Filters{activeFilterCount ? ` · ${activeFilterCount}` : ''}
        </button>
        <button
          className={`btn ${reviewMode ? 'btn-review' : ''}`}
          onClick={() => setReviewMode(!reviewMode)}
          title="Show extraction evidence, confidence and corrections"
        >
          Review
        </button>
        <button
          className={`btn ${feedbackOpen ? 'btn-active' : ''}`}
          onClick={() => setFeedbackOpen(!feedbackOpen)}
          title="Suggest a correction or addition"
        >
          Suggest
        </button>
      </div>
      {filtersOpen && (
        <div className="filter-popover">
          <div className="filter-group">
            <label>Decade</label>
            <div className="chips">
              {decades.map((d) => (
                <button
                  key={d}
                  className={`chip ${filters.decade === d ? 'chip-on' : ''}`}
                  onClick={() => setFilters({ decade: filters.decade === d ? null : d, year: null })}
                >
                  {d}s
                </button>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <label>Country</label>
            <div className="chips">
              {countries.map((c) => (
                <button
                  key={c}
                  className={`chip ${filters.country === c ? 'chip-on' : ''}`}
                  onClick={() => setFilters({ country: filters.country === c ? null : c })}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          {travellers.length > 0 && (
            <div className="filter-group">
              <label>Traveller</label>
              <div className="chips">
                {travellers.map((t) => (
                  <button
                    key={t}
                    className={`chip ${filters.traveller === t ? 'chip-on' : ''}`}
                    onClick={() => setFilters({ traveller: filters.traveller === t ? null : t })}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="filter-group">
            <label>Status</label>
            <div className="chips">
              {(['all', 'resolved', 'review'] as const).map((st) => (
                <button
                  key={st}
                  className={`chip ${filters.status === st ? 'chip-on' : ''}`}
                  onClick={() => setFilters({ status: st })}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <label>Min confidence {filters.minConfidence > 0 ? filters.minConfidence.toFixed(1) : 'off'}</label>
            <input
              type="range"
              min={0}
              max={0.9}
              step={0.1}
              value={filters.minConfidence}
              onChange={(e) => setFilters({ minConfidence: Number(e.target.value) })}
            />
          </div>
          <div className="filter-group">
            <label>Map layers</label>
            <div className="chips">
              {(
                [
                  ['main', 'Main route'],
                  ['excursions', 'Excursions'],
                  ['crossings', 'Ferries'],
                  ['unresolved', 'Uncertain'],
                  ['allTrips', 'All trips'],
                ] as const
              ).map(([k, label]) => (
                <button key={k} className={`chip ${layers[k] ? 'chip-on' : ''}`} onClick={() => toggleLayer(k)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
