import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import style from '../map/style.json'

export default function MapCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: style as unknown as maplibregl.StyleSpecification,
      center: [-1.0, 50.5], // UK + northern France
      zoom: 5,
      attributionControl: { compact: true },
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  return <div ref={containerRef} style={{ flex: 1, minHeight: 0 }} />
}
