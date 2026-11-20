// Neon Vice editor: connects the page's controls to the rendering engine (engine.js).
//
// Photos are decoded locally from object URLs and only ever drawn on this machine —
// nothing leaves the browser. The stage canvas is kept at the exact pixel size of the
// chosen export, so the preview is the PNG, not a mock-up of it.
import { renderCover, layoutRects, defaultSlots, newSlot, LAYOUTS, GRADES } from './engine.js';
import { runScene } from './scenes.js';

const SIZES = { '1080x1080': [1080, 1080], '1080x1350': [1080, 1350], '1920x1080': [1920, 1080] };
const SAMPLES = [
  { src: 'samples/boulevard.jpg', name: 'Boulevard' },
  { src: 'samples/neon.jpg', name: 'Neon' },
  { src: 'samples/pier.jpg', name: 'Pier' },
  { src: 'samples/boat.jpg', name: 'Boat' },
];

const canvas = document.getElementById('stage');
const statusEl = document.getElementById('status');
const shotKind = new URLSearchParams(location.search).get('shot');

export const state = {
  layout: 'mosaic',
  grade: 'sunset',
  spread: 'each',      // 'each': a photo per panel · 'one': one photo in every panel
  mainPhoto: 0,        // the shared photo when spread is 'one'
  title: 'NEON VICE',
  tagline: 'SUNSET · NEON · TROUBLE',
  foot: 'NEON SHORES · EST. 2026',
  font: 'anton',
  fill: 'sunset',
  place: 'top',
  sun: false,
  grain: true,
  photos: [],          // [{ img, name }]
  slots: defaultSlots('mosaic', 0),
  selected: 0,
  size: '1080x1350',
};

let rects = layoutRects(state.layout, canvas.width, canvas.height);
let queued = false;

/** Coalesced redraw on the next frame; the selection outline is editor-only. */
export function redraw() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    rects = renderCover(canvas, state, { selected: shotKind === 'cover' ? -1 : state.selected });
    syncPanelCard();
  });
}

/** Promise wrapper around an <img> load. */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/** Loads a photo into the pool and returns its index. */
export async function addPhoto(url, name) {
  const img = await loadImage(url);
  state.photos.push({ img, name });
  return state.photos.length - 1;
}

/** Re-points slots at the layout's default photos while keeping each slot's framing. */
function assignDefaults() {
  const fresh = defaultSlots(state.layout, state.photos.length);
  state.slots = fresh.map((f, i) => (state.slots[i] ? { ...state.slots[i], photo: f.photo } : f));
  if (state.selected >= state.slots.length) state.selected = 0;
}

function setLayout(id) {
  state.layout = id;
  assignDefaults();
  document.querySelectorAll('#layoutRow .layout-btn')
    .forEach((b) => b.classList.toggle('on', b.dataset.layout === id));
  redraw();
}

function setGrade(id) {
  state.grade = id;
  document.querySelectorAll('#gradeRow .grade-btn')
    .forEach((b) => b.classList.toggle('on', b.dataset.grade === id));
  redraw();
}

function setSpread(mode) {
  state.spread = mode;
  document.getElementById('spreadEach').classList.toggle('on', mode === 'each');
  document.getElementById('spreadOne').classList.toggle('on', mode === 'one');
  if (mode === 'one') state.slots.forEach((slot) => { slot.photo = state.mainPhoto; });
  else assignDefaults();
  buildTray();
  redraw();
}

/** Places a photo: into the selected panel, or everywhere in one-photo spread. */
function choosePhoto(index) {
  if (state.spread === 'one') {
    state.mainPhoto = index;
    state.slots.forEach((slot) => { slot.photo = index; });
  } else {
    state.slots[state.selected].photo = index;
  }
  buildTray();
  redraw();
}

function removePhoto(index) {
  state.photos.splice(index, 1);
  for (const slot of state.slots) {
    if (slot.photo === index) slot.photo = -1;
    else if (slot.photo > index) slot.photo -= 1;
  }
  if (state.mainPhoto >= state.photos.length) state.mainPhoto = Math.max(0, state.photos.length - 1);
  buildTray();
  redraw();
}

