/**
 * Mobile audit: the checks that only fail on a phone.
 *
 * Kept separate from smoke.mjs because it needs device emulation (touch, DPR,
 * mobile user agent) rather than just a narrow window.
 */
import { chromium, devices } from '@playwright/test'

const BASE = process.env.BASE_URL ?? 'http://localhost:4174/austria-population-tracker/'
const failures = []
const b = await chromium.launch()

function check(ok, label, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  ' + detail}`)
  if (!ok) failures.push(label)
}

for (const [name, dev] of Object.entries({
  'iPhone SE': devices['iPhone SE'],
  'iPhone 14': devices['iPhone 14'],
  'Pixel 7': devices['Pixel 7'],
})) {
  console.log(`\n--- ${name} (${dev.viewport.width}x${dev.viewport.height}) ---`)
  const ctx = await b.newContext({ ...dev })
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 90)))
  await p.goto(BASE + '#/', { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(4500)

  const m = await p.evaluate(() => {
    const vw = window.innerWidth
    const doc = document.documentElement
    const canvas = document.querySelector('.map-canvas')?.getBoundingClientRect()
    const mapTop = document.querySelector('.map-card')?.getBoundingClientRect().top
    const map = window.__aptMap
    let fill = null
    if (map && canvas) {
      const a = map.project([9.53, 49.02])
      const c = map.project([17.16, 46.37])
      fill = +(((Math.abs(c.x - a.x) * Math.abs(c.y - a.y)) / (canvas.width * canvas.height)).toFixed(2))
    }
    const scroller = document.querySelector('.table-scroll')
    return {
      horizontalScroll: doc.scrollWidth > vw + 2,
      screens: +(doc.scrollHeight / window.innerHeight).toFixed(1),
      mapFullyVisible: (() => {
        const r = document.querySelector('.map-card')?.getBoundingClientRect()
        return r ? r.bottom <= window.innerHeight : false
      })(),
      mapTop: mapTop === undefined ? null : Math.round(mapTop),
      mapFill: fill,
      wastedVertical: canvas && map ? Math.round(canvas.height - Math.abs(map.project([9.53, 49.02]).y - map.project([17.16, 46.37]).y)) : null,
      tableOverflowsX: scroller ? scroller.scrollWidth > scroller.clientWidth + 2 : null,
      cooperative: !!document.querySelector('.maplibregl-cooperative-gesture-screen'),
      modeBar: !!document.querySelector('.modebar'),
    }
  })

  check(!m.horizontalScroll, `${name}: no horizontal page scroll`)
  // Stacked filters can push the map off the first screen entirely. Requiring the
  // whole map to be visible encodes that directly, which a page-length threshold
  // only approximates.
  check(m.mapFullyVisible, `${name}: whole map visible on the first screen`,
    `map top ${m.mapTop}px of ${dev.viewport.height}px`)
  check(m.mapFill !== null && m.mapFill > 0.45, `${name}: map is not mostly empty space`, `fill ${m.mapFill}`)
  check(m.wastedVertical !== null && m.wastedVertical < 120, `${name}: little wasted map height`, `${m.wastedVertical}px`)
  check(m.tableOverflowsX === false, `${name}: year table needs no sideways scrolling`, `${m.tableOverflowsX}`)
  check(m.cooperative, `${name}: map requires two-finger pan (page stays scrollable)`)
  check(!m.modeBar, `${name}: chart mode bar hidden`)
  // Loose balloon guard only. A map, a chart and ten years of figures genuinely
  // need more than two 568px screens; the meaningful requirement is the
  // above-the-fold check, not an arbitrary page length.
  check(m.screens <= 3.0, `${name}: page has not ballooned`, `${m.screens} screens`)
  check(errs.length === 0, `${name}: no page errors`, errs.join(' | '))

  await p.screenshot({ path: `screenshots/mobile-${name.replace(/\s+/g, '')}.png` })
  await ctx.close()
}

await b.close()
console.log(`\n${failures.length ? failures.length + ' FAILED' : 'All mobile checks passed'}`)
process.exit(failures.length ? 1 : 0)
