/**
 * Functional smoke test against the built site.
 *
 * Assertions rather than screenshots: these are the paths that broke silently
 * during development, where nothing appears in the console. The MapLibre source
 * check in particular exists because a dead worker leaves the map blank with no
 * error at all.
 *
 *   npm run build && npm run preview &   # then:
 *   npm run test:smoke
 */
import { chromium } from '@playwright/test'

const BASE = process.env.BASE_URL ?? 'http://localhost:4174/austria-population-tracker/'
const failures = []
const errors = []

function check(ok, label, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  ' + detail}`)
  if (!ok) failures.push(label)
}

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
const page = await context.newPage()
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)) })
page.on('pageerror', (e) => errors.push('UNCAUGHT: ' + e.message.slice(0, 160)))
page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url().slice(0, 100)}`) })

await page.goto(BASE + '#/', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)

// The map: a dead GeoJSON worker renders nothing and logs nothing.
const map = await page.evaluate(() => {
  const m = window.__aptMap
  if (!m) return null
  return {
    styleLoaded: m.isStyleLoaded(),
    sourceLoaded: m.isSourceLoaded('regions'),
    rendered: m.queryRenderedFeatures({ layers: ['regions-fill'] }).length,
  }
})
check(!!map, 'map instance exists')
check(map?.styleLoaded === true, 'map style loaded')
check(map?.sourceLoaded === true, 'geojson source loaded (worker alive)')
check((map?.rendered ?? 0) > 0, 'polygons rendered', `rendered=${map?.rendered}`)

// Clicking a region must drive both the detail panel and the selection outline.
const box = await page.locator('.map-canvas').boundingBox()
const pt = await page.evaluate(() => { const q = window.__aptMap.project([16.37, 48.21]); return { x: q.x, y: q.y } })
await page.mouse.click(box.x + pt.x, box.y + pt.y)
await page.waitForTimeout(1500)
const title = (await page.locator('.v-card-title').first().textContent())?.trim()
const filter = await page.evaluate(() => JSON.stringify(window.__aptMap.getFilter('regions-selected')))
check(title === 'Wien', 'clicking Vienna selects it', `title=${title}`)
check(filter.includes('AT13'), 'selection outline follows the click', filter)

// Citizenship breakdown: three annual classes, fixed colour order.
await page.locator('input[type="checkbox"]').first().check()
await page.waitForTimeout(1200)
const annualTraces = await page.evaluate(() => {
  const gd = document.querySelector('.js-plotly-plot')
  return gd?.data?.map((t) => ({ name: t.name, color: t.line?.color })) ?? []
})
check(annualTraces.length === 3, 'annual breakdown has 3 traces', `${annualTraces.length}`)
check(annualTraces[0]?.color === '#2a78d6', 'series colours follow fixed slot order', annualTraces[0]?.color)

// Quarterly is lazily fetched; it used to render empty because of a race.
await page.getByRole('button', { name: 'Quartalsweise' }).click()
await page.waitForTimeout(2200)
const q = await page.evaluate(() => {
  const gd = document.querySelector('.js-plotly-plot')
  return { points: gd?.data?.[0]?.x?.length ?? 0, traces: gd?.data?.length ?? 0, shapes: gd?.layout?.shapes?.length ?? 0 }
})
check(q.points > 60, 'quarterly series populated', `points=${q.points}`)
check(q.traces === 5, 'quarterly has 5 citizenship classes', `${q.traces}`)
check(q.shapes >= 1, 'provisional periods are shaded', `shapes=${q.shapes}`)

// Bezirk level: the heavier geometry, and a different source payload.
await page.getByRole('button', { name: 'Jährlich' }).click()
await page.getByRole('button', { name: 'Bezirke' }).click()
await page.waitForTimeout(3500)
const bez = await page.evaluate(() => window.__aptMap.queryRenderedFeatures({ layers: ['regions-fill'] }).length)
check(bez > 100, 'district level renders its polygons', `rendered=${bez}`)

// List page
await page.goto(BASE + '#/list', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
check((await page.locator('tbody tr').count()) > 0, 'list renders rows')

// About page must span the full width, not a narrow column.
await page.goto(BASE + '#/about', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2000)
const width = await page.evaluate(() => {
  const card = document.querySelector('.v-card')
  // Compare against the container's content box: .v-main's clientWidth still
  // includes the navigation drawer offset as padding.
  const container = document.querySelector('.v-container')
  const cs = container ? getComputedStyle(container) : null
  const inner = container
    ? container.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
    : 1
  return { card: card?.clientWidth ?? 0, inner }
})
check(width.card / width.inner > 0.98, 'about page is full width', `${width.card}/${width.inner}`)

check(errors.length === 0, 'no console errors or failed requests', errors.slice(0, 5).join(' | '))

await browser.close()
console.log(`\n${failures.length ? failures.length + ' FAILED: ' + failures.join('; ') : 'All smoke checks passed'}`)
process.exit(failures.length ? 1 : 0)
