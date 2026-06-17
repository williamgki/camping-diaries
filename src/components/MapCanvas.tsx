import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import style from '../map/style.json'
import { useStore } from '../store'
import { loadGeometry, loadUnderlay } from '../lib/data'
import { buildPath, pointAt, type PlaybackPath } from '../lib/playback'
import { loadMoments, placeMoments, type MomentAtT } from '../lib/moments'

const COLORS = {
  main: '#A93F32',
  excursion: '#4E6E8E',
  ferry: '#3F7186',
  unresolved: '#9A938A',
}

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

export default function MapCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const readyRef = useRef(false)
  const pathRef = useRef<PlaybackPath | null>(null)
  const momentsRef = useRef<MomentAtT[]>([])
  const fitBoundsRef = useRef<[[number, number], [number, number]] | null>(null)
  const rafRef = useRef(0)

  const data = useStore((s) => s.data)
  const selectedTripId = useStore((s) => s.selectedTripId)
  const layers = useStore((s) => s.layers)
  const playback = useStore((s) => s.playback)
  const selectTrip = useStore((s) => s.selectTrip)
  const setMoments = useStore((s) => s.setMoments)

  // ---- map init
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    let map: maplibregl.Map
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: style as unknown as maplibregl.StyleSpecification,
        center: [-1.5, 51.2],
        zoom: 5.2,
        attributionControl: { compact: true },
      })
    } catch (e) {
      // WebGL unavailable (old hardware, headless) — keep the rest of the app alive
      containerRef.current.innerHTML =
        '<div style="display:grid;place-items:center;height:100%;color:#6b675c;font-style:italic">The map needs WebGL, which this browser has disabled — trips and diary pages still work.</div>'
      console.error(e)
      return
    }
    // Prominent zoom +/-; CSS shifts this bottom-left control into the
    // always-clear strip just right of the timeline panel (the side panels are
    // full-height, so the corners are occupied). Gentler wheel zoom so a coarse
    // mouse wheel steps smoothly (Simon's feedback).
    map.addControl(new maplibregl.NavigationControl({ showCompass: false, showZoom: true }), 'bottom-left')
    map.scrollZoom.setWheelZoomRate(1 / 250)

    map.on('load', () => {
      // Route layers slot beneath the basemap's symbol layers so labels stay on top.
      const firstSymbol = map.getStyle().layers?.find((l) => l.type === 'symbol')?.id

      map.addSource('underlay', { type: 'geojson', data: EMPTY })
      map.addSource('trip', { type: 'geojson', data: EMPTY })
      map.addSource('stops', { type: 'geojson', data: EMPTY })
      map.addSource('drawn', { type: 'geojson', data: EMPTY, lineMetrics: true })
      map.addSource('marker', { type: 'geojson', data: EMPTY })

      map.addLayer(
        {
          id: 'underlay',
          type: 'line',
          source: 'underlay',
          paint: { 'line-color': COLORS.main, 'line-width': 1, 'line-opacity': 0.14 },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        },
        firstSymbol,
      )
      map.addLayer(
        {
          id: 'trip-excursions',
          type: 'line',
          source: 'trip',
          filter: ['==', ['get', 'kind'], 'excursion'],
          paint: { 'line-color': COLORS.excursion, 'line-width': 1.5, 'line-dasharray': [2, 2], 'line-opacity': 0.85 },
        },
        firstSymbol,
      )
      map.addLayer(
        {
          id: 'trip-road',
          type: 'line',
          source: 'trip',
          filter: ['all', ['==', ['get', 'kind'], 'main'], ['==', ['get', 'mode'], 'road'], ['!=', ['get', 'uncertain'], true]],
          paint: { 'line-color': COLORS.main, 'line-width': 2.25 },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        },
        firstSymbol,
      )
      map.addLayer(
        {
          id: 'trip-road-uncertain',
          type: 'line',
          source: 'trip',
          filter: ['all', ['==', ['get', 'kind'], 'main'], ['==', ['get', 'mode'], 'road'], ['==', ['get', 'uncertain'], true]],
          paint: { 'line-color': COLORS.unresolved, 'line-width': 1.5, 'line-dasharray': [1, 2] },
        },
        firstSymbol,
      )
      map.addLayer(
        {
          id: 'trip-crossings',
          type: 'line',
          source: 'trip',
          filter: ['all', ['==', ['get', 'kind'], 'main'], ['!=', ['get', 'mode'], 'road']],
          paint: { 'line-color': COLORS.ferry, 'line-width': 1.75, 'line-dasharray': [4, 3], 'line-opacity': 0.9 },
        },
        firstSymbol,
      )
      // Stops + playback render above basemap labels: tiny marks, no clutter.
      map.addLayer({
        id: 'stops',
        type: 'circle',
        source: 'stops',
        paint: {
          'circle-radius': [
            'match',
            ['get', 'role'],
            'home', 5,
            'overnight_base', 4.5,
            'crossing_terminal', 3.5,
            'transit_stop', 3,
            4,
          ],
          'circle-color': [
            'case',
            ['==', ['get', 'role'], 'home'], '#26241F',
            ['get', 'approximate'], '#C9A86A',
            COLORS.main,
          ],
          'circle-stroke-color': '#FCFBF8',
          'circle-stroke-width': 1.5,
          'circle-opacity': ['case', ['<', ['get', 'confidence'], 0.7], 0.55, 1],
        },
      })
      map.addLayer({
        id: 'drawn',
        type: 'line',
        source: 'drawn',
        paint: { 'line-color': '#26241F', 'line-width': 2.75 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      })
      map.addLayer({
        id: 'marker',
        type: 'circle',
        source: 'marker',
        paint: {
          'circle-radius': 6,
          'circle-color': '#26241F',
          'circle-stroke-color': '#FCFBF8',
          'circle-stroke-width': 2,
        },
      })

      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8, className: 'cd-popup' })
      map.on('mouseenter', 'stops', (e) => {
        map.getCanvas().style.cursor = 'pointer'
        const f = e.features?.[0]
        if (!f) return
        const p = f.properties as Record<string, string>
        popup
          .setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
          .setHTML(
            `<strong>${p.name}</strong>${p.wording && p.wording !== p.name ? `<br/><em>“${p.wording}”</em>` : ''}<br/><span>${p.role}${p.approximate === 'true' ? ' · approximate' : ''}</span>`,
          )
          .addTo(map)
      })
      map.on('mouseleave', 'stops', () => {
        map.getCanvas().style.cursor = ''
        popup.remove()
      })
      map.on('mouseenter', 'underlay', () => (map.getCanvas().style.cursor = 'pointer'))
      map.on('mouseleave', 'underlay', () => (map.getCanvas().style.cursor = ''))
      map.on('click', 'underlay', (e) => {
        const id = e.features?.[0]?.properties?.trip_id
        if (id) selectTrip(String(id))
      })

      readyRef.current = true
      loadUnderlay()
        .then((fc) => (map.getSource('underlay') as maplibregl.GeoJSONSource)?.setData(fc))
        .catch(() => {})
    })

    mapRef.current = map
    return () => {
      cancelAnimationFrame(rafRef.current)
      map.remove()
      mapRef.current = null
      readyRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- selected trip geometry + stops
  useEffect(() => {
    const map = mapRef.current
    if (!map || !data) return
    let cancelled = false
    const apply = async () => {
      if (!readyRef.current) {
        map.once('load', apply)
        return
      }
      const tripSrc = map.getSource('trip') as maplibregl.GeoJSONSource
      const stopSrc = map.getSource('stops') as maplibregl.GeoJSONSource
      const drawnSrc = map.getSource('drawn') as maplibregl.GeoJSONSource
      const markerSrc = map.getSource('marker') as maplibregl.GeoJSONSource
      drawnSrc.setData(EMPTY)
      markerSrc.setData(EMPTY)
      pathRef.current = null
      if (!selectedTripId) {
        tripSrc.setData(EMPTY)
        stopSrc.setData(EMPTY)
        return
      }
      let fc: GeoJSON.FeatureCollection
      try {
        fc = await loadGeometry(selectedTripId)
      } catch {
        fc = EMPTY
      }
      if (cancelled) return
      tripSrc.setData(fc)
      const path = buildPath(fc)
      pathRef.current = path

      // Load + position the playback moments for this trip.
      momentsRef.current = []
      setMoments([], null)
      if (path) {
        loadMoments(selectedTripId).then((tm) => {
          if (cancelled || !tm) return
          const placed = placeMoments(path, tm.moments)
          momentsRef.current = placed
          setMoments(placed, tm.epigraph?.quote ?? null)
        })
      }

      const stops = data.evidence
        .filter((e) => e.trip_id === selectedTripId)
        .map((e) => {
          const place = data.places[e.place_id]
          if (!place || place.lon == null) return null
          return {
            type: 'Feature' as const,
            properties: {
              name: place.normalized_name,
              wording: e.original_wording ?? '',
              role: e.role,
              confidence: e.confidence ?? 1,
              approximate: e.approximate,
              page: e.source_page_id ?? '',
            },
            geometry: { type: 'Point' as const, coordinates: [place.lon, place.lat!] },
          }
        })
        .filter((f): f is NonNullable<typeof f> => !!f)
      stopSrc.setData({ type: 'FeatureCollection', features: stops })

      // Fit to trip bounds.
      const allCoords: [number, number][] = []
      for (const f of fc.features)
        if (f.geometry.type === 'LineString') allCoords.push(...((f.geometry.coordinates as [number, number][]) ?? []))
      for (const s of stops) allCoords.push(s.geometry.coordinates as [number, number])
      if (allCoords.length > 1) {
        const lons = allCoords.map((c) => c[0])
        const lats = allCoords.map((c) => c[1])
        const bounds: [[number, number], [number, number]] = [
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)],
        ]
        fitBoundsRef.current = bounds
        map.fitBounds(bounds, { padding: { top: 80, bottom: 60, left: 360, right: 380 }, duration: 900, maxZoom: 9 })
      } else {
        fitBoundsRef.current = null
      }
    }
    apply()
    return () => {
      cancelled = true
    }
  }, [data, selectedTripId])

  // ---- layer visibility
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const vis = (id: string, on: boolean) =>
      map.getLayer(id) && map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none')
    vis('underlay', layers.allTrips)
    vis('trip-road', layers.main)
    vis('trip-road-uncertain', layers.unresolved)
    vis('trip-crossings', layers.crossings)
    vis('trip-excursions', layers.excursions)
  }, [layers])

  const renderFrame = (t: number) => {
    const map = mapRef.current
    const path = pathRef.current
    if (!map || !path) return
    const drawnSrc = map.getSource('drawn') as maplibregl.GeoJSONSource | undefined
    const markerSrc = map.getSource('marker') as maplibregl.GeoJSONSource | undefined
    if (!drawnSrc || !markerSrc) return
    const { pos, drawn } = pointAt(path, t)
    drawnSrc.setData({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: drawn } }],
    })
    markerSrc.setData({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: pos } }],
    })
  }

  // ---- paused / scrub rendering (NOT during play, so it never restarts the loop)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current || playback.playing) return
    const drawnSrc = map.getSource('drawn') as maplibregl.GeoJSONSource | undefined
    const markerSrc = map.getSource('marker') as maplibregl.GeoJSONSource | undefined
    if (!drawnSrc || !markerSrc) return
    if (playback.t === 0) {
      drawnSrc.setData(EMPTY)
      markerSrc.setData(EMPTY)
      if (fitBoundsRef.current)
        map.fitBounds(fitBoundsRef.current, { padding: { top: 80, bottom: 60, left: 360, right: 380 }, duration: 700, maxZoom: 9 })
    } else {
      renderFrame(playback.t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback.t, playback.playing, selectedTripId])

  // ---- playback animation loop (runs once per play, not per frame)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current || !playback.playing) return
    const path = pathRef.current
    if (!path) return

    // Gentle cinematic camera: one smooth zoom-in on play, then track the
    // marker by setting the centre each frame (no per-frame easeTo — those
    // fight each other and the zoom never settles).
    const startPos = pointAt(path, playback.t).pos
    const followZoom = Math.min(8, Math.max(map.getZoom() + 1.4, 7))
    const startedAt = performance.now()
    const INTRO_MS = 850
    map.easeTo({ center: startPos, zoom: followZoom, duration: INTRO_MS })
    let lastPan = 0
    const baseKmPerSec = Math.max(20, path.totalKm / 34) * playback.speed
    const moments = momentsRef.current
    const nearMoment = (t: number) => moments.some((m) => Math.abs(m.t - t) < 0.015)

    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const { playback: pb, setPlayback } = useStore.getState()
      if (!pb.playing) return // paused mid-flight
      // Slow to a dwell as the marker reaches each moment, so its card can read.
      const speed = nearMoment(pb.t) ? baseKmPerSec * 0.4 : baseKmPerSec
      const t = Math.min(1, pb.t + (speed * dt) / path.totalKm)
      const { pos } = pointAt(path, t)
      renderFrame(t)
      // After the intro zoom, pan the centre directly (~12 Hz) for smooth tracking.
      if (now - startedAt > INTRO_MS && now - lastPan > 80) {
        lastPan = now
        map.setCenter(pos)
      }
      setPlayback(t >= 1 ? { t: 1, playing: false } : { t })
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback.playing, playback.speed, selectedTripId])

  return <div ref={containerRef} className="map-canvas" />
}
