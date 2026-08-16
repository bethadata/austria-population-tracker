// Minimal structural types for the boundary files. The full @types/geojson
// package is not worth a dependency for the handful of members used here.
declare namespace GeoJSON {
  interface Feature {
    type: 'Feature'
    properties: Record<string, unknown> | null
    geometry: { type: string; coordinates: unknown }
  }
  interface FeatureCollection {
    type: 'FeatureCollection'
    features: Feature[]
  }
}
