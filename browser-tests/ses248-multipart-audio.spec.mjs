import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import { startRepositoryStaticServer } from './support/static-server.mjs';

test('SES-248 selected violin and piano pilot produce native audio with current Student controls', { timeout: 120000 }, async () => {
  const server = await startRepositoryStaticServer();
  let browser;
  try {
    browser = await ({ chromium, webkit }[process.env.ST_BROWSER ?? 'chromium']).launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors = [], sampleUrls = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', req => { if (req.url().startsWith('https://raw.githubusercontent.com/')) sampleUrls.push(req.url()); });
    await page.addInitScript(() => {
      const proof = { starts: [], analysers: [] };
      globalThis.__SES248_AUDIO__ = proof;
      const connect = AudioNode.prototype.connect;
      AudioNode.prototype.connect = function(destination, ...args) {
        if (destination === this.context.destination) {
          const analyser = this.context.createAnalyser();
          connect.call(this, analyser); connect.call(analyser, destination);
          proof.analysers.push(analyser); return destination;
        }
        return connect.call(this, destination, ...args);
      };
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function(...args) {
        const result = start.apply(this, args);
        proof.starts.push({ when: args[0], frames: this.buffer?.length });
        return result;
      };
    });
    const xml = await readFile(new URL('../test/fixtures/ses248/violin-piano.musicxml', import.meta.url), 'utf8');
    const expected = JSON.parse(await readFile(new URL('../test/fixtures/ses248/expected-events.json', import.meta.url), 'utf8'));
    const fixtures = await readFile(new URL('./support/student-app-e2e-fixtures.mjs', import.meta.url), 'utf8');
    await page.route('**/student-app-e2e-fixtures.mjs', route => route.fulfill({ contentType: 'application/javascript', body: fixtures
      .replace('scoreXml: SCORE_XML_A,', `scoreXml: ${JSON.stringify(xml)},`)
      .replace('tabXml: TAB_XML_A,', 'tabXml: null,')
      .replace('schemaVersion: "1.0.0",', 'schemaVersion: "1.0.0", playbackInstrument: "VIOLIN",')
      .replace('canonicalEvents: Object.freeze([]),', 'violin: Object.freeze({ schemaVersion: 1, targetPartId: "P1", position: 1 }), canonicalEvents: Object.freeze([]),') }));
    await page.route('**/src/ui/main.js', route => route.fulfill({ contentType: 'application/javascript', body: 'import "/browser-tests/support/student-app-e2e-bootstrap.mjs";' }));
    await page.goto(server.baseUrl + '/index.html');
    await page.evaluate(async () => { globalThis.__SES248__ = await import('/browser-tests/support/student-app-e2e-bootstrap.mjs'); });
    await page.locator('[data-sign-in-email]').fill('student-a@ses13.test');
    await page.locator('[data-sign-in-password]').fill('ses13-password');
    await page.getByRole('button', { name: 'Giriş Yap', exact: true }).click();
    await page.getByRole('button', { name: 'Benim Çalışmalarım', exact: true }).click();
    await page.locator('[data-action="open-piece"]').filter({ hasText: 'SES-13 Öğrenci A Etüdü' }).click();
    await page.locator('#st-score-root svg').first().waitFor();
    const actual = await page.evaluate(() => {
      const t = globalThis.__SES248__;
      const pkg = t.controller.getScoreFollowSource().pkg;
      return t.playbackPort.getScoreFollowPlaybackContextForPackage(pkg);
    });
    assert.deepEqual(actual.plan.notes, expected, 'all 189 pitches, onsets, durations and part identities are preserved');
    assert.deepEqual(actual.partInstruments, { P1: 'VIOLIN', P2: 'GRAND_PIANO' });
    await page.getByRole('button', { name: 'Dinle', exact: true }).click();
    await page.waitForFunction(() => {
      const proof = globalThis.__SES248_AUDIO__;
      return globalThis.__SES248__.playbackEngine.getCurrentBeat() > 0 && proof.starts.length >= 2 &&
        proof.starts.every(s => s.frames > 0) && proof.analysers.filter(analyser => {
          const values = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(values);
          return values.some(v => Math.abs(v) > 0.00001);
        }).length >= 2;
    }, null, { timeout: 45000 });
    assert.ok(sampleUrls.some(url => url.includes('/Solo%20Violin/')));
    assert.ok(sampleUrls.some(url => url.includes('/salamander/')));
    await page.locator('[data-violin-fingerboard] [data-playing="true"]').waitFor();
    const violinEvents = await page.evaluate(() => globalThis.__SES248__.violinSnapshots.map(s => s.eventId));
    assert.ok(violinEvents.length > 0);
    assert.ok(violinEvents.every(id => id.startsWith('P1:')), 'piano events never drive the violin board');
    await page.getByRole('button', { name: 'Duraklat', exact: true }).click();
    const paused = await page.evaluate(() => globalThis.__SES248__.playbackEngine.getCurrentBeat());
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => globalThis.__SES248__.playbackEngine.getCurrentBeat()), paused);
    await page.locator('[data-practice-tempo]').fill('72');
    await page.getByRole('button', { name: 'Tempoyu uygula', exact: true }).click();
    await page.locator('[data-action="set-measure-repeat"]').check();
    await page.evaluate(() => {
      globalThis.__SES248_POSITIONS__ = [];
      const t = globalThis.__SES248__;
      t.playbackPort.subscribePositionForPackage(t.controller.getScoreFollowSource().pkg,
        position => globalThis.__SES248_POSITIONS__.push({ beat: position.beat, playing: position.playing }));
    });
    const startsBeforeRestart = await page.evaluate(() => globalThis.__SES248_AUDIO__.starts.length);
    await page.getByRole('button', { name: 'Baştan', exact: true }).click();
    await page.waitForFunction(before => globalThis.__SES248_AUDIO__.starts.length >= before + 2 &&
      globalThis.__SES248__.playbackEngine.getCurrentBeat() > 0.05, startsBeforeRestart);
    const timingBefore = await page.evaluate(() => ({ time: globalThis.__SES248__.audioContextFactory().currentTime,
      beat: globalThis.__SES248__.playbackEngine.getCurrentBeat() }));
    await page.waitForFunction(time => globalThis.__SES248__.audioContextFactory().currentTime >= time + 0.35, timingBefore.time);
    const timingAfter = await page.evaluate(() => ({ time: globalThis.__SES248__.audioContextFactory().currentTime,
      beat: globalThis.__SES248__.playbackEngine.getCurrentBeat() }));
    const beatsPerSecond = (timingAfter.beat - timingBefore.beat) / (timingAfter.time - timingBefore.time);
    assert.ok(Math.abs(beatsPerSecond - 1.2) < 0.1, `72 BPM advances at 1.2 beats/sec: ${beatsPerSecond}`);
    await page.waitForFunction(() => globalThis.__SES248_POSITIONS__.some((p, i, all) =>
      i > 0 && p.playing && all[i - 1].playing && all[i - 1].beat > 2.7 && p.beat < 0.3));
    assert.equal(await page.getByText('Dinleme kullanılamadı.', { exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Duraklat', exact: true }).click();
    const beforeResume = await page.evaluate(() => ({ starts: globalThis.__SES248_AUDIO__.starts.length,
      beat: globalThis.__SES248__.playbackEngine.getCurrentBeat() }));
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Dinle', exact: true }).click();
    await page.waitForFunction(before => globalThis.__SES248_AUDIO__.starts.length > before.starts &&
      globalThis.__SES248__.playbackEngine.getCurrentBeat() > before.beat + 0.05 &&
      globalThis.__SES248_AUDIO__.analysers.filter(analyser => {
        const values = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(values);
        return values.some(v => Math.abs(v) > 0.00001);
      }).length >= 2, beforeResume);
    assert.equal(await page.getByText('Dinleme kullanılamadı.', { exact: true }).count(), 0);
    await context.setOffline(false);
    assert.deepEqual(errors, []);
    await context.close();
  } finally { await browser?.close(); await server.close(); }
});
