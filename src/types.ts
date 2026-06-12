export interface Trip {
  id: string
  slug: string
  title: string
  volume: 'A' | 'B'
  start_date: string | null
  end_date: string | null
  year: number | null
  date_precision: 'day' | 'month' | 'year'
  travellers: string[]
  countries: string[]
  summary: string
  diary_pages: [number, number] | null
  pdf_spreads: [string, string]
  stats: { stops: number; excursions: number; crossings: number; distance_km: number }
  confidence: number | null
  low_confidence_stops: number
  unresolved_stops: number
  boundary_flags: string[]
  status: 'resolved' | 'review'
}

export type StopRole =
  | 'home'
  | 'departure'
  | 'overnight_base'
  | 'main_stop'
  | 'transit_stop'
  | 'crossing_terminal'
  | 'inferred_anchor'
  | 'unresolved'

export interface EvidenceStop {
  trip_id: string
  seq: number
  place_id: string
  role: StopRole
  original_wording: string | null
  excerpt: string | null
  source_page_id: string | null
  confidence: number | null
  approximate: boolean
  inferred: boolean
  inference_reason: string | null
}

export interface Place {
  place_id: string
  normalized_name: string
  display_name: string | null
  lon: number | null
  lat: number | null
  country: string | null
  precision: 'exact' | 'locality' | 'region_anchor' | 'approximate' | 'unresolved'
  curated: boolean
  source: string
  original_wordings: string[]
  ambiguous: boolean
  alternates: { display_name: string; lon: number; lat: number; type: string }[]
  trips: string[]
}

export interface RouteLeg {
  seq: number
  mode: 'road' | 'ferry' | 'tunnel'
  from: string
  to: string
  geometry_ref: string
  distance_km: number
  ferry_route?: string | null
  inferred?: boolean
  uncertain?: boolean
}

export interface ExcursionLeg {
  excursion_index: number
  label: string
  from: string
  to: string
  geometry_ref: string
  distance_km: number
}

export interface TripRoute {
  trip_id: string
  legs: RouteLeg[]
  excursion_legs: ExcursionLeg[]
}

export interface Excursion {
  trip_id: string
  excursion_id: string
  base_place_id: string | null
  label: string
  date_guess: string | null
  stops: {
    place_id: string
    normalized_name: string
    original_wording: string | null
    excerpt: string | null
    source_page_id: string | null
    confidence: number | null
    resolved: boolean
  }[]
  geometry_refs: string[]
}

export interface SourcePage {
  page_id: string
  volume: 'A' | 'B'
  pdf_page: number
  side: 'L' | 'R'
  handwritten_page_no: number | null
  image: { webp: string; thumb: string }
  trip_ids: string[]
  is_index: boolean
  legibility: number | null
  has_route_sketch: boolean
  photo_captions: string[]
  blank: boolean
}

export interface ReviewItem {
  id: string
  type: string
  trip_id: string | null
  page_id: string | null
  detail: string
  candidates: string[]
  status: 'open' | 'patched' | 'dismissed'
}

export interface ArchiveData {
  trips: Trip[]
  places: Record<string, Place>
  evidence: EvidenceStop[]
  routes: TripRoute[]
  excursions: Excursion[]
  sourcePages: SourcePage[]
  reviewQueue: ReviewItem[]
  summary: { counts: Record<string, number>; validation?: { passed: boolean; error_count: number } }
}

export interface Patch {
  target_file: string
  json_pointer: string
  op: 'replace' | 'add' | 'remove'
  value?: unknown
  reason: string
  review_id?: string
  author: string
  created_at: string
}

export interface Filters {
  decade: number | null
  year: number | null
  country: string | null
  traveller: string | null
  minConfidence: number
  status: 'all' | 'resolved' | 'review'
}

export interface LayerToggles {
  main: boolean
  excursions: boolean
  crossings: boolean
  unresolved: boolean
  allTrips: boolean
}
