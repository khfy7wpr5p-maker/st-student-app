import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';
import { startRepositoryStaticServer } from './support/static-server.mjs';
import { createChordBoardViewModel } from '../src/ui/chordBoardViewModel.js';
import { renderStudentApp } from '../src/ui/renderStudentApp.js';
import { STUDENT_APP_SCREENS } from '../src/ui/studentAppController.js';
import { renderPracticeWorkspace } from '../src/ui/renderPracticeWorkspace.js';
import { makeChordBoardPracticeItem } from '../test/support/chordBoardFixtures.js';

const engine = process.env.ST_BROWSER ?? 'chromium';
const browserType = { chromium, webkit }[engine];

function chord(high = false) {
  const item = makeChordBoardPracticeItem();
  if (high) {
    item.package.title = 'A Akor Çalışması';
    item.package.content.chordBoard.voicing = {
      frets: [5, 7, 7, 6, 5, 5], fingers: [1, 3, 4, 2, 1, 1],
      barres: [{ finger: 1, fret: 5, fromString: 6, toString: 1 }],
    };
    item.package.content.chordBoard.chord.displaySymbol = 'A';
  }
  return createChordBoardViewModel(item);
}

function state(mode, high = false) {
  const view = chord(high);
  const common = { student08: true, session: { studentId: 'material-fixture' }, items: [], practice: null };
  if (mode === 'standalone') return { ...common, screen: STUDENT_APP_SCREENS.CHORD_BOARD, chordBoard: view };
  return {
    ...common, screen: STUDENT_APP_SCREENS.PIECE_WORKSPACE, pieceWorkspace: {
      pieceAssignmentId: 'fixture-piece', title: 'Akor görsel kontrolü', teacherNote: '60 BPM ile çalış.',
      selectedView: 'CHORDS', selectedChordId: view.assignmentId,
      availableViews: { score: false, chords: true },
      score: { status: 'UNAVAILABLE', practice: null },
      chords: { status: 'AVAILABLE', items: [view] },
    },
  };
}

async function fixtureServer() {
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const pieceCss = await readFile(new URL('../src/ui/piece-workspace-fusion.css', import.meta.url), 'utf8');
  const styles = `${index.match(/<style>([\s\S]*?)<\/style>/)[1]}\n${pieceCss}`;
  const document = body => `<!doctype html><html lang="tr"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${styles}</style></head><body><div id="app">${body}</div></body></html>`;
  const htmlRoutes = {};
  for (const mode of ['standalone', 'piece']) {
    for (const high of [false, true]) {
      htmlRoutes[`/${mode}-${high ? 'high' : 'open'}`] = document(renderStudentApp(state(mode, high)));
    }
  }
  htmlRoutes['/coexisting'] = document(`<main class="student-app"><section class="piece-workspace">${renderPracticeWorkspace({
    capabilities: { notation: 'AVAILABLE', violin: 'AVAILABLE', playback: 'AVAILABLE' }, practice: { tempoBpm: 60 },
  })}</section></main><div id="chord-siblings"></div>`);
  return startRepositoryStaticServer({ htmlRoutes });
}

