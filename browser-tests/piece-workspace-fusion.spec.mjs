import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import { startRepositoryStaticServer } from './support/static-server.mjs';

async function assertCursorAligned(page) {
  await page.waitForFunction(() => {
    const cursor = document.querySelector('#st-score-root img[id^="cursorImg-"]');
    const svg = cursor?.parentElement?.querySelector('svg');
    const matrix = svg?.getScreenCTM();
    if (!cursor || !matrix || getComputedStyle(cursor).display === 'none') return false;
    const expected = new DOMPoint(Number.parseFloat(cursor.style.left), Number.parseFloat(cursor.style.top)).matrixTransform(matrix);
    const actual = cursor.getBoundingClientRect();
    return Math.abs(actual.left - expected.x) < 1 && Math.abs(actual.top - expected.y) < 1 &&
      Math.abs(actual.width - cursor.width * matrix.a) < 1 && Math.abs(actual.height - cursor.height * matrix.d) < 1;
  }, null, { timeout: 10000 });
}

async function checkHeldCursorSizing(page) {
  await page.getByRole('button', { name: 'Genişliğe sığdır', exact: true }).click();
  await assertCursorAligned(page);
  const cursor = page.locator('#st-score-root img[id^="cursorImg-"]').first();
  const baseline = await cursor.boundingBox();
  const svg = page.locator('#st-score-root svg').first();
  const svgBaseline = await svg.boundingBox();
  for (const [label, count] of [['Notayı küçült', 4], ['Notayı büyüt', 9]]) {
    for (let i = 0; i < count; i++) await page.getByRole('button', { name: label, exact: true }).click();
    await assertCursorAligned(page);
    const box = await cursor.boundingBox();
    const svgBox = await svg.boundingBox();
    const ratio = svgBox.width / svgBaseline.width;
    assert.ok(Math.abs(box.height / baseline.height - ratio) < 0.02, 'held green cursor scales with the score');
    assert.ok(Math.abs(box.width / baseline.width - ratio) < 0.02, 'held green cursor width scales with the score');
    assert.ok(await page.locator('#st-score-root [data-st-score-highlight="true"]').count() > 0, 'orange note follow survives sizing');
  }
  await page.getByRole('button', { name: 'Genişliğe sığdır', exact: true }).click();
  await assertCursorAligned(page);
}

