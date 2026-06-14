import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { activeMomentIndex } from '../lib/moments'

// Format a trip date (YYYY / YYYY-MM / YYYY-MM-DD) as e.g. "Jul 1989".
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function prettyDate(d: string | null): string {
  if (!d) return ''
  const [y, m] = d.split('-')
  return m ? `${MONTHS[Number(m) - 1] ?? ''} ${y}`.trim() : y
}

// Keep captions tidy: drop a trailing country and show at most two segments
// ("Roundwood, County Wicklow" rather than "Roundwood, County Wicklow, Ireland").
function prettyPlace(name: string): string {
  const segs = name.split(',').map((s) => s.trim()).filter(Boolean)
  if (segs.length > 1 && /^(uk|united kingdom|ireland|france|spain|germany|italy|norway|sweden|belgium|netherlands|switzerland|austria|portugal)$/i.test(segs[segs.length - 1]))
    segs.pop()
  return segs.slice(0, 2).join(', ')
}

export default function PlaybackMoments() {
  const moments = useStore((s) => s.currentMoments)
  const t = useStore((s) => s.playback.t)
  const playing = useStore((s) => s.playback.playing)
  const epigraph = useStore((s) => s.epigraph)

  const idx = useMemo(() => activeMomentIndex(moments, t), [moments, t])
  const active = idx >= 0 ? moments[idx] : null

  // Preload the next image so the next card appears instantly.
  useEffect(() => {
    const next = moments[idx + 1]
    next?.images?.forEach((im) => {
      const img = new Image()
      img.src = im.src
    })
  }, [idx, moments])

  // Track image load so we can fade it in only once decoded.
  const [imgReady, setImgReady] = useState(false)
  const lastKey = useRef('')
  const key = active ? `${active.seq}-${active.place_id}` : ''
  useEffect(() => {
    if (key !== lastKey.current) {
      lastKey.current = key
      setImgReady(false)
    }
  }, [key])

  const visible = (playing || t > 0) && moments.length > 0
  if (!visible) return null

  // Before the first moment (t≈0), show the trip epigraph if present.
  if (!active) {
    if (!epigraph) return null
    return (
      <div className="moment-card moment-epigraph" key="epigraph">
        <blockquote>“{epigraph}”</blockquote>
      </div>
    )
  }

  const hero = active.images[0]
  return (
    <div className="moment-card" key={key}>
      {hero && (
        <div className={`moment-image ${imgReady ? 'is-ready' : ''}`}>
          <img
            src={hero.src}
            alt={hero.caption || active.place}
            width={hero.w}
            height={hero.h}
            onLoad={() => setImgReady(true)}
            loading="eager"
          />
          {active.images.length > 1 && (
            <div className="moment-thumbs">
              {active.images.slice(1, 3).map((im) => (
                <img key={im.src} src={im.src} alt={im.caption || ''} loading="lazy" />
              ))}
            </div>
          )}
        </div>
      )}
      {active.quote && <blockquote className="moment-quote">“{active.quote}”</blockquote>}
      <div className="moment-caption">
        {prettyPlace(active.place)}
        {active.date ? ` · ${prettyDate(active.date)}` : ''}
      </div>
    </div>
  )
}
