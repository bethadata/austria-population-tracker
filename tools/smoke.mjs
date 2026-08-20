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
const title = (await page.locator('.region-name').first().textContent())?.trim()
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

// Zoom floor: the whole-country view is the widest allowed.
await page.getByRole('button', { name: 'Bundesländer' }).click()
await page.waitForTimeout(2500)
const zoom = await page.evaluate(async () => {
  const m = window.__aptMap
  const floor = m.getMinZoom()
  m.zoomTo(2, { duration: 0 })
  await new Promise((r) => setTimeout(r, 400))
  const out = m.getZoom()
  m.zoomTo(9, { duration: 0 })
  await new Promise((r) => setTimeout(r, 400))
  return { floor, afterZoomOut: out, afterZoomIn: m.getZoom() }
})
check(Math.abs(zoom.afterZoomOut - zoom.floor) < 0.01, 'zoom-out clamped to default view',
  `floor=${zoom.floor.toFixed(2)} got=${zoom.afterZoomOut.toFixed(2)}`)
check(zoom.afterZoomIn > zoom.floor + 2, 'zoom-in still unrestricted', `${zoom.afterZoomIn}`)

// Region detail: hero figure naming the map metric, plus ten years of changes.
const detail = await page.evaluate(() => {
  const bodyRows = [...document.querySelectorAll('.detail-table tbody tr')]
  const headers = [...document.querySelectorAll('.detail-table thead th')].map((h) => h.textContent.trim())
  return {
    hero: document.querySelector('.hero')?.textContent?.trim(),
    years: headers.slice(1),
    measures: bodyRows.map((r) => r.querySelector('th')?.textContent?.trim()),
    lastCol: bodyRows.map((r) => [...r.querySelectorAll('td')].at(-1)?.textContent?.trim()),
  }
})
check(/%|\d/.test(detail.hero ?? ''), 'hero figure rendered', detail.hero)
check(detail.years.length === 10, 'table shows ten year columns', detail.years.join(','))
check(detail.years.join(',') === [...detail.years].sort().join(','), 'years run oldest to newest',
  detail.years.join(','))
check(detail.measures.length === 3, 'table has population, abs and rel change rows',
  detail.measures.join('|'))
check(detail.lastCol.every((c) => c && c !== '–'), 'latest year column fully populated',
  detail.lastCol.join('|'))

// The table belongs in its own row beneath both, not beside them.
const stacked = await page.evaluate(() => {
  const map = document.querySelector('.map-card').getBoundingClientRect()
  const table = document.querySelector('.detail-table').getBoundingClientRect()
  return { below: table.top > map.bottom - 5, mapHeight: Math.round(map.height) }
})
check(stacked.below, 'year table sits below the map and chart')
check(stacked.mapHeight < 520, 'map is not stretched to full page height', `${stacked.mapHeight}px`)

// Every figure is a stock on one reference date, so the page must say which day.
const reference = await page.evaluate(() => {
  const captions = [...document.querySelectorAll('.text-caption')].map((e) => e.textContent.trim())
  const gd = document.querySelector('.js-plotly-plot')
  return {
    chartNote: captions.find((t) => /Stichtag|Reference date/.test(t)) ?? '',
    headline: captions.find((t) => /Stand |as of /.test(t)) ?? '',
    tableNote: captions.find((t) => /Letzte 10|Last 10/.test(t)) ?? '',
    firstX: gd?.data?.[0]?.x?.[0] ?? '',
    lastX: gd?.data?.[0]?.x?.at(-1) ?? '',
  }
})
check(/1\. Jänner|1 January/.test(reference.chartNote), 'chart states the annual reference date',
  reference.chartNote)
check(/2026/.test(reference.headline) && /Jän|Jan/.test(reference.headline),
  'headline figure carries its reference date', reference.headline)
check(/1\. Jänner|1 January/.test(reference.tableNote), 'year table states its reference date',
  reference.tableNote)
check(/^\d{4}-\d{2}-\d{2}$/.test(reference.firstX),
  'chart plots a real date axis', reference.firstX)

// The hover header is the one place the exact day has to appear, so read it for real.
const plotBox = await page.locator('.js-plotly-plot .nsewdrag').boundingBox()
await page.mouse.move(plotBox.x + plotBox.width * 0.82, plotBox.y + plotBox.height * 0.5)
await page.waitForTimeout(1100)
const hover = await page.evaluate(() =>
  [...document.querySelectorAll('.hoverlayer text')].map((t) => t.textContent.trim()).filter(Boolean),
)
check(/\d{2}\.\d{2}\.\d{4}/.test(hover[0] ?? ''), 'hover header names the exact reference date',
  hover[0] ?? '(no hover)')
check(/\d\s\d{3}|\d{3}\s\d{3}/.test(hover[1] ?? ''), 'hover figures use the same separators as the tables',
  hover[1] ?? '')
