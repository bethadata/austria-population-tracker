<script setup lang="ts">
import {
  AttributionControl,
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
  type StyleSpecification,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre derives its worker URL from `import.meta.url` of its own bundle,
// expecting `./maplibre-gl-worker.mjs` to sit beside it. After bundling that
// file does not exist, so the request hits the SPA fallback, the module worker
// is handed index.html, and it dies parsing HTML. MapLibre swallows worker
// failures, so the only visible symptom is that every GeoJSON source hangs
// forever with no error. Importing the worker through Vite emits it as a real
// asset - with its shared-chunk import intact - and hands us the hashed URL.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

import { useAppTheme } from '@/composables/useTheme'
import { usePopulationStore } from '@/stores/population'
import type { Level } from '@/types/data'
import { useMetricLabel } from '@/composables/useMetricLabel'
import { formatNumber, formatPercent, formatSigned } from '@/utils/format'
import { CHROME, divergingStops } from '@/utils/palette'

setWorkerUrl(maplibreWorkerUrl)

const store = usePopulationStore()
const { mode } = useAppTheme()
const { t, locale } = useI18n()
const { metricLabel, isPercent } = useMetricLabel()
const display = useDisplay()

const container = ref<HTMLDivElement | null>(null)
const map = shallowRef<MapLibreMap | null>(null)
const hovered = ref<string | null>(null)
const loading = ref(true)

const SOURCE = 'regions'
const FILL = 'regions-fill'
const LINE = 'regions-line'
const SELECTED = 'regions-selected'

// Austria's bounding box, with a little slack so the outline is not flush
// against the canvas edge.
const BOUNDS: [[number, number], [number, number]] = [
  [9.3, 46.2],
  [17.4, 49.2],
]

const FIT_PADDING = 24

/**
 * No basemap layer by design: the map shows administrative polygons only. That
 * removes any external tile provider, API key or network dependency, which
 * matters for a static GitHub Pages deployment - and a raster basemap under a
 * choropleth mostly competes with the data for attention anyway.
 */
function baseStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': CHROME[mode.value].plane } },
    ],
  }
}

/** Merge the active metric into the geometry so the fill can read it directly. */
const decorated = computed<GeoJSON.FeatureCollection | null>(() => {
  const geometry = store.geo.get(store.mapLevel as Level)
  if (!geometry) return null
  const values = store.metricByCode
  return {
    type: 'FeatureCollection',
    features: geometry.features.map((feature) => {
      const code = String(feature.properties?.code ?? '')
      const region = store.byCode.get(code)
      const value = values.get(code)
      return {
        ...feature,
        id: code,
        properties: {
          code,
          // Omitted rather than null when unavailable: MapLibre expressions
          // test presence with `has`, and comparing against a null literal is
          // not reliably supported.
          ...(typeof value === 'number' && Number.isFinite(value) ? { value } : {}),
          name: locale.value === 'en' ? region?.name_en : region?.name_de,
        },
      }
    }),
  }
})

function addLayers() {
  const instance = map.value
  if (!instance || !decorated.value) return

  instance.addSource(SOURCE, {
    type: 'geojson',
    data: decorated.value as never,
    promoteId: 'code',
  })

  instance.addLayer({
    id: FILL,
    type: 'fill',
    source: SOURCE,
    paint: {
      // Regions with no computable value (window longer than their series) fall
      // through to the neutral surface rather than to an arbitrary ramp end.
      'fill-color': [
        'case',
        ['has', 'value'],
        ['step', ['get', 'value'], ...divergingStops(mode.value)],
        CHROME[mode.value].grid,
      ] as never,
      'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 1, 0.9] as never,
    },
  })

  instance.addLayer({
    id: LINE,
    type: 'line',
    source: SOURCE,
    paint: {
      'line-color': CHROME[mode.value].surface,
      'line-width': 0.6,
    },
  })

  // Selection is drawn as its own layer above the fills so the ring is never
  // clipped by a neighbouring polygon painted after it.
  instance.addLayer({
    id: SELECTED,
    type: 'line',
    source: SOURCE,
    paint: {
      'line-color': CHROME[mode.value].primary,
      'line-width': 2.5,
    },
    filter: ['==', ['get', 'code'], store.mapHighlight ?? ''] as never,
  })
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string
  ))
}

const popup = new Popup({
  closeButton: false,
  closeOnClick: false,
  offset: 8,
  // See the pointer-events rule on this class: the popup must never take the
  // pointer, or it swallows the click that follows the hover.
  className: 'map-tip-popup',
})