/** Rebuilds the tray of photo thumbnails. */
function buildTray() {
  const tray = document.getElementById('photoTray');
  tray.replaceChildren();
  if (!state.photos.length) {
    const p = document.createElement('p');
    p.className = 'tray-empty';
    p.textContent = 'No photos yet — every panel shows the drawn sunset scene.';
    tray.append(p);
    return;
  }
  const shown = state.spread === 'one' ? state.mainPhoto : (state.slots[state.selected] || {}).photo;
  state.photos.forEach((photo, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'thumb' + (shown === i ? ' on' : '');
    btn.title = `${photo.name} — click to place it`;
    const img = document.createElement('img');
    img.src = photo.img.src;
    img.alt = photo.name;
    const rm = document.createElement('span');
    rm.className = 'rm';
    rm.textContent = '×';
    rm.title = 'Remove this photo';
    rm.addEventListener('click', (e) => { e.stopPropagation(); removePhoto(i); });
    btn.append(img, rm);
    btn.addEventListener('click', () => choosePhoto(i));
    tray.append(btn);
  });
}

/** Mirrors the selection into the panel card (name, zoom slider, mode button). */
function syncPanelCard() {
  const slot = state.slots[state.selected];
  document.getElementById('panelName').textContent = `Panel ${state.selected + 1} of ${state.slots.length}`;
  if (!slot) return;
  const zoom = document.getElementById('zoomRange');
  if (document.activeElement !== zoom) zoom.value = Math.round(slot.zoom * 100);
  document.getElementById('modeBtn').textContent = slot.fit ? 'Mode: Fit' : 'Mode: Fill';
}

/** Layout picker buttons, each with a miniature of its own panel geometry. */
function buildLayoutButtons() {
  const row = document.getElementById('layoutRow');
  for (const [id, layout] of Object.entries(LAYOUTS)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'layout-btn' + (id === state.layout ? ' on' : '');
    btn.dataset.layout = id;
    const cells = layout.cells.map(([x, y, w, h]) =>
      `<rect x="${(x * 40 + 1).toFixed(1)}" y="${(y * 40 + 1).toFixed(1)}" width="${(w * 40 - 2).toFixed(1)}" height="${(h * 40 - 2).toFixed(1)}" rx="1.5"/>`).join('');
    btn.innerHTML = `<svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">${cells}</svg><span>${layout.label}</span>`;
    btn.addEventListener('click', () => setLayout(id));
    row.append(btn);
  }
}

/** Grade picker buttons. */
function buildGradeButtons() {
  const row = document.getElementById('gradeRow');
  const short = { sunset: 'SUNSET', neon: 'NEON', golden: 'GOLDEN', noir: 'NOIR', clean: 'CLEAN' };
  for (const id of Object.keys(GRADES)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `grade-btn grade-${id}` + (id === state.grade ? ' on' : '');
    btn.dataset.grade = id;
    btn.textContent = short[id];
    btn.title = GRADES[id].label;
    btn.addEventListener('click', () => setGrade(id));
    row.append(btn);
  }
}

function setSize(key) {
  const [w, h] = SIZES[key];
  state.size = key;
  canvas.width = w;
  canvas.height = h;
  document.querySelectorAll('.size-tabs button')
    .forEach((b) => b.classList.toggle('on', b.dataset.size === key));
  document.getElementById('exportBtn').textContent = `Export PNG — ${w} × ${h}`;
  redraw();
}

/** Renders the clean cover at an exact size onto a fresh canvas (the export path). */
export function renderToCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  renderCover(c, state, { selected: -1 });
  return c;
}

