import { useEffect, useRef, useState } from 'react'
import MiniSearch from 'minisearch'
import { useStore } from '../store'

interface Hit {
  id: string
  type: 'trip' | 'place' | 'page'
  title: string
  trip_id: string | null
  page_id: string | null
}

let miniPromise: Promise<MiniSearch> | null = null
function getIndex(): Promise<MiniSearch> {
  miniPromise ??= fetch('data/search_index.json')
    .then((r) => r.json())
    .then((j) =>
      MiniSearch.loadJS(j, { fields: ['title', 'text'], storeFields: ['type', 'title', 'trip_id', 'page_id'] }),
    )
  return miniPromise
}

export default function SearchBox() {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const selectTrip = useStore((s) => s.selectTrip)
  const openDrawer = useStore((s) => s.openDrawer)

  useEffect(() => {
    if (!q.trim()) {
      setHits([])
      return
    }
    let cancelled = false
    getIndex().then((mini) => {
      if (cancelled) return
      const res = mini.search(q, { prefix: true, fuzzy: 0.15, boost: { title: 2 } }).slice(0, 12)
      setHits(res.map((r) => ({ id: String(r.id), type: r.type, title: r.title, trip_id: r.trip_id, page_id: r.page_id })))
    })
    return () => {
      cancelled = true
    }
  }, [q])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const pick = (h: Hit) => {
    if (h.trip_id) selectTrip(h.trip_id)
    if (h.page_id) openDrawer(h.page_id)
    setOpen(false)
    setQ('')
  }

  return (
    <div className="searchbox" ref={boxRef}>
      <input
        type="search"
        placeholder="Search trips, places, diary text…"
        value={q}
        onFocus={() => {
          setOpen(true)
          getIndex()
        }}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
      />
      {open && hits.length > 0 && (
        <ul className="search-results">
          {hits.map((h) => (
            <li key={h.id}>
              <button onClick={() => pick(h)}>
                <span className={`search-kind search-kind-${h.type}`}>{h.type}</span>
                {h.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
