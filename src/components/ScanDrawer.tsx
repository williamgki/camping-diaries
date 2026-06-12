import { useMemo } from 'react'
import { useStore } from '../store'

export default function ScanDrawer() {
  const data = useStore((s) => s.data)
  const pageId = useStore((s) => s.drawerPageId)
  const openDrawer = useStore((s) => s.openDrawer)

  const { page, idx, pages } = useMemo(() => {
    const pages = data?.sourcePages ?? []
    const idx = pages.findIndex((p) => p.page_id === pageId)
    return { page: idx >= 0 ? pages[idx] : null, idx, pages }
  }, [data, pageId])

  if (!page) return null

  const nav = (d: number) => {
    const next = pages[idx + d]
    if (next) openDrawer(next.page_id)
  }

  return (
    <div className="drawer" role="dialog" aria-label="Diary page scan">
      <div className="drawer-bar">
        <div className="drawer-meta">
          <strong>
            Vol. {page.volume} · scan {page.pdf_page}
            {page.side === 'L' ? ' (left)' : ' (right)'}
          </strong>
          {page.handwritten_page_no != null && <span> · diary p. {page.handwritten_page_no}</span>}
          {page.has_route_sketch && <span className="drawer-sketch"> · route sketch</span>}
          {page.legibility != null && page.legibility < 0.6 && <span> · faint ink</span>}
        </div>
        <div className="drawer-actions">
          <button className="btn" onClick={() => nav(-1)} disabled={idx <= 0}>
            ‹ prev
          </button>
          <button className="btn" onClick={() => nav(1)} disabled={idx >= pages.length - 1}>
            next ›
          </button>
          <button className="btn" onClick={() => openDrawer(null)} aria-label="Close scans">
            close ×
          </button>
        </div>
      </div>
      <div className="drawer-image">
        <img src={page.image.webp} alt={`Diary volume ${page.volume}, scan ${page.pdf_page} ${page.side}`} loading="eager" />
      </div>
    </div>
  )
}
