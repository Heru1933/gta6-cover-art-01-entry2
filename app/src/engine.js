// Neon Vice rendering engine.
//
// Everything a cover is made of lives here: the panel layouts, the colour grades, the
// drawn sunset scene that fills photo-less panels, the lettering, and renderCover(),
// which paints a complete cover onto any canvas at that canvas's own size. The editor
// (editor.js) keeps one state object and calls renderCover for both the on-screen
// preview and the exported PNG, so the two can never drift apart.

/* ---------------------------------- layouts ---------------------------------- */

// Panel rectangles in unit space (x, y, w, h), listed in reading order.
export const LAYOUTS = {
  mosaic: {
    label: 'Mosaic',
    cells: [
      [0.00, 0.00, 0.34, 0.44], [0.34, 0.00, 0.32, 0.32], [0.66, 0.00, 0.34, 0.44],
      [0.34, 0.32, 0.32, 0.30],
      [0.00, 0.44, 0.34, 0.56], [0.34, 0.62, 0.32, 0.38], [0.66, 0.44, 0.34, 0.56],
    ],
  },
  poster: {
    label: 'Poster',
    cells: [
      [0.00, 0.00, 0.57, 1.00],
      [0.57, 0.00, 0.43, 0.36], [0.57, 0.36, 0.43, 0.31], [0.57, 0.67, 0.43, 0.33],
    ],
  },
  quad: {
    label: 'Quad',
    cells: [
      [0.00, 0.00, 0.50, 0.50], [0.50, 0.00, 0.50, 0.50],
      [0.00, 0.50, 0.50, 0.50], [0.50, 0.50, 0.50, 0.50],
    ],
  },
  trio: {
    label: 'Trio',
    cells: [
      [0.00, 0.00, 0.34, 1.00], [0.34, 0.00, 0.33, 1.00], [0.67, 0.00, 0.33, 1.00],
    ],
  },
  duo: {
    label: 'Duo',
    cells: [[0.00, 0.00, 0.50, 1.00], [0.50, 0.00, 0.50, 1.00]],
  },
  solo: {
    label: 'Solo',
    cells: [[0.00, 0.00, 1.00, 1.00]],
  },
};

/* ---------------------------------- grades ----------------------------------- */

