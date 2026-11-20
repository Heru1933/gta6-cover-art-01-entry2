// End-to-end verification + screenshot capture for the Neon Vice entry.
//
// Drives headless Chrome over the DevTools protocol (via Node's built-in WebSocket —
// nothing to install) against the app served by serve.ts:
//
//   node tools/take-shots.mjs            verify exports, then capture shots.json
//   node tools/take-shots.mjs --verify   export verification only
//   node tools/take-shots.mjs --shots    screenshots only
//
// Verification clicks the app's real export buttons and checks the downloaded PNGs
// (signature + IHDR dimensions), then pushes a photo through the real file input.
// Screenshots land in screenshots/ and must fit the gate's limits: at most 256 KiB,
// long side at most 1280, short side at least 480. Scratch stays on the home
// filesystem because /tmp is a small tmpfs that a browser profile would overflow.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTTP_PORT = 8124;
const CDP_PORT = 9334;
const SCRATCH = join(process.env.HOME, '.nv-scratch');
const CFT = join(SCRATCH, 'chrome-linux64', 'chrome');
const CHROME = process.env.CHROME_BIN || (existsSync(CFT) ? CFT : '/opt/meta-chromium/chrome');
const DOWNLOADS = join(SCRATCH, 'downloads');
const PROFILE = join(SCRATCH, 'chrome-profile');
const SHOT_CAP = 262144;
const shotSpecs = JSON.parse(readFileSync(join(root, 'shots.json'), 'utf8'));
const pageErrors = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(label, fn, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { if (await fn()) return; } catch { /* keep waiting */ }
    await sleep(200);
  }
  throw new Error(`timed out waiting for ${label}`);
}

const server = spawn('node', ['serve.ts', '--port', String(HTTP_PORT)], { cwd: root, stdio: 'ignore' });
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${PROFILE}`, 'about:blank',
], { stdio: 'ignore' });

let ws;
let seq = 0;
const waiters = new Map();

function cdp(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    waiters.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}

async function connect() {
  const version = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json();
  ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && waiters.has(msg.id)) {
      const { resolve, reject } = waiters.get(msg.id);
      waiters.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      pageErrors.push(`exception: ${d.exception?.description || d.text}`);
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      pageErrors.push(`console: ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
    }
  };
}

async function openTab(url, width, height) {
  const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true });
  await cdp('Page.enable', {}, sessionId);
  await cdp('Runtime.enable', {}, sessionId);
  await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
  await cdp('Page.navigate', { url }, sessionId);
  return { targetId, sessionId };
}

async function evaluate(sessionId, expression) {
  const res = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
  if (res.exceptionDetails) {
    throw new Error(`evaluate failed: ${res.exceptionDetails.exception?.description || res.exceptionDetails.text}`);
  }
  return res.result.value;
}

/** Validates a buffer as a PNG and reads its IHDR dimensions. */
function pngDims(buf) {
  const magic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!magic.every((b, i) => buf[i] === b)) throw new Error('download is not a PNG (bad signature)');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

async function verifyExports() {
  rmSync(DOWNLOADS, { recursive: true, force: true });
  mkdirSync(DOWNLOADS, { recursive: true });
  await cdp('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOADS, eventsEnabled: true });
  const { targetId, sessionId } = await openTab(`http://127.0.0.1:${HTTP_PORT}/`, 1280, 900);
  await until('sample photos loaded', async () =>
    (await evaluate(sessionId, 'window.__neonVice && window.__neonVice.state.photos.length')) === 4);
  console.log('verify: editor up, 4 sample photos composed');

  await evaluate(sessionId, `document.querySelector('[data-export="1080x1080"]').click()`);
  await until('square PNG download', () => existsSync(join(DOWNLOADS, 'neon-vice-1080x1080.png')), 15000);
  const png1 = readFileSync(join(DOWNLOADS, 'neon-vice-1080x1080.png'));
  console.log(`verify: neon-vice-1080x1080.png — ${png1.length} bytes, ${JSON.stringify(pngDims(png1))}`);

  await evaluate(sessionId, `(async () => {
    const blob = await (await fetch('samples/boat.jpg')).blob();
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'my-boat.jpg', { type: 'image/jpeg' }));
    const input = document.getElementById('fileInput');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await until('user photo added', async () =>
    (await evaluate(sessionId, 'window.__neonVice.state.photos.length')) === 5);
  console.log('verify: a photo pushed through the file input landed in the panels');

  await evaluate(sessionId, `document.querySelector('[data-export="1920x1080"]').click()`);
  await until('wide PNG download', () => existsSync(join(DOWNLOADS, 'neon-vice-1920x1080.png')), 15000);
  const png2 = readFileSync(join(DOWNLOADS, 'neon-vice-1920x1080.png'));
  console.log(`verify: neon-vice-1920x1080.png — ${png2.length} bytes, ${JSON.stringify(pngDims(png2))}`);
  await cdp('Target.closeTarget', { targetId });
}

async function capture(spec) {
  const { targetId, sessionId } = await openTab(`http://127.0.0.1:${HTTP_PORT}/${spec.query}`, spec.w, spec.h);
  await until('window.__shotReady', async () =>
    (await evaluate(sessionId, 'window.__shotReady === true')) === true, 30000);
  await sleep(250);
  let buf = null;
  if (spec.kind === 'cover') {
    // Covers are re-encoded from the stage canvas at the shot's exact output size.
    for (const q of [0.88, 0.8, 0.72, 0.64]) {
      const dataUrl = await evaluate(sessionId, `(() => {
        const src = document.getElementById('stage');
        const c = document.createElement('canvas');
        c.width = ${spec.outW}; c.height = ${spec.outH};
        c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
        return c.toDataURL('image/jpeg', ${q});
      })()`);
      buf = Buffer.from(dataUrl.split(',')[1], 'base64');
      if (buf.length <= SHOT_CAP) break;
    }
  } else {
    for (const q of [88, 78, 68, 58]) {
      const res = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: q }, sessionId);
      buf = Buffer.from(res.data, 'base64');
      if (buf.length <= SHOT_CAP) break;
    }
  }
  await cdp('Target.closeTarget', { targetId });
  writeFileSync(join(root, 'screenshots', spec.name), buf);
  return { name: spec.name, bytes: buf.length };
}

async function main() {
  const mode = process.argv[2] || 'all';
  try {
    await until('static server', async () => (await fetch(`http://127.0.0.1:${HTTP_PORT}/`)).ok, 10000);
    await until('chromium devtools', async () => (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).ok, 15000);
    await connect();
    if (mode === 'all' || mode === '--verify') await verifyExports();
    if (mode === 'all' || mode === '--shots') {
      mkdirSync(join(root, 'screenshots'), { recursive: true });
      for (const spec of shotSpecs) {
        const fact = await capture(spec);
        console.log(`shot: ${fact.name} — ${fact.bytes} bytes`);
        if (fact.bytes > SHOT_CAP) throw new Error(`${fact.name} exceeds the 256 KiB screenshot cap`);
      }
    }
    if (pageErrors.length) {
      console.error(`PAGE ERRORS (${pageErrors.length}):\n${pageErrors.join('\n')}`);
      process.exitCode = 2;
    } else {
      console.log('no page errors');
    }
  } finally {
    try { ws && ws.close(); } catch { /* already closed */ }
    server.kill();
    chrome.kill();
  }
}

main().catch((err) => {
  console.error(`FAILED: ${err.message}`);
  server.kill();
  chrome.kill();
  process.exit(1);
});
