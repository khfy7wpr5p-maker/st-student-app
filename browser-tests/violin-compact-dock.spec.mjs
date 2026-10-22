import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import { startRepositoryStaticServer } from './support/static-server.mjs';

test('long violin score keeps measures 21 and 24 beside the compact dock across phone orientations', { timeout: 120000 }, async () => {
  const server = await startRepositoryStaticServer();
  const engine = process.env.ST_BROWSER ?? 'chromium';
  let browser;
  try {
    browser = await ({ chromium, webkit }[engine]).launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 680 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const fixture = await readFile(new URL('./support/student-app-e2e-fixtures.mjs', import.meta.url), 'utf8');
    const note = '<note><pitch><step>E</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>';
    const xml = '<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Violin</part-name></score-part></part-list><part id="P1">' +
      Array.from({ length: 28 }, (_, i) => `<measure number="${i+1}">${i===0 ? '<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>' : ''}${note.repeat(4)}</measure>`).join('') + '</part></score-partwise>';
    await page.route('**/student-app-e2e-fixtures.mjs', route => route.fulfill({ contentType: 'application/javascript', body: fixture
      .replace('scoreXml: SCORE_XML_A,', `scoreXml: ${JSON.stringify(xml)},`)
      .replace('canonicalEvents: Object.freeze([]),', 'violin: Object.freeze({ schemaVersion: 1, targetPartId: "P1", position: 1 }), canonicalEvents: Object.freeze([]),') }));
    const bootstrap = await readFile(new URL('./support/student-app-e2e-bootstrap.mjs', import.meta.url), 'utf8');
    await page.route('**/student-app-e2e-bootstrap.mjs', route => route.fulfill({ contentType: 'application/javascript', body: bootstrap + '\nglobalThis.__SES252__ = {controller, playbackPort};' }));
    await page.route('**/src/ui/main.js', route => route.fulfill({ contentType: 'application/javascript', body: 'import "/browser-tests/support/student-app-e2e-bootstrap.mjs";' }));
    await page.goto(server.baseUrl + '/index.html');
    await page.locator('[data-sign-in-email]').fill('student-a@ses13.test');
    await page.locator('[data-sign-in-password]').fill('ses13-password');
    await page.getByRole('button', { name: 'Giriş Yap', exact: true }).click();
    await page.getByRole('button', { name: 'Benim Çalışmalarım', exact: true }).click();
    await page.locator('[data-action="open-piece"]').filter({ hasText: 'SES-13 Öğrenci A Etüdü' }).click();
    await page.locator('#st-score-root svg').first().waitFor();
    await page.getByRole('button', { name: 'Dinle', exact: true }).click();
    await page.evaluate(() => {
      const t=globalThis.__SES252__;
      t.playbackPort.subscribePositionForPackage(t.controller.getScoreFollowSource().pkg, p => t.position=p);
    });
    await mkdir('test-results/ses252', { recursive: true });
    for (const [width,height] of [[320,568],[390,680],[844,390],[568,320]]) {
      await page.setViewportSize({width,height});
      for (const index of [20,23]) {
        await page.evaluate(async index => {
          const t=globalThis.__SES252__; t.position=null;
          await t.playbackPort.playMeasureOnceForPackage(t.controller.getScoreFollowSource().pkg, { startBeat: index*4, endBeat: index*4+4 });
        }, index);
        await page.waitForFunction(index => globalThis.__SES252__.position?.beat >= index*4 && globalThis.__SES252__.position?.beat < index*4+4, index);
        await page.waitForFunction(() => {
          const cursor=document.querySelector('#st-score-root img[id^="cursorImg-"]');
          const dock=document.querySelector('[data-violin-dock]');
          if (!cursor || !dock) return false;
          const c=cursor.getBoundingClientRect(),d=dock.getBoundingClientRect();
          return c.height>0 && c.top>=0 && c.bottom<=d.top && d.bottom<=innerHeight+1;
        });
        const board=await page.locator('.practice-violin-compact').boundingBox();
        assert.ok(board.height <= 145, `compact board height at ${width}x${height}: ${board.height}`);
        assert.match(await page.locator('[data-violin-fingerboard]').textContent(), /Mi · Açık Mi teli · 0/);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({path:`test-results/ses252/${engine}-${width}x${height}-measure-${index+1}.png`});
      }
    }
    await page.getByRole('button', { name: 'Duraklat', exact: true }).click();
    const before=await page.evaluate(() => ({scroll:scrollY,beat:globalThis.__SES252__.position.beat}));
    const scroll=before.scroll, beat=before.beat;
    await page.getByRole('button', {name:'Keman klavyesini genişlet',exact:true}).click();
    assert.equal(await page.locator('[data-violin-detail]').isVisible(),true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('[data-violin-detail]').isVisible(),false);
    assert.equal(await page.evaluate(()=>scrollY),scroll);
    assert.equal(await page.evaluate(()=>globalThis.__SES252__.position.beat),beat);
    assert.equal(await page.locator('[data-action="toggle-violin-detail"]').evaluate(e=>document.activeElement===e),true);
    await page.getByRole('button',{name:'Odak',exact:true}).click();
    assert.equal(await page.locator('[data-violin-dock]').isVisible(),true);
    assert.deepEqual(errors,[]);
    await context.close();
  } finally { await browser?.close(); await server.close(); }
});