// A grade is a CSS filter applied while the photo is drawn, plus a stack of vertical
// gradient washes composited over it. `blend` is the canvas composite op for the wash.
export const GRADES = {
  sunset: {
    label: 'Vice Sunset',
    filter: 'saturate(1.3) contrast(1.08) brightness(1.03)',
    washes: [
      { blend: 'source-over', stops: [[0, 'rgba(26,7,58,0.15)'], [0.45, 'rgba(26,7,58,0)'], [0.8, 'rgba(255,99,56,0.15)'], [1, 'rgba(219,33,119,0.32)']] },
      { blend: 'screen', stops: [[0, 'rgba(255,178,84,0.12)'], [0.55, 'rgba(255,178,84,0)']] },
    ],
  },
  neon: {
    label: 'Neon Night',
    filter: 'saturate(1.5) contrast(1.15) brightness(0.95) hue-rotate(-7deg)',
    washes: [
      { blend: 'multiply', stops: [[0, 'rgba(9,15,46,0)'], [1, 'rgba(3,30,52,0.4)']] },
      { blend: 'screen', stops: [[0, 'rgba(255,44,138,0.16)'], [0.5, 'rgba(255,44,138,0)']] },
      { blend: 'screen', stops: [[0.62, 'rgba(36,211,238,0)'], [1, 'rgba(36,211,238,0.12)']] },
    ],
  },
  golden: {
    label: 'Golden Hour',
    filter: 'saturate(1.16) contrast(1.04) brightness(1.06) sepia(0.24)',
    washes: [
      { blend: 'screen', stops: [[0, 'rgba(255,172,60,0.19)'], [0.6, 'rgba(255,172,60,0)']] },
      { blend: 'multiply', stops: [[0.55, 'rgba(122,54,16,0)'], [1, 'rgba(122,54,16,0.17)']] },
    ],
  },
  noir: {
    label: 'Noir',
    filter: 'grayscale(1) contrast(1.24) brightness(1.01)',
    washes: [
      { blend: 'source-over', stops: [[0.5, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.3)']] },
    ],
  },
  clean: {
    label: 'Clean',
    filter: 'saturate(1.05) contrast(1.02)',
    washes: [],
  },
};

/** Title fills: gradient stop lists, or one flat colour when the list has one entry. */
export const FILLS = {
  sunset: ['#ffe259', '#ffa751', '#ff5e3a', '#ff2e88'],
  gold: ['#fff3ae', '#f6c453', '#dd8f1d', '#9a5b12'],
  pink: ['#ff7ac0'],
  white: ['#ffffff'],
};

/* --------------------------------- geometry ---------------------------------- */

/** Pixel rects for a layout on a W×H cover: cream frame around, gutters between cells. */
export function layoutRects(layoutId, W, H) {
  const frame = Math.max(10, Math.round(Math.min(W, H) * 0.017));
  const gutter = Math.max(6, Math.round(frame * 0.75));
  const innerW = W - frame * 2;
  const innerH = H - frame * 2;
  return LAYOUTS[layoutId].cells.map(([ux, uy, uw, uh]) => {
    const w = uw * innerW;
    const h = uh * innerH;
    return {
      x: frame + ux * innerW + gutter / 2,
      y: frame + uy * innerH + gutter / 2,
      w: w - gutter,
      h: h - gutter,
    };
  });
}

/** One panel's state: which photo it shows (-1 = drawn scene) and how it is framed. */
export function newSlot(photo) {
  return { photo, zoom: 1, ox: 0.5, oy: 0.5, fit: false };
}

/** A sensible first assignment of photos to panels for each layout. */
export function defaultSlots(layoutId, photoCount) {
  const order = {
    mosaic: [1, 3, 0, 2, 0, 3, 1],
    poster: [0, 1, 3, 2],
    quad: [0, 1, 3, 2],
    trio: [1, 0, 3],
    duo: [0, 3],
    solo: [0],
  }[layoutId] ?? [0];
  return LAYOUTS[layoutId].cells.map((_, i) => {
    const slot = newSlot(photoCount > 0 ? order[i % order.length] % photoCount : -1);
    if (i % 3 === 2) slot.oy = 0.3;
    if (i % 4 === 3) slot.ox = 0.36;
    return slot;
  });
}

/* ------------------------------- drawn artwork ------------------------------- */

// Small xorshift PRNG: the drawn scene must come out identical on every render.
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

const sunSprites = new Map();

/** The banded retro sun, pre-rendered to a sprite so the cut stripes stay transparent. */
function sunSprite(radius) {
  const key = Math.round(radius);
  const hit = sunSprites.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = Math.max(2, key * 2);
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, key * 2);
  grad.addColorStop(0, '#ffe259');
  grad.addColorStop(0.55, '#ffa751');
  grad.addColorStop(1, '#ff2e88');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(key, key, key, 0, Math.PI * 2);
  g.fill();
  g.globalCompositeOperation = 'destination-out';
  let y = key * 1.08;
  let band = key * 0.04;
  while (y < key * 2) {
    g.fillRect(0, y, key * 2, band);
    y += band + key * 0.11;
    band *= 1.5;
  }
  sunSprites.set(key, c);
  return c;
}

/** Palm silhouette: origin at the trunk's foot, height s, lean direction flip (±1). */
function palm(g, x, y, s, flip, colour) {
  g.save();
  g.translate(x, y);
  g.scale((flip * s) / 100, s / 100);
  g.fillStyle = colour;
  g.strokeStyle = colour;
  g.beginPath();
  g.moveTo(-6, 0);
  g.quadraticCurveTo(-2, -55, 14, -100);
  g.lineTo(23, -98);
  g.quadraticCurveTo(8, -54, 8, 0);
  g.closePath();
  g.fill();
  g.lineWidth = 5;
  g.lineCap = 'round';
  for (const [dx, dy] of [[-58, -24], [-44, -40], [-16, -52], [15, -55], [40, -45], [58, -28]]) {
    g.beginPath();
    g.moveTo(18, -99);
    g.quadraticCurveTo(18 + dx * 0.5, -99 + dy - 12, 18 + dx, -99 + dy + 14);
    g.stroke();
  }
  g.restore();
}

/** Placeholder art for a panel with no photo: dusk sky, banded sun, skyline, sea, palms. */
function paintScene(g, x, y, w, h) {
  const sky = g.createLinearGradient(0, y, 0, y + h);
  sky.addColorStop(0.00, '#2b1055');
  sky.addColorStop(0.34, '#7b2d8b');
  sky.addColorStop(0.55, '#d6336c');
  sky.addColorStop(0.68, '#ff7e47');
  sky.addColorStop(0.78, '#ffd23f');
  sky.addColorStop(0.80, '#3d1a63');
  sky.addColorStop(1.00, '#170a33');
  g.fillStyle = sky;
  g.fillRect(x, y, w, h);

  const rand = rng(987123);
  g.fillStyle = 'rgba(255,255,255,0.7)';
  for (let i = 0; i < 24; i++) g.fillRect(x + rand() * w, y + rand() * h * 0.3, 1.6, 1.6);

  const horizon = y + h * 0.79;
  const r = Math.min(w, h) * 0.27;
  g.drawImage(sunSprite(r), x + w / 2 - r, horizon - r * 1.55);

  g.fillStyle = '#1c0b38';
  let bx = x - 4;
  while (bx < x + w) {
    const bw = w * (0.05 + rand() * 0.09);
    const bh = h * (0.03 + rand() * 0.08);
    g.fillRect(bx, horizon - bh, bw, bh);
    bx += bw + w * 0.012;
  }
  g.fillStyle = 'rgba(255,210,63,0.45)';
  for (let i = 0; i < 7; i++) {
    const gw = r * (0.4 + rand() * 0.9);
    g.fillRect(x + w / 2 - gw / 2, horizon + 4 + i * h * 0.024, gw, Math.max(1.5, h * 0.006));
  }
  palm(g, x + w * 0.07, y + h * 0.995, h * 0.33, 1, '#12061f');
  palm(g, x + w * 0.95, y + h * 0.995, h * 0.26, -1, '#12061f');
}

/* ------------------------------- photo panels -------------------------------- */

/** Draws one panel's photo onto its own tile canvas, graded, at w×h. */
function photoTile(img, slot, gradeId, w, h) {
  const tile = document.createElement('canvas');
  tile.width = Math.max(1, Math.round(w));
  tile.height = Math.max(1, Math.round(h));
  const g = tile.getContext('2d');
  const grade = GRADES[gradeId] ?? GRADES.sunset;
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  g.fillStyle = '#170a33';
  g.fillRect(0, 0, tile.width, tile.height);

  if (slot.fit) {
    // Fit: whole photo visible over a blurred, darkened blow-up of itself.
    const back = Math.max(tile.width / iw, tile.height / ih) * 1.15;
    g.filter = `${grade.filter} blur(18px) brightness(0.6)`;
    g.drawImage(img, (tile.width - iw * back) / 2, (tile.height - ih * back) / 2, iw * back, ih * back);
    g.filter = grade.filter;
    const s = Math.min(tile.width / iw, tile.height / ih) * slot.zoom;
    const dw = iw * s;
    const dh = ih * s;
    g.drawImage(img,
      (tile.width - dw) / 2 + (slot.ox - 0.5) * tile.width * 0.2,
      (tile.height - dh) / 2 + (slot.oy - 0.5) * tile.height * 0.2, dw, dh);
  } else {
    // Fill: cover the panel; ox/oy pick the focal point inside the overflow.
    const s = Math.max(tile.width / iw, tile.height / ih) * slot.zoom;
    const dw = iw * s;
    const dh = ih * s;
    g.filter = grade.filter;
    g.drawImage(img, (tile.width - dw) * slot.ox, (tile.height - dh) * slot.oy, dw, dh);
  }
  g.filter = 'none';
  for (const wash of grade.washes) {
    const grad = g.createLinearGradient(0, 0, 0, tile.height);
    for (const [at, colour] of wash.stops) grad.addColorStop(at, colour);
    g.globalCompositeOperation = wash.blend;
    g.fillStyle = grad;
    g.fillRect(0, 0, tile.width, tile.height);
  }
  g.globalCompositeOperation = 'source-over';
  return tile;
}

let grainTile = null;

/** One tile of monochrome film grain, generated once and reused as a pattern. */
function grain() {
  if (grainTile) return grainTile;
  grainTile = document.createElement('canvas');
  grainTile.width = grainTile.height = 256;
  const g = grainTile.getContext('2d');
  const data = g.createImageData(256, 256);
  const rand = rng(4242);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = 96 + Math.floor(rand() * 96);
    data.data[i] = data.data[i + 1] = data.data[i + 2] = v;
    data.data[i + 3] = 255;
  }
  g.putImageData(data, 0, 0);
  return grainTile;
}