test('both Student chord views keep exact labels and readable materials on phone, landscape and iPad', { timeout: 90_000 }, async () => {
  const server = await fixtureServer();
  let browser;
  try {
    browser = await browserType.launch({ headless: true });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await mkdir('test-results/chord-materials', { recursive: true });
    for (const mode of ['standalone', 'piece']) {
      for (const high of [false, true]) {
        await page.goto(`${server.baseUrl}/${mode}-${high ? 'high' : 'open'}`);
        const svg = page.getByRole('img', { name: high ? 'A gitar akor diyagramı, 5. perdeden' : 'Am gitar akor diyagramı, açık pozisyon' });
        assert.deepEqual(await svg.locator('.string-number').allTextContents(), ['6', '5', '4', '3', '2', '1']);
        assert.deepEqual(await svg.locator('.fret-number').allTextContents(), high ? ['5', '6', '7', '8', '9'] : ['1', '2', '3', '4', '5']);
        assert.equal(await svg.locator('.nut-body').count(), high ? 0 : 1);
        assert.equal(await svg.locator('.open-mark').count(), high ? 0 : 2);
        assert.equal(await svg.locator('.mute-mark').count(), high ? 0 : 1);
        assert.equal(await page.getByRole('list', { name: 'Gitar telleri' }).locator('li').count(), 6);
        if (high) {
          assert.equal(await svg.locator('[data-fret="5"][data-from-string="6"][data-to-string="1"]').count(), 1);
          assert.match(await page.getByRole('list', { name: 'Bare bilgisi' }).textContent(), /1\. parmak bare: 5\. perde, 6\. telden 1\. tele/);
        }
        for (const [width, height] of [[320, 568], [390, 844], [844, 390], [768, 1024]]) {
          await page.setViewportSize({ width, height });
          const metrics = await svg.evaluate(svg => {
            const box = svg.getBoundingClientRect();
            const labels = [...svg.querySelectorAll('.finger-number,.fret-number,.string-number')];
            return {
              overflow: document.documentElement.scrollWidth > innerWidth,
              labelsInside: labels.every(label => {
                const r = label.getBoundingClientRect();
                return r.width > 0 && r.left >= box.left && r.right <= box.right && r.top >= box.top && r.bottom <= box.bottom;
              }),
              minimumFont: Math.min(...labels.map(label => parseFloat(getComputedStyle(label).fontSize) * svg.getScreenCTM().a)),
              stringWidths: [...svg.querySelectorAll('.string-line')].map(line => parseFloat(getComputedStyle(line).strokeWidth)),
              woundStrings: svg.querySelectorAll('.string-winding').length,
            };
          });
          assert.equal(metrics.overflow, false, `${mode} ${width}: no horizontal page overflow`);
          assert.equal(metrics.labelsInside, true, `${mode} ${width}: all labels remain inside SVG`);
          assert.ok(metrics.minimumFont >= 12, `${mode} ${width}: minimum rendered label font ${metrics.minimumFont}px`);
          assert.ok(metrics.stringWidths.every((v, i, all) => i === 0 || v < all[i - 1]), 'six strings retain decreasing physical thickness');
          assert.equal(metrics.woundStrings, 3);
          await svg.scrollIntoViewIfNeeded();
          await page.screenshot({ path: `test-results/chord-materials/${engine}-${mode}-${high ? 'high' : 'open'}-${width}x${height}.png`, fullPage: true });
        }
      }
    }
    assert.deepEqual(errors, []);
  } finally { await browser?.close(); await server.close(); }
});

