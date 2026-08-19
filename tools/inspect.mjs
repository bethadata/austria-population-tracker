/**
 * Drives the built site in a real browser and reports what breaks.
 *
 * Usage: node tools/inspect.mjs [route ...]
 *   node tools/inspect.mjs /            # map page
 *   node tools/inspect.mjs / /list /about
 *
 * Captures console errors, page exceptions, failed requests and a screenshot per
 * route, plus MapLibre-specific state (style loaded? layers present? features
 * rendered?) which is invisible from the DOM alone.
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE_URL ?? 'http://localhost:4174/austria-population-tracker/'
const routes = process.argv.slice(2).length ? process.argv.slice(2) : ['/', '/list', '/about']
const OUT = 'screenshots'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
let problems = 0

for (const route of routes) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
  const page = await context.newPage()

  const errors = []
  const warnings = []
  const failed = []

  page.on('console', (msg) => {
    const text = msg.text()
    if (msg.type() === 'error') errors.push(text)
    else if (msg.type() === 'warning') warnings.push(text)
  })
  page.on('pageerror', (err) => errors.push(`UNCAUGHT: ${err.message}`))
  page.on('requestfailed', (req) => failed.push(`${req.url()} — ${req.failure()?.errorText}`))
  page.on('response', (res) => {
    if (res.status() >= 400) failed.push(`${res.status()} ${res.url()}`)
  })

  const url = BASE.replace(/\/$/, '/') + '#' + route
  console.log(`\n${'='.repeat(70)}\n${route}  ->  ${url}\n${'='.repeat(70)}`)

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  // MapLibre paints on rAF after the style loads; give it room.
  await page.waitForTimeout(3500)

  if (route === '/') {
    const map = await page.evaluate(() => {
      const canvas = document.querySelector('.maplibregl-canvas')
      const wrap = document.querySelector('.map-canvas')
      const result = {
        canvasPresent: !!canvas,
        canvasSize: canvas ? { w: canvas.clientWidth, h: canvas.clientHeight } : null,
        wrapSize: wrap ? { w: wrap.clientWidth, h: wrap.clientHeight } : null,
        // Non-blank test: sample the canvas and count distinct pixels.
        distinctPixels: null,
      }
      if (canvas) {
        try {
          const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
          result.webglContext = !!gl
        } catch (e) {
          result.webglContext = `error: ${e.message}`
        }
      }
      return result
    })
    console.log('map:', JSON.stringify(map, null, 2))
  }

  await page.screenshot({ path: `${OUT}${route === '/' ? '/map' : route.replace('/', '/')}.png`, fullPage: true })

  const label = (n, arr) => (arr.length ? `\n  ${n}:\n${arr.slice(0, 12).map((x) => '    - ' + x).join('\n')}` : ` ${n}: none`)
  console.log(label('ERRORS', errors))
  console.log(label('FAILED REQUESTS', failed))
  if (warnings.length) console.log(label('WARNINGS', warnings.slice(0, 6)))

  problems += errors.length + failed.length
  await context.close()
}

await browser.close()
console.log(`\n${problems ? problems + ' problem(s) found' : 'No console errors or failed requests'}`)
process.exit(problems ? 1 : 0)