await page.mouse.move(5, 5)
await page.waitForTimeout(400)

// Annual ticks were auto-thinned by Plotly before; they are now explicit, so
// they need the same overlap guard as the quarterly axis.
const annualTicks = await page.evaluate(() => {
  const t = [...document.querySelectorAll('.js-plotly-plot .xtick text')]
    .map((e) => e.getBoundingClientRect())
    .sort((a, b) => a.left - b.left)
  let overlaps = 0
  for (let i = 1; i < t.length; i += 1) if (t[i].left < t[i - 1].right) overlaps += 1
  return { count: t.length, overlaps }
})
check(annualTicks.overlaps === 0, 'annual tick labels do not overlap',
  `${annualTicks.overlaps} of ${annualTicks.count}`)

// Quarterly year ticks must not collide at the narrower chart width.
await page.getByRole('button', { name: 'Quartalsweise' }).click()
await page.waitForTimeout(2400)
const ticks = await page.evaluate(() => {
  const t = [...document.querySelectorAll('.js-plotly-plot .xtick text')]
    .map((e) => ({ text: e.textContent, box: e.getBoundingClientRect() }))
    .sort((a, b) => a.box.left - b.box.left)
  let overlaps = 0
  for (let i = 1; i < t.length; i += 1) {
    if (t[i].box.left < t[i - 1].box.right) overlaps += 1
  }
  return { count: t.length, overlaps, labels: t.map((x) => x.text) }
})
check(ticks.count >= 3, 'quarterly axis is labelled', `${ticks.count} ticks`)
check(ticks.overlaps === 0, 'quarterly tick labels do not overlap',
  `${ticks.overlaps} overlapping of ${ticks.count}: ${ticks.labels.join(',')}`)

// Quarterly is the tallest the chart card gets (its note wraps to two lines), so
// it is the case that used to overflow the row and be clipped by the table card.
const clipping = await page.evaluate(() => {
  const card = document.querySelector('.chart-card').getBoundingClientRect()
  const plot = document.querySelector('.js-plotly-plot').getBoundingClientRect()
  const mapCard = document.querySelector('.map-card').getBoundingClientRect()
  const canvas = document.querySelector('.map-canvas').getBoundingClientRect()
  const table = document.querySelector('.detail-table').closest('.v-card').getBoundingClientRect()
  const note = [...document.querySelectorAll('.chart-card .text-caption')].at(-1)?.getBoundingClientRect()
  return {
    plotOver: Math.round(plot.bottom - card.bottom),
    noteOver: note ? Math.round(note.bottom - card.bottom) : 0,
    mapOver: Math.round(canvas.bottom - mapCard.bottom),
    tableOverlap: Math.round(Math.max(card.bottom, mapCard.bottom) - table.top),
  }
})
check(clipping.plotOver <= 0, 'chart plot not clipped by its card', `${clipping.plotOver}px over`)
check(clipping.noteOver <= 0, 'chart note not clipped by its card', `${clipping.noteOver}px over`)
check(clipping.mapOver <= 1, 'map canvas not clipped by its card', `${clipping.mapOver}px over`)
check(clipping.tableOverlap <= 0, 'table card does not cover the row above',
  `${clipping.tableOverlap}px overlap`)
await page.getByRole('button', { name: 'Jährlich' }).click()
await page.waitForTimeout(1400)

// Map and chart must occupy the same vertical band in row one.
const sideBySide = await page.evaluate(() => {
  const map = document.querySelector('.map-card').getBoundingClientRect()
  const chart = document.querySelector('.chart-card').getBoundingClientRect()
  return { overlap: Math.min(map.bottom, chart.bottom) - Math.max(map.top, chart.top), chartH: chart.height }
})
check(sideBySide.overlap > 100, 'map and chart share one view (side by side)',
  `overlap=${Math.round(sideBySide.overlap)}`)

// Controls must not truncate their own labels.
const clipped = await page.evaluate(() =>
  [...document.querySelectorAll('.v-select__selection-text')]
    .map((e) => ({ text: e.textContent.trim(), clipped: e.scrollWidth > e.clientWidth + 1 }))
    .filter((x) => x.clipped),
)
check(clipped.length === 0, 'no select label is truncated', JSON.stringify(clipped))

// The hint belongs with the map it describes.
const hint = await page.evaluate(() => {
  const map = document.querySelector('.map-card').getBoundingClientRect()
  const el = [...document.querySelectorAll('.text-caption')].find((e) =>
    /anklicken|Click a region/.test(e.textContent),
  )
  if (!el) return null
  const b = el.getBoundingClientRect()
  return { gap: Math.round(b.top - map.bottom), aligned: Math.abs(b.left - map.left) < 6 }
})
check(hint !== null && hint.gap >= 0 && hint.gap < 40 && hint.aligned,
  'hint sits directly below the map', JSON.stringify(hint))

