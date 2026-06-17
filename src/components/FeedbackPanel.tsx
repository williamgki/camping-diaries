import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { SUGGESTION_FORM_URL, suggestionMailto } from '../lib/links'

interface Glossary {
  places: { name: string; note: string }[]
  names: { from: string; to: string; note: string }[]
}

export default function FeedbackPanel() {
  const open = useStore((s) => s.feedbackOpen)
  const setOpen = useStore((s) => s.setFeedbackOpen)
  const [glossary, setGlossary] = useState<Glossary | null>(null)

  useEffect(() => {
    if (open && !glossary)
      fetch('data/glossary.json')
        .then((r) => r.json())
        .then(setGlossary)
        .catch(() => setGlossary({ places: [], names: [] }))
  }, [open, glossary])

  if (!open) return null
  const formHref = SUGGESTION_FORM_URL || suggestionMailto()

  return (
    <aside className="feedback">
      <div className="feedback-head">
        <button className="detail-close" onClick={() => setOpen(false)} aria-label="Close">
          ×
        </button>
        <h2>Suggest a change</h2>
        <p className="feedback-intro">
          Spotted a wrong place, a misread name, or a photo in the wrong spot? Tell us — every
          suggestion is read and applied by hand (nothing changes on the map automatically).
        </p>
        <a className="btn btn-suggest" href={formHref} target="_blank" rel="noopener noreferrer">
          {SUGGESTION_FORM_URL ? 'Open the suggestion form ↗' : 'Email a suggestion ↗'}
        </a>
        <p className="feedback-hint">
          Helpful to include: which trip or place, and what it should be (e.g. “Kate &amp; Jamie’s
          farm = Brook House Farm, Avenbury”).
        </p>
      </div>

      {glossary && (glossary.places.length > 0 || glossary.names.length > 0) && (
        <div className="glossary">
          <h3>Known corrections (the glossary)</h3>
          <p className="glossary-sub">
            Already taught to the map. Suggest additions the same way.
          </p>
          {glossary.names.length > 0 && (
            <ul className="glossary-list">
              {glossary.names.map((n) => (
                <li key={`n-${n.from}`}>
                  <span className="g-from">{n.from}</span> → <span className="g-to">{n.to}</span>
                  {n.note ? <span className="g-note"> · {n.note}</span> : null}
                </li>
              ))}
            </ul>
          )}
          {glossary.places.length > 0 && (
            <ul className="glossary-list">
              {glossary.places.map((p) => (
                <li key={`p-${p.name}`}>
                  <span className="g-to">{p.name}</span>
                  {p.note ? <span className="g-note"> · {p.note}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </aside>
  )
}