test('Piece layout keeps real notation, follow, controls and teacher note across focus and chord views', { timeout: 90000 }, async () => {
  const server = await startRepositoryStaticServer();
  let browser;
  try {
    browser = await ({ chromium, webkit }[process.env.ST_BROWSER ?? 'chromium']).launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/src/ui/main.js', route => route.fulfill({ contentType: 'application/javascript', body: 'import "/browser-tests/support/student-app-e2e-bootstrap.mjs";' }));
    await page.goto(`${server.baseUrl}/index.html`);
    await page.locator('[data-sign-in-email]').fill('student-a@ses13.test');
    await page.locator('[data-sign-in-password]').fill('ses13-password');
    await page.getByRole('button', { name: 'Giriş Yap', exact: true }).click();
    await page.getByRole('heading', { name: 'Bugün ne çalıyoruz?', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Benim Çalışmalarım', exact: true }).click();
    await page.getByRole('heading', { name: 'Benim Çalışmalarım', exact: true }).waitFor();
    // The work stylesheet adds a decorative note to the accessible name.
    const piece = page.locator('[data-action="open-piece"]').filter({ hasText: 'SES-13 Öğrenci A Etüdü' });
    await piece.click();
    await page.locator('#st-score-root svg').first().waitFor();
    const note = page.locator('.piece-teacher-note');
    assert.equal(await note.count(), 1);
    const teacherText = await note.innerText();
    const keepSvg = () => page.evaluate(() => { window.pieceSvg = document.querySelector('#st-score-root svg'); });
    await keepSvg();
    const focus = page.getByRole('button', { name: 'Odak', exact: true });
    await focus.click();
    assert.equal(await page.locator('.piece-workspace').getAttribute('data-focus-mode'), 'true');
    assert.equal(await page.evaluate(() => window.pieceSvg === document.querySelector('#st-score-root svg')), true);
    assert.equal(await note.innerText(), teacherText);
    const originalSize = await page.locator('#st-score-root svg').first().boundingBox();
    await page.getByRole('button', { name: 'Notayı büyüt', exact: true }).click();
    assert.equal(await page.locator('[data-piece-notation-size]').innerText(), '110%');
    const largerSize = await page.locator('#st-score-root svg').first().boundingBox();
    assert.ok(largerSize.width > originalSize.width * 1.09);
    assert.equal(await page.evaluate(() => window.pieceSvg === document.querySelector('#st-score-root svg')), true);
    // Measure hit geometry must remain valid after SVG-only sizing.
    const hit = await page.locator('#st-score-root .vf-notehead').first().evaluate(el => {
      const box = el.getBoundingClientRect();
      return globalThis.__ST_SCORE_RENDER_HOST__.hitTestMeasureDetailed({ clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 });
    });
    assert.equal(hit.kind, 'HIT');
    await page.getByRole('button', { name: 'Dinle', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#st-score-root [data-st-score-highlight="true"]'));
    await page.getByRole('button', { name: 'Duraklat', exact: true }).click();
    await checkHeldCursorSizing(page);
    await page.getByLabel('Tempo', { exact: true }).fill('72');
    await page.getByRole('button', { name: 'Tempoyu uygula', exact: true }).click();
    assert.equal(await page.getByLabel('Tempo', { exact: true }).inputValue(), '72');
    assert.equal(await page.locator('.piece-workspace').getAttribute('data-focus-mode'), 'true');
    await page.getByLabel('Ölçü tekrarını aç', { exact: true }).check();
    assert.equal(await page.getByLabel('Ölçü tekrarını aç', { exact: true }).isChecked(), true);
    for (const [width, height] of [[320, 568], [390, 680], [768, 844], [1280, 844], [844, 390], [568, 320]]) {
      await page.setViewportSize({ width, height });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no horizontal overflow at ${width}`);
      const controls = await page.locator('.practice-playback').boundingBox();
      assert.ok(controls.y >= 0 && controls.y + controls.height <= height + 1, `visible playback controls at ${width}x${height}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Odaktan çık', exact: true }).click();
    await page.getByRole('tab', { name: 'Akorlar', exact: true }).click();
    assert.equal(await note.innerText(), teacherText);
    assert.equal(await page.locator('.piece-score-panel').isVisible(), false);
    assert.equal(await page.locator('.chord-diagram').isVisible(), true);
    await page.getByRole('button', { name: 'Odak', exact: true }).click();
    assert.equal(await note.innerText(), teacherText);
    assert.equal(await page.locator('.chord-diagram').isVisible(), true);
    await page.getByRole('tab', { name: 'Nota', exact: true }).click();
    assert.equal(await page.locator('.piece-workspace').getAttribute('data-focus-mode'), 'true');
    await page.getByRole('tab', { name: 'TAB', exact: true }).click();
    await page.locator('#st-score-root .vf-tabnote').first().waitFor();
    await keepSvg();
    await page.getByRole('button', { name: 'Odaktan çık', exact: true }).click();
    assert.equal(await page.evaluate(() => window.pieceSvg === document.querySelector('#st-score-root svg')), true);
    await page.screenshot({ path: '/tmp/student-piece-workspace.png', fullPage: true });
    await page.getByRole('button', { name: '← Geri', exact: true }).click();
    await piece.click();
    assert.equal(await page.locator('.piece-workspace').getAttribute('data-focus-mode'), 'false');
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await server.close();
  }
});

test('real TAB Piece keeps green geometry and orange follow through sizing and actual redraws', { timeout: 90000 }, async () => {
  const server = await startRepositoryStaticServer();
  let browser;
  try {
    browser = await ({ chromium, webkit }[process.env.ST_BROWSER ?? 'chromium']).launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const source = await readFile(new URL('./support/student-app-e2e-fixtures.mjs', import.meta.url), 'utf8');
    const xml = await readFile(new URL('../test/fixtures/score-follow/smellstab-guitar-tab.musicxml', import.meta.url), 'utf8');
    // Unlike the generic shell fixture's independent SCORE/TAB examples,
    // use the same authoritative musical identities for playback and TAB.
    await page.route('**/student-app-e2e-fixtures.mjs', route => route.fulfill({ contentType: 'application/javascript', body: source.replace('scoreXml: SCORE_XML_A,', `scoreXml: ${JSON.stringify(xml)},`).replace('tabXml: TAB_XML_A,', `tabXml: ${JSON.stringify(xml)},`) }));
    await page.route('**/src/ui/main.js', route => route.fulfill({ contentType: 'application/javascript', body: 'import "/browser-tests/support/student-app-e2e-bootstrap.mjs";' }));
    await page.goto(`${server.baseUrl}/index.html`);
    await page.locator('[data-sign-in-email]').fill('student-a@ses13.test');
    await page.locator('[data-sign-in-password]').fill('ses13-password');
    await page.getByRole('button', { name: 'Giriş Yap', exact: true }).click();
    await page.getByRole('button', { name: 'Benim Çalışmalarım', exact: true }).click();
    await page.locator('[data-action="open-piece"]').filter({ hasText: 'SES-13 Öğrenci A Etüdü' }).click();
    await page.getByRole('tab', { name: 'TAB', exact: true }).click();
    await page.locator('#st-score-root .vf-tabnote').first().waitFor();
    await page.getByRole('button', { name: 'Dinle', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#st-score-root .vf-tabnote[data-st-score-highlight="true"]'));
    await page.getByRole('button', { name: 'Duraklat', exact: true }).click();
    await checkHeldCursorSizing(page);
    for (const [width, height] of [[844, 390], [390, 680]]) {
      const oldSvg = await page.locator('#st-score-root svg').first().elementHandle();
      await page.setViewportSize({ width, height });
      await page.waitForFunction(element => !element.isConnected, oldSvg);
      await assertCursorAligned(page);
      assert.ok(await page.locator('#st-score-root .vf-tabnote[data-st-score-highlight="true"]').count() > 0, 'held orange TAB survives actual OSMD redraw');
      await oldSvg.dispose();
    }
    await page.getByRole('button', { name: 'Dinle', exact: true }).click();
    await assertCursorAligned(page);
    await page.getByRole('button', { name: 'Duraklat', exact: true }).click();
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await server.close();
  }
});

test('long Piece scores use document scrolling and keep transport reachable on short phones', { timeout: 90000 }, async () => {
  const server = await startRepositoryStaticServer();
  let browser;
  try {
    browser = await ({ chromium, webkit }[process.env.ST_BROWSER ?? 'chromium']).launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 320, height: 568 } });
    const source = await readFile(new URL('./support/student-app-e2e-fixtures.mjs', import.meta.url), 'utf8');
    const notes = ['C', 'D', 'E', 'F'].map(step => `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>`).join('');
    const tail = Array.from({ length: 15 }, (_, i) => `<measure number="${i + 2}">${notes}</measure>`).join('') + '</part></score-partwise>';
    await page.route('**/student-app-e2e-fixtures.mjs', route => route.fulfill({ contentType: 'application/javascript', body: source.replace('scoreXml: SCORE_XML_A,', `scoreXml: SCORE_XML_A.replace('</part></score-partwise>', ${JSON.stringify(tail)}),`) }));
    await page.route('**/src/ui/main.js', route => route.fulfill({ contentType: 'application/javascript', body: 'import "/browser-tests/support/student-app-e2e-bootstrap.mjs";' }));
    await page.goto(`${server.baseUrl}/index.html`);
    await page.locator('[data-sign-in-email]').fill('student-a@ses13.test');
    await page.locator('[data-sign-in-password]').fill('ses13-password');
    await page.getByRole('button', { name: 'Giriş Yap', exact: true }).click();
    await page.getByRole('button', { name: 'Benim Çalışmalarım', exact: true }).click();
    await page.locator('[data-action="open-piece"]').filter({ hasText: 'SES-13 Öğrenci A Etüdü' }).click();
    await page.locator('#st-score-root svg').first().waitFor();
    assert.ok(await page.locator('#st-score-root .vf-notehead').count() >= 64);
    for (const [width, height] of [[320, 568], [390, 680], [844, 390], [568, 320]]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => scrollTo(0, 0));
      const reading = await page.locator('.practice-notation').boundingBox();
      assert.ok(reading.height > height, 'long score has its natural document height');
      for (const sizeAction of ['Notayı büyüt', 'Genişliğe sığdır']) {
        await page.getByRole('button', { name: sizeAction, exact: true }).click();
        for (const atEnd of [false, true]) {
          await page.evaluate(end => scrollTo(0, end ? document.documentElement.scrollHeight : 0), atEnd);
          const transport = await page.locator('.practice-playback').boundingBox();
          assert.ok(transport.y >= 0 && transport.y + transport.height <= height + 1, `bottom transport at ${width}x${height}, end=${atEnd}`);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        }
      }
    }
    await page.getByRole('button', { name: 'Dinle', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#st-score-root [data-st-score-highlight="true"]'));
    await page.getByRole('button', { name: 'Duraklat', exact: true }).click();
    assert.equal(await page.getByText('Dinleme kullanılamadı.', { exact: true }).count(), 0);
  } finally {
    await browser?.close();
    await server.close();
  }
});