/* --------------------------------- lettering --------------------------------- */

/** Reduces the font size until text fits maxWidth; returns the size that fits. */
function shrinkToFit(g, text, family, maxWidth, start, spacingEm) {
  let size = start;
  while (size > 10) {
    g.font = `${size}px ${family}`;
    try { g.letterSpacing = `${(size * spacingEm).toFixed(1)}px`; } catch { /* unsupported */ }
    if (g.measureText(text).width <= maxWidth) break;
    size *= 0.94;
  }
  return size;
}

/** Tagline above (or below) a big outlined title, foot line at the opposite edge. */
function lettering(g, W, H, st) {
  const title = (st.title || '').trim().toUpperCase();
  const tagline = (st.tagline || '').trim().toUpperCase();
  const foot = (st.foot || '').trim().toUpperCase();
  if (!title && !tagline && !foot) return;
  const cx = W / 2;
  const margin = H * 0.032;
  const onTop = st.place !== 'bottom';
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';

  const family = st.font === 'bebas' ? '"Bebas Neue", sans-serif' : '"Anton", sans-serif';
  const titleSize = title
    ? shrinkToFit(g, title, family, W * 0.93, Math.min(W * 0.185, H * 0.17), 0.015)
    : 0;
  const tagSize = Math.max(11, Math.min(W, H) * 0.021);
  const footSize = Math.max(10, Math.min(W, H) * 0.017);

  const shadowed = (blur, dy, alpha) => {
    g.shadowColor = `rgba(10,2,24,${alpha})`;
    g.shadowBlur = blur;
    g.shadowOffsetY = dy;
  };
  const noShadow = () => { g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetY = 0; };

  const drawTagline = (baseline) => {
    if (!tagline) return;
    g.font = `${tagSize}px "Bebas Neue", sans-serif`;
    try { g.letterSpacing = `${(tagSize * 0.34).toFixed(1)}px`; } catch { /* unsupported */ }
    shadowed(tagSize * 0.35, tagSize * 0.08, 0.65);
    g.fillStyle = '#ffe9c9';
    g.fillText(tagline, cx, baseline);
    noShadow();
  };
  const drawTitle = (baseline) => {
    if (!title) return;
    g.font = `${titleSize}px ${family}`;
    try { g.letterSpacing = `${(titleSize * 0.015).toFixed(1)}px`; } catch { /* unsupported */ }
    const stops = FILLS[st.fill] ?? FILLS.sunset;
    let fill = stops[0];
    if (stops.length > 1) {
      fill = g.createLinearGradient(0, baseline - titleSize, 0, baseline + titleSize * 0.12);
      stops.forEach((colour, i) => fill.addColorStop(i / (stops.length - 1), colour));
    }
    g.lineJoin = 'round';
    g.strokeStyle = '#170b31';
    g.lineWidth = titleSize * 0.15;
    shadowed(titleSize * 0.13, titleSize * 0.05, 0.55);
    g.strokeText(title, cx, baseline);
    noShadow();
    g.fillStyle = fill;
    g.fillText(title, cx, baseline);
  };
  const drawFoot = (baseline) => {
    if (!foot) return;
    g.font = `${footSize}px "Bebas Neue", sans-serif`;
    try { g.letterSpacing = `${(footSize * 0.3).toFixed(1)}px`; } catch { /* unsupported */ }
    shadowed(footSize * 0.4, 0, 0.6);
    g.fillStyle = 'rgba(255,240,214,0.92)';
    g.fillText(foot, cx, baseline);
    noShadow();
  };

  if (onTop) {
    let y = margin + tagSize;
    drawTagline(y);
    if (tagline) y += tagSize * 0.55;
    drawTitle(y + titleSize * 0.92);
    drawFoot(H - margin * 0.72);
  } else {
    drawFoot(margin + footSize);
    const y = H - margin * 0.72;
    drawTitle(y);
    drawTagline(y - titleSize * 1.04);
  }
  try { g.letterSpacing = '0px'; } catch { /* unsupported */ }
}