function bindInteractions() {
  const instance = map.value
  if (!instance) return

  instance.on('mousemove', FILL, (event: MapLayerMouseEvent) => {
    const feature = event.features?.[0]
    if (!feature) return
    const code = String(feature.properties?.code)

    if (hovered.value && hovered.value !== code) {
      instance.setFeatureState({ source: SOURCE, id: hovered.value }, { hover: false })
    }
    hovered.value = code
    instance.setFeatureState({ source: SOURCE, id: code }, { hover: true })
    instance.getCanvas().style.cursor = 'pointer'

    const raw = feature.properties?.value
    const value = typeof raw === 'number' ? raw : null
    const series = store.annual.get(store.mapLevel as Level)?.series[code]?.total
    const latest = series ? series[series.length - 1] : null
    // Absolute change is a head count, so it must not be suffixed with '%'.
    const metricText = isPercent.value
      ? formatPercent(value, locale.value)
      : formatSigned(value, locale.value)
    popup
      .setLngLat(event.lngLat)
      .setHTML(
        `<div class="map-tip">
           <strong>${escapeHtml(String(feature.properties?.name ?? code))}</strong>
           <span>${escapeHtml(t('chart.population'))}: ${formatNumber(latest ?? null, locale.value)}</span>
           <span>${escapeHtml(metricLabel.value)}: ${metricText}</span>
         </div>`,
      )
      .addTo(instance)
  })

  instance.on('mouseleave', FILL, () => {
    if (hovered.value) {
      instance.setFeatureState({ source: SOURCE, id: hovered.value }, { hover: false })
    }
    hovered.value = null
    instance.getCanvas().style.cursor = ''
    popup.remove()
  })

  instance.on('click', FILL, (event: MapLayerMouseEvent) => {
    const code = event.features?.[0]?.properties?.code
    if (code) store.selected = String(code)
  })
}

async function ensureData() {
  loading.value = true
  await Promise.all([store.ensureLevel(store.mapLevel as Level), store.ensureGeo(store.mapLevel as Level)])
  loading.value = false
}

onMounted(async () => {
  await ensureData()
  if (!container.value) return

  const instance = new MapLibreMap({
    container: container.value,
    style: baseStyle(),
    bounds: BOUNDS,
    fitBoundsOptions: { padding: FIT_PADDING },
    attributionControl: false,
    // On a phone the map sits mid-page, and a one-finger drag inside it would
    // pan the map rather than scroll the page - leaving the reader stuck. This
    // asks for two fingers instead, with an on-canvas hint.
    cooperativeGestures: display.smAndDown.value,
    // Nothing here benefits from a tilted or rotated camera, and both are easy
    // to trigger by accident with two fingers.
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
  })
  instance.addControl(new NavigationControl({ showCompass: false }), 'top-right')
  instance.addControl(
    new AttributionControl({ compact: true, customAttribution: '© Statistik Austria' }),
  )

  // Surface MapLibre's own diagnostics: it swallows listener exceptions into an
  // 'error' event, so without this a bad paint expression fails silently.
  instance.on('error', (event) => {
    console.error('[maplibre]', event.error?.message ?? event)
  })

  instance.on('load', () => {
    map.value = instance
    addLayers()
    bindInteractions()
    applyMinZoom(instance)
    applyTipTheme(instance)
    ;(window as unknown as { __aptMap?: unknown }).__aptMap = instance
  })

  // The fitted zoom depends on the container size, so it has to be recomputed
  // whenever the map is resized rather than captured once.
  instance.on('resize', () => applyMinZoom(instance))
})

onBeforeUnmount(() => {
  popup.remove()
  map.value?.remove()
  map.value = null
})

// Level change swaps both geometry and values; rebuild the source data wholesale.
watch(
  () => store.mapLevel,
  async () => {
    await ensureData()
    const source = map.value?.getSource(SOURCE) as GeoJSONSource | undefined
    if (source && decorated.value) source.setData(decorated.value as never)
  },
)

// Metric / window changes only alter values, so a setData is enough.
watch(decorated, (value) => {
  const source = map.value?.getSource(SOURCE) as GeoJSONSource | undefined
  if (source && value) source.setData(value as never)
})

watch(
  () => store.mapHighlight,
  (code) => {
    if (map.value?.getLayer(SELECTED)) {
      map.value.setFilter(SELECTED, ['==', ['get', 'code'], code ?? ''] as never)
    }
  },
)

watch(display.smAndDown, (small) => {
  const handler = map.value?.cooperativeGestures
  if (!handler) return
  if (small) handler.enable()
  else handler.disable()
})

// Theme is a full repaint: background, fills and strokes all move together.
watch(mode, (value) => {
  const instance = map.value
  if (!instance) return
  instance.setPaintProperty('bg', 'background-color', CHROME[value].plane)
  instance.setPaintProperty(FILL, 'fill-color', [
    'case',
    ['has', 'value'],
    ['step', ['get', 'value'], ...divergingStops(value)],
    CHROME[value].grid,
  ] as never)
  instance.setPaintProperty(LINE, 'line-color', CHROME[value].surface)
  instance.setPaintProperty(SELECTED, 'line-color', CHROME[value].primary)
  applyTipTheme(instance)
})

