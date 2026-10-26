import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { after, before, test } from 'node:test'
import { chromium, webkit } from 'playwright'
import { startRepositoryStaticServer } from './support/static-server.mjs'

// Independently checked with standard open-string MIDI [64, 59, 55, 50, 45, 40].
// Source-sounding pitches: E4 D4 E4 | E4 A3 (E2 + G3).
// This original two-measure example includes all strings, zero, two-digit
// frets, a chord, and separate notation/TAB voices (1 and 5).
const EXPECTED = [
  [[{ string: 1, fret: '0' }], [{ string: 2, fret: '3' }], [{ string: 3, fret: '9' }]],
  [[{ string: 4, fret: '14' }], [{ string: 5, fret: '12' }],
    [{ string: 3, fret: '0' }, { string: 6, fret: '0' }]],
]
const xml = await readFile(new URL('./fixtures/tab-string-fret.musicxml', import.meta.url), 'utf8')
let server
before(async () => { server = await startRepositoryStaticServer() })
after(async () => { await server?.close() })

for (const width of [390, 1280]) {
  test(`SES-228 renders every exact fret on its assigned string across both measures at ${width}px`,
    { timeout: 60_000 }, async () => {
      const browserName = process.env.ST_BROWSER ?? 'chromium'
      const browserType = { chromium, webkit }[browserName]
      assert.ok(browserType, `Unsupported ST_BROWSER: ${browserName}`)
      const browser = await browserType.launch({ headless: true,
        ...(browserName === 'chromium' && process.env.ST_CHROMIUM_EXECUTABLE_PATH
          ? { executablePath: process.env.ST_CHROMIUM_EXECUTABLE_PATH } : {}),
      })
      try {
        const page = await browser.newPage({ viewport: { width, height: 844 } })
        const errors = []
        page.on('pageerror', error => errors.push(error.message))
        await page.goto(`${server.baseUrl}/vendor/st-score-runtime/index.html`)
        await page.locator('html[data-st-score-runtime-ready="true"]').waitFor()
        const result = await page.evaluate(musicxml =>
          globalThis.__ST_SCORE_RENDER_HOST__.renderMusicXml({
            contractVersion: '0.2.0', musicxml, ticket: '228',
            pageMode: 'continuous', autoResize: true, drawTitle: false, drawComposer: false,
          }), xml)
        assert.equal(result.contractVersion, '0.2.0')
        assert.ok(result.renderEpoch)
        const actual = await page.locator('#st-score-root svg .vf-measure').evaluateAll(measures =>
          measures.filter(measure => measure.querySelector('.vf-tabnote')).map(measure => {
            // Read the six painted horizontal staff lines, then locate each
            // visible numeral against them. No source pitch or renderer model
            // is used to compute the expected string/fret values.
            const lines = [...measure.querySelectorAll(':scope > path')].map(path => {
              const start = path.getPointAtLength(0)
              const end = path.getPointAtLength(path.getTotalLength())
              return Math.abs(end.y - start.y) < 0.01 && end.x - start.x > 50 ? start.y : null
            }).filter(y => y !== null).sort((a, b) => a - b)
            const onsets = [...measure.querySelectorAll('.vf-tabnote')].map(group => {
              const notes = [...group.querySelectorAll('text')].map(text => {
                const box = text.getBBox()
                const center = box.y + box.height / 2
                const distances = lines.map(y => Math.abs(center - y))
                const nearest = Math.min(...distances)
                return {
                  string: distances.indexOf(nearest) + 1,
                  fret: text.textContent.trim(),
                  visible: box.width > 0 && box.height > 0 &&
                    getComputedStyle(text).visibility === 'visible' &&
                    getComputedStyle(text).display !== 'none',
                  onLine: nearest < (lines[1] - lines[0]) / 2,
                }
              }).sort((a, b) => a.string - b.string)
              return { x: group.getBBox().x, notes }
            })
            return { lineCount: lines.length, onsets }
          }))
        assert.equal(actual.length, 2, 'both measures must render, with no extra TAB measures')
        for (const [index, measure] of actual.entries()) {
          assert.equal(measure.lineCount, 6)
          assert.equal(measure.onsets.length, 3)
          for (let i = 1; i < measure.onsets.length; i++) {
            assert.ok(measure.onsets[i].x > measure.onsets[i - 1].x, 'quarter-note order must advance')
          }
          assert.ok(measure.onsets.flatMap(onset => onset.notes).every(note => note.visible && note.onLine))
          assert.deepEqual(measure.onsets.map(onset => onset.notes.map(({ string, fret }) => ({ string, fret }))),
            EXPECTED[index], `measure ${index + 1}: every visible numeral must match its exact string`)
        }
        assert.deepEqual(errors, [])
      } finally { await browser.close() }
    })
}