test('simultaneous chord materials leave the accepted violin and score presentation unchanged', async () => {
  const server = await fixtureServer();
  let browser;
  try {
    browser = await browserType.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${server.baseUrl}/coexisting`);
    await page.evaluate(async () => {
      const { createViolinFingerboardPresentation } = await import('/src/ui/violinFingerboard.js');
      const { resolveFirstPositionNote } = await import('/vendor/st-violin-learning/src/firstPosition.js');
      const note = resolveFirstPositionNote({ noteId: 'material-example', pitch: { step: 'F', alter: 1, octave: 5 } });
      createViolinFingerboardPresentation({ root: document }).show({ state: 'AVAILABLE', playing: false, pitch: note.pitch, primary: note.primary });
      document.querySelector('#st-score-root').innerHTML = '<svg viewBox="0 0 320 90"><path d="M10 30H310M10 40H310M10 50H310M10 60H310M10 70H310" stroke="#000" fill="none"/><text x="28" y="48">𝄞</text></svg>';
      globalThis.presentationSnapshot = () => [...document.querySelectorAll('.violin-fingerboard-svg *,#st-score-root svg *')].map(node => {
        const style = getComputedStyle(node), box = node.getBoundingClientRect();
        return [node.outerHTML, style.fill, style.stroke, style.filter, style.fontSize, box.x, box.y, box.width, box.height];
      });
    });
    const before = await page.evaluate(() => globalThis.presentationSnapshot());
    await page.evaluate(async states => {
      const { renderStudentApp } = await import('/src/ui/renderStudentApp.js');
      document.querySelector('#chord-siblings').innerHTML = states.map(state => renderStudentApp(state)).join('');
    }, [state('standalone'), state('standalone', true)]);
    assert.deepEqual(await page.evaluate(() => globalThis.presentationSnapshot()), before);
    const resources = await page.locator('.chord-diagram').evaluateAll(svgs => {
      const ids = svgs.flatMap(svg => [...svg.querySelectorAll('[id]')].map(node => node.id));
      return { unique: ids.length === new Set(ids).size, local: svgs.every(svg => {
        const own = new Set([...svg.querySelectorAll('[id]')].map(node => node.id));
        return [...svg.outerHTML.matchAll(/url\(#([^\)]+)\)/g)].every(match => own.has(match[1]));
      }) };
    });
    assert.deepEqual(resources, { unique: true, local: true });
  } finally { await browser?.close(); await server.close(); }
});

test('a fresh document reopens cached chord materials when the origin is unavailable', { timeout: 90_000 }, async () => {
  const blank = '<!doctype html><html lang="tr"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>';
  const server = await startRepositoryStaticServer({ htmlRoutes: { '/': blank, '/vendor/st-score-runtime/index.html': blank } });
  let browser;
  try {
    browser = await browserType.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto(`${server.baseUrl}/vendor/st-score-runtime/index.html`);
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/service-worker.js', { scope: '/' });
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    const cachedPaths = await page.evaluate(async () => {
      const shell = await caches.open('st-student-shell-v51');
      return (await shell.keys()).map(request => new URL(request.url).pathname);
    });
    // WebKit's network emulation also disables its service worker. As in the
    // existing offline runtime tests, make the origin unavailable with 503s
    // and require every shell request to be served without reaching it.
    server.blockPaths([...cachedPaths, '/uncached-chord-network-probe']);
    if (engine === 'chromium') await context.setOffline(true);
    await page.close();
    const reopened = await context.newPage();
    await reopened.goto(`${server.baseUrl}/`);
    const result = await reopened.evaluate(async state => {
      const index = await (await fetch('/index.html')).text();
      const { renderStudentApp } = await import('/src/ui/renderStudentApp.js');
      document.head.insertAdjacentHTML('beforeend', `<style>${index.match(/<style>([\s\S]*?)<\/style>/)[1]}</style>`);
      document.body.innerHTML = `<div id="app">${renderStudentApp(state)}</div>`;
      // A cached navigation can report navigator.onLine=true in Chromium even
      // while network emulation blocks requests. Probe an uncached URL instead.
      const networkBlocked = await fetch('/uncached-chord-network-probe').then(response => response.status === 503, () => true);
      return { networkBlocked, caches: await caches.keys(), material: getComputedStyle(document.querySelector('.finger-mark')).fill };
    }, state('standalone', true));
    assert.equal(result.networkBlocked, true);
    assert.ok(result.caches.includes('st-student-shell-v51'));
    assert.match(result.material, /url\(/);
    assert.deepEqual(await reopened.locator('.fret-number').allTextContents(), ['5', '6', '7', '8', '9']);
    assert.equal(await reopened.locator('.string-winding').count(), 3);
    assert.equal(await reopened.locator('.finger-number').first().evaluate(node => getComputedStyle(node).fill), 'rgb(24, 27, 23)');
    assert.deepEqual(server.getBlockedRequests().filter(path => path !== '/uncached-chord-network-probe'), [], 'cached shell and module graph never reach the unavailable origin');
    await context.close();
  } finally { await browser?.close(); await server.close(); }
});
