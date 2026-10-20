import test from 'node:test';
import assert from 'node:assert/strict';
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
    await page.getByRole('button', { name: 'Benim Çalışmalarım', exact: true }).click();
    await page.getByRole('button', { name: 'SES-13 Öğrenci A Etüdü', exact: true }).click();
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
    await page.getByRole('button', { name: 'Dinle', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#st-score-root [data-st-score-highlight="true"]'));
    await page.getByRole('button', { name: 'Duraklat', exact: true }).click();
    await page.getByLabel('Tempo', { exact: true }).fill('72');
    await page.getByRole('button', { name: 'Tempoyu uygula', exact: true }).click();
    assert.equal(await page.getByLabel('Tempo', { exact: true }).inputValue(), '72');
    assert.equal(await page.locator('.piece-workspace').getAttribute('data-focus-mode'), 'true');
    await page.getByLabel('Ölçü tekrarını aç', { exact: true }).check();
    assert.equal(await page.getByLabel('Ölçü tekrarını aç', { exact: true }).isChecked(), true);
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no horizontal overflow at ${width}`);
      const controls = await page.locator('.practice-playback').boundingBox();
      assert.ok(controls.y >= 0 && controls.y + controls.height <= 845, `visible playback controls at ${width}`);
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
    await page.getByRole('button', { name: 'SES-13 Öğrenci A Etüdü', exact: true }).click();
    assert.equal(await page.locator('.piece-workspace').getAttribute('data-focus-mode'), 'false');
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await server.close();
  }
});