// Hover tooltip: readable in the active theme, and unit-correct per metric.
async function tooltip() {
  // The zoom checks above leave the camera zoomed in, which would put the hover
  // point off-canvas; reset so the helper is self-contained.
  await page.evaluate(() =>
    window.__aptMap.fitBounds([[9.3, 46.2], [17.4, 49.2]], { padding: 24, duration: 0 }),
  )
  await page.waitForTimeout(700)
  const box = await page.locator('.map-canvas').boundingBox()
  const pt = await page.evaluate(() => {
    const q = window.__aptMap.project([14.3, 48.05])
    return { x: q.x, y: q.y }
  })
  await page.mouse.move(box.x + pt.x, box.y + pt.y)
  await page.waitForTimeout(900)
  return page.evaluate(() => {
    const el = document.querySelector('.maplibregl-popup-content')
    const inner = document.querySelector('.map-tip')
    if (!el || !inner) return null
    const parse = (c) => c.match(/\d+/g).slice(0, 3).map(Number)
    const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b
    const bg = parse(getComputedStyle(el).backgroundColor)
    const fg = parse(getComputedStyle(inner).color)
    return { text: inner.textContent.replace(/\s+/g, ' ').trim(), delta: Math.abs(lum(bg) - lum(fg)) }
  })
}

const tipLight = await tooltip()
check((tipLight?.delta ?? 0) > 100, 'tooltip readable in light mode', `luminance delta ${Math.round(tipLight?.delta ?? 0)}`)
check(/%/.test(tipLight?.text ?? ''), 'percent metric tooltip carries %', tipLight?.text)

await page.locator('button[aria-label="Darstellung"], button[aria-label="Appearance"]').first().click()
await page.waitForTimeout(1600)
const tipDark = await tooltip()
check((tipDark?.delta ?? 0) > 100, 'tooltip readable in dark mode', `luminance delta ${Math.round(tipDark?.delta ?? 0)}`)
await page.locator('button[aria-label="Darstellung"], button[aria-label="Appearance"]').first().click()
await page.waitForTimeout(1400)

// Absolute change is a head count and must lose the percent sign.
await page.locator('.v-select').first().click()
await page.waitForTimeout(600)
await page.getByRole('option', { name: 'Absolute Veränderung' }).click()
await page.waitForTimeout(1800)
const tipAbs = await tooltip()
check(!/%/.test(tipAbs?.text ?? ''), 'absolute metric tooltip has no %', tipAbs?.text)
await page.locator('.v-select').first().click()
await page.waitForTimeout(600)
await page.getByRole('option', { name: 'Jährliche Wachstumsrate' }).click()
await page.waitForTimeout(1400)

// List page
await page.goto(BASE + '#/list', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
check((await page.locator('tbody tr').count()) > 0, 'list renders rows')

// Jumping from a Gemeinde in the list to the map used to break the map outright:
// it asked for municipality geometry that does not exist, so nothing rendered and
// clicks stopped working.
await page.locator('.v-select').first().click()
await page.waitForTimeout(600)
await page.getByRole('option', { name: 'Gemeinden' }).click()
await page.waitForTimeout(3500)
await page.locator('tbody tr').first().click()
await page.waitForTimeout(4500)
const handoff = await page.evaluate(() => {
  const m = window.__aptMap
  return {
    rendered: m ? m.queryRenderedFeatures({ layers: ['regions-fill'] }).length : 0,
    highlight: m ? JSON.stringify(m.getFilter('regions-selected')) : '',
    name: document.querySelector('.region-name')?.textContent?.trim(),
    measures: document.querySelectorAll('.detail-table tbody tr').length,
    years: document.querySelectorAll('.detail-table thead th').length - 1,
  }
})
check(handoff.rendered > 100, 'map still renders after a Gemeinde handoff', `${handoff.rendered}`)
check(!/"code"\],""\]/.test(handoff.highlight), 'containing district is outlined', handoff.highlight)
check(handoff.measures === 3 && handoff.years === 10, 'Gemeinde detail table populated',
  `${handoff.measures} measures x ${handoff.years} years`)

// ... and the map must remain clickable afterwards.
const box2 = await page.locator('.map-canvas').boundingBox()
const pt2 = await page.evaluate(() => {
  const q = window.__aptMap.project([16.37, 48.21])
  return { x: q.x, y: q.y }
})
await page.mouse.click(box2.x + pt2.x, box2.y + pt2.y)
await page.waitForTimeout(1600)
const afterClick = await page.evaluate(() => document.querySelector('.region-name')?.textContent?.trim())
check(afterClick !== handoff.name, 'map clicks still work after handoff', `${afterClick}`)

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