/* ---------------------------------- render ----------------------------------- */

/**
 * Paints the cover described by `state` onto `canvas` at the canvas's own size and
 * returns the panel rects it used. opts.selected is a panel index to outline with the
 * editor's selection marker, or -1 to draw the clean cover (the export path).
 */
export function renderCover(canvas, state, opts = {}) {
  const g = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const selected = opts.selected ?? -1;

  g.fillStyle = '#f7ecd9'; // cream frame stock
  g.fillRect(0, 0, W, H);

  const rects = layoutRects(state.layout, W, H);
  rects.forEach((rect, i) => {
    const slot = state.slots[i] ?? newSlot(-1);
    g.save();
    g.shadowColor = 'rgba(23,6,43,0.35)';
    g.shadowBlur = Math.max(6, W * 0.008);
    g.shadowOffsetY = Math.max(2, H * 0.004);
    g.fillStyle = '#1c0f33';
    g.fillRect(rect.x, rect.y, rect.w, rect.h);
    g.restore();

    g.save();
    g.beginPath();
    g.rect(rect.x, rect.y, rect.w, rect.h);
    g.clip();
    const entry = slot.photo >= 0 ? state.photos[slot.photo] : null;
    if (entry) g.drawImage(photoTile(entry.img, slot, state.grade, rect.w, rect.h), rect.x, rect.y, rect.w, rect.h);
    else paintScene(g, rect.x, rect.y, rect.w, rect.h);
    g.restore();

    g.strokeStyle = 'rgba(18,6,36,0.35)';
    g.lineWidth = Math.max(1, W * 0.0012);
    g.strokeRect(rect.x, rect.y, rect.w, rect.h);
  });

  if (state.sun) {
    const biggest = rects.reduce((a, b) => (a.w * a.h >= b.w * b.h ? a : b), rects[0]);
    const r = Math.min(biggest.w, biggest.h) * 0.24;
    g.save();
    g.globalAlpha = 0.88;
    g.drawImage(sunSprite(r), biggest.x + biggest.w / 2 - r, biggest.y + biggest.h * 0.06);
    g.restore();
  }

  if (state.grain) {
    g.save();
    g.globalAlpha = 0.055;
    g.globalCompositeOperation = 'overlay';
    g.fillStyle = g.createPattern(grain(), 'repeat');
    g.fillRect(0, 0, W, H);
    g.restore();
  }

  const vig = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.78);
  vig.addColorStop(0, 'rgba(8,2,18,0)');
  vig.addColorStop(1, 'rgba(8,2,18,0.3)');
  g.fillStyle = vig;
  g.fillRect(0, 0, W, H);

  lettering(g, W, H, state);

  g.strokeStyle = 'rgba(23,6,43,0.85)';
  g.lineWidth = Math.max(2, Math.min(W, H) * 0.004);
  g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, W - g.lineWidth, H - g.lineWidth);

  if (selected >= 0 && rects[selected]) {
    const rect = rects[selected];
    g.save();
    g.strokeStyle = '#22d3ee';
    g.lineWidth = Math.max(3, W * 0.004);
    g.shadowColor = 'rgba(34,211,238,0.8)';
    g.shadowBlur = 14;
    g.strokeRect(rect.x, rect.y, rect.w, rect.h);
    g.restore();
  }
  return rects;
}