/** Downloads the cover as a PNG at w×h. */
export function exportPNG(w, h) {
  renderToCanvas(w, h).toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `neon-vice-${w}x${h}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    statusEl.textContent = `Saved neon-vice-${w}x${h}.png — post it anywhere.`;
  }, 'image/png');
}

async function addFiles(fileList) {
  const images = [...fileList].filter((f) => f.type.startsWith('image/'));
  if (!images.length) return;
  let target = state.selected;
  for (const file of images) {
    const index = await addPhoto(URL.createObjectURL(file), file.name.replace(/\.[^.]+$/, ''));
    if (state.spread === 'one') state.mainPhoto = index;
    else if (state.slots[target]) {
      state.slots[target].photo = index;
      target = (target + 1) % state.slots.length;
    }
  }
  if (state.spread === 'one') state.slots.forEach((slot) => { slot.photo = state.mainPhoto; });
  statusEl.textContent = `${images.length} photo${images.length > 1 ? 's' : ''} added — drag panels to compose, then export.`;
  buildTray();
  redraw();
}

/** Applies a whole scene at once (screenshot scenes; also handy in tests). */
export async function applyScene(scene) {
  if (scene.size && SIZES[scene.size]) setSize(scene.size);
  if (scene.layout && LAYOUTS[scene.layout]) state.layout = scene.layout;
  if (scene.grade && GRADES[scene.grade]) state.grade = scene.grade;
  if (scene.photos) {
    state.photos = [];
    for (const name of scene.photos) {
      const sample = SAMPLES.find((s) => s.src.endsWith(`/${name}.jpg`));
      if (sample) await addPhoto(sample.src, sample.name);
    }
  }
  assignDefaults();
  if (scene.assign) scene.assign.forEach((photo, i) => { if (state.slots[i]) state.slots[i].photo = photo; });
  if (scene.oyList) scene.oyList.forEach((oy, i) => { if (state.slots[i] && Number.isFinite(oy)) state.slots[i].oy = oy; });
  const words = [['title', 'titleInput'], ['tagline', 'taglineInput'], ['foot', 'bottomInput']];
  for (const [key, id] of words) {
    if (scene[key] !== undefined) { state[key] = scene[key]; document.getElementById(id).value = scene[key]; }
  }
  if (scene.font) { state.font = scene.font; document.getElementById('fontSelect').value = scene.font; }
  if (scene.fill) { state.fill = scene.fill; document.getElementById('fillSelect').value = scene.fill; }
  if (scene.place) { state.place = scene.place; document.getElementById('posSelect').value = scene.place; }
  if (scene.sun !== undefined) { state.sun = scene.sun; document.getElementById('sunToggle').checked = scene.sun; }
  if (scene.grain !== undefined) { state.grain = scene.grain; document.getElementById('grainToggle').checked = scene.grain; }
  if (scene.selected !== undefined) state.selected = Math.min(scene.selected, state.slots.length - 1);
  document.querySelectorAll('#layoutRow .layout-btn')
    .forEach((b) => b.classList.toggle('on', b.dataset.layout === state.layout));
  document.querySelectorAll('#gradeRow .grade-btn')
    .forEach((b) => b.classList.toggle('on', b.dataset.grade === state.grade));
  buildTray();
  redraw();
}

function wireControls() {
  const $ = (id) => document.getElementById(id);
  $('fileInput').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
  $('spreadEach').addEventListener('click', () => setSpread('each'));
  $('spreadOne').addEventListener('click', () => setSpread('one'));
  $('sunToggle').addEventListener('change', (e) => { state.sun = e.target.checked; redraw(); });
  $('grainToggle').addEventListener('change', (e) => { state.grain = e.target.checked; redraw(); });
  for (const [id, key] of [['titleInput', 'title'], ['taglineInput', 'tagline'], ['bottomInput', 'foot']]) {
    $(id).addEventListener('input', (e) => { state[key] = e.target.value; redraw(); });
  }
  $('fontSelect').addEventListener('change', (e) => { state.font = e.target.value; redraw(); });
  $('fillSelect').addEventListener('change', (e) => { state.fill = e.target.value; redraw(); });
  $('posSelect').addEventListener('change', (e) => { state.place = e.target.value; redraw(); });
  document.querySelectorAll('.size-tabs button')
    .forEach((b) => b.addEventListener('click', () => setSize(b.dataset.size)));
  $('exportBtn').addEventListener('click', () => { const [w, h] = SIZES[state.size]; exportPNG(w, h); });
  document.querySelectorAll('[data-export]')
    .forEach((b) => b.addEventListener('click', () => { const [w, h] = SIZES[b.dataset.export]; exportPNG(w, h); }));

  $('zoomRange').addEventListener('input', (e) => {
    const slot = state.slots[state.selected];
    if (slot) { slot.zoom = Number(e.target.value) / 100; redraw(); }
  });
  $('modeBtn').addEventListener('click', () => {
    const slot = state.slots[state.selected];
    if (slot) { slot.fit = !slot.fit; redraw(); }
  });
  $('centerBtn').addEventListener('click', () => {
    const slot = state.slots[state.selected];
    if (slot) { slot.ox = 0.5; slot.oy = 0.5; redraw(); }
  });
  const cycle = (dir) => {
    const slot = state.slots[state.selected];
    if (!slot || !state.photos.length) return;
    slot.photo = (((slot.photo + dir) % state.photos.length) + state.photos.length) % state.photos.length;
    buildTray();
    redraw();
  };
  $('prevPhotoBtn').addEventListener('click', () => cycle(-1));
  $('nextPhotoBtn').addEventListener('click', () => cycle(1));
  $('sceneBtn').addEventListener('click', () => {
    const slot = state.slots[state.selected];
    if (slot) { slot.photo = -1; buildTray(); redraw(); }
  });

  const zone = $('dropZone');
  window.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragging'); });
  window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) zone.classList.remove('dragging'); });
  window.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('dragging'); addFiles(e.dataTransfer.files); });

  let drag = null;
  const toCanvas = (e) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * canvas.width / r.width,
      y: (e.clientY - r.top) * canvas.height / r.height,
    };
  };
  canvas.addEventListener('pointerdown', (e) => {
    const p = toCanvas(e);
    const hit = rects.findIndex((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);
    if (hit === -1) return;
    state.selected = hit;
    const slot = state.slots[hit];
    drag = { x: p.x, y: p.y, ox: slot.ox, oy: slot.oy };
    canvas.setPointerCapture(e.pointerId);
    buildTray();
    redraw();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const slot = state.slots[state.selected];
    const entry = slot.photo >= 0 ? state.photos[slot.photo] : null;
    if (!entry) return;
    const p = toCanvas(e);
    const rect = rects[state.selected];
    const iw = entry.img.naturalWidth || entry.img.width;
    const ih = entry.img.naturalHeight || entry.img.height;
    const scale = Math.max(rect.w / iw, rect.h / ih) * slot.zoom;
    const overX = iw * scale - rect.w;
    const overY = ih * scale - rect.h;
    if (overX > 0) slot.ox = Math.min(1, Math.max(0, drag.ox - (p.x - drag.x) / overX));
    if (overY > 0) slot.oy = Math.min(1, Math.max(0, drag.oy - (p.y - drag.y) / overY));
    redraw();
  });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('pointercancel', () => { drag = null; });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const slot = state.slots[state.selected];
    if (!slot) return;
    slot.zoom = Math.min(4, Math.max(0.4, slot.zoom * Math.exp(-e.deltaY * 0.0012)));
    redraw();
  }, { passive: false });

  document.addEventListener('keydown', (e) => {
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    const slot = state.slots[state.selected];
    if (!slot) return;
    const step = 0.03;
    if (e.key === 'ArrowLeft') slot.ox = Math.max(0, slot.ox - step);
    else if (e.key === 'ArrowRight') slot.ox = Math.min(1, slot.ox + step);
    else if (e.key === 'ArrowUp') slot.oy = Math.max(0, slot.oy - step);
    else if (e.key === 'ArrowDown') slot.oy = Math.min(1, slot.oy + step);
    else if (e.key === '+' || e.key === '=') slot.zoom = Math.min(4, slot.zoom * 1.08);
    else if (e.key === '-') slot.zoom = Math.max(0.4, slot.zoom / 1.08);
    else return;
    e.preventDefault();
    redraw();
  });
}

buildLayoutButtons();
buildGradeButtons();
wireControls();
window.__neonVice = { state, renderCover, exportPNG, renderToCanvas, applyScene, addPhoto };

if (shotKind) {
  runScene(shotKind, new URLSearchParams(location.search), applyScene);
} else {
  (async () => {
    for (const sample of SAMPLES) {
      try { await addPhoto(sample.src, sample.name); } catch { /* a missing sample must not block the editor */ }
    }
    assignDefaults();
    buildTray();
    redraw();
    if (document.fonts?.ready) document.fonts.ready.then(() => redraw());
  })();
}
