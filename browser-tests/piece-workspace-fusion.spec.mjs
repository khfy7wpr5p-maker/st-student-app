import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import { startRepositoryStaticServer } from './support/static-server.mjs';

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