/**
 * Push the palette into CSS variables on the map container.
 *
 * MapLibre's stylesheet hard-codes `background: #fff` on the popup body and
 * `#fff` on all eight tip variants, and the text colour is inherited, so in
 * dark mode the popup reads as white text on a white body. Popups are appended
 * to the map container, so variables set here reach them.
 */
function applyTipTheme(instance: MapLibreMap) {
  const chrome = CHROME[mode.value]
  const el = instance.getContainer()
  el.style.setProperty('--apt-tip-bg', chrome.surface)
  el.style.setProperty('--apt-tip-fg', chrome.primary)
  el.style.setProperty('--apt-tip-muted', chrome.secondary)
  el.style.setProperty('--apt-tip-border', chrome.border)
}

/**
 * Pin the zoom floor to the whole-country view.
 *
 * Austria is the entire subject of the map, so zooming out past it only adds
 * empty space. Deriving the floor from cameraForBounds keeps it exact for the
 * current container instead of hard-coding a level that is wrong at another
 * viewport size.
 */
function applyMinZoom(instance: MapLibreMap) {
  const camera = instance.cameraForBounds(BOUNDS, { padding: FIT_PADDING })
  if (camera?.zoom === undefined) return
  instance.setMinZoom(camera.zoom)
}

/**
 * Back to the whole country: refit the camera *and* drop the region selection.
 *
 * Clicking a polygon is the only way to select on this page and clicking it
 * again does not clear it, so without this there is no route back to the
 * Austria-wide series once any Bundesland or Bezirk has been picked. 'AT' is
 * the store's own initial value, and it has no polygon, so `mapHighlight`
 * resolves to null and the selection ring disappears with it.
 */
function resetView() {
  map.value?.fitBounds(BOUNDS, { padding: FIT_PADDING })
  store.selected = 'AT'
}

defineExpose({ resetView })
</script>

<template>
  <div class="map-wrap">
    <div ref="container" class="map-canvas" />
    <v-overlay :model-value="loading" contained persistent class="align-center justify-center">
      <v-progress-circular indeterminate size="40" />
    </v-overlay>
    <v-btn
      class="map-reset"
      size="small"
      variant="tonal"
      prepend-icon="mdi-map-outline"
      :title="t('map.reset_hint')"
      @click="resetView"
    >
      {{ t('map.reset') }}
    </v-btn>
  </div>
</template>

<style scoped>
.map-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  /* Deliberately small: the card decides the height (from its width on narrow
     screens), and a large min-height here would silently override it. */
  min-height: 180px;
}

.map-canvas {
  width: 100%;
  height: 100%;
}

.map-reset {
  position: absolute;
  left: 8px;
  bottom: 8px;
}
</style>

<style>
.map-tip {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font: 12px/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: var(--apt-tip-fg, #0b0b0b);
}

.map-tip span {
  color: var(--apt-tip-muted, #52514e);
}

/**
 * A hover tooltip must never take the pointer.
 *
 * MapLibre popups default to pointer-events: auto, and this one is placed next
 * to the cursor. Left interactive it catches the mousedown that follows the
 * mousemove: the click never reaches the canvas, and moving between two nearby
 * regions drops the tooltip because the map sees mouseleave and no further
 * mousemove. There is nothing here to interact with, so the whole popup opts out.
 */
.map-tip-popup,
.map-tip-popup * {
  pointer-events: none !important;
}

.maplibregl-popup-content {
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--apt-tip-bg, #fcfcfb);
  color: var(--apt-tip-fg, #0b0b0b);
  border: 1px solid var(--apt-tip-border, rgba(11, 11, 11, 0.1));
  box-shadow: 0 2px 8px rgb(0 0 0 / 18%);
}

/* The tip is drawn with borders, so each anchor direction needs its own side
   recoloured to match the popup background. */
.maplibregl-popup-anchor-top .maplibregl-popup-tip,
.maplibregl-popup-anchor-top-left .maplibregl-popup-tip,
.maplibregl-popup-anchor-top-right .maplibregl-popup-tip {
  border-bottom-color: var(--apt-tip-bg, #fcfcfb);
}

.maplibregl-popup-anchor-bottom .maplibregl-popup-tip,
.maplibregl-popup-anchor-bottom-left .maplibregl-popup-tip,
.maplibregl-popup-anchor-bottom-right .maplibregl-popup-tip {
  border-top-color: var(--apt-tip-bg, #fcfcfb);
}

.maplibregl-popup-anchor-left .maplibregl-popup-tip {
  border-right-color: var(--apt-tip-bg, #fcfcfb);
}

.maplibregl-popup-anchor-right .maplibregl-popup-tip {
  border-left-color: var(--apt-tip-bg, #fcfcfb);
}
</style>
